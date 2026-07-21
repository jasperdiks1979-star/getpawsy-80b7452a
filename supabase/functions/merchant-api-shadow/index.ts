// Read-only shadow diff: for N sample products fetches the processed product
// from Merchant API v1 and diffs against DB source-of-truth. No writes.
//
// CORS-safe contract: every code path — including unexpected exceptions —
// returns a JSON body with corsHeaders. No bare 500s, no unhandled rejections.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, MerchantApiClientError, readEnabled, mlog, buildProductIdSegment } from "../_shared/merchant-api.ts";

const CONTENT_LANGUAGE = "en";
const FEED_LABEL = "US";

type Classification =
  | "PRODUCT_FOUND_MATCH"
  | "PRODUCT_FOUND_DIFFERENT_ATTRIBUTES"
  | "PRODUCT_TRULY_NOT_FOUND"
  | "RESOURCE_NAME_CONSTRUCTION_ERROR"
  | "MERCHANT_API_ERROR";

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
    const account = await client.resolveAccount();

    // ── Authoritative mapping: list processed products once, index by offerId,
    //    and use Google's returned resource name for the per-product GET. This
    //    avoids inferring contentLanguage / feedLabel locally when Google
    //    already provides them.
    stage = "list_merchant_products";
    const resourceByOfferId = new Map<string, string>();
    try {
      let pageToken: string | undefined;
      let pages = 0;
      while (pages < 20) { // hard cap: 20 * 250 = 5000 products
        const page = await client.listProducts(250, pageToken);
        for (const raw of page.products ?? []) {
          const prod = raw as Record<string, unknown>;
          const name = typeof prod.name === "string" ? prod.name : "";
          const offerId = typeof prod.offerId === "string" ? prod.offerId : "";
          if (name && offerId && !resourceByOfferId.has(offerId)) {
            resourceByOfferId.set(offerId, name);
          }
        }
        if (!page.nextPageToken) break;
        pageToken = page.nextPageToken;
        pages++;
      }
    } catch (listErr) {
      // Non-fatal: fall back to constructed resource names. Log and continue.
      if (listErr instanceof MerchantApiClientError) {
        mlog("shadow_list_products_failed", { corrId, status: listErr.status, code: listErr.code });
      } else {
        mlog("shadow_list_products_exception", { corrId, message: (listErr as Error)?.message });
      }
    }

    stage = "per_product_diff";
    const diffs: Array<Record<string, unknown>> = [];
    for (const p of products) {
      const offerId = `getpawsy_${p.id}`;

      // Construct expected canonical resource name (en~US~offerId).
      let requestedResourceName: string;
      try {
        const idSeg = buildProductIdSegment(CONTENT_LANGUAGE, FEED_LABEL, offerId);
        requestedResourceName = `${account}/products/${idSeg}`;
      } catch (_ce) {
        diffs.push({
          offerId,
          classification: "RESOURCE_NAME_CONSTRUCTION_ERROR" satisfies Classification,
          requestedResourceName: null,
          resolvedResourceName: null,
          found: false,
          legacyContentApiPresent: true, // DB row exists → local Content API surface
          safeHttpStatus: 400,
        });
        continue;
      }

      const authoritative = resourceByOfferId.get(offerId);
      const resourceToGet = authoritative ?? requestedResourceName;

      try {
        const remote = await client.getProductByResourceName(resourceToGet) as Record<string, unknown>;
        const attrs = (remote.attributes ?? {}) as Record<string, unknown>;
        const price = attrs.price as { amountMicros?: string } | undefined;
        const priceUsd = price?.amountMicros ? Number(price.amountMicros) / 1_000_000 : null;
        const titleMatch = attrs.title === p.name;
        const priceMatch = priceUsd !== null && priceUsd === Number(p.price);
        const differences: string[] = [];
        if (!titleMatch) differences.push("title");
        if (!priceMatch) differences.push("price");
        const classification: Classification = differences.length === 0
          ? "PRODUCT_FOUND_MATCH"
          : "PRODUCT_FOUND_DIFFERENT_ATTRIBUTES";
        diffs.push({
          offerId,
          classification,
          requestedResourceName,
          resolvedResourceName: typeof remote.name === "string" ? remote.name : resourceToGet,
          found: true,
          legacyContentApiPresent: true,
          attributeDifferences: differences,
          db: { name: p.name, price: p.price, image: p.image_url },
          remote: { title: attrs.title, priceUsd, image: attrs.imageLink, availability: attrs.availability, link: attrs.link },
          safeHttpStatus: 200,
        });
      } catch (e) {
        if (e instanceof MerchantApiClientError) {
          const status = typeof e.status === "number" ? e.status : 0;
          if (status === 404) {
            diffs.push({
              offerId,
              classification: "PRODUCT_TRULY_NOT_FOUND" satisfies Classification,
              requestedResourceName,
              resolvedResourceName: authoritative ?? null,
              found: false,
              legacyContentApiPresent: true,
              safeHttpStatus: 404,
            });
          } else {
            diffs.push({
              offerId,
              classification: "MERCHANT_API_ERROR" satisfies Classification,
              requestedResourceName,
              resolvedResourceName: authoritative ?? null,
              found: false,
              legacyContentApiPresent: true,
              upstreamStatus: status,
              upstreamCode: e.code ?? null,
              safeHttpStatus: status >= 400 && status < 600 ? status : 502,
            });
          }
        } else {
          const err = e as Error;
          mlog("shadow_item_exception", { corrId, offerId, message: err?.message });
          diffs.push({
            offerId,
            classification: "MERCHANT_API_ERROR" satisfies Classification,
            requestedResourceName,
            resolvedResourceName: authoritative ?? null,
            found: false,
            legacyContentApiPresent: true,
            safeHttpStatus: 502,
          });
        }
      }
    }

    const summary = diffs.reduce<Record<string, number>>((acc, d) => {
      const k = String(d.classification ?? "UNKNOWN");
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    mlog("shadow_ok", { corrId, count: diffs.length, summary });
    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      sample_size: diffs.length,
      merchantApiVersion: "v1",
      account,
      authoritativeMappingCount: resourceByOfferId.size,
      summary,
      diffs,
    });
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