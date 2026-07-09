// Google Enterprise Gateway (GEIP) — canonical Google API surface.
// Read-only by default. Every call returns { ok, data?, blocker?, error? }.
// Writes (Indexing API, Site Verification, Merchant mutations) are guarded by
// GEIP_*_WRITE=on env flags; default is off per mission rules.

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GSC_KEY = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY") ?? "";
const PAGESPEED_KEY = Deno.env.get("PAGESPEED_API_KEY") ?? "";
const CRUX_KEY = Deno.env.get("PAGESPEED_API_KEY") ?? Deno.env.get("CRUX_API_KEY") ?? "";
const GA4_SA_JSON =
  Deno.env.get("GA4_SERVICE_ACCOUNT_JSON") ??
  Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";
const GA4_PROPERTY_ID = Deno.env.get("GA4_PROPERTY_ID") ?? "";
const INDEXING_WRITE = (Deno.env.get("GEIP_INDEXING_WRITE") ?? "").toLowerCase() === "on";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export type GResult<T> =
  | { ok: true; data: T }
  | { ok: false; blocker: string; error?: string; status?: number };

function gscHeaders() {
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GSC_KEY,
    "Content-Type": "application/json",
  };
}

export function gscAvailable(): { ok: boolean; blocker?: string } {
  if (!LOVABLE_API_KEY) return { ok: false, blocker: "missing_lovable_api_key" };
  if (!GSC_KEY) return { ok: false, blocker: "missing_connector" };
  return { ok: true };
}

export async function callGSC<T = unknown>(path: string, init?: RequestInit): Promise<GResult<T>> {
  const avail = gscAvailable();
  if (!avail.ok) return { ok: false, blocker: avail.blocker! };
  try {
    const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: { ...gscHeaders(), ...(init?.headers ?? {}) } });
    const text = await res.text();
    if (!res.ok) return { ok: false, blocker: "provider_error", status: res.status, error: text.slice(0, 500) };
    return { ok: true, data: text ? JSON.parse(text) as T : ({} as T) };
  } catch (e) {
    return { ok: false, blocker: "network_error", error: String(e) };
  }
}

// URL Inspection (via same GSC connector)
export async function callUrlInspection(inspectionUrl: string, siteUrl: string) {
  return callGSC("/v1/urlInspection/index:inspect", {
    method: "POST",
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
}

// Site Verification
export async function callSiteVerificationList() {
  return callGSC("/siteVerification/v1/webResource");
}

// GA4 — service account JWT flow (reuses existing project pattern in scripts/gsc-integration.mjs)
export function ga4Available(): { ok: boolean; blocker?: string } {
  if (!GA4_SA_JSON) return { ok: false, blocker: "missing_secret" };
  if (!GA4_PROPERTY_ID) return { ok: false, blocker: "missing_ga4_property_id" };
  return { ok: true };
}

async function ga4AccessToken(): Promise<GResult<string>> {
  const avail = ga4Available();
  if (!avail.ok) return { ok: false, blocker: avail.blocker! };
  try {
    const sa = JSON.parse(GA4_SA_JSON);
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const signInput = `${b64(header)}.${b64(payload)}`;
    const pem = sa.private_key as string;
    const raw = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signInput)));
    const sigB64 = btoa(String.fromCharCode(...sig)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `${signInput}.${sigB64}`;
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokJson = await tokRes.json();
    if (!tokRes.ok) return { ok: false, blocker: "provider_error", error: JSON.stringify(tokJson) };
    return { ok: true, data: tokJson.access_token as string };
  } catch (e) {
    return { ok: false, blocker: "auth_error", error: String(e) };
  }
}

export async function callGA4<T = unknown>(body: unknown): Promise<GResult<T>> {
  const tok = await ga4AccessToken();
  if (!tok.ok) return tok;
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.data}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) return { ok: false, blocker: "provider_error", status: res.status, error: text.slice(0, 500) };
  return { ok: true, data: JSON.parse(text) as T };
}

// PageSpeed Insights (public API key ok)
export function pagespeedAvailable(): { ok: boolean; blocker?: string } {
  if (!PAGESPEED_KEY) return { ok: false, blocker: "missing_secret" };
  return { ok: true };
}

export async function callPageSpeed(url: string, strategy: "mobile" | "desktop"): Promise<GResult<unknown>> {
  const avail = pagespeedAvailable();
  if (!avail.ok) return { ok: false, blocker: avail.blocker! };
  const u = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", url);
  u.searchParams.set("strategy", strategy);
  u.searchParams.set("key", PAGESPEED_KEY);
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) u.searchParams.append("category", c);
  const res = await fetch(u.toString());
  const text = await res.text();
  if (!res.ok) return { ok: false, blocker: "provider_error", status: res.status, error: text.slice(0, 500) };
  return { ok: true, data: JSON.parse(text) };
}

// CrUX API
export async function callCrUX(identifier: string, scope: "origin" | "url"): Promise<GResult<unknown>> {
  if (!CRUX_KEY) return { ok: false, blocker: "missing_secret" };
  const res = await fetch(
    `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [scope]: identifier, formFactor: "ALL_FORM_FACTORS" }),
    },
  );
  const text = await res.text();
  if (!res.ok) return { ok: false, blocker: "provider_error", status: res.status, error: text.slice(0, 500) };
  return { ok: true, data: JSON.parse(text) };
}

// Merchant Center — reuses existing merchant_oauth_tokens table (read via edge fn callers)
// Indexing API — write-guarded
export async function callIndexingSubmit(url: string, type: "URL_UPDATED" | "URL_DELETED") {
  if (!INDEXING_WRITE) return { ok: false as const, blocker: "write_disabled_by_default" };
  // Real call would use GA4-style service account with the indexing scope.
  return { ok: false as const, blocker: "not_implemented_yet" };
}

export function gatewayStatus() {
  return {
    gsc: gscAvailable(),
    ga4: ga4Available(),
    pagespeed: pagespeedAvailable(),
    crux: CRUX_KEY ? { ok: true } : { ok: false, blocker: "missing_secret" },
    indexing: INDEXING_WRITE
      ? { ok: true }
      : { ok: false, blocker: "write_disabled_by_default" },
  };
}