// Shared Merchant API v1 client. Phase 1: not wired into any production
// caller. All existing Content API v2.1 code paths remain the default.
//
// Safety:
//   - Fails closed when account or data source cannot be resolved.
//   - Retries only 429 / 5xx with exponential backoff + jitter.
//   - Redacts secrets from error strings.
//   - No secret is ever logged.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const MERCHANT_API_HOST = "https://merchantapi.googleapis.com";

export type Money = { amountMicros: string; currencyCode: string };

export type ProductInputAttributes = Record<string, unknown> & {
  title?: string;
  description?: string;
  link?: string;
  imageLink?: string;
  additionalImageLinks?: string[];
  availability?: string;
  price?: Money;
  salePrice?: Money;
  condition?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  identifierExists?: boolean;
  googleProductCategory?: string;
  productTypes?: string[];
  shipping?: Array<Record<string, unknown>>;
  customLabel0?: string;
  customLabel1?: string;
  customLabel2?: string;
  customLabel3?: string;
  customLabel4?: string;
};

export type ProductInput = {
  name?: string;
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
  attributes: ProductInputAttributes;
};

export type MerchantApiError = {
  status: number;
  code?: string;
  message: string;
  retriable: boolean;
  stage?: string;
};

export class MerchantApiClientError extends Error {
  status: number;
  code?: string;
  retriable: boolean;
  stage?: string;
  constructor(err: MerchantApiError) {
    super(err.message);
    this.status = err.status;
    this.code = err.code;
    this.retriable = err.retriable;
    this.stage = err.stage;
  }
}

// ── AES-GCM decrypt for stored refresh token (mirrors merchant-sync) ──
export async function decryptToken(encrypted: string, keyStr: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(":");
  if (!ivB64 || !ctB64) throw new Error("malformed_encrypted_token");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyStr.slice(0, 32).padEnd(32, "0")),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// ── Structured logging that refuses raw tokens ──
const TOKEN_LIKE = /(?:ya29\.[A-Za-z0-9_-]+|[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,})/g;

export function redact(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.replace(TOKEN_LIKE, "[REDACTED]").slice(0, 500);
}

export function mlog(event: string, fields: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/token|secret|refresh|password/i.test(k)) { safe[k] = "[REDACTED]"; continue; }
    if (typeof v === "string") safe[k] = redact(v);
    else safe[k] = v;
  }
  console.log(`[merchant-api] ${event}`, JSON.stringify(safe));
}

export type MerchantApiClientOpts = {
  supabase?: SupabaseClient;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class MerchantApiClient {
  private supabase: SupabaseClient;
  private fetchImpl: typeof fetch;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private cachedToken?: { token: string; expiresAt: number };
  private accountCache?: string;

  constructor(opts: MerchantApiClientOpts = {}) {
    this.supabase = opts.supabase ??
      createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > this.now() + 30_000) {
      return this.cachedToken.token;
    }
    const { data, error } = await this.supabase
      .from("merchant_oauth_tokens")
      .select("id, encrypted_refresh_token, merchant_center_id, is_connected")
      .eq("is_connected", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) throw new MerchantApiClientError({ status: 0, message: "no_oauth_token", retriable: false });

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const encKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    if (!clientId || !clientSecret || !encKey) {
      throw new MerchantApiClientError({ status: 0, message: "oauth_env_missing", retriable: false });
    }

    const refresh = await decryptToken(data.encrypted_refresh_token, encKey);
    const resp = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      let googleErr = "";
      try { googleErr = String((JSON.parse(body) as { error?: string })?.error ?? ""); } catch { /* ignore */ }
      mlog("token_refresh_failed", { status: resp.status, googleError: googleErr });
      // invalid_grant / unauthorized_client / invalid_request → refresh token no longer valid
      const reauth = /invalid_grant|unauthorized_client|invalid_request/i.test(googleErr);
      await this.supabase.from("merchant_oauth_tokens").update({
        last_error: reauth ? "reauth_required" : "token_refresh_failed",
        last_error_at: new Date().toISOString(),
        ...(reauth ? { is_connected: false } : {}),
      }).eq("id", data.id);
      throw new MerchantApiClientError({
        status: resp.status,
        message: reauth ? "merchant_reauth_required" : "token_refresh_failed",
        code: reauth ? "reauth_required" : "token_refresh_failed",
        stage: "token_refresh",
        retriable: false,
      });
    }
    const j = await resp.json() as { access_token: string; expires_in?: number };
    const expiresAt = this.now() + (j.expires_in ?? 3600) * 1000;
    this.cachedToken = { token: j.access_token, expiresAt };

    await this.supabase.from("merchant_oauth_tokens").update({
      token_refreshed_at: new Date().toISOString(),
      access_token_expires_at: new Date(expiresAt).toISOString(),
      last_error: null,
      last_error_at: null,
    }).eq("id", data.id);

    return j.access_token;
  }

  async resolveAccount(): Promise<string> {
    if (this.accountCache) return this.accountCache;
    const { data } = await this.supabase
      .from("merchant_oauth_tokens")
      .select("merchant_center_id")
      .eq("is_connected", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const mid = data?.merchant_center_id ?? Deno.env.get("GOOGLE_MERCHANT_ID");
    if (!mid) throw new MerchantApiClientError({ status: 0, message: "merchant_center_id_unresolved", retriable: false });
    if (!/^[0-9]+$/.test(mid)) throw new MerchantApiClientError({ status: 0, message: "merchant_center_id_invalid", retriable: false });
    this.accountCache = `accounts/${mid}`;
    return this.accountCache;
  }

  resolveDataSourceName(): string {
    const explicit = Deno.env.get("MERCHANT_API_DATA_SOURCE_NAME");
    if (!explicit) throw new MerchantApiClientError({ status: 0, message: "data_source_unresolved", retriable: false });
    if (!/^accounts\/\d+\/dataSources\/\d+$/.test(explicit)) {
      throw new MerchantApiClientError({ status: 0, message: "data_source_name_invalid", retriable: false });
    }
    return explicit;
  }

  buildProductInputName(account: string, input: Pick<ProductInput, "contentLanguage" | "feedLabel" | "offerId">): string {
    const id = `${input.contentLanguage}~${input.feedLabel}~${input.offerId}`;
    return `${account}/productInputs/${encodeURIComponent(id)}`;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; allowMutation?: boolean } = {},
  ): Promise<T> {
    const isMutation = method !== "GET" && method !== "HEAD";
    if (isMutation && !opts.allowMutation) {
      throw new MerchantApiClientError({ status: 0, message: "mutation_not_explicitly_allowed", retriable: false });
    }
    const url = new URL(MERCHANT_API_HOST + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

    let attempt = 0;
    let lastErr: MerchantApiClientError | undefined;
    let refreshed = false;
    while (attempt < 4) {
      const token = await this.getAccessToken();
      const resp = await this.fetchImpl(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      if (resp.ok) {
        const text = await resp.text();
        return (text ? JSON.parse(text) : {}) as T;
      }
      const body = await resp.text();
      const status = resp.status;
      if (status === 401 && !refreshed) {
        this.cachedToken = undefined;
        refreshed = true;
        attempt++;
        continue;
      }
      if (status === 401 && refreshed) {
        mlog("upstream_401_after_refresh", { method, path });
        throw new MerchantApiClientError({
          status: 401,
          message: "merchant_api_unauthorized_after_refresh",
          code: "unauthorized_after_refresh",
          stage: "upstream_call",
          retriable: false,
        });
      }
      const retriable = status === 429 || status >= 500;
      lastErr = new MerchantApiClientError({ status, message: `merchant_api_${status}: ${redact(body)}`, retriable });
      mlog("request_failed", { method, path, status, retriable });
      if (!retriable) throw lastErr;
      const base = 500 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 250);
      await this.sleep(base + jitter);
      attempt++;
    }
    throw lastErr ?? new MerchantApiClientError({ status: 0, message: "request_exhausted", retriable: false });
  }

  async insertProductInput(input: ProductInput): Promise<{ name: string }> {
    const account = await this.resolveAccount();
    const dataSource = this.resolveDataSourceName();
    return this.request<{ name: string }>(
      "POST",
      `/products/v1/${account}/productInputs:insert`,
      { query: { dataSource }, body: input, allowMutation: true },
    );
  }

  async deleteProductInput(input: Pick<ProductInput, "contentLanguage" | "feedLabel" | "offerId">): Promise<void> {
    const account = await this.resolveAccount();
    const dataSource = this.resolveDataSourceName();
    const name = this.buildProductInputName(account, input);
    await this.request<void>("DELETE", `/products/v1/${name}`, { query: { dataSource }, allowMutation: true });
  }

  async listProductInputs(pageSize = 100, pageToken?: string): Promise<{ productInputs?: unknown[]; nextPageToken?: string }> {
    const account = await this.resolveAccount();
    const query: Record<string, string> = { pageSize: String(pageSize) };
    if (pageToken) query.pageToken = pageToken;
    return this.request("GET", `/products/v1/${account}/productInputs`, { query });
  }

  // Read-only list of processed products. Returns each product's Google-issued
  // resource name so callers can map offerId → exact name without inferring
  // contentLanguage/feedLabel locally.
  async listProducts(pageSize = 250, pageToken?: string): Promise<{ products?: Array<Record<string, unknown>>; nextPageToken?: string }> {
    const account = await this.resolveAccount();
    const query: Record<string, string> = { pageSize: String(pageSize) };
    if (pageToken) query.pageToken = pageToken;
    return this.request("GET", `/products/v1/${account}/products`, { query });
  }

  async getProductByResourceName(name: string): Promise<unknown> {
    if (!/^accounts\/\d+\/products\/[^/]+$/.test(name)) {
      throw new MerchantApiClientError({ status: 0, message: "product_resource_name_invalid", retriable: false });
    }
    return this.request("GET", `/products/v1/${name}`);
  }

  async getProduct(input: Pick<ProductInput, "contentLanguage" | "feedLabel" | "offerId">): Promise<unknown> {
    const account = await this.resolveAccount();
    const id = buildProductIdSegment(input.contentLanguage, input.feedLabel, input.offerId);
    return this.request("GET", `/products/v1/${account}/products/${id}`);
  }

  async listDataSources(): Promise<{ dataSources?: unknown[]; nextPageToken?: string }> {
    const account = await this.resolveAccount();
    return this.request("GET", `/datasources/v1/${account}/dataSources`);
  }

  async reportsSearch(query: string, pageSize = 250): Promise<{ results?: unknown[]; nextPageToken?: string }> {
    const account = await this.resolveAccount();
    return this.request(
      "POST",
      `/reports/v1/${account}/reports:search`,
      { body: { query, pageSize }, allowMutation: true },
    );
  }
}

export function readEnabled(): boolean { return Deno.env.get("MERCHANT_API_READ_ENABLED") === "true"; }
export function writeEnabled(): boolean { return Deno.env.get("MERCHANT_API_WRITE_ENABLED") === "true"; }
export function deleteEnabled(): boolean { return Deno.env.get("MERCHANT_API_DELETE_ENABLED") === "true"; }