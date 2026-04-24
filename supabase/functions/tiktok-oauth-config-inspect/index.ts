import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Auth: only admins
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid auth token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
          "Sandbox key detected (sbaw…). It only works with users you've added under Sandbox → Test users in the TikTok Developer Portal.",
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
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tiktok-oauth-config-inspect] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});