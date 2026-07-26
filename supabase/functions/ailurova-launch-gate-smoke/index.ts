// Ailurova launch-gate smoke test — strictly read-only.
// Phase 1: Admin + storefront verification.
// Phase 2: Storefront cart probe via /cart/add.js + /cart.js.
// Phase 3: Checkout reachability via cart permalink + follow to checkout host.
// Phase 4: Payment configuration classification via Admin paymentsAccount + storefront checkout HTML.
// No mutations. No test order placed by this function (Phase 5 requires an
// admin-approved test-mode gateway; we surface classification only).

import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_ID = "gid://shopify/Product/15889810194764";
const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const EXPECTED_SKU = "CJFT268927601AZ";
const EXPECTED_PRICE = "99.00";
const EXPECTED_COMPARE = "119.00";
const PUBLIC_HOST = "ailurova.com";

const Q_PRODUCT = `
query($id: ID!) {
  product(id: $id) {
    id handle status onlineStoreUrl tracksInventory totalInventory
    variants(first: 10) {
      nodes {
        id sku price compareAtPrice
        inventoryPolicy availableForSale
        inventoryItem { tracked }
        inventoryQuantity
      }
    }
  }
}`;

const Q_PUBLISHED = `
query {
  products(first: 5, query: "published_status:online_store_channel:published") {
    edges { node { id handle } }
  }
}`;

const Q_MARKETS = `
query {
  markets(first: 50) {
    nodes {
      id name enabled primary
      regions(first: 50) { nodes { ... on MarketRegionCountry { code } } }
      currencySettings { baseCurrency { currencyCode } }
    }
  }
}`;

const Q_THEMES = `query { themes(first: 20, roles: [MAIN]) { nodes { id name role } } }`;

const Q_PRICELIST = `
query {
  priceLists(first: 25) {
    nodes {
      id name currency
      catalog { ... on MarketCatalog { markets(first: 5) { nodes { id name } } } }
      prices(first: 50, query: "sku:${EXPECTED_SKU}") {
        nodes {
          variant { id sku }
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          originType
        }
      }
    }
  }
}`;

const Q_SHOP = `
query {
  shop {
    name primaryDomain { host url }
    paymentSettings { enabledPresentmentCurrencies acceptedCardBrands supportedDigitalWallets }
  }
}`;

async function safeFetch(url: string, init: RequestInit = {}): Promise<{ status: number; body: string; url: string; headers: Record<string,string> }> {
  try {
    const r = await fetch(url, {
      redirect: "manual",
      ...init,
      headers: {
        "User-Agent": "Mozilla/5.0 AilurovaLaunchGate/1.0",
        "Accept-Language": "en-US,en;q=0.9",
        ...(init.headers || {}),
      },
    });
    const body = await r.text().catch(() => "");
    const h: Record<string,string> = {};
    r.headers.forEach((v,k) => { h[k] = v; });
    return { status: r.status, body: body.slice(0, 200_000), url, headers: h };
  } catch (e) {
    return { status: 0, body: `fetch_error: ${(e as Error).message}`, url, headers: {} };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ledger: string[] = [];
  const blockers: string[] = [];
  const manualSteps: string[] = [];
  const cfg = getShopifyConfig();

  // ================= PHASE 1 — Admin =================
  const [prodR, pubR, mktR, themeR, plR, shopR] = await Promise.all([
    shopifyAdminFetch<any>(Q_PRODUCT, { id: PRODUCT_ID }),
    shopifyAdminFetch<any>(Q_PUBLISHED),
    shopifyAdminFetch<any>(Q_MARKETS),
    shopifyAdminFetch<any>(Q_THEMES),
    shopifyAdminFetch<any>(Q_PRICELIST),
    shopifyAdminFetch<any>(Q_SHOP),
  ]);

  const product = prodR.data?.product;
  const variants = product?.variants?.nodes ?? [];
  const targetVariant = variants.find((v: any) => v?.sku === EXPECTED_SKU) ?? variants[0];
  const publishedIds = (pubR.data?.products?.edges ?? []).map((e: any) => e.node.id);
  const publishedCount = publishedIds.length;
  const soloPublished = publishedCount === 1 && publishedIds[0] === PRODUCT_ID;

  const markets = mktR.data?.markets?.nodes ?? [];
  const usMarket = markets.find((m: any) => (m.regions?.nodes ?? []).some((r: any) => r?.code === "US"));
  const primaryMarket = markets.find((m: any) => m.primary);

  const mainTheme = themeR.data?.themes?.nodes?.[0];
  const themeOk = mainTheme?.name === "Ailurova — Lovable Final Draft";

  const usdPriceLists = (plR.data?.priceLists?.nodes ?? []).filter((p: any) => p.currency === "USD");
  let usPriceRow: any = null;
  let usPriceListName: string | null = null;
  for (const pl of usdPriceLists) {
    const row = (pl.prices?.nodes ?? []).find((n: any) => n.variant?.sku === EXPECTED_SKU);
    if (row) { usPriceRow = row; usPriceListName = pl.name; break; }
  }

  const invPolicyDeny = targetVariant?.inventoryPolicy === "DENY";
  const invTracked = targetVariant?.inventoryItem?.tracked === true;
  const invQty = Number(targetVariant?.inventoryQuantity ?? 0);
  const availableForSale = targetVariant?.availableForSale === true;

  if (!themeOk) blockers.push(`MAIN theme is "${mainTheme?.name}" (expected "Ailurova — Lovable Final Draft")`);
  if (product?.status !== "ACTIVE") blockers.push(`Product status is ${product?.status}`);
  if (!product?.onlineStoreUrl) blockers.push("Product has no onlineStoreUrl");
  if (!soloPublished) blockers.push(`${publishedCount} products published to Online Store (expected 1)`);
  if (!targetVariant) blockers.push(`Variant SKU ${EXPECTED_SKU} not found`);
  if (!availableForSale) blockers.push("Variant not availableForSale");
  if (!invTracked) blockers.push("Inventory not tracked");
  if (invQty <= 0) blockers.push(`Inventory quantity is ${invQty}`);
  if (!invPolicyDeny) blockers.push(`Inventory policy is ${targetVariant?.inventoryPolicy} (expected DENY)`);
  if (!usMarket?.enabled) blockers.push("US market not enabled");
  const usdBase = usMarket?.currencySettings?.baseCurrency?.currencyCode;
  if (usdBase !== "USD") blockers.push(`US market base currency is ${usdBase} (expected USD)`);
  if (!usPriceRow) blockers.push(`No USD fixed price row found for SKU ${EXPECTED_SKU}`);
  else {
    if (usPriceRow.price?.amount !== EXPECTED_PRICE) blockers.push(`US price is ${usPriceRow.price?.amount} (expected ${EXPECTED_PRICE})`);
    if (usPriceRow.compareAtPrice?.amount !== EXPECTED_COMPARE) blockers.push(`US compare-at is ${usPriceRow.compareAtPrice?.amount} (expected ${EXPECTED_COMPARE})`);
  }
  if (!primaryMarket?.regions?.nodes?.some((r: any) => r.code === "US")) {
    manualSteps.push("Set United States as the Primary market in Shopify Admin → Settings → Markets.");
  }

  // ================= Storefront reachability =================
  const homeR = await safeFetch(`https://${PUBLIC_HOST}/`);
  const pdpR  = await safeFetch(`https://${PUBLIC_HOST}/products/${HANDLE}`);

  const domainOk = homeR.status >= 200 && homeR.status < 400;
  if (!domainOk) blockers.push(`ailurova.com HTTPS status ${homeR.status}`);
  const passwordPage = /shopify.*password|Enter store using password/i.test(homeR.body + pdpR.body);
  if (passwordPage) blockers.push("Storefront password page is active");

  const pdpHas99 = /\$?99(\.00)?/.test(pdpR.body);
  const pdpHas119 = /\$?119(\.00)?/.test(pdpR.body);
  const pdpHasATC = /add.to.cart|AddToCart|name=("|')add("|')/i.test(pdpR.body);
  const pdpInStock = /in.?stock|available/i.test(pdpR.body);
  if (!pdpHas99) blockers.push("PDP HTML does not contain $99");
  if (!pdpHas119) blockers.push("PDP HTML does not contain $119 (compare-at not rendered)");
  if (!pdpHasATC) blockers.push("PDP HTML has no Add to cart form/button");

  const policyPaths = ["contact", "policies/shipping-policy", "policies/refund-policy", "policies/privacy-policy", "policies/terms-of-service"];
  const policyResults: Record<string, number> = {};
  await Promise.all(policyPaths.map(async (p) => {
    const r = await safeFetch(`https://${PUBLIC_HOST}/${p}`);
    policyResults[p] = r.status;
    if (r.status >= 400) blockers.push(`Policy page /${p} → HTTP ${r.status}`);
  }));

  // ================= PHASE 2 — Cart probe =================
  // Use Ajax cart with a fresh cookie jar (manual header capture) — /cart/add.js.
  const variantNumericId = targetVariant?.id?.split("/").pop();
  const cartAdd = await safeFetch(`https://${PUBLIC_HOST}/cart/add.js`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ id: variantNumericId, quantity: 1 }),
  });
  // Capture cart cookie
  const setCookie = cartAdd.headers["set-cookie"] || "";
  const cartCookie = setCookie.split(",").map(s => s.trim().split(";")[0]).filter(c => /^cart=|^_shopify_/i.test(c)).join("; ");

  const cartR = await safeFetch(`https://${PUBLIC_HOST}/cart.js`, {
    headers: { "Accept": "application/json", "Cookie": cartCookie },
  });
  let cartJson: any = null;
  try { cartJson = JSON.parse(cartR.body); } catch { /* */ }
  const cartItemCount = cartJson?.item_count ?? null;
  const cartSubtotal = cartJson?.items_subtotal_price ?? null; // cents
  const cartCurrency = cartJson?.currency ?? null;
  const cartLine = cartJson?.items?.[0] ?? null;

  const cartHas99 = cartLine?.final_price === 9900 || cartLine?.price === 9900;
  const cartUsd = cartCurrency === "USD";
  const cartOk = cartItemCount === 1 && !!cartHas99 && !!cartUsd && cartLine?.sku === EXPECTED_SKU;
  if (!cartOk) {
    blockers.push(`Cart probe failed (items=${cartItemCount}, price=${cartLine?.final_price}, currency=${cartCurrency}, sku=${cartLine?.sku})`);
  }

  // ================= PHASE 3 — Checkout reachability =================
  // Use cart permalink so no session cookies are required.
  const permalink = variantNumericId
    ? `https://${PUBLIC_HOST}/cart/${variantNumericId}:1?country=US&currency=USD`
    : null;
  let checkoutHost: string | null = null;
  let checkoutStatus: number | null = null;
  let checkoutFinalUrl: string | null = null;
  if (permalink) {
    // Follow up to 5 redirects manually.
    let url = permalink;
    let cookieJar = "";
    for (let i = 0; i < 6; i++) {
      const r = await safeFetch(url, { headers: { "Cookie": cookieJar } });
      checkoutStatus = r.status;
      checkoutFinalUrl = r.url;
      const sc = r.headers["set-cookie"];
      if (sc) {
        cookieJar = sc.split(",").map(s => s.trim().split(";")[0]).join("; ");
      }
      const loc = r.headers["location"];
      if (loc && r.status >= 300 && r.status < 400) {
        url = loc.startsWith("http") ? loc : new URL(loc, url).toString();
        continue;
      }
      break;
    }
    try { checkoutHost = new URL(checkoutFinalUrl || "").host; } catch { /* */ }
  }
  const checkoutIsShopify = !!checkoutHost && /(shopify\.com|ailurova\.com|checkout\.shopify\.com)$/.test(checkoutHost);
  if (!checkoutIsShopify) blockers.push(`Checkout host not recognised as Shopify: ${checkoutHost}`);

  // ================= PHASE 4 — Payment classification =================
  // We cannot introspect payment gateways via public Admin API without extra scopes.
  // Heuristic: if checkout page HTML mentions a live provider (Shop Pay / credit-card form) → LIVE_PAYMENT_READY probable.
  // Otherwise MANUAL_TEST_MODE_REQUIRED.
  let paymentClassification: "LIVE_PAYMENT_READY" | "TEST_MODE_READY" | "PAYMENT_CONFIGURATION_BLOCKED" | "MANUAL_TEST_MODE_REQUIRED" = "MANUAL_TEST_MODE_REQUIRED";
  const checkoutBody = checkoutFinalUrl ? (await safeFetch(checkoutFinalUrl)).body : "";
  const paymentSignals = {
    creditCardForm: /credit.card|card.number|payment.method/i.test(checkoutBody),
    shopPay: /shop.pay|shopify.pay/i.test(checkoutBody),
    bogus: /bogus.gateway|test.mode/i.test(checkoutBody),
    disabled: /checkout.disabled|no.payment.methods/i.test(checkoutBody),
  };
  if (!checkoutIsShopify || checkoutStatus === null || checkoutStatus >= 400) {
    paymentClassification = "PAYMENT_CONFIGURATION_BLOCKED";
  } else if (paymentSignals.bogus) {
    paymentClassification = "TEST_MODE_READY";
  } else if (paymentSignals.disabled) {
    paymentClassification = "PAYMENT_CONFIGURATION_BLOCKED";
  } else if (paymentSignals.creditCardForm || paymentSignals.shopPay) {
    paymentClassification = "LIVE_PAYMENT_READY";
  } else {
    paymentClassification = "MANUAL_TEST_MODE_REQUIRED";
    manualSteps.push("Manually verify Shopify Admin → Settings → Payments: at least one live provider active (or enable Bogus Gateway for a simulated test).");
  }

  // ================= Overall verdict =================
  let verdict: "READY_FOR_LIVE_SALES" | "READY_EXCEPT_MANUAL_PAYMENT_TEST" | "NOT_READY_FOR_LIVE_SALES" =
    "NOT_READY_FOR_LIVE_SALES";

  const coreOk =
    domainOk && themeOk && soloPublished &&
    product?.status === "ACTIVE" && availableForSale && invPolicyDeny && invTracked && invQty > 0 &&
    usMarket?.enabled && usdBase === "USD" &&
    usPriceRow?.price?.amount === EXPECTED_PRICE &&
    usPriceRow?.compareAtPrice?.amount === EXPECTED_COMPARE &&
    cartOk && checkoutIsShopify && (checkoutStatus ?? 0) < 400;

  if (coreOk && paymentClassification === "LIVE_PAYMENT_READY") verdict = "READY_FOR_LIVE_SALES";
  else if (coreOk && paymentClassification === "MANUAL_TEST_MODE_REQUIRED") verdict = "READY_EXCEPT_MANUAL_PAYMENT_TEST";
  else verdict = "NOT_READY_FOR_LIVE_SALES";

  const report = {
    ok: verdict !== "NOT_READY_FOR_LIVE_SALES",
    verdict,
    phase1_admin: {
      domain_host: PUBLIC_HOST,
      domain_status: homeR.status,
      active_main_theme: mainTheme?.name ?? null,
      product: {
        id: product?.id, handle: product?.handle, status: product?.status,
        onlineStoreUrl: product?.onlineStoreUrl ?? null,
      },
      variant: targetVariant ? {
        id: targetVariant.id, sku: targetVariant.sku,
        price: targetVariant.price, compareAtPrice: targetVariant.compareAtPrice,
        inventoryPolicy: targetVariant.inventoryPolicy,
        inventoryQuantity: targetVariant.inventoryQuantity,
        inventoryTracked: targetVariant.inventoryItem?.tracked,
        availableForSale: targetVariant.availableForSale,
      } : null,
      us_market: usMarket ? {
        enabled: usMarket.enabled, primary: !!usMarket.primary,
        base_currency: usdBase,
      } : null,
      primary_market_name: primaryMarket?.name ?? null,
      us_price_list: usPriceListName,
      us_price: usPriceRow?.price?.amount ?? null,
      us_compare_at: usPriceRow?.compareAtPrice?.amount ?? null,
      publication_solo: soloPublished,
      published_count: publishedCount,
      policy_pages: policyResults,
      password_page_active: passwordPage,
      pdp_render: { has_99: pdpHas99, has_119_crossed: pdpHas119, has_add_to_cart: pdpHasATC, has_in_stock: pdpInStock },
      shop: shopR.data?.shop ?? null,
    },
    phase2_cart: {
      add_status: cartAdd.status,
      cart_status: cartR.status,
      item_count: cartItemCount,
      currency: cartCurrency,
      subtotal_cents: cartSubtotal,
      line: cartLine ? {
        sku: cartLine.sku, variant_id: cartLine.variant_id,
        quantity: cartLine.quantity, price_cents: cartLine.price,
        final_price_cents: cartLine.final_price, title: cartLine.title,
      } : null,
      ok: cartOk,
    },
    phase3_checkout: {
      permalink,
      final_url: checkoutFinalUrl,
      final_host: checkoutHost,
      final_status: checkoutStatus,
      is_shopify_host: checkoutIsShopify,
      signals: paymentSignals,
    },
    phase4_payment: {
      classification: paymentClassification,
      notes: "Payment gateway list not queryable via granted Admin scopes; classification derived from checkout HTML signals.",
    },
    phase5_test_order: null, // not attempted — requires admin-enabled test mode
    blockers,
    manual_steps_required: manualSteps,
    mutations_performed: [],
    ledger,
  };

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});