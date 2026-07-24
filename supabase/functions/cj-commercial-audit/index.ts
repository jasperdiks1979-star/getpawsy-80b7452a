// READ-ONLY commercial viability audit for one mapped CJ↔Shopify variant.
// Zero writes: only GETs to CJ + one POST to /logistic/freightCalculate
// (read-only pricing calc, not an order create).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCjAccessToken, CJ_API_BASE } from "../_shared/cj-resolver.ts";

const PID = "2004080752018214914";
const VID = "2004080752219541505";
const VARIANT_SKU = "CJFT268927601AZ";

async function cjGet(path: string, token: string) {
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
async function cjPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    method: "POST",
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, body: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token } = await getCjAccessToken();

    // 1. Product detail
    const detail = await cjGet(
      `/product/query?pid=${PID}&features=enable_inventory,enable_video&countryCode=US`,
      token,
    );
    const p: any = detail.body?.data ?? {};
    const variants: any[] = Array.isArray(p?.variants) ? p.variants : [];
    const v = variants.find((x) => String(x?.variantSku) === VARIANT_SKU) ?? null;

    // 2. Freight — several representative US ZIPs
    const zips = ["10001", "90001", "60601", "33101", "94016"];
    const freightByZip: any[] = [];
    for (const zip of zips) {
      const r = await cjPost("/logistic/freightCalculate", token, {
        startCountryCode: "US",
        endCountryCode: "US",
        endPostCode: zip,
        products: [{ vid: VID, quantity: 1 }],
      });
      const rows = Array.isArray(r.body?.data) ? r.body.data : (r.body?.data ? [r.body.data] : []);
      const methods = rows.map((m: any) => ({
        logisticName: m?.logisticName ?? m?.logisticsName ?? null,
        logisticAliasName: m?.logisticAliasName ?? null,
        logisticPrice: m?.logisticPrice ?? m?.freightPrice ?? m?.freight ?? null,
        productAmount: m?.productAmount ?? null,
        totalPrice: m?.totalPrice ?? null,
        processingTime: m?.processingTime ?? null,
        deliveryTime: m?.deliveryTime ?? m?.timeCost ?? null,
      }));
      freightByZip.push({
        zip,
        http: r.status,
        code: r.body?.code,
        message: r.body?.message,
        methodCount: methods.length,
        fedex6: methods.find((m: any) =>
          /fedex.*us.*to.*us.*#?6/i.test(String(m.logisticName ?? "")) ||
          /fedex.*us.*to.*us.*#?6/i.test(String(m.logisticAliasName ?? ""))
        ) ?? null,
        methods,
      });
    }

    // 3. Inventory (fresh, all warehouses)
    const inv = await cjGet(`/product/stock/getInventoryByPid?pid=${PID}`, token);

    return new Response(
      JSON.stringify({
        verdict: "COMMERCIAL_AUDIT_READ_ONLY_COMPLETE",
        pid: PID,
        vid: VID,
        variantSku: VARIANT_SKU,
        product: {
          http: detail.status,
          code: detail.body?.code,
          message: detail.body?.message,
          productNameEn: p?.productNameEn ?? null,
          productSku: p?.productSku ?? null,
          sellPrice: p?.sellPrice ?? null,
          productWeight: p?.productWeight ?? null,
          productUnit: p?.productUnit ?? null,
          sourceFrom: p?.sourceFrom ?? null,
          suggestSellPrice: p?.suggestSellPrice ?? null,
          categoryName: p?.categoryName ?? null,
          currency: p?.currency ?? p?.priceCurrency ?? "USD (assumed)",
          variantCount: variants.length,
        },
        targetVariant: v
          ? {
              vid: v?.vid,
              variantSku: v?.variantSku,
              variantName: v?.variantNameEn ?? v?.variantName,
              variantSellPrice: v?.variantSellPrice,
              variantWeight: v?.variantWeight,
              variantLength: v?.variantLength,
              variantWidth: v?.variantWidth,
              variantHeight: v?.variantHeight,
              variantVolume: v?.variantVolume,
              variantProperty: v?.variantProperty,
              variantStandard: v?.variantStandard,
            }
          : null,
        freightByZip,
        inventory: {
          http: inv.status,
          code: inv.body?.code,
          message: inv.body?.message,
          data: inv.body?.data ?? null,
        },
        mutations: { shopify: 0, cj: 0, mappings: 0, inventory: 0, publications: 0 },
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        verdict: "COMMERCIAL_AUDIT_ERROR",
        error: String(e),
        mutations: { shopify: 0, cj: 0, mappings: 0, inventory: 0, publications: 0 },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});