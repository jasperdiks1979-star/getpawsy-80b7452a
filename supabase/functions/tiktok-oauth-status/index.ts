import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskSecret(value: string | undefined): string {
  if (!value) return "(not set)";
  const v = value.trim();
  if (v.length <= 8) return `${"•".repeat(v.length)} (len=${v.length})`;
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

/**
 * Detects sandbox vs production mode from the client_key prefix.
 * TikTok sandbox keys start with `sbaw`, production with `aw`.
 */
function detectMode(clientKey: string | undefined): {
  mode: "sandbox" | "production" | "unknown";
  detail: string;
} {
  if (!clientKey) return { mode: "unknown", detail: "TIKTOK_CLIENT_KEY is not set" };
  const k = clientKey.trim().toLowerCase();
  if (k.startsWith("sbaw")) {
    return {
      mode: "sandbox",
      detail: "Sandbox key — only test users added in the Developer Portal can authorize",
    };
  }
  if (k.startsWith("aw")) {
    return {
      mode: "production",
      detail: "Production key — any TikTok user can authorize",
    };
  }
  return { mode: "unknown", detail: "Unrecognized key prefix (expected `aw` or `sbaw`)" };
}

/**
 * TikTok OAuth Status — admin-only mini dashboard endpoint.
 *
 * Returns a single envelope with everything an operator needs to debug
 * a failing connection in one glance:
 *   - Masked client key + length, secret presence, scopes, redirect URI
 *   - Sandbox vs Production detection from the key prefix
 *   - Currently connected account (if any) with token TTL + scopes
 *   - Recent OAuth state rows (CSRF tickets) so you can see whether the
 *     user is even reaching the start endpoint
 *   - A list of validation errors / hints when the configuration is broken
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

    // Auth: admin only
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

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const origin = (body.origin as string) || "https://getpawsy.lovable.app";
    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;
    const scopes = "user.info.basic,video.publish,video.upload";

    // --- Secret diagnostics ---------------------------------------------
    const errors: string[] = [];
    const warnings: string[] = [];
    const rawKey = (clientKey || "").trim();
    const mode = detectMode(clientKey);

    if (!rawKey) {
      errors.push("TIKTOK_CLIENT_KEY is not set in Lovable Cloud secrets.");
    } else {
      if (rawKey !== clientKey) {
        warnings.push("TIKTOK_CLIENT_KEY contains leading/trailing whitespace — strip it.");
      }
      if (rawKey.length < 12) {
        warnings.push(
          "TIKTOK_CLIENT_KEY looks unusually short — verify you copied the full Client Key.",
        );
      }
      if (rawKey.length > 40) {
        warnings.push(
          "TIKTOK_CLIENT_KEY looks unusually long — you may have pasted the Client Secret.",
        );
      }
      if (!/^[a-z0-9]+$/i.test(rawKey)) {
        warnings.push("TIKTOK_CLIENT_KEY contains unexpected characters.");
      }
    }
    if (!clientSecret) {
      errors.push("TIKTOK_CLIENT_SECRET is not set — token exchange will fail.");
    }

    // --- Connected account ----------------------------------------------
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("tiktok_oauth_tokens")
      .select("open_id, display_name, avatar_url, scope, expires_at, refresh_expires_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let connectedAccount: Record<string, unknown> | null = null;
    if (tokenRow) {
      const expiresAtMs = new Date(tokenRow.expires_at).getTime();
      const tokenExpired = expiresAtMs < Date.now();
      const refreshExpiresAtMs = tokenRow.refresh_expires_at
        ? new Date(tokenRow.refresh_expires_at).getTime()
        : null;
      const refreshExpired = refreshExpiresAtMs ? refreshExpiresAtMs < Date.now() : null;
      connectedAccount = {
        open_id: tokenRow.open_id,
        display_name: tokenRow.display_name,
        avatar_url: tokenRow.avatar_url,
        scope: tokenRow.scope,
        scopes_granted: tokenRow.scope ? tokenRow.scope.split(",").map((s: string) => s.trim()) : [],
        expires_at: tokenRow.expires_at,
        refresh_expires_at: tokenRow.refresh_expires_at,
        token_expired: tokenExpired,
        refresh_expired: refreshExpired,
        seconds_until_expiry: Math.round((expiresAtMs - Date.now()) / 1000),
        connected_at: tokenRow.created_at,
        last_updated_at: tokenRow.updated_at,
      };

      // Verify granted scopes match what we request.
      const granted = (tokenRow.scope || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const required = scopes.split(",").map((s: string) => s.trim());
      const missingScopes = required.filter((s) => !granted.includes(s));
      if (missingScopes.length > 0) {
        warnings.push(
          `Connected account is missing scope(s): ${missingScopes.join(", ")}. Reconnect to grant them.`,
        );
      }
      if (tokenExpired) {
        warnings.push("Access token has expired — reconnect or trigger refresh.");
      }
    }

    // --- Recent OAuth start attempts (CSRF tickets) ---------------------
    const { data: recentStates } = await supabase
      .from("tiktok_oauth_states")
      .select("state, user_id, redirect_to, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(5);

    // --- Mode + connection summary --------------------------------------
    const isHealthy = errors.length === 0 && Boolean(connectedAccount) && !connectedAccount?.token_expired;
    const summary = errors.length > 0
      ? `Configuration broken: ${errors[0]}`
      : !connectedAccount
        ? "Configuration valid but no TikTok account connected yet."
        : connectedAccount.token_expired
          ? "Connected, but access token has expired."
          : "Connected and healthy.";

    return new Response(
      JSON.stringify({
        ok: true,
        is_healthy: isHealthy,
        summary,
        mode: mode.mode,
        mode_detail: mode.detail,
        config: {
          client_key_masked: maskSecret(clientKey),
          client_key_full: rawKey || null,
          client_key_length: rawKey.length,
          client_secret_set: Boolean(clientSecret),
          client_secret_length: clientSecret ? clientSecret.length : 0,
          redirect_uri: redirectUri,
          origin_used: origin,
          scopes,
          scopes_list: scopes.split(",").map((s) => s.trim()),
        },
        connected_account: connectedAccount,
        recent_state_attempts: (recentStates || []).map((s) => ({
          state_masked: s.state ? `${s.state.slice(0, 6)}…${s.state.slice(-4)}` : null,
          user_id: s.user_id,
          redirect_to: s.redirect_to,
          created_at: s.created_at,
          expires_at: s.expires_at,
          expired: s.expires_at ? new Date(s.expires_at).getTime() < Date.now() : null,
        })),
        errors,
        warnings,
        token_query_error: tokenErr?.message ?? null,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tiktok-oauth-status] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});