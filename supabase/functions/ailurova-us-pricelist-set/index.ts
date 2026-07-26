import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

// Narrowly scoped US price-list update for Ailurova.
// Target SKU: CJFT268927601AZ (Light Gray variant).
// Sets US market fixed price = $99.00 USD, compareAt = $119.00 USD.
// Base EUR price/compareAt is NOT touched.

const SKU = "CJFT268927601AZ";
const PRODUCT_ID = "gid://shopify/Product/15889810194764";
const TARGET_PRICE = "99.00";
const TARGET_COMPARE = "119.00";

const CONFIRM = "CONFIRM_AILUROVA_US_PRICELIST_99_119";

// --- Queries ---
const Q_VARIANT = `
query($q: String!) {
  productVariants(first: 5, query: $q) {
    nodes { id sku title price compareAtPrice product { id title } }
  }
}`;

const Q_CATALOGS = `
query {
  catalogs(first: 50, type: MARKET) {
    nodes {
      id title status
      ... on MarketCatalog {
        markets(first: 10) { nodes { id name handle } }
      }
      priceList { id name currency }
    }
  }
}`;

const Q_PRICELIST_READ = `
query($id: ID!, $q: String!) {
  priceList(id: $id) {
    id name currency
    prices(first: 50, query: $q) {
      nodes {
        originType
        price { amount currencyCode }
        compareAtPrice { amount currencyCode }
        variant { id sku }
      }
    }
  }
}`;

const M_UPDATE = `
mutation($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
  priceListFixedPricesUpdate(priceListId: $priceListId, pricesToAdd: $prices, variantIdsToDelete: []) {
    pricesAdded { originType price { amount currencyCode } compareAtPrice { amount currencyCode } variant { id sku } }
    userErrors { field message code }
  }
}`;

async function verifyStorefront(): Promise<{ ok: boolean; note: string; html_len?: number; status?: number }> {
  try {
    const res = await fetch("https://ailurova.com/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats", {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "accept-language": "en-US,en;q=0.9",
        "x-shopify-country": "US",
      },
    });
    if (res.status !== 200) return { ok: false, note: `HTTP ${res.status}`, status: res.status };
    const html = await res.text();
    const has99 = /\$?99\.00|\$?99\b/.test(html);
    const has119 = /\$?119\.00|\$?119\b/.test(html);
    return { ok: has99 && has119, note: `has99=${has99} has119=${has119}`, html_len: html.length, status: 200 };
  } catch (e) {
    return { ok: false, note: `fetch_err ${String(e)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.confirm !== CONFIRM;

  const ledger: any = { mutation_performed: "NO", steps: [] };

  // Step 1: Resolve variant by SKU
  const vr = await shopifyAdminFetch<any>(Q_VARIANT, { q: `sku:${SKU}` });
  const variants = vr.data?.productVariants?.nodes ?? [];
  const variant = variants.find((v: any) => v.sku === SKU) ?? variants[0];
  ledger.steps.push({ step: "resolve_variant", found: variants.length, chosen: variant?.id, gqlErrors: vr.errors ?? null });
  if (!variant) return json({ ...ledger, verdict: "VARIANT_NOT_FOUND" });
  if (variant.product?.id !== PRODUCT_ID) {
    return json({ ...ledger, verdict: "VARIANT_PRODUCT_MISMATCH", got: variant.product?.id, expected: PRODUCT_ID });
  }

  // Step 2: List catalogs to find the US market catalog
  const cr = await shopifyAdminFetch<any>(Q_CATALOGS, {});
  const catalogs = cr.data?.catalogs?.nodes ?? [];
  const usCatalog = catalogs.find((c: any) => {
    const mks = c.markets?.nodes ?? [];
    return mks.some((m: any) =>
      /united states|^us$|usa/i.test(m.name ?? "") ||
      /^us$|united-states/i.test(m.handle ?? "")
    );
  }) ?? catalogs.find((c: any) => c.priceList?.currency === "USD");
  ledger.steps.push({
    step: "resolve_us_catalog",
    total_catalogs: catalogs.length,
    catalogs_summary: catalogs.map((c: any) => ({ id: c.id, title: c.title, currency: c.priceList?.currency, markets: (c.markets?.nodes ?? []).map((m: any) => m.name) })),
    chosen: usCatalog?.id,
    priceListId: usCatalog?.priceList?.id,
    gqlErrors: cr.errors ?? null,
  });
  if (!usCatalog?.priceList?.id) return json({ ...ledger, verdict: "US_PRICELIST_NOT_FOUND" });
  const priceListId = usCatalog.priceList.id as string;

  // Step 3: Read current fixed price
  const beforeRead = await shopifyAdminFetch<any>(Q_PRICELIST_READ, { id: priceListId, q: `variant_id:${variant.id.split("/").pop()}` });
  const beforePrices = beforeRead.data?.priceList?.prices?.nodes ?? [];
  const beforeForVariant = beforePrices.find((p: any) => p.variant?.id === variant.id) ?? beforePrices[0] ?? null;
  ledger.steps.push({ step: "read_before", before: beforeForVariant, gqlErrors: beforeRead.errors ?? null });

  if (dryRun) {
    return json({
      ...ledger,
      verdict: "PREFLIGHT_READY",
      productVariantId: variant.id,
      usCatalogId: usCatalog.id,
      priceListId,
      hint: `POST { confirm: "${CONFIRM}" } to execute the mutation.`,
    });
  }

  // Step 4: Execute mutation
  const pricesInput = [{
    variantId: variant.id,
    price: { amount: TARGET_PRICE, currencyCode: "USD" },
    compareAtPrice: { amount: TARGET_COMPARE, currencyCode: "USD" },
  }];
  const mr = await shopifyAdminFetch<any>(M_UPDATE, { priceListId, prices: pricesInput });
  const uErrs = mr.data?.priceListFixedPricesUpdate?.userErrors ?? [];
  const mutated = mr.data?.priceListFixedPricesUpdate?.pricesAdded ?? [];
  ledger.steps.push({ step: "mutation", mutated, userErrors: uErrs, gqlErrors: mr.errors ?? null });
  ledger.mutation_performed = uErrs.length === 0 && !mr.errors ? "YES" : "NO";

  if (uErrs.length || mr.errors) {
    return json({
      ...ledger,
      verdict: "AILUROVA_US_PRICELIST_MUTATION_FAILED",
      productVariantId: variant.id,
      usCatalogId: usCatalog.id,
      priceListId,
      userErrors: uErrs,
      gqlErrors: mr.errors ?? null,
    });
  }

  // Step 5: Read-back verification
  const afterRead = await shopifyAdminFetch<any>(Q_PRICELIST_READ, { id: priceListId, q: `variant_id:${variant.id.split("/").pop()}` });
  const afterPrices = afterRead.data?.priceList?.prices?.nodes ?? [];
  const afterForVariant = afterPrices.find((p: any) => p.variant?.id === variant.id) ?? afterPrices[0] ?? null;

  const okPrice = afterForVariant?.price?.amount === TARGET_PRICE && afterForVariant?.price?.currencyCode === "USD";
  const okCompare = afterForVariant?.compareAtPrice?.amount === TARGET_COMPARE && afterForVariant?.compareAtPrice?.currencyCode === "USD";
  const okOrigin = afterForVariant?.originType === "FIXED";

  // Step 6: Storefront verification
  const storefront = await verifyStorefront();

  const finalOk = okPrice && okCompare && okOrigin;
  return json({
    ...ledger,
    verdict: finalOk && storefront.ok ? "AILUROVA_US_PRICELIST_99_119_SET" : finalOk ? "AILUROVA_US_PRICELIST_SET_STOREFRONT_UNVERIFIED" : "AILUROVA_US_PRICELIST_READBACK_MISMATCH",
    productVariantId: variant.id,
    usCatalogId: usCatalog.id,
    priceListId,
    before: beforeForVariant,
    after: afterForVariant,
    checks: { okPrice, okCompare, okOrigin },
    storefront,
    userErrors: [],
  });
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: { ...corsHeaders, "content-type": "application/json" } });
}