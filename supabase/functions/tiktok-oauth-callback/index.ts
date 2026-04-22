import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");

    if (!clientKey || !clientSecret) {
      return new Response(
        JSON.stringify({ ok: false, error: "TikTok credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({} as Record<string, string>));
    const code = body.code as string | undefined;
    const state = body.state as string | undefined;
    const origin = (body.origin as string) || "https://getpawsy.lovable.app";

    if (!code || !state) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing code or state" }),
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

    if (!stateRow) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid or expired state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await supabase.from("tiktok_oauth_states").delete().eq("state", state);
      return new Response(
        JSON.stringify({ ok: false, error: "State expired — please retry" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const redirectUri = `${origin.replace(/\/$/, "")}/auth/tiktok/callback`;

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
        code,
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