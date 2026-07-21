// Read-only probe: lists Merchant Center data sources and reports the resolved
// account. No writes, no deletes, no Merchant Center configuration changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { MerchantApiClient, MerchantApiClientError, readEnabled, mlog } from "../_shared/merchant-api.ts";

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
  let stage: string = "init";
  try {
    if (!readEnabled()) return json({ ok: false, error: "MERCHANT_API_READ_ENABLED_false" }, 403);

    stage = "auth";
    const authz = req.headers.get("Authorization");
    if (!authz) return json({ ok: false, error: "missing_auth" }, 401);
    const bearer = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (!bearer) return json({ ok: false, error: "invalid_auth" }, 401);

    // Auth: use the anon client scoped by the caller's Authorization header
    // and validate the token server-side via supabase.auth.getUser(jwt).
    // This matches the known-working pattern used by admin-payments and
    // admin-bulk-seo-update. The service-role client is used only for the
    // subsequent read (merchant token lookup) after auth+authorization pass.
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authz } } },
    );

    let userId: string;
    try {
      const { data: userData, error: uerr } = await authClient.auth.getUser(bearer);
      if (uerr || !userData?.user?.id) {
        mlog("probe_auth_invalid", { corrId, message: uerr?.message });
        return json({ ok: false, error: "invalid_auth" }, 401);
      }
      userId = userData.user.id;
    } catch (authErr) {
      mlog("probe_auth_exception", { corrId, message: (authErr as Error)?.message });
      return json({ ok: false, error: "invalid_auth" }, 401);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    stage = "token_load";
    const { data: token } = await supabase
      .from("merchant_oauth_tokens")
      .select("id, access_token_expires_at, token_refreshed_at, scopes, merchant_center_id, is_connected, last_error, encrypted_refresh_token")
      .eq("user_id", userId).eq("is_connected", true).maybeSingle();
    if (!token) return json({ ok: false, error: "not_connected", stage }, 403);
    const hasRefresh = typeof token.encrypted_refresh_token === "string" && token.encrypted_refresh_token.length > 20;
    if (!hasRefresh) {
      return json({ ok: false, error: "merchant_reauth_required", stage, reason: "no_refresh_token" }, 401);
    }
    const tokenMeta = {
      hasRefreshToken: hasRefresh,
      expiresAt: token.access_token_expires_at,
      expired: token.access_token_expires_at ? new Date(token.access_token_expires_at as string).getTime() < Date.now() : null,
      scopes: token.scopes,
      merchantId: token.merchant_center_id,
      lastError: token.last_error,
    };

    const client = new MerchantApiClient({ supabase });
    stage = "resolve_account";
    const account = await client.resolveAccount();
    stage = "list_data_sources";
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
    return json({ ok: true, stage: "done", account, tokenMeta, dataSources: classified, apiOwnedCandidates: apiOwned.map((c) => c.name), xmlFeedDataSource: xmlFeed?.name ?? null, verdict });
  } catch (e) {
    if (e instanceof MerchantApiClientError) {
      const errStage = e.stage || stage;
      mlog("probe_merchant_error", { corrId, stage: errStage, status: e.status, code: e.code });
      // Explicit mappings
      if (e.code === "reauth_required") {
        return json({ ok: false, error: "merchant_reauth_required", stage: errStage, upstreamStatus: e.status, reason: "invalid_grant", adminAction: "reconnect_google_merchant" }, 401);
      }
      if (e.code === "unauthorized_after_refresh") {
        return json({
          ok: false,
          error: "merchant_api_unauthorized_after_refresh",
          stage: errStage,
          upstreamStatus: 401,
          reason: "google_identity_lacks_merchant_access_or_scope_insufficient",
          adminAction: "verify_google_user_has_access_to_merchant_center_5717571566_or_reauthorize_with_content_scope",
        }, 502);
      }
      if (e.status === 403) {
        const scope = /scope|insufficient/i.test(e.message);
        return json({ ok: false, error: scope ? "merchant_scope_insufficient" : "merchant_account_forbidden", stage: errStage, upstreamStatus: 403 }, 403);
      }
      if (e.status === 404) return json({ ok: false, error: "merchant_account_not_found", stage: errStage, upstreamStatus: 404 }, 404);
      if (typeof e.status === "number" && e.status > 0) {
        return json({ ok: false, error: "merchant_api_error", stage: errStage, upstreamStatus: e.status }, 502);
      }
      return json({ ok: false, error: "merchant_api_error", stage: errStage }, 502);
    }
    const err = e as Error;
    mlog("probe_unexpected_exception", { corrId, message: err?.message, stack: err?.stack });
    return json({ ok: false, error: "internal_error", stage }, 500);
  }
});