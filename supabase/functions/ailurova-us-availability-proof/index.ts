// AILUROVA US AVAILABILITY — FINAL READ-ONLY ROOT-CAUSE VERIFICATION
// STRICTLY READ-ONLY: only GraphQL *queries* + public storefront GETs.
// One optional ephemeral cart probe (session cart, creates no order, no mutation
// of catalog/product/inventory state) guarded behind ?cart=1.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const VARIANT_GID = "gid://shopify/ProductVariant/58044850536780";
const LOCATION_GID = "gid://shopify/Location/123641200972";
const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";

const Q_PROFILE = `
query P($vid: ID!) {
  productVariant(id: $vid) {
    id title sku availableForSale inventoryQuantity
    price compareAtPrice sellableOnlineQuantity
    deliveryProfile { id name default }
    contextualPricing(context: { country: US }) {
      price { amount currencyCode } compareAtPrice { amount currencyCode }
      quantityRule { minimum increment }
    }
    product { id title status }
    inventoryItem {
      id requiresShipping tracked
      inventoryLevels(first: 20) {
        nodes {
          location { id name isActive fulfillsOnlineOrders shipsInventory
            address { countryCode province city zip } }
          quantities(names: ["available","on_hand","committed","incoming","reserved"]) { name quantity }
        }
      }
    }
  }
  deliveryProfiles(first: 20) {
    nodes {
      id name default
      profileItems(first: 50) { nodes { product { id title } } }
      profileLocationGroups {
        locationGroup { id locations(first: 50) { nodes { id name } } }
        locationGroupZones(first: 30) {
          nodes {
            zone { id name countries { code { countryCode restOfWorld } provinces { code } } }
            methodDefinitions(first: 20) { nodes { id name active rateProvider { __typename
              ... on DeliveryRateDefinition { id price { amount currencyCode } } } } }
          }
        }
      }
    }
  }
}`;

const Q_MARKETS = `
query M($pid: ID!) {
  markets(first: 20) {
    nodes {
      id name handle status
      webPresences(first: 5) { nodes { id rootUrls { locale url } domain { host } } }
      catalogs(first: 10) { nodes { id title status
        ... on MarketCatalog { publication { id autoPublish } priceList { id currency parent { adjustment { type value } } } } } }
    }
  }
  product(id: $pid) {
    id title status handle onlineStoreUrl
    resourcePublicationsV2(first: 40) {
      nodes { isPublished publishDate publication { id catalog { id title
        ... on AppCatalog { apps(first:3){nodes{title}} } } } }
    }
  }
  publications(first: 40) { nodes { id autoPublish catalog { id title } } }
}`;


const Q_LOC = `
query L($loc: ID!, $prof: ID!) {
  location(id: $loc) {
    id name isActive fulfillsOnlineOrders shipsInventory hasActiveInventory
    localPickupSettingsV2 { instructions }
    address { countryCode }
  }
  locations(first: 20, includeInactive: true) {
    nodes { id name isActive fulfillsOnlineOrders shipsInventory }
  }
  deliveryProfile(id: $prof) {
    id name
    locationsWithoutRatesCount { count }
    unassignedLocations { id name }
    profileLocationGroups {
      locationGroup { id locations(first: 30) { nodes { id name } } }
    }
  }
  shop { id name }
}`;

async function probe(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, init);
    const t = await r.text();
    return { url, status: r.status, len: t.length, body: t.slice(0, 4000) };
  } catch (e) { return { url, error: String(e) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const u = new URL(req.url);
  const out: Record<string, unknown> = {
    mode: "READ_ONLY", ts: new Date().toISOString(),
    config: getShopifyConfig(), product: PRODUCT_GID, variant: VARIANT_GID, location: LOCATION_GID,
  };

  try { out.shipping = await shopifyAdminFetch(Q_PROFILE, { vid: VARIANT_GID }); }
  catch (e) { out.shipping_error = String(e); }

  try { out.markets = await shopifyAdminFetch(Q_MARKETS, { pid: PRODUCT_GID }); }
  catch (e) { out.markets_error = String(e); }

  try { out.locations = await shopifyAdminFetch(Q_LOC, { loc: LOCATION_GID, prof: "gid://shopify/DeliveryProfile/146220056908" }); }
  catch (e) { out.locations_error = String(e); }

  // Storefront API contextual reads (US vs NL) if a storefront token exists.
  const sfToken = Deno.env.get("SHOPIFY_STOREFRONT_TOKEN");
  if (sfToken) {
    const { domain, apiVersion } = getShopifyConfig();
    const SF = `
    query S($handle: String!) @inContext(country: $$COUNTRY$$) {
      localization { country { isoCode currency { isoCode } } }
      product(handle: $handle) {
        id title availableForSale
        variants(first: 5) { nodes { id availableForSale quantityAvailable currentlyNotInStock
          price { amount currencyCode } compareAtPrice { amount currencyCode } } }
      }
    }`;
    const sfOut: Record<string, unknown> = {};
    for (const c of ["US", "NL"]) {
      const r = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": sfToken },
        body: JSON.stringify({ query: SF.replace("$$COUNTRY$$", c), variables: { handle: HANDLE } }),
      });
      sfOut[c] = { status: r.status, body: await r.json().catch(() => null) };
    }
    out.storefront_api = sfOut;
  } else out.storefront_api = "SHOPIFY_STOREFRONT_TOKEN not configured";

  // Public storefront probes
  out.public = {
    us_js: await probe(`https://ailurova.com/products/${HANDLE}.js`),
    us_json: await probe(`https://ailurova.com/products/${HANDLE}.json`),
    myshopify_js: await probe(`https://${getShopifyConfig().domain}/products/${HANDLE}.js`),
  };

  if (u.searchParams.get("cart") === "1") {
    // Ephemeral session-cart probe. No order, no payment.
    const add = await probe(`https://ailurova.com/cart/add.js`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: 58044850536780, quantity: 1 }] }),
    });
    out.cart_probe = { add };
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
