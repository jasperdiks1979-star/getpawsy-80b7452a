import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";
import { getTikTokClientKey, getTikTokClientSecret } from "../_shared/tiktok-secrets.ts";

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

/**
 * TikTok OAuth Callback
 * Exchanges the authorization code for access + refresh tokens,
 * fetches the connected TikTok account info, and stores everything
 * in tiktok_oauth_tokens for the publisher to use.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Sanitize at read time — pasted secrets often carry trailing spaces or
    // newlines from the Developer Portal, which break the token exchange POST.
    const clientKey = getTikTokClientKey();
    const clientSecret = getTikTokClientSecret();

    if (!clientKey || !clientSecret) {
      return new Response(
        JSON.stringify({ ok: false, error: "TikTok credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, string>));
    const code = body.code as string | undefined;
    const state = body.state as string | undefined;
    const origin = resolveTikTokOAuthOrigin(body.origin);
    const debug = body.debug === true || body.debug === "1";
    const clientTicket = (body.client_ticket as string | undefined) || null;
    // validate_only: skip the TikTok token exchange and return after state +
    // client_ticket validation. Used by the admin debug panel to dry-run the
    // callback without burning a real authorization code.
    const validateOnly = body.validate_only === true || body.validate_only === "1";

    // Debug envelope — populated as we go, returned only when debug=true
    const dbg: Record<string, unknown> = {
      receivedAt: new Date().toISOString(),
      hasCode: Boolean(code),
      hasState: Boolean(state),
      origin,
      clientTicketProvided: Boolean(clientTicket),
      validateOnly,
    };

    // In validate_only mode we don't need a code — only state is required.
    if (!state || (!validateOnly && !code)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing code or state", ...(debug ? { debug: dbg } : {}) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify state
    const { data: stateRow } = await supabase
      .from("tiktok_oauth_states")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    dbg.stateLookup = {
      stateValueLength: state.length,
      foundInDb: Boolean(stateRow),
      storedClientTicket: stateRow?.client_ticket ?? null,
      storedExpiresAt: stateRow?.expires_at ?? null,
      storedUserId: stateRow?.user_id ?? null,
    };

    if (!stateRow) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Invalid or expired state",
          ...(debug ? { debug: { ...dbg, validation: "state_not_found" } } : {}),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await supabase.from("tiktok_oauth_states").delete().eq("state", state);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "State expired — please retry",
          ...(debug ? { debug: { ...dbg, validation: "state_expired" } } : {}),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate client_ticket when both sides have one. Mismatch is a soft warning
    // (we still proceed — TikTok's own state check is the security boundary), but
    // it's surfaced loudly in debug so we can spot tampering or a stale tab.
    let clientTicketStatus: "match" | "mismatch" | "missing_stored" | "missing_provided" | "absent" = "absent";
    const storedTicket = (stateRow as Record<string, unknown>).client_ticket as string | null | undefined;
    if (clientTicket && storedTicket) {
      clientTicketStatus = clientTicket === storedTicket ? "match" : "mismatch";
    } else if (clientTicket && !storedTicket) {
      clientTicketStatus = "missing_stored";
    } else if (!clientTicket && storedTicket) {
      clientTicketStatus = "missing_provided";
    }
    dbg.clientTicketStatus = clientTicketStatus;
    if (clientTicketStatus === "mismatch") {
      console.warn(
        "[tiktok-oauth-callback] client_ticket MISMATCH — possible tab swap or tampering",
        { provided: clientTicket?.slice(0, 6) + "…", stored: (storedTicket || "").slice(0, 6) + "…" },
      );
    }

    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;
    dbg.redirectUri = redirectUri;

    // Validation-only short circuit: don't consume the state, don't call TikTok.
    // Return everything the debug panel needs to render pass/fail.
    if (validateOnly) {
      const stateOk = true;
      const ticketOk =
        clientTicketStatus === "match" ||
        clientTicketStatus === "absent" ||
        clientTicketStatus === "missing_provided" ||
        clientTicketStatus === "missing_stored";
      return new Response(
        JSON.stringify({
          ok: stateOk && ticketOk,
          mode: "validate_only",
          stateValid: stateOk,
          clientTicketStatus,
          redirectUri,
          storedRedirectTo: stateRow.redirect_to || null,
          storedExpiresAt: stateRow.expires_at,
          ...(debug ? { debug: { ...dbg, validation: "validate_only" } } : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Exchange code for tokens
    const tokenResp = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code ?? "",
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || tokenData.error) {
      console.error("[tiktok-oauth-callback] Token exchange failed:", tokenData);
      return new Response(
        JSON.stringify({
          ok: false,
          error: tokenData.error_description || tokenData.error || "Token exchange failed",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string = tokenData.refresh_token;
    const openId: string = tokenData.open_id;
    const expiresIn: number = tokenData.expires_in || 86400;
    const refreshExpiresIn: number = tokenData.refresh_expires_in || 31536000;
    const scope: string = tokenData.scope || "";

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000).toISOString();

    // Fetch user info (display name + avatar) for nice display in admin
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const userInfoResp = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const userInfo = await userInfoResp.json();
      displayName = userInfo?.data?.user?.display_name ?? null;
      avatarUrl = userInfo?.data?.user?.avatar_url ?? null;
    } catch (e) {
      console.warn("[tiktok-oauth-callback] user info fetch failed:", e);
    }

    // Upsert into tokens table — single account model: replace any existing row for this open_id
    await supabase.from("tiktok_oauth_tokens").delete().eq("open_id", openId);
    const { error: insertError } = await supabase.from("tiktok_oauth_tokens").insert({
      open_id: openId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      scope,
      display_name: displayName,
      avatar_url: avatarUrl,
      connected_by: stateRow.user_id,
    });

    if (insertError) {
      console.error("[tiktok-oauth-callback] Insert failed:", insertError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to store tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cleanup state
    await supabase.from("tiktok_oauth_states").delete().eq("state", state);

    console.log("[tiktok-oauth-callback] Connected TikTok account:", openId, displayName);

    return new Response(
      JSON.stringify({
        ok: true,
        openId,
        displayName,
        avatarUrl,
        redirectTo: stateRow.redirect_to || "/admin/tiktok-automation",
        ...(debug
          ? {
              debug: {
                ...dbg,
                validation: "passed",
                tokenExchange: "ok",
                scopeGranted: scope,
              },
            }
          : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[tiktok-oauth-callback] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});