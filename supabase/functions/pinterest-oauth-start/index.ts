import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

const DEFAULT_FRONTEND_BASE = Deno.env.get("APP_BASE_URL") || ALLOWED_ORIGINS[0];

function resolveFrontendBase(req: Request) {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_FRONTEND_BASE;
}

function encodeState(state: string, frontendBase: string) {
  return `${state}::${btoa(frontendBase)}`;
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  const clientId = Deno.env.get("PINTEREST_CLIENT_ID");
  const redirectUri = Deno.env.get("PINTEREST_REDIRECT_URI") ||
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-oauth-callback`;

  if (!clientId) {
    return new Response(
      JSON.stringify({ error: "PINTEREST_CLIENT_ID not configured" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  // Generate a random state for CSRF protection
  const state = encodeState(crypto.randomUUID(), resolveFrontendBase(req));

  // Store state in DB for verification during callback
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Store state temporarily (we'll verify it during callback)
  await sb.from("pinterest_oauth_states").upsert({
    state,
    created_at: new Date().toISOString(),
  });

  // Pinterest OAuth 2.0 authorization URL
  const scopes = [
    "boards:read",
    "boards:write",
    "pins:read",
    "pins:write",
  ].join(",");

  const authUrl = new URL("https://www.pinterest.com/oauth/");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);

  return new Response(
    JSON.stringify({ auth_url: authUrl.toString(), state }),
    { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
  );
});
