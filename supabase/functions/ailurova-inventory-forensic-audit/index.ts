// Ailurova SOLD OUT forensic — STRICTLY READ-ONLY. No mutations anywhere.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";

const Q2 = `
query M($id: ID!) {
  markets(first: 25) {
    nodes {
      id name enabled primary handle
      status
      catalogs(first: 10) {
        nodes {
          id title status
          publication { id catalog { id } }
          ... on MarketCatalog { markets(first:5){nodes{id name}} }
        }
      }
      webPresences(first: 5) { nodes { id defaultLocale rootUrls { locale url } domain { host } } }
    }
  }
  product(id: $id) {
    id
    variants(first: 5) { nodes { id availableForSale sellableOnlineQuantity } }
  }
  deliveryProfiles(first: 10) {
    nodes {
      id name default
      profileLocationGroups {
        locationGroup { id locations(first: 10) { nodes { id name } } }
        locationGroupZones(first: 20) { nodes { zone { id name countries { code { countryCode } } } } }
      }
      productVariantsCount { count }
    }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const out: Record<string, unknown> = { mode: "READ_ONLY", ts: new Date().toISOString(), config: getShopifyConfig() };
  try { out.markets = await shopifyAdminFetch(Q2, { id: PRODUCT_GID }); }
  catch (e) { out.err = String(e); }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
