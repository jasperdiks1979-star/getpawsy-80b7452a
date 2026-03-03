import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AES-GCM encryption for refresh token
async function encryptToken(plaintext: string, keyStr: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(keyStr.slice(0, 32).padEnd(32, "0")),
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    enc.encode(plaintext)
  );
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return `${ivB64}:${ctB64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Support both GET (legacy direct redirect) and POST (new proxy flow)
  let code: string | null = null;
  let state: string | null = null;
  let isPostFlow = false;

  if (req.method === "POST") {
    isPostFlow = true;
    try {
      const body = await req.json();
      code = body.code || null;
      state = body.state || null;
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } else {
    // GET — legacy redirect flow
    const url = new URL(req.url);
    code = url.searchParams.get("code");
    state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
      return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?error=${encodeURIComponent(error)}`, 302);
    }
  }

  if (!code || !state) {
    if (isPostFlow) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing code or state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
    return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?error=missing_params`, 302);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const configuredRedirect = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    const fallbackRedirect = `${supabaseUrl}/functions/v1/merchant-oauth-callback`;
    const redirectUri = configuredRedirect || fallbackRedirect;
    const encryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    const merchantId = Deno.env.get("GOOGLE_MERCHANT_CENTER_ID");

    console.log("[merchant-oauth-callback] Redirect URI used for token exchange:", redirectUri);

    if (!encryptionKey) {
      console.error("[merchant-oauth-callback] TOKEN_ENCRYPTION_KEY not set");
      if (isPostFlow) {
        return new Response(
          JSON.stringify({ ok: false, error: "Server configuration error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
      return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?error=server_config`, 302);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Look up state to get code_verifier and user_id
    const { data: stateData, error: stateError } = await supabase
      .from("merchant_oauth_state")
      .select("*")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (stateError || !stateData) {
      console.error("[merchant-oauth-callback] Invalid/expired state:", stateError?.message);
      if (isPostFlow) {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid or expired OAuth state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
      return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?error=invalid_state`, 302);
    }

    // Exchange code for tokens — redirect_uri MUST match what was used in the authorize request
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: stateData.code_verifier,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.refresh_token) {
      console.error("[merchant-oauth-callback] Token exchange failed:", JSON.stringify({ error: tokenData.error, error_description: tokenData.error_description }));
      if (isPostFlow) {
        return new Response(
          JSON.stringify({ ok: false, error: "Token exchange failed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
      return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?error=token_exchange_failed`, 302);
    }

    // Encrypt refresh token
    const encryptedRefreshToken = await encryptToken(tokenData.refresh_token, encryptionKey);

    // Upsert token record
    const { error: upsertError } = await supabase
      .from("merchant_oauth_tokens")
      .upsert(
        {
          user_id: stateData.user_id,
          encrypted_refresh_token: encryptedRefreshToken,
          access_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
          token_created_at: new Date().toISOString(),
          token_refreshed_at: new Date().toISOString(),
          merchant_center_id: merchantId || null,
          is_connected: true,
          last_error: null,
          last_error_at: null,
        },
        { onConflict: "user_id", ignoreDuplicates: false }
      );

    if (upsertError) {
      console.error("[merchant-oauth-callback] DB upsert error:", upsertError);
      await supabase.from("merchant_oauth_tokens").insert({
        user_id: stateData.user_id,
        encrypted_refresh_token: encryptedRefreshToken,
        access_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
        merchant_center_id: merchantId || null,
        is_connected: true,
      });
    }

    // Clean up used state
    await supabase.from("merchant_oauth_state").delete().eq("state", state);

    console.log("[merchant-oauth-callback] ✅ Successfully connected for user:", stateData.user_id);

    if (isPostFlow) {
      return new Response(
        JSON.stringify({ ok: true, message: "Connected successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
    return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?connected=1`, 302);
  } catch (err) {
    console.error("[merchant-oauth-callback] Unhandled error:", err);
    if (isPostFlow) {
      return new Response(
        JSON.stringify({ ok: false, error: "Internal error completing OAuth flow" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
    return Response.redirect(`${appBaseUrl}/admin/integrations/merchant?error=internal`, 302);
  }
});
