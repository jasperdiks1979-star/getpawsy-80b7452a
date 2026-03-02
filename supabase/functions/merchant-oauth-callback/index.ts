import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  // Store as iv:ciphertext (both base64)
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return `${ivB64}:${ctB64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
  const adminRedirect = `${appBaseUrl}/admin/integrations/merchant`;

  if (error) {
    console.error("[merchant-oauth-callback] OAuth error:", error);
    return Response.redirect(
      `${adminRedirect}?error=${encodeURIComponent(error)}`,
      302
    );
  }

  if (!code || !state) {
    return Response.redirect(`${adminRedirect}?error=missing_params`, 302);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const redirectUri =
      Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI") ||
      "https://getpawsy.pet/api/merchant/oauth/callback";
    const encryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    const merchantId = Deno.env.get("GOOGLE_MERCHANT_CENTER_ID");

    if (!encryptionKey) {
      console.error("[merchant-oauth-callback] TOKEN_ENCRYPTION_KEY not set");
      return Response.redirect(`${adminRedirect}?error=server_config`, 302);
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
      return Response.redirect(`${adminRedirect}?error=invalid_state`, 302);
    }

    // Exchange code for tokens
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
      console.error("[merchant-oauth-callback] Token exchange failed:", tokenData);
      return Response.redirect(
        `${adminRedirect}?error=token_exchange_failed`,
        302
      );
    }

    // Encrypt refresh token
    const encryptedRefreshToken = await encryptToken(
      tokenData.refresh_token,
      encryptionKey
    );

    // Upsert token record (one row per user)
    const { error: upsertError } = await supabase
      .from("merchant_oauth_tokens")
      .upsert(
        {
          user_id: stateData.user_id,
          encrypted_refresh_token: encryptedRefreshToken,
          access_token_expires_at: new Date(
            Date.now() + (tokenData.expires_in || 3600) * 1000
          ).toISOString(),
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
      // Try insert if upsert fails (no unique constraint on user_id yet)
      await supabase.from("merchant_oauth_tokens").insert({
        user_id: stateData.user_id,
        encrypted_refresh_token: encryptedRefreshToken,
        access_token_expires_at: new Date(
          Date.now() + (tokenData.expires_in || 3600) * 1000
        ).toISOString(),
        merchant_center_id: merchantId || null,
        is_connected: true,
      });
    }

    // Clean up used state
    await supabase
      .from("merchant_oauth_state")
      .delete()
      .eq("state", state);

    console.log(
      "[merchant-oauth-callback] ✅ Successfully connected for user:",
      stateData.user_id
    );

    return Response.redirect(`${adminRedirect}?connected=1`, 302);
  } catch (err) {
    console.error("[merchant-oauth-callback] Unhandled error:", err);
    return Response.redirect(`${adminRedirect}?error=internal`, 302);
  }
});
