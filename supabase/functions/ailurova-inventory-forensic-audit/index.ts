// Ailurova SOLD OUT forensic — STRICTLY READ-ONLY.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const CATALOG = "gid://shopify/MarketCatalog/190142939468";

const Q3 = `
query C($id: ID!, $cat: ID!) {
  catalog(id: $cat) {
    id title status
    publication { id autoPublish productsCount { count } products(first: 10) { nodes { id title } } }
    priceList { id name currency parent { adjustment { type value } } }
  }
  product(id: $id) {
    id
    resourcePublicationsV2(first: 30) { nodes { isPublished publication { id catalog { id title } } } }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const out: Record<string, unknown> = { mode: "READ_ONLY", ts: new Date().toISOString(), config: getShopifyConfig() };
  try { out.catalog = await shopifyAdminFetch(Q3, { id: PRODUCT_GID, cat: CATALOG }); }
  catch (e) { out.err = String(e); }
  const probes: Record<string, unknown> = {};
  for (const [k, url] of [
    ["us", "https://ailurova.com/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats.js"],
    ["us_json", "https://ailurova.com/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats.json"],
    ["nl_market", "https://ailurova.com/nl/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats.js"],
  ] as const) {
    try { const r = await fetch(url); const t = await r.text(); probes[k] = { status: r.status, body: t.slice(0, 1500) }; }
    catch (e) { probes[k] = { error: String(e) }; }
  }
  out.storefront = probes;
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
