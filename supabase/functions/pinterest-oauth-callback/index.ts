import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_FRONTEND_BASES = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

const DEFAULT_FRONTEND_BASE = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";

function decodeFrontendBaseFromState(state: string | null): string {
  if (!state || !state.includes("::")) return DEFAULT_FRONTEND_BASE;

  try {
    const encodedBase = state.split("::").slice(1).join("::");
    const decodedBase = atob(encodedBase);
    return ALLOWED_FRONTEND_BASES.includes(decodedBase) ? decodedBase : DEFAULT_FRONTEND_BASE;
  } catch {
    return DEFAULT_FRONTEND_BASE;
  }
}

/**
 * Pinterest OAuth 2.0 Callback Handler
 * 
 * This function handles the redirect from Pinterest after the user
 * grants permission. It exchanges the authorization code for tokens
 * and stores them securely in the database.
 */
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Determine the frontend redirect base
  const frontendBase = decodeFrontendBaseFromState(state);
  const adminUrl = `${frontendBase}/admin/pinterest-automation`;

  if (error) {
    console.error("[pinterest-oauth-callback] Error from Pinterest:", error);
    return Response.redirect(`${adminUrl}?oauth_error=${encodeURIComponent(error)}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${adminUrl}?oauth_error=missing_code_or_state`, 302);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify state to prevent CSRF
  const { data: stateRecord } = await sb
    .from("pinterest_oauth_states")
    .select("*")
    .eq("state", state)
    .single();

  if (!stateRecord) {
    console.error("[pinterest-oauth-callback] Invalid state parameter");
    return Response.redirect(`${adminUrl}?oauth_error=invalid_state`, 302);
  }

  // Clean up used state
  await sb.from("pinterest_oauth_states").delete().eq("state", state);

  // Exchange code for tokens
  const clientId = Deno.env.get("PINTEREST_CLIENT_ID");
  const clientSecret = Deno.env.get("PINTEREST_CLIENT_SECRET");
  const redirectUri = Deno.env.get("PINTEREST_REDIRECT_URI") ||
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-oauth-callback`;

  if (!clientId || !clientSecret) {
    return Response.redirect(`${adminUrl}?oauth_error=missing_client_credentials`, 302);
  }

  try {
    // Use sandbox API for token exchange when in sandbox mode
    const { PINTEREST_API_BASE } = await import("../_shared/pinterest-config.ts");
    const tokenRes = await fetch(`${PINTEREST_API_BASE}/v5/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[pinterest-oauth-callback] Token exchange failed: ${tokenRes.status} ${errText}`);
      await sb.from("pinterest_post_logs").insert({
        action: "oauth_token_exchange",
        status: "failed",
        error_message: `${tokenRes.status}: ${errText}`,
      });
      return Response.redirect(`${adminUrl}?oauth_error=token_exchange_failed`, 302);
    }

    const tokenData = await tokenRes.json();
    console.log("[pinterest-oauth-callback] Token exchange successful, scopes:", tokenData.scope);

    // Fetch user account info
    let accountName = "Pinterest Account";
    let accountId = "";
    try {
      const userRes = await fetch(`${PINTEREST_API_BASE}/v5/user_account`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        accountName = userData.username || userData.business_name || "Pinterest Account";
        accountId = userData.username || "";
        console.log("[pinterest-oauth-callback] User:", accountName);
      }
    } catch (e) {
      console.warn("[pinterest-oauth-callback] Could not fetch user info:", e);
    }

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    const { data: existingConnection } = await sb
      .from("pinterest_connection")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const connectionPayload = {
      account_name: accountName,
      account_id: accountId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_expires_at: expiresAt,
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = existingConnection?.id
      ? await sb
        .from("pinterest_connection")
        .update(connectionPayload)
        .eq("id", existingConnection.id)
      : await sb
        .from("pinterest_connection")
        .insert(connectionPayload);

    if (dbError) {
      console.error("[pinterest-oauth-callback] DB error:", dbError);
      await sb.from("pinterest_post_logs").insert({
        action: "oauth_connect",
        status: "failed",
        error_message: `db_save_failed: ${dbError.message}`,
      });
      return Response.redirect(`${adminUrl}?oauth_error=db_save_failed`, 302);
    }

    // Log success
    await sb.from("pinterest_post_logs").insert({
      action: "oauth_connect",
      status: "success",
      response_data: {
        account: accountName,
        scopes: tokenData.scope,
        expires_at: expiresAt,
      },
    });

    console.log("[pinterest-oauth-callback] ✅ Pinterest connected successfully!");
    return Response.redirect(`${adminUrl}?oauth_success=true`, 302);

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[pinterest-oauth-callback] Exception:", msg);
    return Response.redirect(`${adminUrl}?oauth_error=${encodeURIComponent(msg)}`, 302);
  }
});
