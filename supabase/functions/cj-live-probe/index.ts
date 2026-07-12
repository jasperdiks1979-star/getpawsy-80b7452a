// cj-live-probe — READ-ONLY live CJ API verification.
// No writes to Shopify, CJ or local catalog tables (token cache only, per existing pattern).
// Accepts { sku } and returns exact-SKU match evidence from the live CJ production API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getAccessToken(): Promise<{ token: string; auth_status: number }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cached } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .single();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return { token: cached.access_token, auth_status: 200 };
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data?.result) {
    throw new Error(`CJ auth failed status=${res.status} code=${data?.code}`);
  }
  const expiry = new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 5 * 60 * 1000);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: expiry.toISOString(),
    updated_at: new Date().toISOString(),
  });
  return { token: data.data.accessToken, auth_status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const sku: string = (body?.sku || "").trim();
    if (!sku) {
      return json({ ok: false, error: "sku required" }, 400);
    }

    // 1) Auth
    const { token, auth_status } = await getAccessToken();

    // 2) Live stock by exact SKU
    const stockRes = await fetch(
      `${CJ_API_BASE}/product/stock/queryBySku?sku=${encodeURIComponent(sku)}`,
      { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } },
    );
    const stockJson = await stockRes.json().catch(() => ({}));

    // 3) Product list filter by exact productSku
    const listRes = await fetch(
      `${CJ_API_BASE}/product/list?productSku=${encodeURIComponent(sku)}&pageNum=1&pageSize=50`,
      { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } },
    );
    const listJson = await listRes.json().catch(() => ({}));

    // Build candidate map: prefer stock rows (authoritative variant-level), enrich with list.
    const stockRows: any[] = Array.isArray(stockJson?.data) ? stockJson.data : [];
    const listRows: any[] = Array.isArray(listJson?.data?.list) ? listJson.data.list : [];

    const listByPid = new Map<string, any>();
    for (const p of listRows) if (p?.pid) listByPid.set(String(p.pid), p);

    // Filter to EXACT SKU only (case-insensitive) — never fuzzy.
    const skuLower = sku.toLowerCase();
    const exactStockRows = stockRows.filter(
      (r) => String(r?.vid || r?.sku || "").length &&
             (String(r?.sku || "").toLowerCase() === skuLower ||
              String(r?.variantSku || "").toLowerCase() === skuLower),
    );

    const candidates = exactStockRows.map((r) => {
      const pid = String(r?.pid || r?.productId || "");
      const p = listByPid.get(pid) || {};
      const warehouses = Array.isArray(r?.areaList)
        ? r.areaList.map((a: any) => ({
            warehouse_id: String(a?.areaId ?? a?.countryCode ?? ""),
            warehouse_name: String(a?.areaName ?? a?.countryCode ?? ""),
            stock: Number(a?.storageNum ?? a?.quantity ?? 0),
          }))
        : [];
      const stock_total = warehouses.reduce((s, w) => s + (w.stock || 0), 0) ||
                          Number(r?.storageNum ?? r?.quantity ?? 0);
      return {
        cj_product_id: pid || null,
        cj_variant_id: String(r?.vid || r?.variantId || "") || null,
        cj_sku: String(r?.sku || r?.variantSku || ""),
        product_name: p?.productNameEn || p?.productName || null,
        variant_name: r?.variantNameEn || r?.variantName || null,
        stock_total,
        warehouses,
      };
    });

    // Deduplicate by (pid,vid,sku)
    const seen = new Set<string>();
    const deduped = candidates.filter((c) => {
      const k = `${c.cj_product_id}|${c.cj_variant_id}|${c.cj_sku}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    let match_status: "exact_unique" | "exact_multiple" | "not_found" | "upstream_error";
    if (stockRes.status !== 200 && listRes.status !== 200) match_status = "upstream_error";
    else if (deduped.length === 0) match_status = "not_found";
    else if (deduped.length === 1) match_status = "exact_unique";
    else match_status = "exact_multiple";

    return json({
      ok: true,
      environment: "live",
      auth_verified: auth_status === 200,
      input_sku: sku,
      match_status,
      candidate_count: deduped.length,
      matches: deduped,
      http_statuses: { auth: auth_status, lookup: listRes.status, stock: stockRes.status },
      upstream_codes: {
        stock: stockJson?.code ?? null,
        stock_message: stockJson?.message ?? null,
        lookup: listJson?.code ?? null,
        lookup_message: listJson?.message ?? null,
      },
      _debug: body?.debug ? {
        stock_raw: stockJson,
        list_first: listRows.slice(0, 2),
      } : undefined,
      elapsed_ms: Date.now() - started,
      writes_performed: 0,
    });
  } catch (e) {
    return json({
      ok: false,
      environment: "live",
      auth_verified: false,
      error: String(e).slice(0, 300),
      writes_performed: 0,
    }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}