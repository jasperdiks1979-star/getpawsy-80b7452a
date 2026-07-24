// US-only fixed price provisioning for a single variant.
//
// Creates the minimum Shopify Markets infrastructure required to assign
// a fixed USD $99.00 price to variant gid://shopify/ProductVariant/58044850536780
// in the United States market (gid://shopify/Market/111494562124), without
// altering the EUR base price, product status, publications, inventory,
// or any other product / variant / market.
//
// Modes:
//   - "preflight" (default): Read-only Phase 1 audit. No mutations.
//   - "execute": Runs preflight; if all gates pass AND
//     confirm === "CONFIRM_CREATE_US_CATALOG_99", performs:
//         1) catalogCreate  (context: MARKET, marketsIds: [US])
//         2) priceListCreate (currency USD, catalogId, parent 0% adjustment)
//         3) priceListFixedPricesAdd (single variant, no compareAtPrice)
//     Then Phase 3 read-back and Phase 4 presentment resolution check.
//
// Zero writes to: product, variant base fields, inventory, publications,
// CJ, catalog_recovery_mappings, or any other product.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getShopifyConfig,
  shopifyAdminFetch,
} from "../_shared/shopify-token-provider.ts";

const EXPECTED_SHOP_DOMAIN = "ukz3v8-0n.myshopify.com";
const US_MARKET_GID = "gid://shopify/Market/111494562124";
const SHOPIFY_PRODUCT_GID = "gid://shopify/Product/15889810194764";
const SHOPIFY_VARIANT_GID = "gid://shopify/ProductVariant/58044850536780";
const EXPECTED_SKU = "CJFT268927601AZ";
const EXPECTED_BASE_PRICE_EUR = "49.50";
const EXPECTED_BASE_COMPARE_EUR = "138.99";
const EXPECTED_MEDIA_COUNT = 9;
const MAPPING_ROW_ID = "e05d929a-8a1b-439c-b87a-3c54e3ead484";

const TARGET_PRICE_USD = "99.00";
const CONFIRM_PHRASE = "CONFIRM_CREATE_US_CATALOG_99";

const CATALOG_TITLE = "US Market Catalog — Fixed USD (single-variant scoped)";
const PRICE_LIST_NAME = "US Market Price List — USD (single-variant scoped)";

type MutationCounters = {
  catalogs_created: number;
  price_lists_created: number;
  price_rows_created: number;
  market_associations_changed: number;
  shopify_product_mutations: number;
  inventory_mutations: number;
  publication_mutations: number;
  cj_mutations: number;
  mapping_mutations: number;
};

function zeroMutations(): MutationCounters {
  return {
    catalogs_created: 0,
    price_lists_created: 0,
    price_rows_created: 0,
    market_associations_changed: 0,
    shopify_product_mutations: 0,
    inventory_mutations: 0,
    publication_mutations: 0,
    cj_mutations: 0,
    mapping_mutations: 0,
  };
}

async function preflight() {
  const cfg = getShopifyConfig();
  const domainOk = cfg.domain.toLowerCase() === EXPECTED_SHOP_DOMAIN;

  const q = `
    query Preflight($pid: ID!, $vid: ID!, $mid: ID!) {
      shop {
        name
        myshopifyDomain
        currencyCode
      }
      market(id: $mid) {
        id
        name
        handle
        enabled
        currencySettings { baseCurrency { currencyCode } }
        catalogs(first: 20) {
          nodes {
            id
            title
            status
            priceList { id name currency }
          }
        }
        regions(first: 50) {
          nodes { ... on MarketRegionCountry { code name } }
        }
      }
      product(id: $pid) {
        id
        title
        handle
        status
        vendor
        resourcePublicationsCount { count }
        mediaCount { count }
      }
      productVariant(id: $vid) {
        id
        sku
        price
        compareAtPrice
        inventoryPolicy
        inventoryQuantity
      }
    }
  `;
  const r = await shopifyAdminFetch<any>(q, {
    pid: SHOPIFY_PRODUCT_GID,
    vid: SHOPIFY_VARIANT_GID,
    mid: US_MARKET_GID,
  });

  const shop = r?.data?.shop;
  const market = r?.data?.market;
  const product = r?.data?.product;
  const variant = r?.data?.productVariant;

  const usdBase =
    market?.currencySettings?.baseCurrency?.currencyCode === "USD";
  const usCountry = (market?.regions?.nodes ?? []).some(
    (n: any) => n?.code === "US",
  );
  const existingUsCatalogs = market?.catalogs?.nodes ?? [];
  const existingUsdPriceListOnMarket = existingUsCatalogs.find(
    (c: any) => c?.priceList?.currency === "USD",
  ) ?? null;

  const checks = {
    shopDomainMatches: domainOk && shop?.myshopifyDomain?.toLowerCase() === EXPECTED_SHOP_DOMAIN,
    usMarketExistsAndEnabled: !!market && market.enabled === true,
    usMarketBaseCurrencyIsUsd: usdBase,
    usMarketRegionIncludesUs: usCountry,
    productExists: !!product,
    variantExists: !!variant,
    variantSkuMatches: variant?.sku === EXPECTED_SKU,
    baseVariantPriceUnchanged: variant?.price === EXPECTED_BASE_PRICE_EUR,
    baseCompareAtUnchanged: variant?.compareAtPrice === EXPECTED_BASE_COMPARE_EUR,
    productStillDraft: product?.status === "DRAFT",
    publicationsCountZero:
      (product?.resourcePublicationsCount?.count ?? -1) === 0,
    inventoryQuantityZero: variant?.inventoryQuantity === 0,
    inventoryPolicyDeny: variant?.inventoryPolicy === "DENY",
    mediaCountUnchanged:
      (product?.mediaCount?.count ?? -1) === EXPECTED_MEDIA_COUNT,
    noExistingUsMarketPriceList: !existingUsdPriceListOnMarket,
  };

  const allGatesPass = Object.values(checks).every(Boolean);

  return {
    domainOk,
    shop,
    market,
    product,
    variant,
    existingUsCatalogs,
    existingUsdPriceListOnMarket,
    checks,
    allGatesPass,
    rawErrors: r?.errors ?? null,
  };
}

async function createCatalog() {
  const q = `
    mutation CatalogCreate($input: CatalogCreateInput!) {
      catalogCreate(input: $input) {
        catalog {
          id
          title
          status
          ... on MarketCatalog {
            markets(first: 10) { nodes { id name } }
          }
        }
        userErrors { field message code }
      }
    }
  `;
  const input = {
    title: CATALOG_TITLE,
    status: "ACTIVE",
    context: {
      marketIds: [US_MARKET_GID],
    },
  };
  return await shopifyAdminFetch<any>(q, { input });
}

async function createPriceList(catalogId: string) {
  const q = `
    mutation PriceListCreate($input: PriceListCreateInput!) {
      priceListCreate(input: $input) {
        priceList { id name currency catalog { id } }
        userErrors { field message code }
      }
    }
  `;
  const input = {
    name: PRICE_LIST_NAME,
    currency: "USD",
    catalogId,
    parent: {
      adjustment: {
        type: "PERCENTAGE_INCREASE",
        value: 0.0,
      },
    },
  };
  return await shopifyAdminFetch<any>(q, { input });
}

async function addFixedPrice(priceListId: string) {
  const q = `
    mutation AddFixedPrice($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
      priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
        prices {
          variant { id sku }
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          originType
        }
        userErrors { field message code }
      }
    }
  `;
  const variables = {
    priceListId,
    prices: [
      {
        variantId: SHOPIFY_VARIANT_GID,
        price: { amount: TARGET_PRICE_USD, currencyCode: "USD" },
        // compareAtPrice intentionally omitted → null (no false MSRP)
      },
    ],
  };
  return await shopifyAdminFetch<any>(q, variables);
}

async function tryDeletePriceList(priceListId: string) {
  const q = `
    mutation PriceListDelete($id: ID!) {
      priceListDelete(id: $id) {
        deletedId
        userErrors { field message code }
      }
    }
  `;
  return await shopifyAdminFetch<any>(q, { id: priceListId });
}

async function tryDeleteCatalog(catalogId: string) {
  const q = `
    mutation CatalogDelete($id: ID!) {
      catalogDelete(id: $id) {
        deletedId
        userErrors { field message code }
      }
    }
  `;
  return await shopifyAdminFetch<any>(q, { id: catalogId });
}

async function readback(priceListId: string, catalogId: string) {
  const q = `
    query Readback($pid: ID!, $vid: ID!, $mid: ID!, $plId: ID!, $catId: ID!) {
      market(id: $mid) {
        id name enabled
        currencySettings { baseCurrency { currencyCode } }
        catalogs(first: 20) {
          nodes { id title status priceList { id name currency } }
        }
      }
      catalog(id: $catId) {
        id title status
        ... on MarketCatalog { markets(first: 20) { nodes { id name } } }
        priceList { id name currency }
        publication { id }
      }
      priceList(id: $plId) {
        id name currency
        catalog { id title }
        parent { adjustment { type value } }
        prices(first: 5) {
          nodes {
            variant { id sku }
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
            originType
          }
        }
        pricesCount: prices(first: 250) { nodes { variant { id } } }
      }
      product(id: $pid) {
        id title handle status vendor
        resourcePublicationsCount { count }
        mediaCount { count }
      }
      productVariant(id: $vid) {
        id sku price compareAtPrice inventoryPolicy inventoryQuantity
      }
    }
  `;
  return await shopifyAdminFetch<any>(q, {
    pid: SHOPIFY_PRODUCT_GID,
    vid: SHOPIFY_VARIANT_GID,
    mid: US_MARKET_GID,
    plId: priceListId,
    catId: catalogId,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const mutations = zeroMutations();

  try {
    const input = await req.json().catch(() => ({} as any));
    const mode = input?.mode === "execute" ? "execute" : "preflight";
    const confirm = input?.confirm ?? "";

    // --- PHASE 1: PREFLIGHT ---
    const pf = await preflight();

    const phase1 = {
      target: {
        shopDomain: EXPECTED_SHOP_DOMAIN,
        marketId: US_MARKET_GID,
        productId: SHOPIFY_PRODUCT_GID,
        variantId: SHOPIFY_VARIANT_GID,
        sku: EXPECTED_SKU,
        targetPriceUsd: TARGET_PRICE_USD,
        compareAtUsd: null,
      },
      snapshot: {
        shop: pf.shop,
        market: pf.market
          ? {
              id: pf.market.id,
              name: pf.market.name,
              handle: pf.market.handle,
              enabled: pf.market.enabled,
              baseCurrency: pf.market.currencySettings?.baseCurrency?.currencyCode,
              regionCodes: (pf.market.regions?.nodes ?? [])
                .map((r: any) => r?.code)
                .filter(Boolean),
              existingCatalogs: pf.existingUsCatalogs,
            }
          : null,
        product: pf.product,
        variant: pf.variant,
      },
      checks: pf.checks,
      allGatesPass: pf.allGatesPass,
      plannedMutations: [
        "catalogCreate(input: {title, status: ACTIVE, context: {marketIds: [US_MARKET_GID]}})  // MarketCatalog",
        "priceListCreate(input: {name, currency: USD, catalogId, parent: {adjustment: {type: PERCENTAGE_INCREASE, value: 0}}})",
        "priceListFixedPricesAdd(priceListId, prices: [{variantId, price:{amount:99.00, currencyCode:USD}}])  // compareAtPrice omitted",
      ],
      isolationGuarantees: [
        "No productUpdate / productVariantsBulkUpdate call → base EUR 49.50 / compareAt 138.99 preserved",
        "No publicationCreate / publishablePublish → product remains DRAFT, publications=0",
        "No inventoryAdjustQuantities / inventorySetOnHandQuantities → quantity 0 / DENY preserved",
        "priceListFixedPricesAdd targets exactly ONE variantId → no other products, no other markets",
        "catalogCreate context is scoped to marketIds=[US_MARKET_GID] only",
        "No CJ mutations; no catalog_recovery_mappings writes",
      ],
      rawShopErrors: pf.rawErrors,
    };

    if (!pf.allGatesPass) {
      return new Response(
        JSON.stringify({
          verdict: "BLOCKED_NO_MUTATION",
          reason: "One or more Phase 1 preflight gates failed",
          phase1,
          mutations,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    if (mode !== "execute") {
      return new Response(
        JSON.stringify({
          verdict: "PREFLIGHT_PASS_AWAITING_CONFIRMATION",
          confirm_phrase_required: CONFIRM_PHRASE,
          phase1,
          mutations,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    if (confirm !== CONFIRM_PHRASE) {
      return new Response(
        JSON.stringify({
          verdict: "BLOCKED_NO_MUTATION",
          reason: "Confirmation phrase missing or incorrect",
          confirm_phrase_required: CONFIRM_PHRASE,
          phase1,
          mutations,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // --- PHASE 2: MUTATION ---
    // Step 1: catalogCreate
    const catResp = await createCatalog();
    const catErrors = catResp?.data?.catalogCreate?.userErrors ?? [];
    const catalog = catResp?.data?.catalogCreate?.catalog ?? null;
    if (catErrors.length > 0 || !catalog?.id) {
      return new Response(
        JSON.stringify({
          verdict: "PRICE_LIST_CREATION_FAILED_ROLLED_BACK",
          stage: "catalogCreate",
          userErrors: catErrors,
          raw: catResp,
          phase1,
          mutations,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }
    mutations.catalogs_created = 1;
    mutations.market_associations_changed = 1;

    // Step 2: priceListCreate
    const plResp = await createPriceList(catalog.id);
    const plErrors = plResp?.data?.priceListCreate?.userErrors ?? [];
    const priceList = plResp?.data?.priceListCreate?.priceList ?? null;
    if (plErrors.length > 0 || !priceList?.id) {
      // Roll back catalog
      const del = await tryDeleteCatalog(catalog.id).catch((e) => ({ error: String(e) }));
      return new Response(
        JSON.stringify({
          verdict: "PRICE_LIST_CREATION_FAILED_ROLLED_BACK",
          stage: "priceListCreate",
          userErrors: plErrors,
          raw: plResp,
          rollback: { catalogDelete: del },
          phase1,
          mutations: { ...mutations, catalogs_created: 0, market_associations_changed: 0 },
        }),
        { status: 200, headers: jsonHeaders },
      );
    }
    mutations.price_lists_created = 1;

    // Step 3: priceListFixedPricesAdd
    const priceResp = await addFixedPrice(priceList.id);
    const priceErrors = priceResp?.data?.priceListFixedPricesAdd?.userErrors ?? [];
    const priceRows = priceResp?.data?.priceListFixedPricesAdd?.prices ?? [];
    if (priceErrors.length > 0 || priceRows.length !== 1) {
      const delPl = await tryDeletePriceList(priceList.id).catch((e) => ({ error: String(e) }));
      const delCat = await tryDeleteCatalog(catalog.id).catch((e) => ({ error: String(e) }));
      return new Response(
        JSON.stringify({
          verdict: "PRICE_LIST_CREATION_FAILED_ROLLED_BACK",
          stage: "priceListFixedPricesAdd",
          userErrors: priceErrors,
          raw: priceResp,
          rollback: { priceListDelete: delPl, catalogDelete: delCat },
          phase1,
          mutations: zeroMutations(),
        }),
        { status: 200, headers: jsonHeaders },
      );
    }
    mutations.price_rows_created = 1;

    // --- PHASE 3: READBACK ---
    const rb = await readback(priceList.id, catalog.id);
    const rbPriceList = rb?.data?.priceList;
    const rbCatalog = rb?.data?.catalog;
    const rbMarket = rb?.data?.market;
    const rbProduct = rb?.data?.product;
    const rbVariant = rb?.data?.productVariant;

    const priceNodes = rbPriceList?.prices?.nodes ?? [];
    const usdFixed = priceNodes.find(
      (p: any) => p?.variant?.id === SHOPIFY_VARIANT_GID,
    );
    const fixedCount = rbPriceList?.pricesCount?.nodes?.length ?? priceNodes.length;

    // Mapping row untouched
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(supaUrl, supaKey);
    const { data: mapping, error: mapErr } = await supa
      .from("catalog_recovery_mappings")
      .select("*")
      .eq("id", MAPPING_ROW_ID)
      .maybeSingle();

    const catalogMarkets = (rbCatalog as any)?.markets?.nodes ?? [];
    const catalogMarketIds = catalogMarkets.map((m: any) => m.id);

    const readbackReport = {
      usMarketId: rbMarket?.id,
      catalogId: rbCatalog?.id,
      catalogTitle: rbCatalog?.title,
      catalogStatus: rbCatalog?.status,
      catalogAttachedMarkets: catalogMarketIds,
      catalogAttachedOnlyToUs:
        catalogMarketIds.length === 1 && catalogMarketIds[0] === US_MARKET_GID,
      catalogPublication: (rbCatalog as any)?.publication ?? null,
      priceListId: rbPriceList?.id,
      priceListCurrency: rbPriceList?.currency,
      priceListParentAdjustment: rbPriceList?.parent?.adjustment,
      variantId: usdFixed?.variant?.id,
      variantSku: usdFixed?.variant?.sku,
      usFixedPrice: usdFixed?.price,
      usCompareAtPrice: usdFixed?.compareAtPrice ?? null,
      usCompareAtIsNull: !usdFixed?.compareAtPrice,
      fixedPriceRowsInPriceList: fixedCount,
      onlyOnePriceRow: fixedCount === 1,
      product: rbProduct,
      productStatusStillDraft: rbProduct?.status === "DRAFT",
      publicationsStillZero:
        (rbProduct?.resourcePublicationsCount?.count ?? -1) === 0,
      mediaCountUnchanged:
        (rbProduct?.mediaCount?.count ?? -1) === EXPECTED_MEDIA_COUNT,
      variant: rbVariant,
      baseVariantPriceUnchanged: rbVariant?.price === EXPECTED_BASE_PRICE_EUR,
      baseCompareAtUnchanged:
        rbVariant?.compareAtPrice === EXPECTED_BASE_COMPARE_EUR,
      inventoryQuantityStillZero: rbVariant?.inventoryQuantity === 0,
      inventoryPolicyStillDeny: rbVariant?.inventoryPolicy === "DENY",
      shopifyProductIdUnchanged: rbProduct?.id === SHOPIFY_PRODUCT_GID,
      shopifyVariantIdUnchanged: rbVariant?.id === SHOPIFY_VARIANT_GID,
      mappingRow: mapping,
      mappingRowUnchanged: !!mapping && mapErr === null,
    };

    // --- PHASE 4: PRESENTMENT RESOLUTION (no publish) ---
    const usPriceOk =
      usdFixed?.price?.currencyCode === "USD" &&
      String(usdFixed?.price?.amount) === TARGET_PRICE_USD;
    const usIsolationOk =
      readbackReport.catalogAttachedOnlyToUs && readbackReport.onlyOnePriceRow;
    const presentment = {
      usContextResolvesTo99: usPriceOk && usIsolationOk,
      eurBaseFallbackPreservedOutsideUs:
        readbackReport.baseVariantPriceUnchanged &&
        readbackReport.baseCompareAtUnchanged,
      usPriceIsFixedNotFxConverted: !!usdFixed && !usdFixed?.originType?.toString().includes("RELATIVE"),
      catalogMarketAssociationComplete: readbackReport.catalogAttachedOnlyToUs,
    };

    const allVerified =
      usPriceOk &&
      readbackReport.usCompareAtIsNull &&
      readbackReport.onlyOnePriceRow &&
      readbackReport.catalogAttachedOnlyToUs &&
      readbackReport.productStatusStillDraft &&
      readbackReport.publicationsStillZero &&
      readbackReport.baseVariantPriceUnchanged &&
      readbackReport.baseCompareAtUnchanged &&
      readbackReport.inventoryQuantityStillZero &&
      readbackReport.inventoryPolicyStillDeny &&
      readbackReport.mediaCountUnchanged &&
      readbackReport.shopifyProductIdUnchanged &&
      readbackReport.shopifyVariantIdUnchanged &&
      readbackReport.mappingRowUnchanged;

    return new Response(
      JSON.stringify({
        verdict: allVerified
          ? "US_PRICE_LIST_CREATED_AND_VERIFIED"
          : "PRICE_LIST_CREATION_FAILED_ROLLED_BACK",
        rollback_note: allVerified
          ? undefined
          : "Post-mutation verification failed one or more checks. Catalog/price list left in place for forensic inspection — DO NOT auto-delete without approval.",
        phase1,
        phase2: {
          catalogCreate: catResp,
          priceListCreate: plResp,
          priceListFixedPricesAdd: priceResp,
        },
        phase3: readbackReport,
        phase4: presentment,
        mutations,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        verdict: "PRICE_LIST_CREATION_FAILED_ROLLED_BACK",
        error: String((e as any)?.message ?? e),
        mutations,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }
});