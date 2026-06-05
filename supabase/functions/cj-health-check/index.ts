// CJ API Health Check
// Returns: env presence, token cache status, live token fetch result,
// account/settings probe, last sync errors. Admin-only (JWT).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ---- Auth: require admin user
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, traceId, message: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ ok: false, traceId, message: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin =
      !!roleRow || ADMIN_FALLBACK_EMAILS.includes((user.email ?? "").toLowerCase());
    if (!isAdmin) return json({ ok: false, traceId, message: "Forbidden" }, 403);

    // ---- 1. Env presence
    const env = {
      CJ_API_KEY: !!Deno.env.get("CJ_API_KEY"),
      CJ_API_SECRET: !!Deno.env.get("CJ_API_SECRET"),
      CJ_EMAIL: !!Deno.env.get("CJ_EMAIL"),
      CJ_PASSWORD: !!Deno.env.get("CJ_PASSWORD"),
      SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
    };

    // ---- 2. Token cache snapshot
    const { data: cached } = await admin
      .from("cj_token_cache")
      .select("access_token, token_expiry, updated_at")
      .eq("id", "singleton")
      .maybeSingle();

    const now = Date.now();
    const cacheStatus = cached
      ? {
          present: true,
          expires_at: cached.token_expiry,
          updated_at: cached.updated_at,
          valid: new Date(cached.token_expiry).getTime() > now,
          age_minutes: cached.updated_at
            ? Math.round((now - new Date(cached.updated_at).getTime()) / 60000)
            : null,
          token_preview: cached.access_token
            ? `${cached.access_token.slice(0, 6)}…${cached.access_token.slice(-4)}`
            : null,
        }
      : { present: false };

    // ---- 3. Live token fetch (always — proves CJ_API_KEY works right now)
    const apiKey = Deno.env.get("CJ_API_KEY");
    let tokenFetch: Record<string, unknown> = { attempted: false };
    let liveToken: string | null = null;

    if (!apiKey) {
      tokenFetch = {
        attempted: false,
        skipped: "CJ_API_KEY not configured",
      };
    } else {
      const t0 = Date.now();
      try {
        const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { /* keep text */ }
        const success = !!body?.result;
        liveToken = success ? body?.data?.accessToken ?? null : null;
        tokenFetch = {
          attempted: true,
          endpoint: `${CJ_API_BASE}/authentication/getAccessToken`,
          http_status: res.status,
          duration_ms: Date.now() - t0,
          cj_result: body?.result ?? null,
          cj_code: body?.code ?? null,
          cj_message: body?.message ?? null,
          token_preview: liveToken
            ? `${liveToken.slice(0, 6)}…${liveToken.slice(-4)}`
            : null,
          token_expiry: success ? body?.data?.accessTokenExpiryDate ?? null : null,
          raw_body_preview: text.slice(0, 500),
        };
      } catch (e) {
        tokenFetch = {
          attempted: true,
          endpoint: `${CJ_API_BASE}/authentication/getAccessToken`,
          duration_ms: Date.now() - t0,
          network_error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    // ---- 4. Account probe (mySetting/queryMySetting) when we have a token
    const tokenToUse = liveToken ?? (cached?.access_token as string | undefined) ?? null;
    let accountProbe: Record<string, unknown> = { attempted: false };
    if (tokenToUse) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${CJ_API_BASE}/setting/getCountry`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "CJ-Access-Token": tokenToUse },
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { /* keep text */ }
        accountProbe = {
          attempted: true,
          endpoint: `${CJ_API_BASE}/setting/getCountry`,
          http_status: res.status,
          duration_ms: Date.now() - t0,
          cj_result: body?.result ?? null,
          cj_code: body?.code ?? null,
          cj_message: body?.message ?? null,
          sample_size: Array.isArray(body?.data) ? body.data.length : null,
          raw_body_preview: text.slice(0, 300),
        };
      } catch (e) {
        accountProbe = {
          attempted: true,
          network_error: e instanceof Error ? e.message : String(e),
          duration_ms: Date.now() - t0,
        };
      }
    }

    // ---- 5. Recent sync errors (last 20 cj_fetch_failed items)
    const { data: recentErrors } = await admin
      .from("cj_sync_items")
      .select("id, run_id, product_id, action, after, created_at")
      .like("action", "cj_fetch_failed%")
      .order("created_at", { ascending: false })
      .limit(20);

    // ---- 6. Last runs summary
    const { data: lastRuns } = await admin
      .from("cj_sync_runs")
      .select("id, started_at, finished_at, status, totals")
      .order("started_at", { ascending: false })
      .limit(5);

    // ---- Verdict
    const verdict = !env.CJ_API_KEY
      ? "missing_api_key"
      : (tokenFetch as any)?.cj_result === true
        ? "healthy"
        : (tokenFetch as any)?.http_status === 401 ||
          (tokenFetch as any)?.http_status === 403
          ? "auth_failed"
          : (tokenFetch as any)?.network_error
            ? "network_error"
            : "degraded";

    return json({
      ok: true,
      traceId,
      verdict,
      duration_ms: Date.now() - startedAt,
      env,
      token_cache: cacheStatus,
      token_fetch: tokenFetch,
      account_probe: accountProbe,
      recent_errors: recentErrors ?? [],
      last_runs: lastRuns ?? [],
      checked_at: new Date().toISOString(),
      checked_by: user.email ?? user.id,
    });
  } catch (e) {
    return json(
      {
        ok: false,
        traceId,
        message: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});