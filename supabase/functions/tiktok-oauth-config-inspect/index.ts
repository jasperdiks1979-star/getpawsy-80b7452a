import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Stable error codes returned to the UI so it can show targeted messages
 * instead of leaking raw auth errors. Keep these names in sync with the
 * switch statement in TikTokConnectCard.handleInspectConfig().
 */
type InspectErrorCode =
  | "missing_authorization_header"
  | "invalid_auth_token"
  | "user_not_found"
  | "not_admin"
  | "internal_error";

function errorResponse(
  code: InspectErrorCode,
  message: string,
  status: number,
) {
  return new Response(
    JSON.stringify({ ok: false, code, error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Mask a secret so we can safely show it in the UI.
 *   "aw1234abcd5678efgh"  ->  "aw12…efgh  (len=18)"
 * Empty / missing values become "(not set)".
 */
function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  const v = value.trim();
  if (v.length <= 8) return `${"•".repeat(v.length)}  (len=${v.length})`;
  return `${v.slice(0, 4)}…${v.slice(-4)}  (len=${v.length})`;
}

/**
 * TikTok OAuth Config Inspect
 *
 * Admin-only diagnostic endpoint. Returns:
 *  - the *masked* TIKTOK_CLIENT_KEY currently in use by the edge functions
 *  - the redirect_uri that tiktok-oauth-start would generate for the caller's origin
 *  - the exact authorize URL that would be sent to TikTok (with the same masking)
 *  - the requested scopes
 *
 * Use this when "Connect TikTok" fails with `client_key` errors to confirm
 * which key the edge function is actually sending to TikTok.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");

    // Auth: only admins. We deliberately split each failure mode into its own
    // error code so the UI can show a specific, actionable message
    // ("you're signed out" vs "your account is not an admin").
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      console.warn("[tiktok-oauth-config-inspect] Missing/invalid Authorization header");
      return errorResponse(
        "missing_authorization_header",
        "You must be signed in as an admin to use the TikTok OAuth config inspector.",
        401,
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return errorResponse(
        "missing_authorization_header",
        "You must be signed in as an admin to use the TikTok OAuth config inspector.",
        401,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      console.warn(
        "[tiktok-oauth-config-inspect] Auth token rejected:",
        authError?.message ?? "no user",
      );
      return errorResponse(
        "invalid_auth_token",
        "Your session is invalid or expired. Please sign in again as an admin.",
        401,
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      console.error(
        "[tiktok-oauth-config-inspect] Role lookup failed:",
        roleError.message,
      );
      return errorResponse(
        "internal_error",
        "Could not verify your admin role. Please try again or contact support.",
        500,
      );
    }

    if (!roleData) {
      console.warn(
        "[tiktok-oauth-config-inspect] Non-admin attempted access. user_id:",
        user.id,
      );
      return errorResponse(
        "not_admin",
        "Admin access required. The TikTok OAuth config inspector is only available to admin accounts.",
        403,
      );
    }

    // Mirror the exact redirect URI logic from tiktok-oauth-start so the
    // values shown here match what would actually be sent to TikTok.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const origin = (body.origin as string) || "https://getpawsy.lovable.app";
    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;
    const scopes = "user.info.basic,video.publish,video.upload";

    // Quick sanity hints — most "client_key" errors come from one of these.
    const hints: string[] = [];
    const rawKey = (clientKey || "").trim();
    // Stable links we point admins to. Keeping them here (not just in the UI)
    // means the same guidance shows up in logs/curl output too.
    const PORTAL_APPS_URL = "https://developers.tiktok.com/apps";
    const SANDBOX_DOCS_URL =
      "https://developers.tiktok.com/doc/login-kit-sandbox/";
    const TEST_USERS_HELP =
      `Open your app in the TikTok Developer Portal (${PORTAL_APPS_URL}) → ` +
      `Sandbox → Test users → "Add test user" → enter the TikTok username ` +
      `"@getpawsy" (without the @). The user must accept the invite from the ` +
      `notification in their TikTok app before "Connect TikTok" will work. ` +
      `Sandbox keys (sbaw…) only authorize accounts that appear in this list — ` +
      `any other account will fail with an invalid_client / unauthorized error. ` +
      `Docs: ${SANDBOX_DOCS_URL}`;

    if (!rawKey) {
      hints.push("TIKTOK_CLIENT_KEY is not set in Lovable Cloud secrets.");
    } else {
      if (rawKey !== clientKey) {
        hints.push("TIKTOK_CLIENT_KEY contains leading/trailing whitespace — strip it.");
      }
      if (rawKey.length < 12) {
        hints.push("TIKTOK_CLIENT_KEY looks unusually short — verify you copied the Client Key, not just a prefix.");
      }
      if (rawKey.length > 40) {
        hints.push(
          "TIKTOK_CLIENT_KEY looks unusually long — you may have pasted the Client Secret instead of the Client Key.",
        );
      }
      if (!/^[a-z0-9]+$/i.test(rawKey)) {
        hints.push("TIKTOK_CLIENT_KEY contains unexpected characters (only letters/digits expected).");
      }
      if (rawKey.toLowerCase().startsWith("sbaw")) {
        hints.push(
          "Sandbox key detected (sbaw…). " + TEST_USERS_HELP,
        );
      }
    }
    if (!clientSecret) {
      hints.push("TIKTOK_CLIENT_SECRET is not set — token exchange will fail in the callback step.");
    }

    // Build the same authorize URL tiktok-oauth-start would build, but with
    // the key masked. Useful for visually confirming what TikTok receives.
    const maskedKey = maskSecret(clientKey);
    const authorizeUrlPreview =
      `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(maskedKey)}` +
      `&response_type=code&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=<csrf>`;

    return new Response(
      JSON.stringify({
        ok: true,
        client_key_masked: maskedKey,
        client_secret_set: Boolean(clientSecret),
        client_secret_length: clientSecret ? clientSecret.length : 0,
        redirect_uri: redirectUri,
        origin_used: origin,
        scopes,
        authorize_url_preview: authorizeUrlPreview,
        hints,
        // Always returned so the UI can show "where do I add @getpawsy?" even
        // when there are no warning hints — admins keep asking for the link.
        sandbox_test_user_help: {
          tiktok_username_to_add: "@getpawsy",
          portal_apps_url: PORTAL_APPS_URL,
          sandbox_docs_url: SANDBOX_DOCS_URL,
          steps: [
            `Open your TikTok app at ${PORTAL_APPS_URL}`,
            "Switch to the Sandbox tab (top of the app page)",
            "Open the Test users section",
            'Click "Add test user" and enter the username "getpawsy"',
            "Open the TikTok mobile app on the @getpawsy account and accept the invite notification",
            'Return here and try "Connect TikTok" again',
          ],
          why_sandbox_only:
            "Sandbox client keys (prefix sbaw…) are isolated from production. " +
            "TikTok will reject the OAuth request for any account that is not " +
            "explicitly listed under Sandbox → Test users, returning errors " +
            "like invalid_client, unauthorized_client, or 'application not " +
            "approved'. To authorize @getpawsy you either (a) add it as a " +
            "test user above, or (b) submit the app for production review " +
            "and switch to the production client key.",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tiktok-oauth-config-inspect] Error:", err);
    return errorResponse(
      "internal_error",
      err instanceof Error ? err.message : "Internal error",
      500,
    );
  }
});