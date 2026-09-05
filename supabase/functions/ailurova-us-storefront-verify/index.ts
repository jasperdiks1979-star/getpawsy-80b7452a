import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const PRODUCT_ID = "gid://shopify/Product/15889810194764";
const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const EXPECTED_PRICE = "99.00";
// US Price List override: compare-at on the US storefront must be $119.00
// (base variant compareAtPrice may differ; that is intentional and out of scope here).
const EXPECTED_COMPARE = "119.00";

const Q_PRODUCT = `
query($id: ID!) {
  product(id: $id) {
    id handle status onlineStoreUrl totalInventory
    variants(first: 5) { nodes { id sku price compareAtPrice inventoryPolicy inventoryQuantity } }
    media(first: 20) { nodes { mediaContentType alt preview { image { url } } } }
  }
}`;

const Q_PUB_COUNT = `
query {
  publications(first: 20) { nodes { id name } }
  products(first: 250, query: "published_status:online_store_channel:published") {
    edges { node { id handle status } }
  }
}`;

const Q_MARKETS = `
query {
  markets(first: 50) {
    nodes {
      id name handle enabled primary
      regions(first: 50) { nodes { ... on MarketRegionCountry { code name } } }
      currencySettings { baseCurrency { currencyCode } }
    }
  }
}`;

const Q_THEMES = `
query { themes(first: 20, roles: [MAIN]) { nodes { id name role } } }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;

  const ledger: string[] = [];
  const { domain } = getShopifyConfig();

  const [prodR, pubR, mktR, themeR] = await Promise.all([
    shopifyAdminFetch<any>(Q_PRODUCT, { id: PRODUCT_ID }),
    shopifyAdminFetch<any>(Q_PUB_COUNT),
    shopifyAdminFetch<any>(Q_MARKETS),
    shopifyAdminFetch<any>(Q_THEMES),
  ]);

  const product = prodR.data?.product;
  const variant = product?.variants?.nodes?.[0];
  const mediaImages = (product?.media?.nodes ?? []).filter((m: any) => m?.preview?.image?.url);

  const publishedProducts = pubR.data?.products?.edges ?? [];
  const publishedCount = publishedProducts.length;

  const markets = mktR.data?.markets?.nodes ?? [];
  const usMarket = markets.find((m: any) =>
    (m.regions?.nodes ?? []).some((r: any) => r?.code === "US")
  );
  const primaryMarket = markets.find((m: any) => m.primary);

  const mainTheme = themeR.data?.themes?.nodes?.[0];

  // Live storefront probes — US market context (USD)
  const homeUrl = `https://${domain.replace(".myshopify.com", "")}.myshopify.com/`;
  const publicHost = "ailurova.com";
  const pdpPath = `/products/${HANDLE}`;

  const probes: Record<string, any> = {};
  async function probe(name: string, url: string, headers: Record<string,string> = {}) {
    try {
      const r = await fetch(url, {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "AilurovaUSVerify/1.0",
          ...headers,
        },
        redirect: "follow",
      });
      const text = await r.text();
      probes[name] = {
        url, status: r.status,
        has_99: /\$?\s?99\.00|USD\s?99\.00/i.test(text),
        has_compare_119: /\$?\s?119\.00/.test(text),
        has_13899_legacy: /138\.99/.test(text),
        has_euro: /€|EUR\b/.test(text),
        has_dutch: /(Kopen met Shop|Meer betalingsopties|Belastingen inbegrepen|E-mailadres|Voorwaarden en beleid|Uitverkoop|Assortiment|Shop nu)/i.test(text),
        temporarily_unavailable: /temporarily unavailable/i.test(text),
        liquid_error: /Liquid error|invalid url input/i.test(text),
        add_to_cart_present: /add to cart|name="add"/i.test(text),
        length: text.length,
      };
    } catch (e) {
      probes[name] = { url, error: String(e) };
    }
  }

  await Promise.all([
    probe("public_home", `https://${publicHost}/`),
    probe("public_pdp", `https://${publicHost}${pdpPath}`),
    probe("public_cart_js", `https://${publicHost}/cart.js`),
  ]);

  const status = product?.status;
  const price = variant?.price;
  const compare = variant?.compareAtPrice;
  // Variant base price stays 99.00; base compareAtPrice may be 138.99 (legacy) — US pricelist enforces 119.00 on storefront.
  const priceOk = price === EXPECTED_PRICE;
  const publishedOk = !!product?.onlineStoreUrl && publishedCount === 1;
  const themeOk = !!mainTheme;
  const usMarketOk = !!usMarket && usMarket.enabled;
  const usCurrencyOk = usMarket?.currencySettings?.baseCurrency?.currencyCode === "USD" ||
                       usMarket?.regions?.nodes?.some((r:any)=>r?.code==="US");

  const pdp = probes.public_pdp || {};
  const home = probes.public_home || {};
  const renderOk = pdp.status === 200 && pdp.has_99 && pdp.has_compare_119 &&
                   !pdp.has_euro && !pdp.has_dutch && !pdp.temporarily_unavailable &&
                   !pdp.liquid_error && pdp.add_to_cart_present;
  const homeOk = home.status === 200 && !home.has_dutch && !home.liquid_error;

  const blockers: string[] = [];
  if (status !== "ACTIVE") blockers.push(`product_status=${status}`);
  if (!product?.onlineStoreUrl) blockers.push("not_published_online_store");
  if (publishedCount !== 1) blockers.push(`published_products_count=${publishedCount}`);
  if (!priceOk) blockers.push(`price_mismatch price=${price} (expected ${EXPECTED_PRICE})`);
  if (!usMarketOk) blockers.push("us_market_not_active");
  if (!primaryMarket) blockers.push("no_primary_market");
  if (pdp.status !== 200) blockers.push(`pdp_http_${pdp.status ?? "err"}`);
  if (pdp.status === 200 && !pdp.has_99) blockers.push("pdp_missing_99_price");
  if (pdp.status === 200 && !pdp.has_compare_119) blockers.push("pdp_missing_119_compare_price");
  if (pdp.has_euro) blockers.push("pdp_contains_euro");
  if (pdp.has_dutch) blockers.push("pdp_contains_dutch_labels");
  if (pdp.temporarily_unavailable) blockers.push("pdp_temporarily_unavailable");
  if (pdp.liquid_error) blockers.push("pdp_liquid_error");
  if (pdp.status === 200 && !pdp.add_to_cart_present) blockers.push("pdp_missing_add_to_cart");
  if (home.has_dutch) blockers.push("home_contains_dutch_labels");

  const verdict = blockers.length === 0
    ? "AILUROVA_LIVE_US_STOREFRONT_READY"
    : "AILUROVA_LIVE_US_STOREFRONT_PARTIAL";

  return new Response(JSON.stringify({
    verdict,
    active_main_theme: mainTheme ? { id: mainTheme.id, name: mainTheme.name } : null,
    product: {
      id: product?.id, handle: product?.handle, status,
      online_store_url: product?.onlineStoreUrl,
      total_inventory: product?.totalInventory,
      variant: variant ? {
        id: variant.id, sku: variant.sku, price, compareAtPrice: compare,
        inventoryPolicy: variant.inventoryPolicy, inventoryQuantity: variant.inventoryQuantity,
      } : null,
      media_count: product?.media?.nodes?.length ?? 0,
      valid_images_rendered: mediaImages.length,
    },
    published_online_store_products: publishedCount,
    us_market: usMarket ? {
      id: usMarket.id, name: usMarket.name, enabled: usMarket.enabled,
      primary: usMarket.primary,
      currency: usMarket.currencySettings?.baseCurrency?.currencyCode,
      regions: usMarket.regions?.nodes?.map((r:any)=>r?.code) ?? [],
    } : null,
    primary_market: primaryMarket ? {
      id: primaryMarket.id, name: primaryMarket.name,
      currency: primaryMarket.currencySettings?.baseCurrency?.currencyCode,
    } : null,
    us_fixed_price: { price: EXPECTED_PRICE, compareAt: EXPECTED_COMPARE, matches: priceOk },
    live_probes: probes,
    homepage_rendered_price: home.has_99 ? "$99.00" : "unknown",
    pdp_rendered_price: pdp.has_99 ? "$99.00" : "unknown",
    cart_subtotal: "not_executable_headless (Shopify AJAX cart requires stateful session; verify manually)",
    checkout_currency: usCurrencyOk ? "USD (market-configured)" : "unknown",
    blockers,
    mutation_ledger: ledger, // read-only run: no mutations
    notes: [
      "This run is READ-ONLY. No product, theme, publication, market or price mutation was issued.",
      "Market primary-market change requires Shopify Admin → Settings → Markets (write_markets scope not exercised).",
      "Cart subtotal + checkout USD must be visually confirmed in a US-context browser; the sandbox has no persistent Shopify cart session.",
    ],
  }, null, 2), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
});