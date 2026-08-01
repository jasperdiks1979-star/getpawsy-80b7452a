// Ailurova SOLD OUT forensic — STRICTLY READ-ONLY. No mutations anywhere.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";

const Q = `
query Audit($id: ID!) {
  product(id: $id) {
    id title handle status templateSuffix onlineStoreUrl onlineStorePreviewUrl
    totalInventory tracksInventory
    requiresSellingPlan
    sellingPlanGroupsCount { count }
    resourcePublications(first: 30) { nodes { isPublished publishDate publication { id name } } }
    variants(first: 20) {
      nodes {
        id title sku availableForSale price
        inventoryQuantity inventoryPolicy
        requiresComponents
        selectedOptions { name value }
        sellingPlanGroupsCount { count }
        inventoryItem {
          id tracked requiresShipping
          unitCost { amount }
          inventoryLevels(first: 25) {
            nodes {
              id
              location { id name isActive fulfillsOnlineOrders shipsInventory activatable address { country } }
              quantities(names: ["available","on_hand","committed","incoming","reserved","damaged","safety_stock","quality_control"]) { name quantity }
            }
          }
        }
      }
    }
  }
  locations(first: 25, includeInactive: true) {
    nodes { id name isActive fulfillsOnlineOrders shipsInventory isFulfillmentService address { country } }
  }
  publications(first: 30) { nodes { id name supportsFuturePublishing } }
  markets(first: 25) { nodes { id name enabled primary webPresence { rootUrls { locale url } } } }
  shop { name myshopifyDomain primaryDomain { host url } }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const out: Record<string, unknown> = { mode: "READ_ONLY", ts: new Date().toISOString() };
  try {
    out.config = getShopifyConfig();
    const data = await shopifyAdminFetch(Q, { id: PRODUCT_GID });
    out.shopify = data;
  } catch (e) {
    out.shopify_error = String(e);
  }
  // Public storefront probes (GET only)
  const probes: Record<string, unknown> = {};
  for (const url of [
    "https://ailurova.com/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box.js",
    "https://ailurova.com/products.json?limit=5",
  ]) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "AilurovaAudit/1.0" } });
      const t = await r.text();
      probes[url] = { status: r.status, body: t.slice(0, 4000) };
    } catch (e) { probes[url] = { error: String(e) }; }
  }
  out.storefront = probes;
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
