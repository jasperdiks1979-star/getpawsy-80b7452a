import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

// Phase 2: smallest safe mutation — base variant compareAtPrice 138.99 -> 119.00
const PRODUCT_ID = "gid://shopify/Product/15889810194764";
const VARIANT_ID = "gid://shopify/ProductVariant/58044850536780";
const SKU = "CJFT268927601AZ";
const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const TARGET = "119.00";
const EXPECTED_OLD = "138.99";

const Q_READ = `query($id: ID!) { product(id: $id) { id status variants(first: 20) { nodes {
  id sku price compareAtPrice
  us: contextualPricing(context: { country: US }) { price { amount currencyCode } compareAtPrice { amount currencyCode } }
  nl: contextualPricing(context: { country: NL }) { price { amount currencyCode } compareAtPrice { amount currencyCode } }
} } } }`;

const M_UPDATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id sku price compareAtPrice }
    userErrors { field message }
  }
}`;

async function probe(url: string, ua: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, { headers: { "user-agent": ua, ...headers } });
    const text = await res.text();
    return {
      url, status: res.status,
      has_119_00: /119[.,]00/.test(text),
      has_119_99: /119[.,]99/.test(text),
      has_138_99: /138[.,]99/.test(text),
      has_99_00: /\b99[.,]00/.test(text),
    };
  } catch (e) { return { url, error: String(e) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "execute" ? "execute" : "preflight";
  const out: Record<string, unknown> = { mode, mutation_performed: "NO" };

  const before = await shopifyAdminFetch<any>(Q_READ, { id: PRODUCT_ID });
  const v = (before.data?.product?.variants?.nodes ?? []).find((n: any) => n.id === VARIANT_ID || n.sku === SKU);
  out.before = v ?? null;

  if (!v) {
    out.halt = "VARIANT_NOT_FOUND";
    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  if (v.compareAtPrice === TARGET) {
    out.halt = "ALREADY_AT_TARGET";
    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  if (v.compareAtPrice !== EXPECTED_OLD) {
    out.halt = `UNEXPECTED_CURRENT_COMPARE_AT:${v.compareAtPrice}`;
    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  out.planned_mutation = { productId: PRODUCT_ID, variants: [{ id: VARIANT_ID, compareAtPrice: TARGET }] };
  if (mode !== "execute") {
    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  const mr = await shopifyAdminFetch<any>(M_UPDATE, { productId: PRODUCT_ID, variants: [{ id: VARIANT_ID, compareAtPrice: TARGET }] });
  out.mutation_result = mr.data?.productVariantsBulkUpdate ?? null;
  out.mutation_errors = mr.errors ?? mr.data?.productVariantsBulkUpdate?.userErrors ?? null;
  out.mutation_performed = (mr.data?.productVariantsBulkUpdate?.userErrors ?? []).length === 0 ? "YES" : "FAILED";

  const after = await shopifyAdminFetch<any>(Q_READ, { id: PRODUCT_ID });
  out.after = (after.data?.product?.variants?.nodes ?? []).find((n: any) => n.id === VARIANT_ID) ?? null;

  const bust = `?v=${Date.now()}`;
  const base = "https://ailurova.com/products/" + HANDLE;
  const UA_D = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
  const UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  out.verify_storefront = {
    product_json_us: await probe(base + ".js" + bust, UA_D, { "x-shopify-country": "US" }),
    desktop_html_us: await probe(base + bust, UA_D, { "x-shopify-country": "US" }),
    mobile_html_us: await probe(base + bust + "1", UA_M, { "x-shopify-country": "US" }),
  };

  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
});
