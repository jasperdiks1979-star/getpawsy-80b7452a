import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CANONICAL_TIKTOK_OAUTH_ORIGIN = "https://getpawsy.pet";
const ALLOWED_TIKTOK_OAUTH_ORIGINS = new Set([
  CANONICAL_TIKTOK_OAUTH_ORIGIN,
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
]);

function resolveTikTokOAuthOrigin(origin: unknown): string {
  if (typeof origin !== "string") return CANONICAL_TIKTOK_OAUTH_ORIGIN;
  const clean = origin.replace(/\/+$/, "");
  return ALLOWED_TIKTOK_OAUTH_ORIGINS.has(clean) ? clean : CANONICAL_TIKTOK_OAUTH_ORIGIN;
}

type Check = {
  name: string;
  status: "pass" | "fail" | "warn" | "info";
  detail: string;
  hint?: string;
};

/**
 * TikTok OAuth Diagnose
 * Pre-flight check that validates the full OAuth handshake configuration
 * BEFORE the user is redirected to TikTok. Returns a list of pass/fail
 * checks with actionable hints for the developer portal.
 *
 * Checks performed:
 *  1. Required secrets present (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET)
 *  2. Caller is authenticated + admin
 *  3. Redirect URI is well-formed and uses an allowed origin
 *  4. Token endpoint reachable from the edge runtime
 *  5. Authorize endpoint returns a non-error response for the built URL
 *     (we do a HEAD/GET and inspect the response — if TikTok would have
 *     responded with an "invalid client_key" error page we surface that
 *     here instead of letting the user discover it after redirect).
 *  6. Database tables (tiktok_oauth_states, tiktok_oauth_tokens) exist
 *     and are writable with the service role.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const checks: Check[] = [];
  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");

    // 1) Secrets
    checks.push({
      name: "TIKTOK_CLIENT_KEY secret",
      status: clientKey ? "pass" : "fail",
      detail: clientKey
        ? `Set (length ${clientKey.length}, starts with "${clientKey.slice(0, 4)}…")`
        : "Missing",
      hint: clientKey
        ? undefined
        : "Add TIKTOK_CLIENT_KEY to project secrets (Lovable Cloud → Secrets).",
    });
    checks.push({
      name: "TIKTOK_CLIENT_SECRET secret",
      status: clientSecret ? "pass" : "fail",
      detail: clientSecret ? `Set (length ${clientSecret.length})` : "Missing",
      hint: clientSecret
        ? undefined
        : "Add TIKTOK_CLIENT_SECRET to project secrets.",
    });

    // 2) Auth + admin
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let isAdmin = false;
    if (!authHeader) {
      checks.push({
        name: "Caller authenticated",
        status: "fail",
        detail: "No Authorization header",
        hint: "Call this endpoint from the admin UI while logged in.",
      });
    } else {
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (authError || !user) {
        checks.push({
          name: "Caller authenticated",
          status: "fail",
          detail: authError?.message || "Invalid token",
        });
      } else {
        userId = user.id;
        checks.push({
          name: "Caller authenticated",
          status: "pass",
          detail: `User ${user.email || user.id}`,
        });
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        const { data: roleRow } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        isAdmin = !!roleRow;
        checks.push({
          name: "Caller is admin",
          status: isAdmin ? "pass" : "fail",
          detail: isAdmin ? "Admin role confirmed" : "Not an admin",
        });
      }
    }

    // 3) Redirect URI
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const origin = resolveTikTokOAuthOrigin(body.origin);
    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;
    const validOrigins = [
      "https://getpawsy.pet",
      "https://www.getpawsy.pet",
      "https://getpawsy.lovable.app",
      "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
    ];
    const originOk = validOrigins.includes(origin.replace(/\/$/, ""));
    checks.push({
      name: "Redirect URI",
      status: originOk ? "pass" : "warn",
      detail: redirectUri,
      hint: originOk
        ? "This exact URI must be listed in TikTok Developer Portal → Login Kit → Redirect URI."
        : `Origin ${origin} is not in the known allow-list. Make sure it's registered in TikTok.`,
    });

    // 4) Token endpoint reachability
    try {
      const tokenPing = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "OPTIONS",
      });
      checks.push({
        name: "TikTok token endpoint reachable",
        status: tokenPing.status < 500 ? "pass" : "fail",
        detail: `HTTP ${tokenPing.status}`,
      });
    } catch (e) {
      checks.push({
        name: "TikTok token endpoint reachable",
        status: "fail",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 5) Authorize URL probe — TikTok returns an HTML error page when the
    //    client_key is invalid. We GET the URL with redirect=manual and
    //    inspect the response body for known error markers.
    let authorizeProbe: Check = {
      name: "TikTok authorize URL probe",
      status: "info",
      detail: "Skipped (no client_key)",
    };
    if (clientKey) {
      const params = new URLSearchParams({
        client_key: clientKey,
        response_type: "code",
        scope: "user.info.basic,video.publish,video.upload",
        redirect_uri: redirectUri,
        state: "diagnostic-probe",
      });
      const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
      try {
        const probe = await fetch(authUrl, { redirect: "manual" });
        const text = await probe.text();
        const looksInvalidKey = /invalid[_\s-]?client[_\s-]?key|invalid[_\s-]?app/i.test(text);
        const looksInvalidRedirect = /redirect[_\s-]?uri|invalid[_\s-]?redirect/i.test(text) &&
          !/please/i.test(text);
        const looksScopeIssue = /invalid[_\s-]?scope/i.test(text);

        if (probe.status >= 300 && probe.status < 400) {
          authorizeProbe = {
            name: "TikTok authorize URL probe",
            status: "pass",
            detail: `HTTP ${probe.status} → redirects to login (expected for unauthenticated probe).`,
          };
        } else if (looksInvalidKey) {
          authorizeProbe = {
            name: "TikTok authorize URL probe",
            status: "fail",
            detail: "TikTok responded with an invalid client_key error.",
            hint:
              "1) Verify TIKTOK_CLIENT_KEY matches the Client Key in TikTok Developer Portal exactly. " +
              "2) Make sure the app status is 'Live' (or your account is added as a sandbox user). " +
              "3) Confirm Login Kit + Content Posting API are both added to the app.",
          };
        } else if (looksInvalidRedirect) {
          authorizeProbe = {
            name: "TikTok authorize URL probe",
            status: "fail",
            detail: "TikTok rejected the redirect_uri.",
            hint: `Add this exact URI to TikTok Developer Portal → Login Kit → Redirect URI: ${redirectUri}`,
          };
        } else if (looksScopeIssue) {
          authorizeProbe = {
            name: "TikTok authorize URL probe",
            status: "fail",
            detail: "TikTok rejected one of the requested scopes.",
            hint:
              "Enable user.info.basic, video.publish and video.upload in the Developer Portal under Scopes.",
          };
        } else {
          authorizeProbe = {
            name: "TikTok authorize URL probe",
            status: "pass",
            detail: `HTTP ${probe.status} — no known error markers in response.`,
          };
        }
      } catch (e) {
        authorizeProbe = {
          name: "TikTok authorize URL probe",
          status: "warn",
          detail: `Could not fetch authorize URL: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    checks.push(authorizeProbe);

    // 6) DB tables
    if (isAdmin && userId) {
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      const probeState = `diag-${crypto.randomUUID()}`;
      const { error: insertErr } = await sb.from("tiktok_oauth_states").insert({
        state: probeState,
        user_id: userId,
        redirect_to: "/admin/tiktok-automation",
      });
      if (insertErr) {
        checks.push({
          name: "tiktok_oauth_states writable",
          status: "fail",
          detail: insertErr.message,
        });
      } else {
        await sb.from("tiktok_oauth_states").delete().eq("state", probeState);
        checks.push({
          name: "tiktok_oauth_states writable",
          status: "pass",
          detail: "Insert + delete succeeded.",
        });
      }

      const { error: tokenSelErr } = await sb
        .from("tiktok_oauth_tokens")
        .select("open_id")
        .limit(1);
      checks.push({
        name: "tiktok_oauth_tokens readable",
        status: tokenSelErr ? "fail" : "pass",
        detail: tokenSelErr ? tokenSelErr.message : "OK",
      });
    }

    const failed = checks.filter((c) => c.status === "fail");
    const warned = checks.filter((c) => c.status === "warn");
    const summary = failed.length > 0
      ? `${failed.length} check(s) failed — fix these before retrying OAuth.`
      : warned.length > 0
      ? `All critical checks passed, but ${warned.length} warning(s) to review.`
      : "All checks passed. The OAuth handshake should succeed.";

    return new Response(
      JSON.stringify({
        ok: failed.length === 0,
        summary,
        elapsed_ms: Date.now() - startedAt,
        redirectUri,
        checks,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        summary: "Diagnostic crashed before completion.",
        error: err instanceof Error ? err.message : String(err),
        checks,
      }, null, 2),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});