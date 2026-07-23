// READ-ONLY CJ identity diagnostic for a single SKU.
// No writes anywhere. Sanitized responses only.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCjAccessToken, CJ_API_BASE } from "../_shared/cj-resolver.ts";

const TARGET_SKU = "CJFT268927601AZ";
const SHOP = "ukz3v8-0n.myshopify.com";
const SHOPIFY_VARIANT_GID = "gid://shopify/ProductVariant/58044850536780";
const TITLE_FULL =
  "XL Stainless Steel Litter Box W Flip Top, Scoop, Step, Top & Side Entry Enclosed Litter Box For Big Cats";
const TITLE_SHORT = "XL Stainless Steel Litter Box Flip Top";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cjGet(path: string, token: string) {
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function sanitize(body: any) {
  if (!body) return body;
  const list = body?.data?.list;
  const summary: any = {
    code: body?.code ?? null,
    message: body?.message ?? null,
    total: body?.data?.total ?? (Array.isArray(list) ? list.length : null),
    resultCount: Array.isArray(list) ? list.length : (body?.data ? 1 : 0),
  };
  // Preserve raw data for stock/freight-style responses whose shape isn't list/variants.
  if (body?.data && !Array.isArray(list) && !Array.isArray(body?.data?.variants)) {
    summary.rawData = body.data;
  }
  if (Array.isArray(list)) {
    summary.sample = list.slice(0, 5).map((r: any) => ({
      pid: r?.pid ?? r?.productId ?? null,
      productSku: r?.productSku ?? null,
      productNameEn: r?.productNameEn ?? r?.productName ?? null,
    }));
  } else if (body?.data && typeof body.data === "object") {
    const d = body.data;
    summary.data = {
      pid: d?.pid ?? null,
      productSku: d?.productSku ?? null,
      productNameEn: d?.productNameEn ?? d?.productName ?? null,
      variantCount: Array.isArray(d?.variants) ? d.variants.length : null,
      variants: Array.isArray(d?.variants)
        ? d.variants.slice(0, 20).map((v: any) => ({
            vid: v?.vid ?? null,
            variantSku: v?.variantSku ?? null,
            variantNameEn: v?.variantNameEn ?? v?.variantName ?? null,
          }))
        : null,
    };
  }
  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const attempts: any[] = [];
  let requests = 0;

  try {
    const { token } = await getCjAccessToken();

    async function attempt(label: string, path: string) {
      await sleep(1100);
      const r = await cjGet(path, token);
      requests += 1;
      attempts.push({ label, path, status: r.status, response: sanitize(r.body) });
      return r;
    }

    // PHASE A: raw productList by productSku (canonical resolver's exact call)
    await attempt(
      "A1_product/list?productSku",
      `/product/list?productSku=${encodeURIComponent(TARGET_SKU)}&pageNum=1&pageSize=30`,
    );

    // PHASE B alternatives
    // B1 variant lookup by variantSku (legacy)
    await attempt(
      "B1_product/variant/queryByVid?variantSku",
      `/product/variant/queryByVid?variantSku=${encodeURIComponent(TARGET_SKU)}`,
    );
    // B1b variant/query by variantSku (alternate)
    await attempt(
      "B1b_product/variant/query?variantSku",
      `/product/variant/query?variantSku=${encodeURIComponent(TARGET_SKU)}`,
    );
    // B2 product/list by keyword = SKU
    await attempt(
      "B2_product/list?keyWords=SKU",
      `/product/list?keyWords=${encodeURIComponent(TARGET_SKU)}&pageNum=1&pageSize=30`,
    );
    // B3 search by full title
    await attempt(
      "B3_product/list?keyWords=titleFull",
      `/product/list?keyWords=${encodeURIComponent(TITLE_FULL)}&pageNum=1&pageSize=30`,
    );
    // B4 search by short title
    await attempt(
      "B4_product/list?keyWords=titleShort",
      `/product/list?keyWords=${encodeURIComponent(TITLE_SHORT)}&pageNum=1&pageSize=30`,
    );
    // B5 my/connected shopify listing
    await attempt(
      "B5_my/product/list?shop",
      `/my/product/list?pageNum=1&pageSize=30`,
    );
    // B6 stock/queryBySku direct
    await attempt(
      "B6_product/stock/queryBySku",
      `/product/stock/queryBySku?sku=${encodeURIComponent(TARGET_SKU)}`,
    );

    // Iterate any candidate pids discovered in any attempt, byte-equal match variantSku
    const candidatePids = new Set<string>();
    for (const a of attempts) {
      const list = a?.response?.sample;
      if (Array.isArray(list)) for (const r of list) if (r?.pid) candidatePids.add(String(r.pid));
    }

    const proven: any[] = [];
    for (const pid of Array.from(candidatePids).slice(0, 10)) {
      const q = await attempt(`C_product/query:${pid}`, `/product/query?pid=${encodeURIComponent(pid)}`);
      const d = q.body?.data;
      const variants: any[] = Array.isArray(d?.variants) ? d.variants : [];
      for (const v of variants) {
        if (String(v?.variantSku ?? "").trim().toLowerCase() === TARGET_SKU.toLowerCase()) {
          proven.push({
            pid: String(d?.pid ?? pid),
            vid: String(v?.vid ?? ""),
            variantSku: v?.variantSku,
            variantNameEn: v?.variantNameEn ?? v?.variantName ?? null,
            productNameEn: d?.productNameEn ?? d?.productName ?? null,
          });
        }
      }
    }

    // PHASE D: freight/stock ONLY if proven
    let commercial: any = null;
    if (proven.length === 1) {
      const p = proven[0];
      const stock = await attempt(
        "D1_stock/queryBySku:proven",
        `/product/stock/queryBySku?sku=${encodeURIComponent(p.variantSku)}`,
      );
      const freight = await attempt(
        "D2_logistic/freightCalculate",
        `/logistic/freightCalculate?startCountryCode=US&endCountryCode=US&vid=${encodeURIComponent(p.vid)}&quantity=1`,
      );
      commercial = {
        stockRaw: stock.body?.data ?? null,
        freightRaw: Array.isArray(freight.body?.data) ? freight.body.data.slice(0, 20) : freight.body?.data ?? null,
      };
    }

    let verdict = "CJ_PRODUCT_EXISTS_BUT_API_IDENTITY_UNRESOLVED";
    if (proven.length === 1) verdict = "CJ_IDENTITY_PROVEN_READ_ONLY";
    else if (proven.length > 1) verdict = "CJ_DATA_CONFLICT";
    else if (!attempts.some((a) => a.status === 200)) verdict = "CJ_AUTH_OR_ENDPOINT_FAILURE";

    return new Response(
      JSON.stringify({
        verdict,
        target: { sku: TARGET_SKU, shop: SHOP, shopifyVariantGid: SHOPIFY_VARIANT_GID },
        requestCount: requests,
        candidatePidsDiscovered: Array.from(candidatePids),
        provenIdentities: proven,
        commercial,
        attempts,
        mutations: {
          shopify: 0, cj: 0, mappings: 0, inventory: 0,
        },
        resolverNote:
          proven.length === 1 && !attempts.find(a => a.label === "A1_product/list?productSku")?.response?.sample?.length
            ? "Canonical resolver's product/list?productSku does NOT surface this SKU. A variant-SKU aware lookup (e.g. keyword search or my/product/list) is required to reach this variant."
            : "Canonical resolver path returned candidates; no lookup fix implied.",
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ verdict: "CJ_AUTH_OR_ENDPOINT_FAILURE", error: String(e), attempts, requestCount: requests }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});