// Shopify Admin API token provider — client_credentials grant.
//
// SECURITY CONTRACT
// - Reads SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET / SHOPIFY_STORE_DOMAIN / SHOPIFY_API_VERSION
//   from Deno.env only. Never accepts them as arguments, never returns them to callers,
//   never logs them, never persists them to any table.
// - The access_token is kept in module-scope memory ONLY. It is never written to a
//   database row, never returned to the browser, never included in audit payloads.
// - Single-flight refresh: concurrent callers await the same in-flight Promise so we
//   don't hammer /admin/oauth/access_token during a burst.
// - Auto-refresh 60s before expiry.
// - Callers use `shopifyAdminFetch(query, variables)`; on a 401 we force one refresh
//   and retry exactly once.
//
// This module is isolated under SHOPIFY_AUTH_MODE=client_credentials. Legacy shpat_
// token flows for unrelated systems are NOT touched.

interface CachedToken {
  token: string;
  expiresAtMs: number; // absolute ms epoch
}

let cached: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

const AUTH_MODE = Deno.env.get("SHOPIFY_AUTH_MODE") ?? "client_credentials";
const REFRESH_SKEW_MS = 60_000; // refresh 60s before expiry

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || !v.trim()) throw new Error(`shopify-token-provider: missing env ${name}`);
  return v.trim();
}

export function getShopifyConfig() {
  const domain = requireEnv("SHOPIFY_STORE_DOMAIN");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain)) {
    throw new Error(`shopify-token-provider: SHOPIFY_STORE_DOMAIN is not a myshopify.com host (${domain})`);
  }
  const apiVersion = requireEnv("SHOPIFY_API_VERSION");
  if (!/^\d{4}-(01|04|07|10)$/.test(apiVersion)) {
    throw new Error(`shopify-token-provider: SHOPIFY_API_VERSION invalid (${apiVersion})`);
  }
  return { domain, apiVersion, authMode: AUTH_MODE };
}

async function exchangeClientCredentials(): Promise<CachedToken> {
  if (AUTH_MODE !== "client_credentials") {
    throw new Error(`shopify-token-provider: unsupported SHOPIFY_AUTH_MODE=${AUTH_MODE}`);
  }
  const { domain } = getShopifyConfig();
  const clientId = requireEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requireEnv("SHOPIFY_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });

  if (!res.ok) {
    // Never include token or full auth material in error surface.
    const status = res.status;
    let hint = "";
    try {
      const j = await res.json();
      // Shopify may return { error, error_description }. Neither contains secrets.
      if (j?.error) hint = ` (${j.error})`;
    } catch { /* ignore */ }
    throw new Error(`shopify-token-provider: token exchange failed HTTP ${status}${hint}`);
  }

  const j = await res.json() as { access_token?: string; expires_in?: number };
  if (!j.access_token || typeof j.access_token !== "string") {
    throw new Error("shopify-token-provider: token exchange returned no access_token");
  }
  const expiresIn = typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 300;
  return { token: j.access_token, expiresAtMs: Date.now() + expiresIn * 1000 };
}

async function getFreshToken(force = false): Promise<CachedToken> {
  const now = Date.now();
  if (!force && cached && cached.expiresAtMs - REFRESH_SKEW_MS > now) return cached;
  if (inflight) return inflight;
  inflight = exchangeClientCredentials()
    .then((t) => { cached = t; return t; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Returns metadata safe to expose (never the token itself). */
export async function getShopifyTokenMeta(): Promise<{ expiresInSec: number; authMode: string; cached: boolean }> {
  const wasCached = !!cached && cached.expiresAtMs - REFRESH_SKEW_MS > Date.now();
  const t = await getFreshToken();
  return {
    expiresInSec: Math.max(0, Math.floor((t.expiresAtMs - Date.now()) / 1000)),
    authMode: AUTH_MODE,
    cached: wasCached,
  };
}

/** Server-side Admin GraphQL fetcher. Retries once on 401 after forcing a refresh. */
export async function shopifyAdminFetch<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data?: T; errors?: unknown; status: number }> {
  const { domain, apiVersion } = getShopifyConfig();
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;

  const doCall = async (tok: string) => fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": tok,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  let t = await getFreshToken();
  let res = await doCall(t.token);
  if (res.status === 401) {
    t = await getFreshToken(true);
    res = await doCall(t.token);
  }
  const status = res.status;
  let payload: { data?: T; errors?: unknown } = {};
  try { payload = await res.json(); } catch { /* ignore */ }
  return { ...payload, status };
}

/** Server-side Admin REST fetcher. Retries once on 401. */
export async function shopifyAdminRest<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ data?: T; status: number; text?: string }> {
  const { domain, apiVersion } = getShopifyConfig();
  const url = `https://${domain}/admin/api/${apiVersion}/${path.replace(/^\//, "")}`;
  const method = init.method ?? "GET";
  const doCall = async (tok: string) => fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": tok,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });
  let t = await getFreshToken();
  let res = await doCall(t.token);
  if (res.status === 401) { t = await getFreshToken(true); res = await doCall(t.token); }
  const text = await res.text();
  let data: T | undefined;
  try { data = JSON.parse(text) as T; } catch { /* ignore */ }
  return { data, status: res.status, text };
}