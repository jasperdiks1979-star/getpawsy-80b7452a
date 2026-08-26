import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
  "https://id-preview--597d7eb2-8207-4374-9ac1-67ffe0048ce1.lovable.app",
];

const DEFAULT_FRONTEND_BASE = Deno.env.get("APP_BASE_URL") || ALLOWED_ORIGINS[0];
const APPROVED_PINTEREST_CLIENT_ID = "1567611";

function maskPinterestClientId(clientId: string | null | undefined) {
  if (!clientId) return null;
  const confirmationDigits = clientId.slice(0, APPROVED_PINTEREST_CLIENT_ID.length);
  return clientId.length > APPROVED_PINTEREST_CLIENT_ID.length
    ? `${confirmationDigits}…${clientId.slice(-3)}`
    : confirmationDigits;
}

function resolveFrontendBase(req: Request) {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_FRONTEND_BASE;
}

function encodeState(state: string, meta: Record<string, unknown>) {
  // Backwards-compatible: legacy callers split on "::" and atob the tail.
  // We now encode a JSON blob so we can carry { base, scopes, autoSync }.
  return `${state}::${btoa(JSON.stringify(meta))}`;
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

  // Allow caller to request extra scopes (e.g. catalogs:read/write) and
  // to ask the callback to auto-run the catalog sync after success.
  // `additive` (default true) = never request LESS than what is already
  // granted: the requested scope set is always a superset of the stored
  // connection scopes, so existing boards/pins/user_accounts permissions
  // are preserved and never revoked by the reconnect.
  let extraScopes: string[] = [];
  let autoSyncCatalog = false;
  let additive = true;
  let previewOnly = false;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (Array.isArray(body?.extra_scopes)) {
        extraScopes = body.extra_scopes.filter((s: unknown) => typeof s === "string");
      }
      autoSyncCatalog = Boolean(body?.auto_sync_catalog);
      if (body?.additive === false) additive = false;
      previewOnly = Boolean(body?.preview_only);
    } catch { /* no body */ }
  } else {
    const url = new URL(req.url);
    const qsScopes = url.searchParams.get("extra_scopes");
    if (qsScopes) extraScopes = qsScopes.split(",").map((s) => s.trim()).filter(Boolean);
    autoSyncCatalog = url.searchParams.get("auto_sync_catalog") === "1";
    if (url.searchParams.get("additive") === "0") additive = false;
    previewOnly = url.searchParams.get("preview_only") === "1";
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

  if (clientId !== APPROVED_PINTEREST_CLIENT_ID) {
    return new Response(
      JSON.stringify({
        error: "PINTEREST_CLIENT_ID does not match approved Standard Access app",
        approved_client_id: APPROVED_PINTEREST_CLIENT_ID,
        active_client_id: maskPinterestClientId(clientId),
        reconnect_blocked: true,
      }),
      { status: 409, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Minimum organic scopes this project always needs to keep working.
  const baseScopes = [
    "boards:read",
    "boards:write",
    "pins:read",
    "pins:write",
    "user_accounts:read",
  ];
  const ALLOWED_EXTRA = new Set([
    "catalogs:read",
    "catalogs:write",
    "ads:read",
    "ads:write",
    "billing:read",
    "billing:write",
    "user_accounts:write",
    "boards:read_secret",
    "boards:write_secret",
    "pins:read_secret",
    "pins:write_secret",
    "biz_access:read",
    "biz_access:write",
  ]);
  const KNOWN_SCOPES = new Set([...baseScopes, ...ALLOWED_EXTRA]);

  // Currently granted scopes on the active connection. Pinterest re-issues a
  // token with exactly the scopes requested here, so an additive reconnect
  // MUST replay every scope already granted, plus the newly requested ones.
  let currentScopes: string[] = [];
  try {
    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("scopes, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const raw = typeof conn?.scopes === "string" ? conn.scopes : "";
    currentScopes = raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => KNOWN_SCOPES.has(s));
  } catch (_e) { /* no stored connection yet */ }

  const sanitizedExtra = extraScopes.filter((s) => ALLOWED_EXTRA.has(s));
  const preservedScopes = additive
    ? Array.from(new Set([...baseScopes, ...currentScopes]))
    : baseScopes;
  const requestedScopes = Array.from(new Set([...preservedScopes, ...sanitizedExtra]));
  const addedScopes = sanitizedExtra.filter((s) => !preservedScopes.includes(s));
  // Safety invariant: never request less than what is already granted.
  const droppedScopes = additive ? currentScopes.filter((s) => !requestedScopes.includes(s)) : [];
  if (droppedScopes.length > 0) {
    return new Response(
      JSON.stringify({
        error: "additive_scope_violation",
        message: "Reconnect would drop already granted scopes; aborted.",
        dropped_scopes: droppedScopes,
      }),
      { status: 409, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  const scopePreview = {
    additive,
    current_scopes: currentScopes,
    added_scopes: addedScopes,
    preserved_scopes: preservedScopes,
    requested_scopes: requestedScopes,
    revoked_scopes: [] as string[],
  };

  // Dry run: let the UI show exactly what will change before sending the
  // user to Pinterest. No state row is created for a preview.
  if (previewOnly) {
    return new Response(
      JSON.stringify({ preview: true, ...scopePreview }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }

  // Generate a random state for CSRF protection (carries post-success metadata).
  const state = encodeState(crypto.randomUUID(), {
    base: resolveFrontendBase(req),
    autoSyncCatalog,
    expectedScopes: requestedScopes,
  });

  // Force a clean OAuth attempt: never let a stale cached state participate
  // in a reconnect after a token/auth failure.
  await sb.from("pinterest_oauth_states").delete().neq("state", state);

  // Store state temporarily (we'll verify it during callback)
  await sb.from("pinterest_oauth_states").upsert({
    state,
    created_at: new Date().toISOString(),
  });

  const scopes = requestedScopes.join(",");

  const authUrl = new URL("https://www.pinterest.com/oauth/");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);

  return new Response(
    JSON.stringify({ auth_url: authUrl.toString(), state, ...scopePreview }),
    { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
  );

});
