// AILUROVA — STAGE 1 READ-ONLY PRODUCT FACT MATRIX AUDIT
// STRICTLY READ-ONLY. GraphQL queries only. No mutations of any kind.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";

const Q = `
query F($pid: ID!) {
  product(id: $pid) {
    id title handle status vendor productType tags createdAt updatedAt
    descriptionHtml description
    onlineStoreUrl
    seo { title description }
    featuredMedia { ... on MediaImage { id image { url altText width height } } }
    media(first: 60) {
      nodes {
        __typename mediaContentType alt
        ... on MediaImage { id image { url altText width height } }
        ... on Video { id sources { url format } }
      }
    }
    metafields(first: 100) { nodes { namespace key type value } }
    options { name values }
    variants(first: 20) {
      nodes {
        id title sku barcode price compareAtPrice availableForSale
        inventoryQuantity sellableOnlineQuantity
        selectedOptions { name value }
        inventoryItem {
          id tracked requiresShipping countryCodeOfOrigin harmonizedSystemCode
          measurement { weight { value unit } }
          unitCost { amount currencyCode }
        }
        metafields(first: 50) { nodes { namespace key type value } }
        contextualPricing(context: { country: US }) {
          price { amount currencyCode } compareAtPrice { amount currencyCode }
        }
      }
    }
  }
  shop {
    name email contactEmail myshopifyDomain url
    billingAddress { address1 address2 city province zip country countryCodeV2 company phone }
    shopPolicies { type title body url }
  }
  deliveryProfiles(first: 10) {
    nodes {
      id name default
      profileLocationGroups {
        locationGroupZones(first: 30) {
          nodes {
            zone { name countries { code { countryCode restOfWorld } } }
            methodDefinitions(first: 20) {
              nodes { id name active description
                rateProvider { __typename ... on DeliveryRateDefinition { price { amount currencyCode } } }
                methodConditions { field operator conditionCriteria { __typename
                  ... on MoneyV2 { amount currencyCode } ... on Weight { value unit } } }
              }
            }
          }
        }
      }
    }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const out: Record<string, unknown> = { mode: "READ_ONLY", mutations: 0, ts: new Date().toISOString() };
  try {
    out.config = getShopifyConfig();
    const res = await shopifyAdminFetch(Q, { pid: PRODUCT_GID });
    out.shopify = res;
  } catch (e) { out.shopifyError = String(e); }

  // Public storefront reads
  const urls = [
    "https://ailurova.com/products.json?limit=5",
    "https://ailurova.com/policies/shipping-policy",
    "https://ailurova.com/policies/refund-policy",
  ];
  const pub: Record<string, unknown> = {};
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 AilurovaFactAudit" } });
      const t = await r.text();
      pub[u] = { status: r.status, length: t.length, body: t.slice(0, 6000) };
    } catch (e) { pub[u] = { error: String(e) }; }
  }
  out.public = pub;

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
