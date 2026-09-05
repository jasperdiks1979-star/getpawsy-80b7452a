import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

// STRICTLY READ-ONLY forensic audit of the Ailurova compare-at price.
// No mutations of any kind are performed by this function.

const SKU = "CJFT268927601AZ";
const PRODUCT_ID = "gid://shopify/Product/15889810194764";
const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const Q_PRODUCT = `
query($id: ID!) {
  product(id: $id) {
    id title handle status
    metafields(first: 50) { nodes { namespace key type value } }
    variants(first: 20) {
      nodes {
        id sku title price compareAtPrice inventoryPolicy
        inventoryItem { id }
        contextualPricing(context: { country: US }) {
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
        }
        metafields(first: 50) { nodes { namespace key type value } }
      }
    }
  }
}`;

const Q_MARKETS = `
query {
  markets(first: 30) {
    nodes {
      id name handle enabled primary
      regions(first: 30) { nodes { ... on MarketRegionCountry { code name } } }
    }
  }
}`;

const Q_CATALOGS = `
query {
  catalogs(first: 50) {
    nodes {
      id title status
      ... on MarketCatalog { markets(first: 10) { nodes { id name handle } } }
      priceList {
        id name currency
        parent { adjustment { type value } settings { compareAtMode } }
      }
    }
  }
}`;

const Q_PL_PRICES = `
query($id: ID!) {
  priceList(id: $id) {
    id name currency
    parent { adjustment { type value } settings { compareAtMode } }
    prices(first: 50) {
      nodes {
        originType
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        variant { id sku }
      }
    }
  }
}`;

async function probe(url: string, ua: string, extra: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": ua,
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        ...extra,
      },
    });
    const text = await res.text();
    const money = Array.from(
      new Set((text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) ?? []).map((m) => m.replace(/\s/g, ""))),
    ).slice(0, 30);
    return {
      url,
      status: res.status,
      len: text.length,
      money_tokens: money,
      has_119_00: /119[.,]00/.test(text),
      has_119_99: /119[.,]99/.test(text),
      has_138_99: /138[.,]99/.test(text),
      has_99_00: /\b99[.,]00/.test(text),
      snippet: res.status === 200 && text.length < 20000 ? text.slice(0, 4000) : undefined,
    };
  } catch (e) {
    return { url, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const out: Record<string, unknown> = { mode: "READ_ONLY", mutation_performed: "NO" };

  // A. Admin base prices
  const pr = await shopifyAdminFetch<any>(Q_PRODUCT, { id: PRODUCT_ID });
  const product = pr.data?.product;
  const variant = (product?.variants?.nodes ?? []).find((v: any) => v.sku === SKU) ?? product?.variants?.nodes?.[0];
  out.A_admin = {
    productId: product?.id,
    title: product?.title,
    status: product?.status,
    handle: product?.handle,
    variantId: variant?.id,
    sku: variant?.sku,
    variantTitle: variant?.title,
    shop_currency_price: variant?.price,
    shop_currency_compareAtPrice: variant?.compareAtPrice,
    us_contextual: variant?.contextualPricing,
    product_metafields: product?.metafields?.nodes ?? [],
    variant_metafields: variant?.metafields?.nodes ?? [],
    gqlErrors: pr.errors ?? null,
  };

  // B. Markets + catalogs + price lists
  const [mr, cr] = await Promise.all([
    shopifyAdminFetch<any>(Q_MARKETS, {}),
    shopifyAdminFetch<any>(Q_CATALOGS, {}),
  ]);
  const catalogs = cr.data?.catalogs?.nodes ?? [];
  out.B_markets = mr.data?.markets?.nodes ?? [];
  out.B_markets_errors = mr.errors ?? null;

  const priceLists: any[] = [];
  for (const c of catalogs) {
    if (!c.priceList?.id) continue;
    const plr = await shopifyAdminFetch<any>(Q_PL_PRICES, { id: c.priceList.id });
    const pl = plr.data?.priceList;
    const forVariant = (pl?.prices?.nodes ?? []).filter((p: any) => p.variant?.sku === SKU || p.variant?.id === variant?.id);
    priceLists.push({
      catalogId: c.id,
      catalogTitle: c.title,
      catalogStatus: c.status,
      markets: (c.markets?.nodes ?? []).map((m: any) => ({ id: m.id, name: m.name, handle: m.handle })),
      priceListId: pl?.id,
      priceListName: pl?.name,
      currency: pl?.currency,
      parentAdjustment: pl?.parent ?? null,
      total_fixed_prices: (pl?.prices?.nodes ?? []).length,
      variant_entry: forVariant,
      gqlErrors: plr.errors ?? null,
    });
  }
  out.B_price_lists = priceLists;

  // B2. Targeted fixed-price lookup for this variant in every price list
  const Q_PL_ONE = `
  query($id: ID!, $q: String!) {
    priceList(id: $id) {
      id currency
      prices(first: 5, query: $q) {
        nodes { originType price { amount currencyCode } compareAtPrice { amount currencyCode } variant { id sku } }
      }
    }
  }`;
  const vNum = variant?.id?.split("/").pop();
  const targeted: any[] = [];
  for (const c of catalogs) {
    if (!c.priceList?.id) continue;
    const r = await shopifyAdminFetch<any>(Q_PL_ONE, { id: c.priceList.id, q: `variant_id:${vNum}` });
    targeted.push({ priceListId: c.priceList.id, nodes: r.data?.priceList?.prices?.nodes ?? [], gqlErrors: r.errors ?? null });
  }
  out.B2_variant_fixed_prices = targeted;

  // B3. Contextual pricing in the Netherlands market (shop-currency path)
  const Q_NL = `query($id: ID!) { product(id: $id) { variants(first: 5) { nodes { id sku
      nl: contextualPricing(context: { country: NL }) { price { amount currencyCode } compareAtPrice { amount currencyCode } } } } } }`;
  const nlr = await shopifyAdminFetch<any>(Q_NL, { id: PRODUCT_ID });
  out.B3_nl_contextual = (nlr.data?.product?.variants?.nodes ?? []).filter((v: any) => v.sku === SKU);
  out.B3_errors = nlr.errors ?? null;

  // D. Storefront readbacks
  const bust = `?v=${Date.now()}`;
  const base = "https://ailurova.com/products/" + HANDLE;
  const myshop = "https://ukz3v8-0n.myshopify.com/products/" + HANDLE;
  out.D_storefront = {
    product_json_us: await probe(base + ".js" + bust, UA_DESKTOP, { "x-shopify-country": "US" }),
    desktop_html_us: await probe(base + bust, UA_DESKTOP, { "x-shopify-country": "US" }),
    mobile_html_us: await probe(base + bust, UA_MOBILE, { "x-shopify-country": "US" }),
    myshopify_json: await probe(myshop + ".js" + bust, UA_DESKTOP, { "x-shopify-country": "US" }),
    nl_context_json: await probe(base + ".js" + bust + "1", UA_DESKTOP, { "x-shopify-country": "NL", "accept-language": "nl-NL,nl;q=0.9" }),
  };

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
