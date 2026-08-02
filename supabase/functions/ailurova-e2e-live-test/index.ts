// AILUROVA — FINAL END-TO-END LIVE COMMERCE TEST (READ-ONLY + ephemeral cart)
// No catalog/settings mutation. No order. No payment. Stops before payment submit.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const VARIANT_ID = 58044850536780;
const VARIANT_GID = `gid://shopify/ProductVariant/${VARIANT_ID}`;
const ORIGIN = "https://ailurova.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// --- cookie jar -----------------------------------------------------------
const jar = new Map<string, string>();
function store(res: Response) {
  for (const [k, v] of res.headers) {
    if (k.toLowerCase() !== "set-cookie") continue;
    for (const part of v.split(/,(?=[^;]+=)/)) {
      const [nv] = part.split(";");
      const i = nv.indexOf("=");
      if (i > 0) jar.set(nv.slice(0, i).trim(), nv.slice(i + 1).trim());
    }
  }
}
function cookieHeader() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let only_fast = false;

async function req(url: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    ...(init.headers as Record<string, string> ?? {}),
  };
  const c = cookieHeader();
  if (c) headers["Cookie"] = c;
  let res = await fetch(url, { ...init, headers, redirect: "manual" });
  let attempt = 0;
  while (res.status === 429 && attempt < 3) {
    await res.body?.cancel();
    await sleep((only_fast ? 2500 : 6000) * (attempt + 1));
    attempt++;
    res = await fetch(url, { ...init, headers: { ...headers, Cookie: cookieHeader() || "" }, redirect: "manual" });
  }
  store(res);
  const text = await res.text();
  await sleep(only_fast ? 200 : 1200);
  return { url, status: res.status, location: res.headers.get("location"), len: text.length, text, retries: attempt };
}
async function follow(url: string, init: RequestInit = {}, max = 5) {
  let r = await req(url, init);
  let hops = 0;
  while (r.location && hops++ < max) {
    const next = new URL(r.location, r.url).toString();
    r = await req(next);
  }
  return r;
}
const slim = (r: Awaited<ReturnType<typeof req>>) => ({ url: r.url, status: r.status, location: r.location, len: r.len });

const Q_BASE = `query B($vid: ID!) {
  productVariant(id: $vid) {
    id title sku availableForSale inventoryQuantity sellableOnlineQuantity
    price compareAtPrice
    inventoryPolicy
    contextualPricing(context:{country:US}){ price{amount currencyCode} compareAtPrice{amount currencyCode} }
    inventoryItem { tracked inventoryLevels(first:5){nodes{ location{id name}
      quantities(names:["available","on_hand","committed","reserved","incoming"]){name quantity} }}}
    product { id title status handle }
    sellingPlanGroupsCount { count }
  }
  shop { name currencyCode }
  markets(first:10){nodes{ id name handle status }}
}`;

const Q_ORDERS = `query O {
  orders(first:5, sortKey: CREATED_AT, reverse:true){nodes{id name createdAt totalPriceSet{shopMoney{amount currencyCode}}}}
  draftOrders(first:5, sortKey: UPDATED_AT, reverse:true){nodes{id name createdAt status}}
}`;

Deno.serve(async (r0) => {
  if (r0.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cb = () => `cb=${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const out: Record<string, unknown> = { mode: "READ_ONLY + ephemeral cart", ts: new Date().toISOString(), config: getShopifyConfig() };

  const onlyParam = new URL(r0.url).searchParams.get("only") ?? "all";
  only_fast = onlyParam === "cart";

  if (onlyParam === "pdp") {
    only_fast = true;
    const p = await follow(`${ORIGIN}/products/${HANDLE}?${cb()}`);
    const t = p.text;
    const i = t.search(/add to cart/i);
    out.pdp = {
      status: p.status, url: p.url, len: p.len,
      button_context: i > -1 ? t.slice(Math.max(0, i - 1200), i + 400) : null,
      sold_out: /sold out/i.test(t),
      disabled_buy: /(add-to-cart|product-form__submit|button[^>]*type="submit")[^>]*disabled/i.test(t),
      price_hits: [...t.matchAll(/\$1?[0-9]{2}\.[0-9]{2}/g)].map((m) => m[0]).slice(0, 12),
    };
    const j = await follow(`${ORIGIN}/products/${HANDLE}.js?${cb()}`);
    out.pdp_js = { status: j.status, body: j.text.slice(0, 400) };
    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Non-persisting shipping-rate + pricing calculation for a US address.
  // draftOrderCalculate does NOT create a draft order or an order.
  if (onlyParam === "calc") {
    const Q_CALC = `mutation C($input: DraftOrderInput!) {
      draftOrderCalculate(input: $input) {
        calculatedDraftOrder {
          currencyCode
          subtotalPriceSet { presentmentMoney { amount currencyCode } }
          totalShippingPriceSet { presentmentMoney { amount currencyCode } }
          totalTaxSet { presentmentMoney { amount currencyCode } }
          totalPriceSet { presentmentMoney { amount currencyCode } }
          availableShippingRates { handle title price { amount currencyCode } }
          lineItems { title variantTitle quantity originalUnitPriceSet { presentmentMoney { amount currencyCode } } }
        }
        userErrors { field message }
      }
    }`;
    const input = {
      presentmentCurrencyCode: "USD",
      lineItems: [{ variantId: VARIANT_GID, quantity: 1 }],
      shippingAddress: {
        firstName: "Test", lastName: "Customer", address1: "1 Apple Park Way",
        city: "Cupertino", provinceCode: "CA", zip: "95014", countryCode: "US",
      },
    };
    try { out.calc = await shopifyAdminFetch(Q_CALC, { input }); } catch (e) { out.calc_error = String(e); }
    try { out.orders_check = await shopifyAdminFetch(Q_ORDERS, {}); } catch (e) { out.orders_check_error = String(e); }
    return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!only_fast) {
  // PHASE 1 — admin baseline
  try { out.phase1_baseline = await shopifyAdminFetch(Q_BASE, { vid: VARIANT_GID }); } catch (e) { out.phase1_error = String(e); }
  try { out.phase1_orders_before = await shopifyAdminFetch(Q_ORDERS, {}); } catch (e) { out.phase1_orders_error = String(e); }
  }

  const only = onlyParam;

  // PHASE 2 — public storefront (US context)
  jar.set("localization", "US"); jar.set("cart_currency", "USD");
  const home = only === "cart" ? { url: "", status: 0, location: null, len: 0, text: "" } as any : await follow(`${ORIGIN}/?${cb()}`);
  const pdp = only === "cart" ? { url: "", status: 0, location: null, len: 0, text: "" } as any : await follow(`${ORIGIN}/products/${HANDLE}?${cb()}`);
  const pjson = only === "cart" ? { url: "", status: 0, location: null, len: 0, text: "" } as any : await follow(`${ORIGIN}/products/${HANDLE}.js?${cb()}`);
  const policies: Record<string, unknown> = {};
  for (const p of only === "cart" ? [] : ["/policies/shipping-policy", "/policies/refund-policy", "/policies/terms-of-service", "/policies/privacy-policy", "/pages/contact"]) {
    policies[p] = slim(await follow(`${ORIGIN}${p}?${cb()}`));
  }
  const body = pdp.text;
  const scan = (s: string) => body.includes(s);
  out.phase2_storefront = {
    home: slim(home), pdp: slim(pdp), product_js: slim(pjson), policies,
    pdp_title: (body.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? null,
    h1: [...body.matchAll(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()),
    contains: {
      "$99.00": scan("$99.00"), "$119.00": scan("$119.00"),
      "Sold out": /sold out/i.test(body), "Currently unavailable": /currently unavailable/i.test(body),
      "Add to cart": /add to cart/i.test(body), "Light Gray": /light gray/i.test(body),
      password_page: /\/password/i.test(pdp.url) || home.status === 401,
      liquid_error: /Liquid error/i.test(body),
    },
    product_js_parsed: (() => { try { const j = JSON.parse(pjson.text); const v = j.variants.find((x: any) => x.id === VARIANT_ID); return { available: j.available, price: j.price, compare_at_price: j.compare_at_price, media: (j.media ?? []).length, requires_selling_plan: j.requires_selling_plan, variant: v }; } catch { return { parse_error: true }; } })(),
  };

  // PHASE 3 — ephemeral cart
  const clear = await req(`${ORIGIN}/cart/clear.js`, { method: "POST" });
  const add = await req(`${ORIGIN}/cart/add.js`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ id: VARIANT_ID, quantity: 1 }] }) });
  const cart1 = await req(`${ORIGIN}/cart.js?${cb()}`);
  const qty2 = await req(`${ORIGIN}/cart/change.js`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(VARIANT_ID), quantity: 2 }) });
  const qty1 = await req(`${ORIGIN}/cart/change.js`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(VARIANT_ID), quantity: 1 }) });
  const parse = (t: string) => { try { return JSON.parse(t); } catch { return null; } };
  const c1 = parse(cart1.text), c2 = parse(qty2.text), c3 = parse(qty1.text);
  out.phase3_cart = {
    clear: slim(clear), add: { ...slim(add), body: add.text.slice(0, 500) },
    cart_after_add: c1 && { token: c1.token, item_count: c1.item_count, total_price: c1.total_price, currency: c1.currency, items: c1.items?.map((i: any) => ({ id: i.id, title: i.title, variant_title: i.variant_title, quantity: i.quantity, price: i.price, line_price: i.line_price, selling_plan: i.selling_plan_allocation ?? null })) },
    qty2_total: c2?.total_price, qty2_count: c2?.item_count,
    qty1_total: c3?.total_price, qty1_count: c3?.item_count,
  };

  // shipping rates for the cart (read-only classic endpoint)
  const rates = await req(`${ORIGIN}/cart/shipping_rates.json?shipping_address%5Bcountry%5D=United+States&shipping_address%5Bprovince%5D=California&shipping_address%5Bzip%5D=95014&${cb()}`);
  out.phase4_shipping_rates = { ...slim(rates), body: rates.text.slice(0, 1500) };

  // PHASE 4 — checkout page (GET only, no payment)
  const checkout = await follow(`${ORIGIN}/checkout`);
  const cb2 = checkout.text;
  out.phase4_checkout = {
    ...slim(checkout),
    is_checkout: /checkout/i.test(checkout.url),
    lang: (cb2.match(/<html[^>]*lang="([^"]+)"/i) ?? [])[1] ?? null,
    currency_usd: /USD|\$99\.00/.test(cb2),
    has_99: cb2.includes("99.00"), has_198: cb2.includes("198.00"),
    mentions_light_gray: /light gray/i.test(cb2),
    cannot_ship: /cannot ship|not available for shipping|no shipping/i.test(cb2),
    payment_hints: {
      shopify_payments: /shopify_payments|shopifyPayments/i.test(cb2),
      paypal: /paypal/i.test(cb2), apple_pay: /applepay|apple_pay/i.test(cb2),
      google_pay: /googlepay|google_pay/i.test(cb2),
      test_mode: /test mode|testmode/i.test(cb2),
    },
    snippet: cb2.slice(0, 1200),
  };

  // abandon: clear cart
  out.phase5_cart_cleared = slim(await req(`${ORIGIN}/cart/clear.js`, { method: "POST" }));

  // PHASE 5 — post-test consistency
  if (!only_fast) {
  try { out.phase5_baseline = await shopifyAdminFetch(Q_BASE, { vid: VARIANT_GID }); } catch (e) { out.phase5_error = String(e); }
  try { out.phase5_orders_after = await shopifyAdminFetch(Q_ORDERS, {}); } catch (e) { out.phase5_orders_error = String(e); }
  out.phase5_pdp_recheck = only_fast ? null : slim(await follow(`${ORIGIN}/products/${HANDLE}?${cb()}`));
  }
  const recheck = await follow(`${ORIGIN}/products/${HANDLE}.js?${cb()}`);
  out.phase5_pdp_js = (() => { try { const j = JSON.parse(recheck.text); const v = j.variants.find((x: any) => x.id === VARIANT_ID); return { available: j.available, price: j.price, compare_at_price: j.compare_at_price, variant_available: v?.available, variant_price: v?.price }; } catch { return { parse_error: true, status: recheck.status }; } })();

  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
