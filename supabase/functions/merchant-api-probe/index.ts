// Read-only probe: lists Merchant Center data sources and reports the resolved
// account. No writes, no deletes, no Merchant Center configuration changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, readEnabled, mlog } from "../_shared/merchant-api.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Safe correlation: pass-through-only, non-sensitive.
  const probeId = (req.headers.get("x-client-probe-id") || "").slice(0, 64);
  const echoHeaders: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (probeId) echoHeaders["x-echo-probe-id"] = probeId;
  const json = (b: unknown, s = 200) => {
    const body = probeId && b && typeof b === "object" ? { ...(b as object), probeId } : b;
    return new Response(JSON.stringify(body), { status: s, headers: echoHeaders });
  };

  // Correlation ID for server-side logs only; never returned to client.
  const corrId = crypto.randomUUID();
  try {
    if (!readEnabled()) return json({ ok: false, error: "MERCHANT_API_READ_ENABLED_false" }, 403);

    const authz = req.headers.get("Authorization");
    if (!authz) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (!bearer) return json({ ok: false, error: "invalid_auth" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let userId: string;
    try {
      const { data: claims, error: cerr } = await supabase.auth.getClaims(bearer);
      if (cerr || !claims?.claims?.sub) return json({ ok: false, error: "invalid_auth" }, 401);
      userId = claims.claims.sub as string;
    } catch (authErr) {
      mlog("probe_auth_exception", { corrId, message: (authErr as Error)?.message });
      return json({ ok: false, error: "invalid_auth" }, 401);
    }

    const { data: token } = await supabase
      .from("merchant_oauth_tokens").select("id").eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "not_connected" }, 403);

    const client = new MerchantApiClient({ supabase });
    const account = await client.resolveAccount();
    const ds = await client.listDataSources();
    const rows = (ds.dataSources ?? []) as Array<Record<string, unknown>>;
    const classified = rows.map((d) => {
      const primary = (d.primaryProductDataSource ?? {}) as Record<string, unknown>;
      const fileInput = (d.fileInput ?? {}) as Record<string, unknown>;
      return {
        name: d.name, displayName: d.displayName, input: d.input,
        contentLanguage: primary.contentLanguage, feedLabel: primary.feedLabel, countries: primary.countries,
        fetchUri: fileInput.fetchUri,
      };
    });
    const apiOwned = classified.filter((c) =>
      c.input === "API" &&
      String(c.contentLanguage ?? "").toLowerCase() === "en" &&
      String(c.feedLabel ?? "").toUpperCase() === "US");
    const xmlFeed = classified.find((c) => String(c.fetchUri ?? "").includes("getpawsy.pet/merchant-feed.xml"));
    const verdict = apiOwned.length === 0 ? "no_api_data_source_found"
      : apiOwned.length > 1 ? "MERCHANT_DATA_SOURCE_CONFLICT_REQUIRES_REVIEW"
      : "single_api_data_source_resolved";
    mlog("probe_ok", { account, count: classified.length, verdict });
    return json({ ok: true, account, dataSources: classified, apiOwnedCandidates: apiOwned.map((c) => c.name), xmlFeedDataSource: xmlFeed?.name ?? null, verdict });
  } catch (e) {
    const err = e as Error & { status?: number };
    // Preserve prior 502 branch for Merchant API downstream failures that carry a status.
    if (err && typeof err.status === "number") {
      mlog("probe_failed", { corrId, status: err.status, message: err.message });
      return json({ ok: false, error: "merchant_api_error", status: err.status }, 502);
    }
    mlog("probe_unexpected_exception", { corrId, message: err?.message, stack: err?.stack });
    return json({ ok: false, error: "internal_error" }, 500);
  }
});