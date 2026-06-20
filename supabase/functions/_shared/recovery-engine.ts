// Shared helpers for the Global Product Recovery Engine.
// CJ token handling, worldwide inventory parsing, supplier candidate scoring,
// and protected-winner lookups. Kept dependency-light so any edge function
// in the recovery family can import without pulling extras.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

export const RECOVERY_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RECOVERY_CORS, "Content-Type": "application/json" },
  });
}

export function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// deno-lint-ignore no-explicit-any
export async function cjToken(sb: any): Promise<string> {
  const { data: cached } = await sb
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .maybeSingle();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return cached.access_token;
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data.result) throw new Error(`CJ auth failed: ${data.message ?? res.status}`);
  const expiry = new Date(data.data.accessTokenExpiryDate);
  await sb.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: new Date(expiry.getTime() - 5 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return data.data.accessToken;
}

export type WarehouseRow = {
  warehouse: string;
  country: string | null;
  qty: number;
  shippingDays: { min?: number; max?: number };
  raw: Record<string, unknown>;
};

const COUNTRY_FROM = (entry: Record<string, unknown>): string | null => {
  const cc = String(entry.countryCode ?? entry.country ?? "").toUpperCase();
  if (cc && cc.length <= 3) return cc;
  const area = String(entry.areaEn ?? entry.area ?? "").toUpperCase();
  if (area.includes("UNITED STATES") || area.startsWith("US")) return "US";
  if (area.includes("GERMAN")) return "DE";
  if (area.includes("UNITED KING")) return "GB";
  if (area.includes("FRANCE")) return "FR";
  if (area.includes("SPAIN")) return "ES";
  if (area.includes("AUSTRAL")) return "AU";
  if (area.includes("CHINA")) return "CN";
  return null;
};

export function parseCjInventory(json: Record<string, unknown>): WarehouseRow[] {
  const data = json.data as Record<string, unknown> | unknown[] | null;
  const list: Array<Record<string, unknown>> = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : ((data as Record<string, unknown>)?.inventories as Array<Record<string, unknown>>) ?? [];
  const out: WarehouseRow[] = [];
  for (const e of list) {
    const qty = Number(e.storageNum ?? e.quantity ?? e.stock ?? 0);
    if (!Number.isFinite(qty)) continue;
    out.push({
      warehouse: String(e.warehouseName ?? e.warehouseCode ?? e.areaEn ?? "unknown"),
      country: COUNTRY_FROM(e),
      qty: Math.max(0, qty),
      shippingDays: {},
      raw: e,
    });
  }
  return out;
}

export async function fetchGlobalInventory(token: string, pid: string): Promise<{
  warehouses: WarehouseRow[];
  status: "ok" | "discontinued" | "error";
  message?: string;
}> {
  const res = await fetch(`${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${pid}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { return { warehouses: [], status: "error", message: "Bad JSON" }; }
  const ok = json.result === true || json.success === true;
  if (!ok) {
    const msg = String(json.message ?? "");
    if (/removed from shelves|discontinued|off.?shelf/i.test(msg)) {
      return { warehouses: [], status: "discontinued", message: msg };
    }
    return { warehouses: [], status: "error", message: msg || `HTTP ${res.status}` };
  }
  return { warehouses: parseCjInventory(json), status: "ok" };
}

// CJ catalog search — returns at most `limit` candidates.
export async function searchCjCatalog(
  token: string,
  keyword: string,
  limit = 20,
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    productNameEn: keyword,
    pageNum: "1",
    pageSize: String(Math.min(40, limit * 2)),
  });
  const res = await fetch(`${CJ_API_BASE}/product/list?${params}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  const json = await res.json().catch(() => ({}));
  const list = (json?.data?.list as Array<Record<string, unknown>>) ?? [];
  return list.slice(0, limit);
}

// Token similarity 0..1 (cheap Jaccard on lowercased word stems).
export function titleSimilarity(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(
      (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 2),
    );
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

export function scoreCandidate(
  product: { name?: string | null; price?: number | null; weight_g?: number | null },
  cand: Record<string, unknown>,
  globalQty: number,
): { score: number; signals: Record<string, unknown> } {
  const title = String(cand.productNameEn ?? cand.productName ?? "");
  const titleSim = titleSimilarity(product.name ?? "", title);
  const sellPrice = Number(cand.sellPrice ?? cand.price ?? 0);
  const ourPrice = Number(product.price ?? 0);
  const priceFit = ourPrice > 0 && sellPrice > 0
    ? Math.max(0, 1 - Math.abs(sellPrice - ourPrice) / Math.max(ourPrice, sellPrice))
    : 0.4;
  const stockFit = globalQty > 0 ? Math.min(1, globalQty / 50) : 0;
  const status = Number(cand.productStatus ?? cand.status ?? 1);
  const liveBonus = status === 3 ? 0 : 1; // 3 = off-shelf
  const score = (titleSim * 0.45 + priceFit * 0.2 + stockFit * 0.25) * liveBonus + 0.1 * liveBonus;
  return {
    score: Math.max(0, Math.min(1, score)),
    signals: { titleSim, priceFit, stockFit, status, sellPrice, title },
  };
}

// deno-lint-ignore no-explicit-any
export async function isProtected(sb: any, productId: string): Promise<boolean> {
  const { data } = await sb
    .from("winner_products")
    .select("is_protected")
    .eq("product_id", productId)
    .maybeSingle();
  return !!data?.is_protected;
}