import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_FRONTEND_BASES = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

const DEFAULT_FRONTEND_BASE = Deno.env.get("APP_BASE_URL") || "https://getpawsy.pet";
const PINTEREST_PRODUCTION_API_BASE = "https://api.pinterest.com/v5";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tokenPrefix(token: string | null | undefined) {
  return token ? token.slice(0, 12) : null;
}

async function fetchPinterestJson(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body, text };
}

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
    const tokenRes = await fetch(`${PINTEREST_PRODUCTION_API_BASE}/oauth/token`, {
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
    const tokenCreatedAt = new Date().toISOString();
    const accessToken = String(tokenData.access_token || "");
    if (!accessToken) {
      await sb.from("pinterest_post_logs").insert({
        action: "oauth_connect",
        status: "failed",
        error_message: "Pinterest token exchange returned no access_token",
        response_data: { api_base: PINTEREST_PRODUCTION_API_BASE, token_response_keys: Object.keys(tokenData || {}) },
      });
      return Response.redirect(`${adminUrl}?oauth_error=missing_access_token`, 302);
    }
    const accessTokenSha256 = accessToken ? await sha256Hex(accessToken) : null;
    console.log("[pinterest-oauth-callback] Token exchange successful", {
      scopes: tokenData.scope,
      access_token_prefix: tokenPrefix(accessToken),
      access_token_length: accessToken.length,
      access_token_sha256: accessTokenSha256,
      token_created_at: tokenCreatedAt,
      api_base: PINTEREST_PRODUCTION_API_BASE,
    });

    // Fetch user account info (diagnostic only; /boards is the publish-capability signal)
    let accountName = "Pinterest Account";
    let accountId = "";
    try {
      const userRes = await fetch(`${PINTEREST_PRODUCTION_API_BASE}/user_account`, {
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
    await sb.from("pinterest_runtime_settings").update({
      active_pinterest_connection_id: null,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    await sb.from("pinterest_connection").delete().not("id", "is", null);

    const connectionPayload = {
      account_name: accountName,
      account_id: accountId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_expires_at: expiresAt,
      token_created_at: tokenCreatedAt,
      scopes: tokenData.scope || null,
      token_prefix: tokenPrefix(accessToken),
      token_sha256: accessTokenSha256,
      last_account_status: null,
      last_boards_status: null,
      board_count: 0,
      status: "validating",
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedConnection, error: dbError } = await sb
      .from("pinterest_connection")
      .insert(connectionPayload)
      .select("id, access_token")
      .single();

    if (dbError) {
      console.error("[pinterest-oauth-callback] DB error:", dbError);
      await sb.from("pinterest_post_logs").insert({
        action: "oauth_connect",
        status: "failed",
        error_message: `db_save_failed: ${dbError.message}`,
      });
      return Response.redirect(`${adminUrl}?oauth_error=db_save_failed`, 302);
    }

    const savedToken = String(insertedConnection?.access_token || "");
    const tokenSavedExactly = savedToken === accessToken;
    const accountApi = await fetchPinterestJson(`${PINTEREST_PRODUCTION_API_BASE}/user_account`, savedToken);
    const boardsApi = await fetchPinterestJson(`${PINTEREST_PRODUCTION_API_BASE}/boards?page_size=250&privacy=ALL`, savedToken);
    const boardItems = Array.isArray(boardsApi.body?.items) ? boardsApi.body.items : [];
    const boardCount = boardItems.length;
    const REQUIRED_USERNAME = "getpawsyshop";
    const apiUsername = typeof accountApi.body?.username === "string" ? accountApi.body.username : null;
    const wrongAccount = accountApi.ok && apiUsername && apiUsername !== REQUIRED_USERNAME;
    const authValid = tokenSavedExactly && boardsApi.ok && boardCount > 0 && !wrongAccount;
    if (apiUsername) {
      accountName = apiUsername;
      accountId = apiUsername;
    }

    await sb.from("pinterest_connection").update({
      account_name: accountName,
      account_id: accountId,
      last_account_status: accountApi.status,
      last_boards_status: boardsApi.status,
      board_count: boardCount,
      status: authValid ? "connected" : "auth_failed",
      last_error: authValid
        ? null
        : !tokenSavedExactly
          ? "AUTH FAILURE: saved Pinterest access_token differs from OAuth response."
          : wrongAccount
            ? `AUTH FAILURE: connected username "${apiUsername}" does not match required "${REQUIRED_USERNAME}".`
            : `AUTH FAILURE: /boards=${boardsApi.status}, board_count=${boardCount} (account=${accountApi.status})`,
      updated_at: new Date().toISOString(),
    }).eq("id", insertedConnection.id);

    if (authValid) {
      await sb.from("pinterest_runtime_settings").update({
        active_pinterest_connection_id: insertedConnection.id,
        mode: "production",
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
    }

    // Log final reconnect result with raw validation metadata for diagnostics.
    await sb.from("pinterest_post_logs").insert({
      action: "oauth_connect",
      status: authValid ? "success" : "failed",
      error_message: authValid ? null : `Pinterest reconnect validation failed: /boards=${boardsApi.status}, board_count=${boardCount}`,
      response_data: {
        connection_id: insertedConnection.id,
        account: accountName,
        scopes: tokenData.scope,
        expires_at: expiresAt,
        token_created_at: tokenCreatedAt,
        token_prefix: tokenPrefix(accessToken),
        token_sha256: accessTokenSha256,
        api_base: PINTEREST_PRODUCTION_API_BASE,
        user_account_status: accountApi.status,
        user_account_response_body: accountApi.body,
        boards_status: boardsApi.status,
        boards_response_body: boardsApi.body,
        board_count: boardCount,
        active_connection_saved: authValid,
        token_saved_exactly: tokenSavedExactly,
        auth_valid: authValid,
      },
    });

    if (!authValid) {
      console.error("[pinterest-oauth-callback] AUTH FAILURE after token save", {
        user_account_status: accountApi.status,
        user_account_body: accountApi.body,
        boards_status: boardsApi.status,
        boards_body: boardsApi.body,
        board_count: boardCount,
        token_prefix: tokenPrefix(accessToken),
        token_sha256: accessTokenSha256,
      });
      return Response.redirect(`${adminUrl}?oauth_error=auth_validation_failed`, 302);
    }

    console.log("[pinterest-oauth-callback] ✅ Pinterest connected successfully!");
    return Response.redirect(`${adminUrl}?oauth_success=true`, 302);

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[pinterest-oauth-callback] Exception:", msg);
    return Response.redirect(`${adminUrl}?oauth_error=${encodeURIComponent(msg)}`, 302);
  }
});
