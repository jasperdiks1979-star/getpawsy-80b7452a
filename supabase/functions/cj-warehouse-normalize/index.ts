import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";

async function getAccessToken(supabase: any): Promise<string> {
  const { data: cached } = await supabase
    .from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").single();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) return cached.access_token;

  const apiKey = Deno.env.get("CJ_API_KEY");
  const email = Deno.env.get("CJ_EMAIL");
  if (!apiKey || !email) throw new Error("CJ_API_KEY or CJ_EMAIL not configured");

  const r = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: apiKey }),
  });
  const d = await r.json();
  if (!d.result || !d.data?.accessToken) throw new Error(`CJ auth failed: ${d.message ?? "unknown"}`);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton", access_token: d.data.accessToken,
    token_expiry: new Date(d.data.accessTokenExpiryDate).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return d.data.accessToken;
}

async function cjFetch(url: string, token: string, opts: RequestInit = {}, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", "CJ-Access-Token": token, ...(opts.headers || {}) },
    });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000 * (i + 1))); continue; }
    return { status: r.status, body: await r.json() };
  }
  return { status: 0, body: null };
}

function parseAging(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*[-~]\s*(\d+)/);
  if (m) return Math.round((parseInt(m[1]) + parseInt(m[2])) / 2);
  const s2 = String(s).match(/(\d+)/);
  return s2 ? parseInt(s2[1]) : null;
}

async function normalizeProduct(token: string, cjPid: string) {
  // 1. inventory query
  const inv = await cjFetch(
    `${CJ_API_BASE}/product/query?pid=${encodeURIComponent(cjPid)}&features=enable_inventory&countryCode=US`,
    token,
  );
  if (inv.status !== 200 || !inv.body?.result) {
    return { ok: false, reason: `inv_${inv.status}`, body: inv.body?.message };
  }

  const variants = inv.body.data?.variants ?? [];
  let usQty = 0;
  let totalQty = 0;
  let bestVid: string | null = null;
  let bestVidStock = -1;
  let warehouseName: string | null = null;

  for (const v of variants) {
    for (const inv of (v.inventories ?? [])) {
      const q = Number(inv.totalInventory ?? 0);
      totalQty += q;
      if (inv.countryCode === "US") usQty += q;
      if (q > bestVidStock) {
        bestVidStock = q;
        bestVid = v.vid;
      }
      if (inv.countryCode === "US" && !warehouseName && inv.warehouseName) {
        warehouseName = String(inv.warehouseName);
      }
    }
  }

  const hasUS = usQty > 0;
  const warehouseCountry = hasUS ? "US" : (variants[0]?.inventories?.[0]?.countryCode ?? null);

  // 2. freight calc (only if US warehouse)
  let deliveryDays: number | null = null;
  let shippingCost: number | null = null;
  let shippingMethod: string | null = null;

  if (hasUS && bestVid) {
    const f = await cjFetch(`${CJ_API_BASE}/logistic/freightCalculate`, token, {
      method: "POST",
      body: JSON.stringify({
        startCountryCode: "US", endCountryCode: "US", zip: "10001",
        products: [{ vid: bestVid, quantity: 1 }],
      }),
    });
    if (f.status === 200 && f.body?.result && Array.isArray(f.body.data) && f.body.data.length) {
      // pick fastest USPS-like, fallback fastest
      const opts = f.body.data.map((o: any) => ({
        name: o.logisticName,
        price: Number(o.logisticPrice ?? 0),
        aging: o.logisticAging,
        days: parseAging(o.logisticAging) ?? 99,
        isUSPS: /usps|postal/i.test(o.logisticName ?? ""),
      }));
      const usps = opts.filter((o: any) => o.isUSPS).sort((a: any, b: any) => a.days - b.days);
      const pick = usps[0] ?? opts.sort((a: any, b: any) => a.days - b.days)[0];
      deliveryDays = pick.days;
      shippingCost = pick.price;
      shippingMethod = pick.name;
    }
  } else if (warehouseCountry) {
    // No US warehouse — international fallback
    deliveryDays = 14;
    shippingMethod = "International Standard";
  }

  const stockQty = hasUS ? usQty : totalQty;

  // shipping_score: US warehouse 50pts + stock (cap 25) + speed (≤7d:25, ≤10d:15, ≤14d:5)
  let score = 0;
  if (hasUS) score += 50;
  score += Math.min(25, stockQty);
  if (deliveryDays !== null) {
    if (deliveryDays <= 7) score += 25;
    else if (deliveryDays <= 10) score += 15;
    else if (deliveryDays <= 14) score += 5;
  }

  return {
    ok: true,
    warehouse_country: warehouseCountry,
    warehouse_name: warehouseName,
    estimated_delivery_days: deliveryDays,
    shipping_cost: shippingCost,
    shipping_method: shippingMethod,
    stock: stockQty,
    shipping_score: score,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* GET */ }
    const limit = Math.min(50, Number(body.limit ?? 30));
    const offset = Number(body.offset ?? 0);
    const onlyMissing = body.onlyMissing !== false;

    const token = await getAccessToken(supabase);

    let q = supabase
      .from("products")
      .select("id, cj_product_id, warehouse_country")
      .not("cj_product_id", "is", null)
      .eq("is_active", true)
      .order("id");
    if (onlyMissing) {
      q = q.or("shipping_sync_status.is.null,shipping_sync_status.eq.pending");
    }

    const { data: products, error } = await q.range(offset, offset + limit - 1);
    if (error) throw error;

    const results: any[] = [];
    let okCount = 0, failCount = 0;

    for (const p of products ?? []) {
      try {
        const r = await normalizeProduct(token, p.cj_product_id);
        if (r.ok) {
          await supabase.from("products").update({
            warehouse_country: r.warehouse_country,
            warehouse_name: r.warehouse_name,
            estimated_delivery_days: r.estimated_delivery_days,
            shipping_cost: r.shipping_cost,
            shipping_method: r.shipping_method,
            stock: r.stock,
            shipping_score: r.shipping_score,
            shipping_sync_status: "synced",
            updated_at: new Date().toISOString(),
          }).eq("id", p.id);
          okCount++;
          results.push({ id: p.id, ok: true, country: r.warehouse_country, days: r.estimated_delivery_days, score: r.shipping_score });
        } else {
          await supabase.from("products").update({
            shipping_sync_status: `error:${r.reason}`,
            updated_at: new Date().toISOString(),
          }).eq("id", p.id);
          failCount++;
          results.push({ id: p.id, ok: false, reason: r.reason });
        }
      } catch (e) {
        failCount++;
        results.push({ id: p.id, ok: false, reason: "exception", error: String(e) });
      }
      await new Promise(s => setTimeout(s, 350));
    }

    return new Response(JSON.stringify({
      ok: true,
      traceId: crypto.randomUUID(),
      processed: products?.length ?? 0,
      okCount, failCount,
      offset, limit,
      hasMore: (products?.length ?? 0) === limit,
      nextOffset: onlyMissing ? offset : offset + limit,
      duration_ms: Date.now() - t0,
      sample: results.slice(0, 10),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, traceId: crypto.randomUUID(), message: String(e),
      duration_ms: Date.now() - t0,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});