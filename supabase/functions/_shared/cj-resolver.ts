// Canonical CJ variant resolver — extracted from cj-canary-discovery,
// which is the proven source of truth (3/3 positive fixtures).
//
// READ-ONLY. Performs no writes. Both cj-canary-discovery and
// catalog-recovery-batch-execute MUST resolve CJ variants through
// resolveCjVariant() to guarantee behavioural parity.
//
// Version: cj-resolver@1.0.0-canonical

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CJ_RESOLVER_VERSION = "cj-resolver@1.1.0-parent-fallback";
export const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CjExactMatch {
  pid: string;
  vid: string;
  variantSku: string;
  productName: string | null;
  variantName: string | null;
  productStatus: string | null;
  attrs: unknown;
}

export interface CjWarehouseStock {
  warehouse_id: string;
  warehouse_name: string;
  country_code: string | null;
  stock: number;
}

export interface CjResolveResult {
  sku: string;
  classification:
    | "EXACT_UNIQUE_CONFIRMED"
    | "EXACT_MULTIPLE"
    | "NOT_FOUND"
    | "UPSTREAM_ERROR"
    | "SKIPPED_BUDGET";
  candidatePids: string[];
  exact: CjExactMatch[];
  warehouses: CjWarehouseStock[];
  usStock: number;
  totalStock: number;
  http: Record<string, number>;
  codes: Record<string, unknown>;
  requests: number;
  parentSkuUsed?: string | null;
}

export interface CjBudget { reqs: number; max: number }

/**
 * Conservative CJ variant-suffix → parent SKU derivation.
 *
 * Only matches CJ SKUs of the form:
 *   <ALPHA prefix><digits><two-digit variant index><two uppercase letters>
 * e.g. CJFT268927601AZ → parent CJFT2689276 (strips "01AZ").
 *
 * Returns null if the SKU does not confidently match a CJ variant pattern.
 * Never strips arbitrary characters.
 */
export function deriveParentSkuFromVariant(sku: string): string | null {
  if (!sku) return null;
  const trimmed = sku.trim();
  const m = trimmed.match(/^([A-Z]{2,}\d{5,})(\d{2}[A-Z]{2})$/);
  if (!m) return null;
  return m[1];
}

export async function getCjAccessToken(): Promise<{ token: string; status: number }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cached } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .single();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return { token: cached.access_token, status: 200 };
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data?.result) throw new Error(`CJ auth failed status=${res.status}`);
  const expiry = new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 5 * 60_000);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: expiry.toISOString(),
    updated_at: new Date().toISOString(),
  });
  return { token: data.data.accessToken, status: res.status };
}

async function cjGet(path: string, token: string) {
  const doFetch = async () => {
    const res = await fetch(`${CJ_API_BASE}${path}`, {
      headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
  let r = await doFetch();
  if (r.status === 429 || r.body?.code === 1600200) {
    await sleep(1500);
    r = await doFetch();
  }
  return r;
}

/**
 * Canonical CJ variant resolution ladder.
 *
 *   1) product/list?productSku=<sku>   → collect candidate pids
 *   2) product/query?pid=<pid>          → iterate variants, byte-equal variantSku
 *   3) product/stock/queryBySku?sku=<variantSku> → live warehouse stock
 *
 * The legacy batch path (variant/queryByVariantSku) is NOT used — it
 * returns empty for most variant SKUs on this account and is the proven
 * cause of the discovery↔batch resolver divergence (3/3 vs 0/60).
 */
export async function resolveCjVariant(
  sku: string,
  token: string,
  budget: CjBudget,
  opts?: { maxPids?: number; readStock?: boolean },
): Promise<CjResolveResult> {
  const http: Record<string, number> = {};
  const codes: Record<string, unknown> = {};
  const candidatePids = new Set<string>();
  const skuNorm = sku.trim().toLowerCase();
  const startReqs = budget.reqs;

  if (budget.reqs >= budget.max) {
    return { sku, classification: "SKIPPED_BUDGET", candidatePids: [], exact: [], warehouses: [], usStock: 0, totalStock: 0, http, codes, requests: 0 };
  }

  // Step 1: candidate pids via product/list?productSku
  const q1 = await cjGet(`/product/list?productSku=${encodeURIComponent(sku)}&pageNum=1&pageSize=30`, token);
  budget.reqs += 1;
  http["product/list?productSku"] = q1.status;
  codes["product/list?productSku"] = q1.body?.code ?? null;
  for (const r of (q1.body?.data?.list ?? [])) {
    const pid = r?.pid ?? r?.productId;
    if (pid) candidatePids.add(String(pid));
  }

  // Step 2: iterate pids, byte-equal variantSku match
  const exact: CjExactMatch[] = [];
  const pids = Array.from(candidatePids).slice(0, opts?.maxPids ?? 6);
  for (const pid of pids) {
    if (budget.reqs >= budget.max) break;
    await sleep(1100);
    const p = await cjGet(`/product/query?pid=${encodeURIComponent(pid)}`, token);
    budget.reqs += 1;
    http[`product/query:${pid}`] = p.status;
    const pd = p.body?.data;
    if (!pd) continue;
    const variants: any[] = Array.isArray(pd.variants) ? pd.variants : [];
    for (const cv of variants) {
      const vSku = String(cv?.variantSku ?? "").trim();
      if (!vSku) continue;
      if (vSku.toLowerCase() === skuNorm) {
        exact.push({
          pid: String(pd.pid ?? pid),
          vid: String(cv?.vid ?? ""),
          variantSku: vSku,
          productName: pd.productNameEn ?? pd.productName ?? null,
          variantName: cv?.variantNameEn ?? cv?.variantName ?? null,
          productStatus: pd.status ?? pd.productStatus ?? null,
          attrs: cv,
        });
      }
    }
  }

  let classification: CjResolveResult["classification"];
  const anyUpstream = Object.values(http).some((s) => s === 200);
  if (!anyUpstream) classification = "UPSTREAM_ERROR";
  else if (exact.length === 0) classification = "NOT_FOUND";
  else if (exact.length > 1) classification = "EXACT_MULTIPLE";
  else classification = "EXACT_UNIQUE_CONFIRMED";

  // Step 3: warehouse stock (only for unique-confirmed)
  const warehouses: CjWarehouseStock[] = [];
  let usStock = 0;
  let totalStock = 0;
  if (classification === "EXACT_UNIQUE_CONFIRMED" && (opts?.readStock ?? true) && budget.reqs < budget.max) {
    const st = await cjGet(`/product/stock/queryBySku?sku=${encodeURIComponent(exact[0].variantSku)}`, token);
    budget.reqs += 1;
    http["stock/queryBySku"] = st.status;
    const areas: any[] = Array.isArray(st.body?.data) ? st.body.data : [];
    for (const a of areas) {
      const w: CjWarehouseStock = {
        warehouse_id: String(a?.areaId ?? a?.countryCode ?? ""),
        warehouse_name: String(a?.areaEn ?? a?.countryNameEn ?? a?.countryCode ?? ""),
        country_code: a?.countryCode ?? null,
        stock: Number(a?.totalInventoryNum ?? 0),
      };
      warehouses.push(w);
      totalStock += w.stock;
      if ((w.country_code ?? "").toString().toUpperCase() === "US") usStock += w.stock;
    }
  }

  return {
    sku,
    classification,
    candidatePids: Array.from(candidatePids),
    exact,
    warehouses,
    usStock,
    totalStock,
    http,
    codes,
    requests: budget.reqs - startReqs,
  };
}