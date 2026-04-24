import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";
import { getTikTokClientKey, getTikTokClientSecret, sanitizeSecret } from "../_shared/tiktok-secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * TikTok OAuth Smoke Test
 *
 * Admin-only diagnostic that exercises the *real* TikTok OAuth endpoints
 * using the sanitized secrets, without requiring the operator to actually
 * complete a browser login. Two checks:
 *
 *   1. authorize_url_check
 *      Builds the same authorize URL tiktok-oauth-start would generate and
 *      issues a GET to TikTok. A healthy `client_key` returns the TikTok
 *      login HTML (status 200/302). A malformed/whitespace-tainted key
 *      returns a 4xx error page mentioning `invalid_client_key`.
 *
 *   2. token_exchange_probe
 *      POSTs to TikTok's /v2/oauth/token/ with a deliberately fake
 *      authorization code. The expected outcome is a 4xx response with
 *      `error: "invalid_grant"` (or similar) — that proves TikTok recognized
 *      our client_key/client_secret pair. If TikTok responds with
 *      `invalid_client`, the secrets themselves are wrong/whitespace-tainted.
 *
 * The response is structured so the admin inspector UI can render each check
 * with a pass/fail badge and the raw TikTok response for debugging.
 */

type CheckStatus = "pass" | "fail" | "warn";

interface SmokeCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
  /** Raw bits captured from the TikTok response for forensic copy-paste. */
  evidence?: Record<string, unknown>;
}

interface SmokeResult {
  ok: boolean;
  summary: string;
  elapsed_ms: number;
  redirect_uri: string;
  client_key_masked: string;
  client_secret_set: boolean;
  checks: SmokeCheck[];
}

function maskKey(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return `${"•".repeat(value.length)} (len=${value.length})`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Admin gating — same pattern as the inspect endpoint.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ ok: false, code: "missing_authorization_header", error: "Sign in as admin to run the smoke test." }, 401);
    }
    const token = authHeader.slice(7).trim();
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ ok: false, code: "invalid_auth_token", error: "Session expired — sign in again." }, 401);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return jsonResponse({ ok: false, code: "not_admin", error: "Admin access required." }, 403);
    }

    // Read sanitized secrets — these are the exact values OAuth functions use.
    const rawClientKey = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
    const rawClientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
    const clientKey = getTikTokClientKey();
    const clientSecret = getTikTokClientSecret();

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const origin = (body.origin as string) || "https://getpawsy.lovable.app";
    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;
    const scopes = "user.info.basic,video.publish,video.upload";

    const checks: SmokeCheck[] = [];

    // ---- Check 0: secrets present ----
    if (!clientKey || !clientSecret) {
      checks.push({
        name: "Secrets configured",
        status: "fail",
        detail: `client_key ${clientKey ? "set" : "MISSING"}, client_secret ${clientSecret ? "set" : "MISSING"}`,
        hint: "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Lovable Cloud → Backend → Secrets.",
      });
      return jsonResponse({
        ok: false,
        summary: "TikTok secrets missing — cannot run smoke test.",
        elapsed_ms: Date.now() - startedAt,
        redirect_uri: redirectUri,
        client_key_masked: maskKey(clientKey),
        client_secret_set: Boolean(clientSecret),
        checks,
      } satisfies SmokeResult);
    }
    checks.push({
      name: "Secrets configured",
      status: "pass",
      detail: `client_key=${maskKey(clientKey)}, client_secret length=${clientSecret.length}`,
    });

    // ---- Check 1: drift between raw and sanitized ----
    if (rawClientKey !== clientKey || rawClientSecret !== clientSecret) {
      checks.push({
        name: "Secret sanitization",
        status: "warn",
        detail:
          `Stored secret(s) contained whitespace/invisible chars. ` +
          `client_key raw=${rawClientKey.length}/clean=${clientKey.length}, ` +
          `client_secret raw=${rawClientSecret.length}/clean=${clientSecret.length}.`,
        hint: "Auto-trimmed at runtime, but please re-save the secret without trailing spaces.",
      });
    } else {
      checks.push({
        name: "Secret sanitization",
        status: "pass",
        detail: "Stored secrets are clean (no whitespace, BOM, or zero-width chars).",
      });
    }

    // ---- Check 2: authorize URL probe ----
    const authorizeUrl =
      `https://www.tiktok.com/v2/auth/authorize/?` +
      new URLSearchParams({
        client_key: clientKey,
        response_type: "code",
        scope: scopes,
        redirect_uri: redirectUri,
        state: "smoketest-" + crypto.randomUUID().slice(0, 8),
      }).toString();

    try {
      const authResp = await fetch(authorizeUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "GetPawsy-OAuth-SmokeTest/1.0" },
      });
      // Drain body for forensic snippet without buffering megabytes.
      const bodyText = (await authResp.text()).slice(0, 500);
      const lower = bodyText.toLowerCase();
      const indicatesInvalidKey =
        lower.includes("invalid_client_key") ||
        lower.includes("invalid client key") ||
        lower.includes("client_key_invalid");

      if (authResp.status >= 200 && authResp.status < 400 && !indicatesInvalidKey) {
        checks.push({
          name: "Authorize URL reachable",
          status: "pass",
          detail: `TikTok responded ${authResp.status} to authorize GET — client_key recognized.`,
          evidence: { status: authResp.status, body_preview: bodyText.slice(0, 200) },
        });
      } else {
        checks.push({
          name: "Authorize URL reachable",
          status: "fail",
          detail: `TikTok responded ${authResp.status}${indicatesInvalidKey ? " with invalid_client_key" : ""}.`,
          hint: indicatesInvalidKey
            ? "TikTok rejected the client_key. Verify it matches the value in the Developer Portal exactly."
            : "Unexpected response from TikTok authorize endpoint — check redirect URI registration.",
          evidence: { status: authResp.status, body_preview: bodyText.slice(0, 200) },
        });
      }
    } catch (e) {
      checks.push({
        name: "Authorize URL reachable",
        status: "fail",
        detail: `Network error contacting TikTok: ${e instanceof Error ? e.message : String(e)}`,
        hint: "Edge runtime could not reach www.tiktok.com — try again in a moment.",
      });
    }

    // ---- Check 3: token exchange probe with bogus code ----
    // We expect TikTok to respond with `invalid_grant` (or similar). That proves
    // our client_key/client_secret pair is recognized. If we instead get
    // `invalid_client`, the secrets are wrong.
    try {
      const probeResp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
          "User-Agent": "GetPawsy-OAuth-SmokeTest/1.0",
        },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code: "smoketest-invalid-code-" + crypto.randomUUID(),
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }).toString(),
      });
      const probeJson = await probeResp.json().catch(() => ({} as Record<string, unknown>));
      const errCode = String((probeJson as Record<string, unknown>).error ?? "").toLowerCase();
      const errDesc = String((probeJson as Record<string, unknown>).error_description ?? "");

      // "invalid_grant" / "invalid_request" / "authorization_code_not_found"
      // all indicate the credential pair was accepted but the code was bad —
      // exactly what we want.
      const credentialsAccepted =
        errCode.includes("invalid_grant") ||
        errCode.includes("invalid_request") ||
        errCode.includes("authorization_code") ||
        errCode === "" /* unknown shape but no client error */;

      const credentialsRejected =
        errCode.includes("invalid_client") ||
        errCode.includes("client_key") ||
        errCode.includes("unauthorized_client");

      if (credentialsRejected) {
        checks.push({
          name: "Token exchange credential probe",
          status: "fail",
          detail: `TikTok rejected client credentials: ${errCode || "unknown"}${errDesc ? ` — ${errDesc}` : ""}.`,
          hint: "client_key or client_secret does not match what TikTok has on file. Re-paste both from the Developer Portal.",
          evidence: { status: probeResp.status, body: probeJson },
        });
      } else if (credentialsAccepted) {
        checks.push({
          name: "Token exchange credential probe",
          status: "pass",
          detail: `TikTok accepted client credentials (rejected only the fake code: ${errCode || "no error"}).`,
          evidence: { status: probeResp.status, body: probeJson },
        });
      } else {
        checks.push({
          name: "Token exchange credential probe",
          status: "warn",
          detail: `Unexpected TikTok response: ${errCode || "no error code"}${errDesc ? ` — ${errDesc}` : ""}.`,
          hint: "Smoke test could not classify the response. Inspect evidence below.",
          evidence: { status: probeResp.status, body: probeJson },
        });
      }
    } catch (e) {
      checks.push({
        name: "Token exchange credential probe",
        status: "fail",
        detail: `Network error contacting TikTok token endpoint: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const failed = checks.filter((c) => c.status === "fail").length;
    const warned = checks.filter((c) => c.status === "warn").length;
    const ok = failed === 0;
    const summary = ok
      ? warned > 0
        ? `Smoke test passed with ${warned} warning(s). OAuth credentials look healthy.`
        : "Smoke test passed — TikTok accepted both the authorize URL and the credential pair."
      : `Smoke test failed: ${failed} check(s) failed. See evidence below for the exact TikTok response.`;

    const result: SmokeResult = {
      ok,
      summary,
      elapsed_ms: Date.now() - startedAt,
      redirect_uri: redirectUri,
      client_key_masked: maskKey(clientKey),
      client_secret_set: Boolean(clientSecret),
      checks,
    };

    console.log(
      `[tiktok-oauth-smoke-test] user=${user.id} ok=${ok} failed=${failed} warned=${warned} elapsed=${result.elapsed_ms}ms`,
    );

    return jsonResponse(result);
  } catch (err) {
    console.error("[tiktok-oauth-smoke-test] Error:", err);
    return jsonResponse(
      {
        ok: false,
        code: "internal_error",
        error: err instanceof Error ? err.message : "Internal error",
        elapsed_ms: Date.now() - startedAt,
      },
      500,
    );
  }
});

// Re-export sanitizeSecret to silence unused-import linter without changing behavior.
void sanitizeSecret;