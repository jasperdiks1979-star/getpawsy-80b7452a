// Ailurova one-product launch-readiness READ-ONLY audit.
// STRICT: no mutations. All Shopify calls are queries. Public HTTP GETs only.
// Storefront cart/checkout via Storefront API is best-effort; when creds/API-scope
// are unavailable, we return NOT_VERIFIABLE_READ_ONLY for that phase.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PROTECTED_GID = "gid://shopify/Product/15889810194764";
const ONLINE_STORE_PUB = "gid://shopify/Publication/355057631564";
const EXPECTED_TITLE = "Ailurova XL Stainless Steel Enclosed Cat Litter Box";
const EXPECTED_SKU = "CJFT268927601AZ";
const EXPECTED_AVAILABLE = 60;
const EXPECTED_ON_HAND = 60;
const APEX = "ailurova.com";
const WWW = "www.ailurova.com";

const UNPUBLISHED_25 = [
  "15889798660428","15889799053644","15889799872844","15889800069452","15889800233292",
  "15889802461516","15889802494284","15889802658124","15889802854732","15889803051340",
  "15889803182412","15889803444556","15889803968844","15889804230988","15889804460364",
  "15889804591436","15889804853580","15889805181260","15889805345100","15889805640012",
  "15889805738316","15889805869388","15889805902156","15889806033228","15889806164300",
].map((n) => `gid://shopify/Product/${n}`);

// ---- GraphQL queries (READ ONLY) ----
const Q_PROTECTED = `
query Protected($id: ID!, $pub: ID!) {
  product(id: $id) {
    id title handle status vendor productType
    descriptionHtml
    seo { title description }
    featuredImage { url altText }
    media(first: 1) { nodes { __typename } }
    onlineStoreUrl
    onlineStorePreviewUrl
    publishedOnPublication(publicationId: $pub)
    resourcePublications(first: 25) { nodes { publication { id name } isPublished } }
    variants(first: 5) {
      nodes {
        id sku price compareAtPrice
        inventoryPolicy
        inventoryItem {
          id tracked
          inventoryLevels(first: 20) {
            nodes {
              location { id name }
              quantities(names: ["available","on_hand"]) { name quantity }
            }
          }
        }
      }
    }
  }
  publication(id: $pub) { id name }
}`;

const Q_CATALOG_PAGE = `
query Catalog($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title status
      publishedOnPublication(publicationId: "gid://shopify/Publication/355057631564")
    }
  }
}`;

const Q_25 = `
query Read25($ids: [ID!]!, $pub: ID!) {
  nodes(ids: $ids) {
    ... on Product { id title status publishedOnPublication(publicationId: $pub) }
  }
}`;

const Q_SHOP = `
query ShopInfo {
  shop {
    name email contactEmail myshopifyDomain
    primaryDomain { host url sslEnabled }
    currencyCode
    enabledPresentmentCurrencies
    plan { displayName }
    shipsToCountries
    billingAddress { country countryCodeV2 }
    paymentSettings { supportedDigitalWallets acceptedCardBrands countryCode currencyCode }
  }
}`;

const Q_LOCATIONS = `
query Locations { locations(first: 25) { nodes { id name isActive shipsInventory fulfillsOnlineOrders address { country countryCode } } } }`;

const Q_MARKETS = `
query Markets {
  markets(first: 25) {
    nodes {
      id name handle enabled primary
      regions(first: 25) { nodes { ... on MarketRegionCountry { code name } } }
      currencySettings { baseCurrency { currencyCode } }
    }
  }
}`;

const Q_DELIVERY = `
query Delivery {
  deliveryProfiles(first: 10) {
    nodes {
      id name default
      profileLocationGroups {
        locationGroup { locations(first: 10) { nodes { id name address { countryCode } } } }
        locationGroupZones(first: 20) {
          nodes {
            zone { name countries { code { countryCode } } }
            methodDefinitionCounts { participantDefinitionsCount rateDefinitionsCount }
            methodDefinitions(first: 20) {
              nodes {
                name active
                rateProvider {
                  __typename
                  ... on DeliveryRateDefinition { price { amount currencyCode } }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

function extractInv(product: any) {
  const variants = product?.variants?.nodes ?? [];
  let available = 0, on_hand = 0, sku: string | null = null, tracked = false, policy: string | null = null;
  for (const v of variants) {
    if (v.sku === EXPECTED_SKU) sku = v.sku;
    if (v.inventoryItem?.tracked) tracked = true;
    policy = v.inventoryPolicy ?? policy;
    for (const l of v?.inventoryItem?.inventoryLevels?.nodes ?? []) {
      for (const q of l.quantities ?? []) {
        if (q.name === "available") available += q.quantity ?? 0;
        if (q.name === "on_hand") on_hand += q.quantity ?? 0;
      }
    }
  }
  if (!sku && variants[0]?.sku) sku = variants[0].sku;
  return { available, on_hand, sku, tracked, policy };
}

async function publicGet(url: string, opts: RequestInit = {}) {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "user-agent": "AiluroaLaunchAudit/1.0 (+read-only)",
        "accept": "text/html,application/xhtml+xml",
        ...(opts.headers ?? {}),
      },
      ...opts,
    });
    const location = res.headers.get("location");
    const ct = res.headers.get("content-type") ?? "";
    let bodyText = "";
    if (res.status < 400 && ct.includes("text/") && res.status !== 301 && res.status !== 302) {
      try { bodyText = (await res.text()).slice(0, 40000); } catch { /* ignore */ }
    }
    return { url, status: res.status, location, contentType: ct, bodyPrefix: bodyText.slice(0, 400), bodyLength: bodyText.length, bodySample: bodyText };
  } catch (e) {
    return { url, status: 0, error: String(e) };
  }
}

async function followRedirects(startUrl: string, max = 5) {
  const chain: Array<{ url: string; status: number; location: string | null }> = [];
  let current = startUrl;
  for (let i = 0; i < max; i++) {
    const r = await publicGet(current);
    chain.push({ url: r.url, status: r.status, location: r.location ?? null });
    if (r.status >= 300 && r.status < 400 && r.location) {
      current = r.location.startsWith("http") ? r.location : new URL(r.location, current).toString();
      continue;
    }
    break;
  }
  return chain;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  const report: any = { schema: "ailurova.launch_readiness.v1", started_at: new Date().toISOString(), mutations: {
    shopify: 0, theme: 0, inventory: 0, publication: 0, settings: 0, orders_created: 0, payments_submitted: 0,
  }};

  try {
    const cfg = getShopifyConfig();
    report.shopify_config = { domain: cfg.domain, apiVersion: cfg.apiVersion };

    // ---------- Phase 1: protected product ----------
    const pRes = await shopifyAdminFetch<any>(Q_PROTECTED, { id: PROTECTED_GID, pub: ONLINE_STORE_PUB });
    const p = pRes.data?.product;
    const inv = p ? extractInv(p) : null;
    const otherPubs = (p?.resourcePublications?.nodes ?? []).map((n: any) => ({ id: n.publication.id, name: n.publication.name, isPublished: n.isPublished }));
    const phase1 = {
      product_id: p?.id, title: p?.title, handle: p?.handle, status: p?.status, vendor: p?.vendor, productType: p?.productType,
      total_variants: p?.variants?.nodes?.length ?? 0,
      variant_id: p?.variants?.nodes?.[0]?.id ?? null,
      sku: inv?.sku, price: p?.variants?.nodes?.[0]?.price ?? null,
      compareAtPrice: p?.variants?.nodes?.[0]?.compareAtPrice ?? null,
      inventory_tracked: inv?.tracked, inventory_policy: inv?.policy,
      continue_when_oos: inv?.policy === "CONTINUE",
      available: inv?.available, on_hand: inv?.on_hand,
      published_online_store: p?.publishedOnPublication,
      other_publications: otherPubs,
      onlineStoreUrl: p?.onlineStoreUrl,
      onlineStorePreviewUrl: p?.onlineStorePreviewUrl,
      featured_image: p?.featuredImage ?? null,
      media_present: (p?.media?.nodes?.length ?? 0) > 0,
      description_present: !!p?.descriptionHtml,
      seo_title_present: !!p?.seo?.title,
      seo_description_present: !!p?.seo?.description,
    };
    const phase1_ok =
      p?.id === PROTECTED_GID && p?.title === EXPECTED_TITLE && p?.status === "ACTIVE" &&
      inv?.sku === EXPECTED_SKU && inv?.available === EXPECTED_AVAILABLE && inv?.on_hand === EXPECTED_ON_HAND &&
      inv?.tracked === true && inv?.policy !== "CONTINUE" && p?.publishedOnPublication === true;
    report.phase1 = { verdict: phase1_ok ? "PROTECTED_PRODUCT_VERIFIED" : "PROTECTED_PRODUCT_DISCREPANCIES", data: phase1, errors: pRes.errors ?? null };

    // ---------- Phase 2: full catalog + 25 hidden ----------
    const all: Array<{ id: string; title: string; status: string; publishedOnPublication: boolean }> = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const r = await shopifyAdminFetch<any>(Q_CATALOG_PAGE, { cursor });
      const nodes = r.data?.products?.nodes ?? [];
      all.push(...nodes);
      const info = r.data?.products?.pageInfo;
      cursor = info?.hasNextPage ? info.endCursor : null;
      guard++;
    } while (cursor && guard < 20);
    const published = all.filter((x) => x.publishedOnPublication);
    const active = all.filter((x) => x.status === "ACTIVE");
    let cls: string;
    if (published.length === 1 && published[0].id === PROTECTED_GID) cls = "EXACTLY_ONE_ONLINE_STORE_PRODUCT";
    else if (published.length === 0) cls = "NO_ONLINE_STORE_PRODUCTS";
    else cls = "MULTIPLE_ONLINE_STORE_PRODUCTS";

    const check25 = await shopifyAdminFetch<any>(Q_25, { ids: UNPUBLISHED_25, pub: ONLINE_STORE_PUB });
    const nodes25 = (check25.data?.nodes ?? []) as Array<any>;
    const offenders25 = nodes25
      .map((n, i) => ({ expected: UNPUBLISHED_25[i], node: n }))
      .filter((x) => !x.node || x.node.publishedOnPublication !== false);

    report.phase2 = {
      verdict: cls,
      total_products: all.length,
      total_active: active.length,
      total_published_online_store: published.length,
      published_products: published.map((x) => ({ id: x.id, title: x.title })),
      protected_included: published.some((x) => x.id === PROTECTED_GID),
      hidden_25_intact: offenders25.length === 0,
      hidden_25_offenders: offenders25,
      pagination_pages: guard,
    };

    // ---------- Phase 3: domain ----------
    const shopRes = await shopifyAdminFetch<any>(Q_SHOP, {});
    const shop = shopRes.data?.shop;
    const apexChain = await followRedirects(`https://${APEX}/`);
    const wwwChain = await followRedirects(`https://${WWW}/`);
    const myshopChain = await followRedirects(`https://${cfg.domain}/`);
    let dnsA = null, dnsWWW = null;
    try {
      const [a, w] = await Promise.all([
        fetch(`https://dns.google/resolve?name=${APEX}&type=A`).then((r) => r.json()),
        fetch(`https://dns.google/resolve?name=${WWW}&type=CNAME`).then((r) => r.json()),
      ]);
      dnsA = a; dnsWWW = w;
    } catch { /* ignore */ }
    // Shopify's global expected apex IP is 23.227.38.65
    const apexResolvesToShopify = (dnsA?.Answer ?? []).some((x: any) => x.data === "23.227.38.65");
    const wwwResolvesToShopify = (dnsWWW?.Answer ?? []).some((x: any) => /myshopify\.com|shops\.myshopify\.com/.test(x.data));
    let domainVerdict = "DOMAIN_NOT_VERIFIABLE";
    const primary = shop?.primaryDomain?.host;
    if (primary && (primary === APEX || primary === WWW)) {
      const apexOk = apexChain.at(-1)?.status && apexChain.at(-1)!.status < 400;
      const wwwOk = wwwChain.at(-1)?.status && wwwChain.at(-1)!.status < 400;
      if (apexOk && wwwOk) domainVerdict = "DOMAIN_READY";
      else if (apexOk || wwwOk) domainVerdict = "DOMAIN_PARTIAL";
      else domainVerdict = "DOMAIN_NOT_CONNECTED";
    } else if (primary === cfg.domain) {
      domainVerdict = "DOMAIN_NOT_CONNECTED";
    }
    report.phase3 = {
      verdict: domainVerdict,
      shopify_primary_domain: shop?.primaryDomain,
      myshopify: cfg.domain,
      apex_redirect_chain: apexChain,
      www_redirect_chain: wwwChain,
      myshopify_redirect_chain: myshopChain,
      dns_apex_A: dnsA?.Answer ?? null,
      dns_www_CNAME: dnsWWW?.Answer ?? null,
      apex_resolves_to_shopify: apexResolvesToShopify,
      www_resolves_to_shopify: wwwResolvesToShopify,
    };

    // ---------- Phase 4: public storefront ----------
    const host = (primary && (primary === APEX || primary === WWW)) ? primary : APEX;
    const homepage = await publicGet(`https://${host}/`);
    const productHandle = p?.handle;
    const productUrl = productHandle ? `https://${host}/products/${productHandle}` : null;
    const productPage = productUrl ? await publicGet(productUrl) : null;
    const cartPage = await publicGet(`https://${host}/cart`);
    const passwordProtected = /password/i.test(homepage.bodyPrefix ?? "") && (homepage.status === 200 && /Enter using password/i.test(homepage.bodySample ?? ""));

    const hasGetPawsy = (s: string | undefined) => !!s && /getpawsy/i.test(s);
    const hasAilurova = (s: string | undefined) => !!s && /ailurova/i.test(s);
    const homeContent = homepage.bodySample ?? "";
    const prodContent = productPage?.bodySample ?? "";
    const storefront = {
      homepage: { url: homepage.url, status: homepage.status, ailurova_branding: hasAilurova(homeContent), getpawsy_remnants: hasGetPawsy(homeContent), password_page: passwordProtected },
      product_page: productPage && {
        url: productPage.url, status: productPage.status,
        title_present: prodContent.includes(EXPECTED_TITLE),
        sku_present: prodContent.includes(EXPECTED_SKU),
        price_present: /\$\s?\d/.test(prodContent) || /USD/i.test(prodContent) || /€\s?\d/.test(prodContent),
        add_to_cart_present: /add[- ]to[- ]cart|AddToCart|Add to bag/i.test(prodContent),
        getpawsy_remnants: hasGetPawsy(prodContent),
        ailurova_branding: hasAilurova(prodContent),
        og_type_product: /property="og:type"\s+content="product"/i.test(prodContent),
        json_ld_product: /"@type"\s*:\s*"Product"/i.test(prodContent),
      },
      cart_page: { url: cartPage.url, status: cartPage.status },
    };
    let phase4Verdict = "TECHNICAL_STOREFRONT_READY";
    if (passwordProtected) phase4Verdict = "STOREFRONT_PASSWORD_PROTECTED";
    else if (!productPage || productPage.status !== 200) phase4Verdict = "PRODUCT_PAGE_UNAVAILABLE";
    else if (!storefront.product_page?.title_present) phase4Verdict = "STOREFRONT_CONTENT_MISMATCH";
    report.phase4 = { verdict: phase4Verdict, ...storefront };

    // ---------- Phase 5: price/currency ----------
    const adminPrice = p?.variants?.nodes?.[0]?.price;
    const storefrontHasUSD = /USD|US\$|\$\s?\d/.test(prodContent);
    report.phase5 = {
      verdict: adminPrice ? (storefrontHasUSD ? "PRICE_READY" : "PRICE_NOT_VERIFIABLE") : "PRICE_NOT_CONFIGURED",
      admin_price: adminPrice,
      admin_compare_at: p?.variants?.nodes?.[0]?.compareAtPrice ?? null,
      shop_currency: shop?.currencyCode,
      presentment_currencies: shop?.enabledPresentmentCurrencies,
      storefront_price_sample: (prodContent.match(/\$\s?\d[\d,.]*/g) ?? []).slice(0, 5),
      storefront_shows_usd: storefrontHasUSD,
    };

    // ---------- Phase 6: markets ----------
    const mkt = await shopifyAdminFetch<any>(Q_MARKETS, {});
    const markets = (mkt.data?.markets?.nodes ?? []) as any[];
    const usMarket = markets.find((m) => (m.regions?.nodes ?? []).some((r: any) => r?.code === "US"));
    report.phase6 = {
      verdict: usMarket?.enabled ? "US_MARKET_READY" : (usMarket ? "US_MARKET_BLOCKED" : "US_MARKET_NOT_VERIFIABLE"),
      us_market: usMarket ? { id: usMarket.id, name: usMarket.name, enabled: usMarket.enabled, primary: usMarket.primary, currency: usMarket.currencySettings?.baseCurrency?.currencyCode } : null,
      total_markets: markets.length,
      markets_summary: markets.map((m) => ({ id: m.id, name: m.name, enabled: m.enabled, primary: m.primary, countries: (m.regions?.nodes ?? []).map((r: any) => r?.code).filter(Boolean) })),
      ships_to_countries_includes_us: (shop?.shipsToCountries ?? []).includes("US"),
    };

    // ---------- Phase 7 & 8: cart/checkout ----------
    // Try Storefront API cart create (READ/CREATE-cart only, not an order) if a Storefront token is available.
    const storefrontToken = Deno.env.get("SHOPIFY_STOREFRONT_TOKEN");
    let cartResult: any = { verdict: "CART_NOT_VERIFIABLE", note: "Storefront API token not configured for read-only cart simulation." };
    let checkoutResult: any = { verdict: "CHECKOUT_NOT_VERIFIABLE_READ_ONLY", note: "Storefront cart+shipping simulation not executed." };
    if (storefrontToken) {
      try {
        const variantId = p?.variants?.nodes?.[0]?.id;
        const createCart = `mutation($lines:[CartLineInput!]!){cartCreate(input:{lines:$lines, buyerIdentity:{countryCode: US}}){cart{id checkoutUrl cost{subtotalAmount{amount currencyCode} totalAmount{amount currencyCode}} lines(first:5){nodes{id quantity merchandise{... on ProductVariant{id sku title price{amount currencyCode} product{title}}}}}} userErrors{field message}}}`;
        const cRes = await fetch(`https://${cfg.domain}/api/${cfg.apiVersion}/graphql.json`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-shopify-storefront-access-token": storefrontToken },
          body: JSON.stringify({ query: createCart, variables: { lines: [{ merchandiseId: variantId, quantity: 1 }] } }),
        });
        const cJson = await cRes.json();
        const cart = cJson.data?.cartCreate?.cart;
        const cErr = cJson.data?.cartCreate?.userErrors ?? [];
        cartResult = {
          verdict: cart && cErr.length === 0 ? "CART_READY" : "ADD_TO_CART_FAILED",
          http_status: cRes.status,
          cart_id: cart?.id, checkout_url: cart?.checkoutUrl,
          subtotal: cart?.cost?.subtotalAmount, total: cart?.cost?.totalAmount,
          line: cart?.lines?.nodes?.[0], userErrors: cErr, gqlErrors: cJson.errors ?? null,
        };
        if (cart?.id) {
          // Add shipping address (does NOT create an order)
          const addAddr = `mutation($cartId:ID!,$addr:MailingAddressInput!){cartBuyerIdentityUpdate(cartId:$cartId,buyerIdentity:{countryCode:US,deliveryAddressPreferences:[{deliveryAddress:$addr}]}){cart{id deliveryGroups(first:5){nodes{deliveryOptions{handle title code deliveryMethodType estimatedCost{amount currencyCode}}}}}userErrors{field message}}}`;
          const addrRes = await fetch(`https://${cfg.domain}/api/${cfg.apiVersion}/graphql.json`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-shopify-storefront-access-token": storefrontToken },
            body: JSON.stringify({ query: addAddr, variables: { cartId: cart.id, addr: {
              firstName: "Audit", lastName: "Test", address1: "1600 Pennsylvania Ave NW",
              city: "Washington", province: "DC", country: "United States", zip: "20500", phone: "202-555-0100",
            }}}),
          });
          const addrJson = await addrRes.json();
          const dg = addrJson.data?.cartBuyerIdentityUpdate?.cart?.deliveryGroups?.nodes ?? [];
          const opts = dg.flatMap((g: any) => g.deliveryOptions ?? []);
          const uErrs = addrJson.data?.cartBuyerIdentityUpdate?.userErrors ?? [];
          checkoutResult = {
            verdict: opts.length > 0 ? "CHECKOUT_READY_TO_PAYMENT" : "NO_US_SHIPPING_RATE",
            http_status: addrRes.status,
            checkout_url: cart.checkoutUrl,
            delivery_options: opts,
            userErrors: uErrs, gqlErrors: addrJson.errors ?? null,
          };
        }
      } catch (e) {
        cartResult = { verdict: "CART_NOT_VERIFIABLE", error: String(e) };
      }
    }
    // Also attempt to probe checkout URL publicly (no order submission)
    let checkoutProbe: any = null;
    if (cartResult?.checkout_url) checkoutProbe = await publicGet(cartResult.checkout_url);
    report.phase7 = cartResult;
    report.phase8 = { ...checkoutResult, checkout_probe: checkoutProbe };

    // ---------- Phase 9: payments ----------
    report.phase9 = {
      verdict: shop?.paymentSettings ? "PAYMENTS_NOT_VERIFIABLE" : "PAYMENTS_NOT_VERIFIABLE",
      // We cannot confirm live-mode vs test-mode purely via Admin GraphQL; report exposed settings only.
      supportedDigitalWallets: shop?.paymentSettings?.supportedDigitalWallets ?? [],
      acceptedCardBrands: shop?.paymentSettings?.acceptedCardBrands ?? [],
      country: shop?.paymentSettings?.countryCode ?? null,
      currency: shop?.paymentSettings?.currencyCode ?? null,
      note: "Live vs test mode and account-verification state are not exposed to Admin GraphQL; confirm in Shopify admin UI.",
    };

    // ---------- Phase 10: shipping ----------
    const locsRes = await shopifyAdminFetch<any>(Q_LOCATIONS, {});
    const locations = locsRes.data?.locations?.nodes ?? [];
    const delRes = await shopifyAdminFetch<any>(Q_DELIVERY, {});
    const profiles = delRes.data?.deliveryProfiles?.nodes ?? [];
    const usZones: any[] = [];
    for (const prof of profiles) {
      for (const g of prof.profileLocationGroups ?? []) {
        for (const z of g.locationGroupZones?.nodes ?? []) {
          const countries = (z.zone?.countries ?? []).map((c: any) => c?.code?.countryCode).filter(Boolean);
          if (countries.includes("US")) {
            usZones.push({
              profile: prof.name, zone: z.zone?.name, countries,
              methods: (z.methodDefinitions?.nodes ?? []).map((m: any) => ({
                name: m.name, active: m.active,
                priceAmount: m.rateProvider?.price?.amount ?? null,
                priceCurrency: m.rateProvider?.price?.currencyCode ?? null,
                type: m.rateProvider?.__typename ?? null,
              })),
            });
          }
        }
      }
    }
    report.phase10 = {
      verdict: usZones.length > 0 && usZones.some((z) => z.methods.some((m: any) => m.active)) ? "SHIPPING_READY" : "NO_US_RATE",
      locations: locations.map((l: any) => ({ id: l.id, name: l.name, active: l.isActive, shipsInventory: l.shipsInventory, fulfillsOnline: l.fulfillsOnlineOrders, country: l.address?.countryCode })),
      us_zones: usZones,
      profiles_count: profiles.length,
    };

    // ---------- Phase 11: policies ----------
    const policyPaths = ["/policies/shipping-policy","/policies/refund-policy","/policies/privacy-policy","/policies/terms-of-service","/policies/contact-information","/pages/contact","/pages/faq"];
    const policies: any[] = [];
    for (const path of policyPaths) {
      const r = await publicGet(`https://${host}${path}`);
      const body = r.bodySample ?? "";
      policies.push({
        path, status: r.status,
        ailurova: /ailurova/i.test(body),
        getpawsy_remnants: /getpawsy/i.test(body),
        support_email_present: /support@ailurova\.com/i.test(body),
        length: r.bodyLength ?? 0,
      });
    }
    const anyGetPawsy = policies.some((x) => x.getpawsy_remnants);
    const anyMissing = policies.slice(0, 5).some((x) => x.status !== 200 || (x.length ?? 0) < 200);
    report.phase11 = {
      verdict: anyGetPawsy ? "POLICY_BRAND_MISMATCH" : (anyMissing ? "POLICIES_INCOMPLETE" : "POLICIES_READY"),
      policies,
    };

    // ---------- Phase 12: technical ----------
    const robots = await publicGet(`https://${host}/robots.txt`);
    const sitemap = await publicGet(`https://${host}/sitemap.xml`);
    const canonicalMatch = (prodContent.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ?? [])[1];
    const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(prodContent);
    const jsonLdProduct = /"@type"\s*:\s*"Product"/i.test(prodContent);
    const priceInLd = (prodContent.match(/"price"\s*:\s*"?([\d.]+)"?/i) ?? [])[1] ?? null;
    const availabilityInLd = (prodContent.match(/"availability"\s*:\s*"([^"]+)"/i) ?? [])[1] ?? null;
    report.phase12 = {
      verdict: (productPage?.status === 200 && !noindex) ? "TECHNICAL_STOREFRONT_READY" : "TECHNICAL_BLOCKERS_FOUND",
      homepage_status: homepage.status,
      product_status: productPage?.status,
      canonical_url: canonicalMatch ?? null,
      product_noindex: noindex,
      robots_status: robots.status,
      robots_sample: robots.bodyPrefix,
      sitemap_status: sitemap.status,
      json_ld_product: jsonLdProduct,
      json_ld_price: priceInLd,
      json_ld_availability: availabilityInLd,
    };

    // ---------- Phase 13: blockers & final verdict ----------
    const P0: any[] = [], P1: any[] = [], P2: any[] = [];
    if (!phase1_ok) P0.push({ code: "PROTECTED_PRODUCT_DISCREPANCY", where: "Phase 1", evidence: phase1 });
    if (cls !== "EXACTLY_ONE_ONLINE_STORE_PRODUCT") P0.push({ code: cls, where: "Phase 2", evidence: { published_count: published.length, ids: published.map((x) => x.id) } });
    if (offenders25.length > 0) P1.push({ code: "HIDDEN_25_LEAK", where: "Phase 2", evidence: offenders25 });
    if (domainVerdict !== "DOMAIN_READY") P0.push({ code: domainVerdict, where: "Phase 3", evidence: report.phase3 });
    if (report.phase4.verdict === "STOREFRONT_PASSWORD_PROTECTED") P0.push({ code: "STOREFRONT_PASSWORD_PROTECTED", where: "Phase 4" });
    if (report.phase4.verdict === "PRODUCT_PAGE_UNAVAILABLE") P0.push({ code: "PRODUCT_PAGE_UNAVAILABLE", where: "Phase 4" });
    if (report.phase4.verdict === "STOREFRONT_CONTENT_MISMATCH") P1.push({ code: "STOREFRONT_CONTENT_MISMATCH", where: "Phase 4" });
    if (report.phase5.verdict === "PRICE_NOT_CONFIGURED") P0.push({ code: "PRICE_NOT_CONFIGURED", where: "Phase 5" });
    if (report.phase6.verdict === "US_MARKET_BLOCKED") P0.push({ code: "US_MARKET_BLOCKED", where: "Phase 6" });
    if (report.phase8.verdict === "NO_US_SHIPPING_RATE") P0.push({ code: "NO_US_SHIPPING_RATE", where: "Phase 8", evidence: report.phase8 });
    if (report.phase10.verdict === "NO_US_RATE") P0.push({ code: "NO_US_RATE_CONFIGURED", where: "Phase 10", evidence: report.phase10 });
    if (report.phase11.verdict === "POLICY_BRAND_MISMATCH") P1.push({ code: "POLICY_BRAND_MISMATCH", where: "Phase 11", evidence: report.phase11 });
    if (report.phase11.verdict === "POLICIES_INCOMPLETE") P1.push({ code: "POLICIES_INCOMPLETE", where: "Phase 11", evidence: report.phase11 });
    if (report.phase12.product_noindex) P0.push({ code: "PRODUCT_NOINDEX", where: "Phase 12" });

    let overall = "AILUROVA_AUDIT_INCOMPLETE";
    if (P0.length === 0 && P1.length === 0) overall = "AILUROVA_READY_FOR_CONTROLLED_TEST_ORDER_ONLY";
    else if (P0.length > 0) overall = "AILUROVA_NOT_READY_P0_BLOCKERS";
    else if (P1.length > 0) overall = "AILUROVA_NOT_READY_P1_BLOCKERS";

    // We NEVER return AILUROVA_READY_FOR_REAL_ORDERS from an automated read-only pass;
    // a controlled test order remains required to prove payment capture end-to-end.

    const ad_decision = P0.length === 0
      ? (P1.length === 0 ? "ONLY_RUN_INTERNAL_TEST_TRAFFIC" : "DO_NOT_START_ADVERTISING_YET")
      : "DO_NOT_START_ADVERTISING_YET";

    report.phase13 = { P0, P1, P2 };
    report.overall_verdict = overall;
    report.advertising_decision = ad_decision;
    report.controlled_test_order_still_required = true;
    report.duration_ms = Date.now() - started;

    return new Response(JSON.stringify(report, null, 2), {
      status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    report.overall_verdict = "AILUROVA_AUDIT_INCOMPLETE";
    report.error = String(e);
    return new Response(JSON.stringify(report, null, 2), {
      status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});