// Read-only shadow diff: for N sample products fetches the processed product
// from Merchant API v1 and diffs against DB source-of-truth. No writes.
//
// CORS-safe contract: every code path — including unexpected exceptions —
// returns a JSON body with corsHeaders. No bare 500s, no unhandled rejections.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, MerchantApiClientError, readEnabled, mlog } from "../_shared/merchant-api.ts";

Deno.serve(async (req) => {
  // Always answer OPTIONS with CORS, even before any other logic.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const probeId = (req.headers.get("x-client-probe-id") || "").slice(0, 64);
  const echoHeaders: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (probeId) echoHeaders["x-echo-probe-id"] = probeId;
  const json = (b: unknown, s = 200) => {
    const body = probeId && b && typeof b === "object" ? { ...(b as object), probeId } : b;
    return new Response(JSON.stringify(body), { status: s, headers: echoHeaders });
  };

  const corrId = crypto.randomUUID();
  let stage: string = "init";
  try {
    if (!readEnabled()) return json({ ok: false, error: "MERCHANT_API_READ_ENABLED_false" }, 403);

    stage = "auth";
    const authz = req.headers.get("Authorization");
    if (!authz) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (!bearer) return json({ ok: false, error: "invalid_auth" }, 401);

    // Validate caller using the same working pattern as merchant-api-probe:
    // anon client scoped by the caller's Authorization header, then
    // supabase.auth.getUser(jwt) to resolve identity. Service-role client is
    // used only afterwards for read-only DB lookups.
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );

    let userId: string;
    try {
      const { data: userData, error: uerr } = await authClient.auth.getUser(bearer);
      if (uerr || !userData?.user?.id) {
        mlog("shadow_auth_invalid", { corrId, message: uerr?.message });
        return json({ ok: false, error: "invalid_auth" }, 401);
      }
      userId = userData.user.id;
    } catch (authErr) {
      mlog("shadow_auth_exception", { corrId, message: (authErr as Error)?.message });
      return json({ ok: false, error: "invalid_auth" }, 401);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "authorize";
    // Ensure caller has a connected merchant token (mirrors probe authorization).
    const { data: token } = await supabase
      .from("merchant_oauth_tokens")
      .select("id, is_connected")
      .eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "forbidden", stage }, 403);

    stage = "load_products";
    const { data: products, error: perr } = await supabase
      .from("products_public")
      .select("id, slug, name, price, image_url, is_active")
      .eq("is_active", true)
      .limit(10);
    if (perr) {
      mlog("shadow_products_error", { corrId, message: perr.message });
      return json({ ok: false, error: "shadow_comparison_error", stage }, 502);
    }
    if (!products || products.length === 0) return json({ ok: false, error: "no_products", stage }, 404);

    stage = "diff";
    const client = new MerchantApiClient({ supabase });
    const diffs: Array<Record<string, unknown>> = [];
    for (const p of products) {
      const offerId = `getpawsy_${p.id}`;
      try {
        const remote = await client.getProduct({ contentLanguage: "en", feedLabel: "US", offerId }) as Record<string, unknown>;
        const attrs = (remote.attributes ?? {}) as Record<string, unknown>;
        const price = attrs.price as { amountMicros?: string } | undefined;
        const priceUsd = price?.amountMicros ? Number(price.amountMicros) / 1_000_000 : null;
        diffs.push({
          offerId,
          db: { name: p.name, price: p.price, image: p.image_url },
          remote: { title: attrs.title, priceUsd, image: attrs.imageLink, availability: attrs.availability, link: attrs.link },
          titleMatch: attrs.title === p.name,
          priceMatch: priceUsd === Number(p.price),
        });
      } catch (e) {
        // Never let a single-product failure escape as an unhandled rejection.
        if (e instanceof MerchantApiClientError) {
          diffs.push({ offerId, error: "merchant_api_error", upstreamStatus: e.status ?? null, code: e.code ?? null });
        } else {
          const err = e as Error;
          mlog("shadow_item_exception", { corrId, offerId, message: err?.message });
          diffs.push({ offerId, error: "shadow_comparison_error" });
        }
      }
    }

    mlog("shadow_ok", { corrId, count: diffs.length });
    return json({ ok: true, generated_at: new Date().toISOString(), sample_size: diffs.length, diffs });
  } catch (e) {
    if (e instanceof MerchantApiClientError) {
      const errStage = e.stage || stage;
      mlog("shadow_merchant_error", { corrId, stage: errStage, status: e.status, code: e.code });
      if (e.code === "reauth_required") {
        return json({ ok: false, error: "merchant_reauth_required", stage: errStage, upstreamStatus: e.status }, 401);
      }
      if (e.status === 403) {
        return json({ ok: false, error: "forbidden", stage: errStage, upstreamStatus: 403 }, 403);
      }
      if (e.status === 404) {
        return json({ ok: false, error: "merchant_account_not_found", stage: errStage, upstreamStatus: 404 }, 404);
      }
      return json({ ok: false, error: "shadow_comparison_error", stage: errStage, upstreamStatus: typeof e.status === "number" ? e.status : null }, 502);
    }
    const err = e as Error;
    mlog("shadow_unexpected_exception", { corrId, stage, message: err?.message, stack: err?.stack });
    return json({ ok: false, error: "internal_error", stage }, 500);
  }
});