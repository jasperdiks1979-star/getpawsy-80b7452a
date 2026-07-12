// cj-live-probe — READ-ONLY live CJ API verification.
// No writes to Shopify, CJ or local catalog tables (cj_token_cache write is
// the standard shared-token cache pattern already used by cj-dropshipping).
// Input: { sku: string, debug?: boolean }

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
    .from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").single();
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
  if (!data?.result) throw new Error(`CJ auth failed status=${res.status} code=${data?.code}`);
  const expiry = new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 5 * 60 * 1000);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: expiry.toISOString(),
    updated_at: new Date().toISOString(),
  });
  return { token: data.data.accessToken, auth_status: res.status };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const sku: string = (body?.sku || "").trim();
    const debug: boolean = !!body?.debug;
    if (!sku) return json({ ok: false, error: "sku required" }, 400);

    const { token, auth_status } = await getAccessToken();

    // Live stock by exact SKU (authoritative variant-level).
    const stockRes = await fetch(
      `${CJ_API_BASE}/product/stock/queryBySku?sku=${encodeURIComponent(sku)}`,
      { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } },
    );
    const stockJson = await stockRes.json().catch(() => ({}));

    // Identity resolvers — try product/query then product/list, both filtered by productSku.
    const queryRes = await fetch(
      `${CJ_API_BASE}/product/query?productSku=${encodeURIComponent(sku)}`,
      { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } },
    );
    const queryJson = await queryRes.json().catch(() => ({}));

    const listRes = await fetch(
      `${CJ_API_BASE}/product/list?productSku=${encodeURIComponent(sku)}&pageNum=1&pageSize=50`,
      { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } },
    );
    const listJson = await listRes.json().catch(() => ({}));

    // Parse stock warehouses.
    const stockAreas: any[] = Array.isArray(stockJson?.data) ? stockJson.data : [];
    const warehouses = stockAreas.map((a) => ({
      warehouse_id: String(a?.areaId ?? a?.countryCode ?? ""),
      warehouse_name: String(a?.areaEn ?? a?.countryNameEn ?? a?.countryCode ?? ""),
      country_code: a?.countryCode ?? null,
      stock: Number(a?.totalInventoryNum ?? 0),
      cj_stock: Number(a?.cjInventoryNum ?? 0),
      factory_stock: Number(a?.factoryInventoryNum ?? 0),
    }));
    const stock_total = warehouses.reduce((s, w) => s + (w.stock || 0), 0);
    const skuFoundOnCj = stockJson?.result === true && stockAreas.length > 0;

    // Resolve pid/vid.
    const skuLower = sku.toLowerCase();
    let cj_product_id: string | null = null;
    let cj_variant_id: string | null = null;
    let product_name: string | null = null;
    let variant_name: string | null = null;
    let resolved_via: string | null = null;

    const q = queryJson?.data;
    if (q && (q.pid || q.productSku)) {
      const variants: any[] = Array.isArray(q.variants) ? q.variants : [];
      const v = variants.find((x) => String(x?.variantSku || "").toLowerCase() === skuLower);
      if (v) {
        cj_product_id = String(q.pid || "");
        cj_variant_id = String(v.vid || "");
        product_name = q.productNameEn || q.productName || null;
        variant_name = v.variantNameEn || v.variantName || null;
        resolved_via = "product/query+variantSku";
      } else if (String(q.productSku || "").toLowerCase() === skuLower) {
        cj_product_id = String(q.pid || "");
        product_name = q.productNameEn || q.productName || null;
        resolved_via = "product/query+productSku";
      }
    }

    if (!cj_product_id) {
      const listRows: any[] = Array.isArray(listJson?.data?.list) ? listJson.data.list : [];
      for (const p of listRows) {
        if (String(p?.productSku || "").toLowerCase() === skuLower) {
          cj_product_id = String(p.pid || "");
          product_name = p.productNameEn || p.productName || null;
          resolved_via = "product/list+productSku";
          break;
        }
      }
    }

    const matches = skuFoundOnCj ? [{
      cj_product_id,
      cj_variant_id,
      cj_sku: sku,
      product_name,
      variant_name,
      stock_total,
      warehouses,
      resolved_via,
    }] : [];

    let match_status:
      | "exact_unique"
      | "exact_multiple"
      | "not_found"
      | "upstream_error"
      | "sku_exists_identity_unresolved";
    if (stockRes.status !== 200 && queryRes.status !== 200 && listRes.status !== 200) {
      match_status = "upstream_error";
    } else if (!skuFoundOnCj) {
      match_status = "not_found";
    } else if (matches.length === 1 && cj_product_id) {
      match_status = "exact_unique";
    } else if (matches.length === 1 && !cj_product_id) {
      match_status = "sku_exists_identity_unresolved";
    } else {
      match_status = "exact_multiple";
    }

    return json({
      ok: true,
      environment: "live",
      auth_verified: auth_status === 200,
      input_sku: sku,
      match_status,
      candidate_count: matches.length,
      matches,
      http_statuses: {
        auth: auth_status,
        stock: stockRes.status,
        query: queryRes.status,
        lookup: listRes.status,
      },
      upstream_codes: {
        stock: stockJson?.code ?? null,
        stock_message: stockJson?.message ?? null,
        query: queryJson?.code ?? null,
        query_message: queryJson?.message ?? null,
        lookup: listJson?.code ?? null,
        lookup_message: listJson?.message ?? null,
      },
      points_remaining: stockJson?.pointsInfo?.remaining ?? null,
      elapsed_ms: Date.now() - started,
      writes_performed: 0,
      _debug: debug ? {
        stock_raw: stockJson,
        query_raw: queryJson,
        list_first: (listJson?.data?.list ?? []).slice(0, 2),
      } : undefined,
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