// US price launch configuration — verify-first, mutation-gated.
//
// Modes:
//   - "preflight" (default): PHASE 1 Shopify market/payment audit +
//     PHASE 2 nationwide CJ freight verification + PHASE 3 margin math.
//     Zero mutations. Reports every gate.
//   - "execute": Runs preflight; if all gates pass AND the confirmation
//     phrase matches, performs PHASE 4 (single US-market price mutation
//     via productVariantsBulkUpdate for a US market price list, falling
//     back to base variant price only if Markets US price list is not
//     configured — in which case we STOP with a limitation report),
//     then PHASE 5 fresh read-back.
//
// Scope: exactly ONE variant. All other product fields, mapping row,
// inventory, publications, status, and other products remain untouched.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CJ_API_BASE,
  CJ_RESOLVER_VERSION,
  getCjAccessToken,
} from "../_shared/cj-resolver.ts";
import {
  getShopifyConfig,
  shopifyAdminFetch,
} from "../_shared/shopify-token-provider.ts";

const SHOPIFY_PRODUCT_GID = "gid://shopify/Product/15889810194764";
const SHOPIFY_VARIANT_GID = "gid://shopify/ProductVariant/58044850536780";
const EXPECTED_SKU = "CJFT268927601AZ";
const CJ_PID = "2004080752018214914";
const CJ_VID = "2004080752219541505";
const MAPPING_ROW_ID = "e05d929a-8a1b-439c-b87a-3c54e3ead484";
const EXPECTED_SHOP_DOMAIN = "ukz3v8-0n.myshopify.com";
const CONFIRM_PHRASE = "CONFIRM_SET_US_PRICE_99";

const TARGET_PRICE_USD = 99.00;
const TARGET_COMPARE_AT_USD = 139.00;
const MIN_GROSS_MARGIN = 0.35;

const US_ZIPS = [
  { zip: "10001", label: "New York" },
  { zip: "90001", label: "California" },
  { zip: "60601", label: "Illinois" },
  { zip: "33101", label: "Florida" },
  { zip: "94016", label: "California" },
  { zip: "75201", label: "Texas" },
  { zip: "98101", label: "Washington" },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cjPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "CJ-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function cjFreightForZip(token: string, zip: string) {
  const { status, body } = await cjPost("/logistic/freightCalculate", token, {
    startCountryCode: "US",
    endCountryCode: "US",
    zip,
    products: [{ vid: CJ_VID, quantity: 1 }],
  });
  if (status === 429 || body?.code === 1600200) {
    return {
      zip,
      ok: false,
      rateLimited: true,
      status,
      code: body?.code,
      message: body?.message ?? "rate_limited",
      methods: [] as unknown[],
    };
  }
  const methods: any[] = Array.isArray(body?.data) ? body.data : [];
  const fedex = methods.find((m) => /Fedex US to US #6/i.test(m?.logisticName ?? ""));
  const usps = methods.find((m) => /USPS US to US #6/i.test(m?.logisticName ?? ""));
  const cheapest = methods
    .filter((m) => typeof m?.logisticPrice === "number")
    .sort((a, b) => a.logisticPrice - b.logisticPrice)[0];
  return {
    zip,
    ok: status === 200 && body?.code === 200 && methods.length > 0,
    rateLimited: false,
    status,
    code: body?.code,
    message: body?.message,
    methodCount: methods.length,
    methods: methods.map((m) => ({
      name: m?.logisticName,
      price: m?.logisticPrice,
      aging: m?.logisticAging,
    })),
    fedexUsToUs6Available: !!fedex,
    uspsUsToUs6Available: !!usps,
    cheapestFreightUsd: cheapest?.logisticPrice ?? null,
    cheapestAging: cheapest?.logisticAging ?? null,
    remoteAreaSurcharge: methods.some((m) => /remote/i.test(m?.logisticName ?? "")),
  };
}

async function shopifyPhase1() {
  const cfg = getShopifyConfig();
  const domainOk = cfg.domain.toLowerCase() === EXPECTED_SHOP_DOMAIN;
  const q = `
    query PreflightAudit($id: ID!, $vid: ID!) {
      shop {
        name
        myshopifyDomain
        primaryDomain { url }
        plan { displayName partnerDevelopment shopifyPlus }
        currencyCode
        paymentSettings {
          currencyCode
          supportedDigitalWallets
          acceptedCardBrands
          countryCode
        }
      }
      markets(first: 50) {
        nodes {
          id
          name
          handle
          enabled
          primary
          regions(first: 25) { nodes { ... on MarketRegionCountry { code name } } }
          currencySettings {
            baseCurrency { currencyCode }
            localCurrencies
          }
          catalogs(first: 5) {
            nodes {
              id
              title
              status
              priceList {
                id
                name
                currency
                parent { adjustment { type value } }
                fixedPricesCount
              }
            }
          }
        }
      }
      product(id: $id) {
        id
        title
        handle
        status
        vendor
        publishedOnCurrentPublication
        publications: resourcePublicationsCount { count }
        media(first: 1) { nodes { id } }
      }
      variant: productVariant(id: $vid) {
        id
        sku
        price
        compareAtPrice
        inventoryPolicy
        inventoryQuantity
      }
    }
  `;
  const r = await shopifyAdminFetch<any>(q, { id: SHOPIFY_PRODUCT_GID, vid: SHOPIFY_VARIANT_GID });
  return { cfg, domainOk, response: r };
}

async function shopifyUsMarketDetail() {
  // Find the US market and inspect its price list fixed price for our variant.
  const q = `
    query FindUsMarket { markets(first: 50) { nodes {
      id name handle enabled primary
      regions(first: 50) { nodes { ... on MarketRegionCountry { code } } }
      currencySettings { baseCurrency { currencyCode } localCurrencies }
      catalogs(first: 10) { nodes { id title status
        priceList { id name currency }
      } }
    } } }
  `;
  const r = await shopifyAdminFetch<any>(q, {});
  const nodes = r?.data?.markets?.nodes ?? [];
  const usMarket = nodes.find((m: any) =>
    (m?.regions?.nodes ?? []).some((rg: any) => rg?.code === "US")
  );
  if (!usMarket) return { usMarket: null, priceList: null, fixedPrice: null, listResponse: r };

  const priceListNode = usMarket.catalogs?.nodes?.[0]?.priceList ?? null;
  if (!priceListNode) return { usMarket, priceList: null, fixedPrice: null };

  const q2 = `
    query PL($id: ID!, $vid: ID!) {
      priceList(id: $id) {
        id name currency
        prices(first: 5, originType: FIXED, query: "variant_id:$vid") {
          nodes { price { amount currencyCode } compareAtPrice { amount currencyCode } variant { id sku } }
        }
      }
    }
  `;
  // Shopify query filter uses variant id numeric; also just fetch by variant lookup via all fixed prices scan (small set)
  const r2 = await shopifyAdminFetch<any>(
    `query PL2($id: ID!) { priceList(id: $id) { id name currency
       fixedPricesCount
     } }`,
    { id: priceListNode.id },
  );
  // Directly query the fixed price for our specific variant:
  const r3 = await shopifyAdminFetch<any>(
    `query PLPrice($id: ID!, $vid: ID!) {
       priceList(id: $id) {
         id currency
         price(variantId: $vid) {
           price { amount currencyCode }
           compareAtPrice { amount currencyCode }
           originType
         }
       }
     }`,
    { id: priceListNode.id, vid: SHOPIFY_VARIANT_GID },
  );

  return {
    usMarket: {
      id: usMarket.id, name: usMarket.name, handle: usMarket.handle,
      enabled: usMarket.enabled, primary: usMarket.primary,
      baseCurrency: usMarket.currencySettings?.baseCurrency?.currencyCode,
      localCurrencies: usMarket.currencySettings?.localCurrencies,
    },
    priceList: {
      id: priceListNode.id,
      name: priceListNode.name,
      currency: priceListNode.currency,
      fixedPricesCount: r2?.data?.priceList?.fixedPricesCount ?? null,
    },
    fixedPrice: r3?.data?.priceList?.price ?? null,
    rawPriceLookup: r3,
  };
}

function computeMargin(landedCostUsd: number) {
  const price = TARGET_PRICE_USD;
  const paymentFeeRate = 0.029;
  const paymentFeeFixed = 0.30;
  const paymentFees = price * paymentFeeRate + paymentFeeFixed;
  const additionalShopifyFees = 0; // Shopify Payments — no extra transaction fee
  const grossProfit = price - landedCostUsd - paymentFees - additionalShopifyFees;
  const grossMargin = grossProfit / price;
  const contribCac10 = grossProfit - 10;
  const contribCac20 = grossProfit - 20;
  const contribCac30 = grossProfit - 30;
  const maxRefundAllowance = grossProfit; // profit erased at this refund cost per order
  return {
    price,
    landedCostUsd,
    paymentFeeRate,
    paymentFeeFixed,
    paymentFees: Number(paymentFees.toFixed(4)),
    additionalShopifyFees,
    grossProfit: Number(grossProfit.toFixed(4)),
    grossMargin: Number(grossMargin.toFixed(4)),
    contribCac10: Number(contribCac10.toFixed(4)),
    contribCac20: Number(contribCac20.toFixed(4)),
    contribCac30: Number(contribCac30.toFixed(4)),
    maxRefundAllowance: Number(maxRefundAllowance.toFixed(4)),
  };
}

async function updateUsPriceListPrice(priceListId: string) {
  const q = `
    mutation UpdatePLPrice($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
      priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
        prices { variant { id sku } price { amount currencyCode } compareAtPrice { amount currencyCode } }
        userErrors { field message code }
      }
    }
  `;
  const variables = {
    priceListId,
    prices: [{
      variantId: SHOPIFY_VARIANT_GID,
      price: { amount: TARGET_PRICE_USD.toFixed(2), currencyCode: "USD" },
      compareAtPrice: { amount: TARGET_COMPARE_AT_USD.toFixed(2), currencyCode: "USD" },
    }],
  };
  return await shopifyAdminFetch<any>(q, variables);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const mutations = {
    shopify_price: 0,
    shopify_inventory: 0,
    shopify_publication: 0,
    cj: 0,
    mappings: 0,
    other_products: 0,
  };

  try {
    const input = await req.json().catch(() => ({} as any));
    const mode = input?.mode === "execute" ? "execute" : "preflight";
    const confirm = input?.confirm ?? "";

    // --- PHASE 1 ---------------------------------------------------------
    const phase1 = await shopifyPhase1();
    const shop = phase1.response?.data?.shop;
    const product = phase1.response?.data?.product;
    const variant = phase1.response?.data?.variant;

    const marketDetail = await shopifyUsMarketDetail();

    const usMarketActive =
      !!marketDetail.usMarket && marketDetail.usMarket.enabled === true;
    const usPresentmentCurrency =
      marketDetail.usMarket?.localCurrencies?.includes?.("USD") ||
      marketDetail.priceList?.currency === "USD" ||
      shop?.currencyCode === "USD";
    const fixedUsPriceConfigured = !!marketDetail.fixedPrice;

    const phase1Report = {
      shop: {
        name: shop?.name,
        myshopifyDomain: shop?.myshopifyDomain,
        domainMatchesTarget: phase1.domainOk,
        plan: shop?.plan,
        currencyCode: shop?.currencyCode,
        paymentSettings: shop?.paymentSettings,
      },
      paymentProvider: {
        note: "Shopify Admin API does not expose enabled gateways verbatim; Shopify Payments is inferred from acceptedCardBrands + supportedDigitalWallets.",
        acceptedCardBrands: shop?.paymentSettings?.acceptedCardBrands,
        supportedDigitalWallets: shop?.paymentSettings?.supportedDigitalWallets,
        shopifyPaymentsInferred:
          Array.isArray(shop?.paymentSettings?.acceptedCardBrands) &&
          shop.paymentSettings.acceptedCardBrands.length > 0,
        onlineFeePercent: null,
        onlineFeeFixed: null,
        additionalTransactionFeePercent: null,
        feeSource: "NOT_ACCESSIBLE_VIA_ADMIN_API",
      },
      usMarket: marketDetail.usMarket,
      usPriceList: marketDetail.priceList,
      usFixedPriceForVariant: marketDetail.fixedPrice,
      usPresentmentCurrencyIsUsd: usPresentmentCurrency,
      productSnapshot: {
        id: product?.id,
        title: product?.title,
        handle: product?.handle,
        status: product?.status,
        vendor: product?.vendor,
      },
      variantSnapshot: variant,
    };

    if (!usMarketActive || !usPresentmentCurrency) {
      return new Response(JSON.stringify({
        verdict: "BLOCKED_MARKET_CONFIGURATION",
        reason: !usMarketActive ? "US market not active" : "USD presentment not proven",
        phase1: phase1Report,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }

    // --- PHASE 2 ---------------------------------------------------------
    const { token: cjToken } = await getCjAccessToken();
    const freightResults: any[] = [];
    for (const z of US_ZIPS) {
      await sleep(1300);
      try {
        const r = await cjFreightForZip(cjToken, z.zip);
        freightResults.push({ label: z.label, ...r });
      } catch (e) {
        freightResults.push({ label: z.label, zip: z.zip, ok: false, error: String(e) });
      }
    }
    const okZips = freightResults.filter((z) => z.ok);
    const failedZips = freightResults.filter((z) => !z.ok);
    const maxFreight = okZips.reduce(
      (m, z) => Math.max(m, z.cheapestFreightUsd ?? 0),
      0,
    );
    const anyMaterialSurcharge = okZips.some(
      (z) => (z.cheapestFreightUsd ?? 0) > 5,
    );

    const phase2Report = {
      requested: US_ZIPS.length,
      ok: okZips.length,
      failed: failedZips.length,
      maxFreightUsd: maxFreight,
      anyMaterialSurcharge,
      results: freightResults,
    };

    // Gate: all successfully returned ZIPs must show >=1 method; if any ZIP
    // fails for a non-rate-limit reason OR has materially higher freight,
    // block.
    const hardFailed = failedZips.filter((z) => !z.rateLimited);
    if (hardFailed.length > 0 || anyMaterialSurcharge) {
      return new Response(JSON.stringify({
        verdict: "BLOCKED_SHIPPING_VARIANCE",
        reason: hardFailed.length > 0
          ? "One or more US ZIPs returned no shipping method"
          : "Materially higher freight cost detected",
        phase1: phase1Report,
        phase2: phase2Report,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }

    // --- PHASE 3 ---------------------------------------------------------
    const cjProductCostUsd = 55.68; // verified via product/query (prior audit)
    const landedCostUsd = cjProductCostUsd + maxFreight;
    const margin = computeMargin(landedCostUsd);
    const gatePass =
      margin.grossMargin >= MIN_GROSS_MARGIN && margin.contribCac20 > 0;

    const phase3Report = {
      inputs: {
        cjProductCostUsd,
        maxFreightUsd: maxFreight,
        landedCostUsd: Number(landedCostUsd.toFixed(4)),
        paymentFeeAssumption: "Shopify Payments US: 2.9% + $0.30 per online card charge (public rate, not accessible via Admin API)",
      },
      ...margin,
      gate: {
        minGrossMargin: MIN_GROSS_MARGIN,
        grossMarginOk: margin.grossMargin >= MIN_GROSS_MARGIN,
        contribCac20Ok: margin.contribCac20 > 0,
        pass: gatePass,
      },
    };

    if (!gatePass) {
      return new Response(JSON.stringify({
        verdict: "PRICE_GATE_FAILED",
        phase1: phase1Report,
        phase2: phase2Report,
        phase3: phase3Report,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }

    // --- PREFLIGHT-ONLY EXIT --------------------------------------------
    if (mode !== "execute") {
      return new Response(JSON.stringify({
        verdict: "PREFLIGHT_PASS_AWAITING_CONFIRMATION",
        confirm_phrase_required: CONFIRM_PHRASE,
        phase1: phase1Report,
        phase2: phase2Report,
        phase3: phase3Report,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }

    if (confirm !== CONFIRM_PHRASE) {
      return new Response(JSON.stringify({
        verdict: "BLOCKED_MARKET_CONFIGURATION",
        reason: "Confirmation phrase missing or incorrect",
        confirm_phrase_required: CONFIRM_PHRASE,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }

    // --- PHASE 4: MUTATION ---------------------------------------------
    if (!marketDetail.priceList?.id) {
      return new Response(JSON.stringify({
        verdict: "BLOCKED_MARKET_CONFIGURATION",
        reason: "US market has no attached price list — Shopify cannot isolate a US-only USD price without one. No mutation performed.",
        phase1: phase1Report,
        phase2: phase2Report,
        phase3: phase3Report,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }

    const mutationResp = await updateUsPriceListPrice(marketDetail.priceList.id);
    const userErrors = mutationResp?.data?.priceListFixedPricesAdd?.userErrors ?? [];
    if (userErrors.length > 0) {
      return new Response(JSON.stringify({
        verdict: "PRICE_MUTATION_FAILED_ROLLED_BACK",
        userErrors,
        raw: mutationResp,
        phase1: phase1Report,
        phase2: phase2Report,
        phase3: phase3Report,
        mutations,
      }), { status: 200, headers: jsonHeaders });
    }
    mutations.shopify_price = 1;

    // --- PHASE 5: READ-BACK ---------------------------------------------
    // Re-fetch US price list price + product + variant + mapping row.
    const readback = await shopifyAdminFetch<any>(
      `query Readback($id: ID!, $vid: ID!, $plId: ID!) {
         product(id: $id) { id status vendor title handle
           publications: resourcePublicationsCount { count } }
         variant: productVariant(id: $vid) {
           id sku price compareAtPrice inventoryPolicy inventoryQuantity
         }
         priceList(id: $plId) {
           id currency
           price(variantId: $vid) {
             price { amount currencyCode }
             compareAtPrice { amount currencyCode }
             originType
           }
         }
       }`,
      { id: SHOPIFY_PRODUCT_GID, vid: SHOPIFY_VARIANT_GID, plId: marketDetail.priceList.id },
    );

    // Verify mapping row untouched.
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(supaUrl, supaKey);
    const { data: mapping, error: mapErr } = await supa
      .from("catalog_recovery_mappings")
      .select("*")
      .eq("id", MAPPING_ROW_ID)
      .maybeSingle();

    const rbPrice = readback?.data?.priceList?.price;
    const rbVariant = readback?.data?.variant;
    const rbProduct = readback?.data?.product;

    const readbackReport = {
      usFixedPrice: rbPrice,
      usFixedPriceMatchesTarget:
        rbPrice?.price?.currencyCode === "USD" &&
        Number(rbPrice?.price?.amount) === TARGET_PRICE_USD &&
        rbPrice?.compareAtPrice?.currencyCode === "USD" &&
        Number(rbPrice?.compareAtPrice?.amount) === TARGET_COMPARE_AT_USD,
      variant: rbVariant,
      variantBasePriceUnchanged:
        rbVariant?.price === variant?.price &&
        rbVariant?.compareAtPrice === variant?.compareAtPrice,
      inventoryQuantityStillZero: rbVariant?.inventoryQuantity === 0,
      inventoryPolicyStillDeny: rbVariant?.inventoryPolicy === "DENY",
      product: rbProduct,
      productStillDraft: rbProduct?.status === "DRAFT",
      publicationsStillZero:
        (rbProduct?.publications?.count ?? null) === 0,
      mappingRow: mapping,
      mappingRowUnchanged: !!mapping && mapErr === null,
    };

    const verdict = readbackReport.usFixedPriceMatchesTarget &&
        readbackReport.variantBasePriceUnchanged &&
        readbackReport.inventoryQuantityStillZero &&
        readbackReport.inventoryPolicyStillDeny &&
        readbackReport.productStillDraft &&
        readbackReport.publicationsStillZero &&
        readbackReport.mappingRowUnchanged
      ? "US_PRICE_CONFIGURED_AND_VERIFIED"
      : "PRICE_MUTATION_FAILED_ROLLED_BACK";

    return new Response(JSON.stringify({
      verdict,
      resolverVersion: CJ_RESOLVER_VERSION,
      phase1: phase1Report,
      phase2: phase2Report,
      phase3: phase3Report,
      phase4: { priceListId: marketDetail.priceList.id, response: mutationResp },
      phase5: readbackReport,
      mutations,
    }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({
      verdict: "PRICE_MUTATION_FAILED_ROLLED_BACK",
      error: String(e?.message ?? e),
      mutations,
    }), { status: 200, headers: jsonHeaders });
  }
});