// catalog-commerce-proof — LIVE commerce proof for the 48 SELLABLE products
// classified in Step C run stepC-1783924943151.
//
// STRICT CONTRACT:
// - Read-only against CJ (no CJ calls here).
// - Shopify Admin API: READ ONLY (products/variants/publications/inventory).
// - Storefront: unauthenticated GET on PDPs, Ajax cart /cart/add.js + /cart.js
//   (session-only, no persistent Shopify mutation).
// - Checkout: GET /checkout only — no payment, no order.
// - No SKU/price/title/media/product writes. No CJ orders, no fulfillment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const RUN_ID = "stepC-1783924943151";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function J(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: CORS });
}

interface SellableRow { product_id: string; variant_id: string; sku: string; applied_on_hand: number | null; }

interface ProductLive {
  productId: string; handle: string | null; title: string | null; status: string | null;
  publishedOnOnlineStore: boolean; onlineStoreUrl: string | null; productType: string | null;
  variants: Array<{ id: string; sku: string | null; price: string | null; availableForSale: boolean; inventoryQuantity: number | null; inventoryItemId: string | null; }>;
  pageReachable: boolean | null; pageStatus: number | null;
  petCategory: "cat" | "dog" | "other";
}

async function loadSellable(sb: ReturnType<typeof createClient>): Promise<SellableRow[]> {
  const { data, error } = await sb
    .from("catalog_commerce_items")
    .select("product_id,variant_id,sku,applied_on_hand")
    .eq("run_id", RUN_ID).eq("status", "sellable");
  if (error) throw new Error(`db read failed: ${error.message}`);
  return (data ?? []) as SellableRow[];
}

function classifyPet(text: string): "cat" | "dog" | "other" {
  const t = text.toLowerCase();
  if (/(\bcat\b|kitten|feline|kat)/.test(t)) return "cat";
  if (/(\bdog\b|puppy|canine|hond)/.test(t)) return "dog";
  return "other";
}

async function verifyProduct(productId: string): Promise<ProductLive> {
  const q = `query($id: ID!) {
    product(id: $id) {
      id handle title status productType tags onlineStoreUrl
      variants(first: 100) { nodes { id sku price availableForSale inventoryQuantity inventoryItem { id tracked } } }
      publications: resourcePublications(first: 25) { nodes { isPublished publication { id name } } }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: productId });
  const p = r.data?.product;
  if (!p) return { productId, handle: null, title: null, status: null, publishedOnOnlineStore: false, onlineStoreUrl: null, productType: null, variants: [], pageReachable: null, pageStatus: null, petCategory: "other" };
  const pubs: any[] = p.publications?.nodes ?? [];
  const onOs = pubs.some((n: any) => n.isPublished && /online store/i.test(n.publication?.name ?? ""));
  const cat = classifyPet(`${p.title ?? ""} ${p.productType ?? ""} ${(p.tags ?? []).join(" ")}`);
  return {
    productId, handle: p.handle ?? null, title: p.title ?? null, status: p.status ?? null,
    publishedOnOnlineStore: onOs, onlineStoreUrl: p.onlineStoreUrl ?? null, productType: p.productType ?? null,
    variants: (p.variants?.nodes ?? []).map((v: any) => ({
      id: v.id, sku: v.sku, price: v.price, availableForSale: !!v.availableForSale,
      inventoryQuantity: v.inventoryQuantity ?? null, inventoryItemId: v.inventoryItem?.id ?? null,
    })),
    pageReachable: null, pageStatus: null, petCategory: cat,
  };
}

async function reachProductPage(domain: string, handle: string) {
  try {
    const r = await fetch(`https://${domain}/products/${handle}`, { redirect: "follow" });
    await r.text().catch(() => "");
    return { ok: r.status >= 200 && r.status < 400, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}

function parseSetCookies(res: Response): string[] {
  const anyH = res.headers as any;
  if (typeof anyH.getSetCookie === "function") return anyH.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? [raw] : [];
}
function cookieHeader(jar: Map<string, string>): string { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
function updateJar(jar: Map<string, string>, setCookies: string[]) {
  for (const c of setCookies) {
    const pair = c.split(";")[0]; const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function runCartFlow(domain: string, handle: string, variantGid: string) {
  const numeric = variantGid.split("/").pop() ?? "";
  const jar = new Map<string, string>();
  const pdp = await fetch(`https://${domain}/products/${handle}`, { redirect: "follow" });
  await pdp.text().catch(() => "");
  updateJar(jar, parseSetCookies(pdp));
  const pageOk = pdp.status >= 200 && pdp.status < 400;

  const addRes = await fetch(`https://${domain}/cart/add.js`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "Accept": "application/json",
      "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (compatible; LovableCommerceProof/1.0)",
    },
    body: JSON.stringify({ items: [{ id: Number(numeric), quantity: 1 }] }),
    redirect: "follow",
  });
  updateJar(jar, parseSetCookies(addRes));
  const addOk = addRes.status >= 200 && addRes.status < 300;
  const addBody = await addRes.text().catch(() => "");
  let addErr: string | undefined;
  if (!addOk) { try { addErr = (JSON.parse(addBody).description ?? JSON.parse(addBody).message ?? "").toString().slice(0, 200); } catch { addErr = addBody.slice(0, 200); } }

  let readback: any = { ok: false, variantIdMatches: null, quantity: null, priceCents: null, itemCount: null };
  if (addOk) {
    const cartRes = await fetch(`https://${domain}/cart.js`, { headers: { "Accept": "application/json", "Cookie": cookieHeader(jar), "X-Requested-With": "XMLHttpRequest" } });
    updateJar(jar, parseSetCookies(cartRes));
    const cartTxt = await cartRes.text().catch(() => "");
    try {
      const c = JSON.parse(cartTxt); const items: any[] = c.items ?? [];
      const match = items.find(i => String(i.variant_id) === numeric || String(i.id) === numeric);
      readback = { ok: cartRes.ok, variantIdMatches: !!match, quantity: match?.quantity ?? null, priceCents: match?.final_price ?? match?.price ?? null, itemCount: items.length };
    } catch { readback.ok = false; }
  }

  let checkout: any = { attempted: false, ok: false, status: 0 };
  if (addOk) {
    const co = await fetch(`https://${domain}/checkout`, {
      redirect: "follow",
      headers: { "Cookie": cookieHeader(jar), "User-Agent": "Mozilla/5.0 (compatible; LovableCommerceProof/1.0)" },
    });
    await co.text().catch(() => "");
    checkout = { attempted: true, ok: co.status >= 200 && co.status < 400, status: co.status, url: co.url };
  }

  return {
    numericVariantId: numeric, variantId: variantGid,
    productPage: { ok: pageOk, status: pdp.status },
    addToCart: { ok: addOk, status: addRes.status, error: addErr },
    cartReadBack: readback, checkout,
  };
}

function pickRepresentative(products: ProductLive[]): ProductLive[] {
  const eligible = products.filter(p =>
    p.status === "ACTIVE" && p.publishedOnOnlineStore && p.handle &&
    p.variants.some(v => v.availableForSale && (v.inventoryQuantity ?? 0) > 0)
  );
  const chosen = new Map<string, ProductLive>();
  const bucket = (pred: (p: ProductLive) => boolean, n: number) => {
    let taken = 0;
    for (const p of eligible) {
      if (taken >= n) break;
      if (!pred(p)) continue;
      if (!chosen.has(p.productId)) { chosen.set(p.productId, p); taken++; }
      else taken++;
    }
  };
  bucket(p => p.variants.length === 1, 3);
  bucket(p => p.variants.length > 1, 3);
  bucket(p => p.petCategory === "cat", 2);
  bucket(p => p.petCategory === "dog", 2);
  for (const p of eligible) { if (chosen.size >= 10) break; if (!chosen.has(p.productId)) chosen.set(p.productId, p); }
  return [...chosen.values()].slice(0, 12);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    const cfg = getShopifyConfig();
    const domain = cfg.domain;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const rows = await loadSellable(sb);
    const productIds = [...new Set(rows.map(r => r.product_id))];
    if (dryRun) return J(200, { run_id: RUN_ID, sellable_row_count: rows.length, unique_products: productIds.length });

    // Phase 1
    const live: ProductLive[] = [];
    for (const pid of productIds) {
      const p = await verifyProduct(pid);
      if (p.status === "ACTIVE" && p.publishedOnOnlineStore && p.handle) {
        const rp = await reachProductPage(domain, p.handle);
        p.pageReachable = rp.ok; p.pageStatus = rp.status;
      }
      live.push(p);
      await new Promise(r => setTimeout(r, 50));
    }

    const phase1 = {
      total: live.length,
      active: live.filter(p => p.status === "ACTIVE").length,
      published_online_store: live.filter(p => p.publishedOnOnlineStore).length,
      any_variant_available: live.filter(p => p.variants.some(v => v.availableForSale)).length,
      inventory_gt_zero: live.filter(p => p.variants.some(v => (v.inventoryQuantity ?? 0) > 0)).length,
      valid_price: live.filter(p => p.variants.some(v => v.price && Number(v.price) > 0)).length,
      page_reachable: live.filter(p => p.pageReachable === true).length,
    };

    // Phase 2/3
    const reps = pickRepresentative(live);
    const cartTests: any[] = [];
    for (const p of reps) {
      const v = p.variants.find(x => x.availableForSale && (x.inventoryQuantity ?? 0) > 0);
      if (!v || !p.handle) continue;
      const t = await runCartFlow(domain, p.handle, v.id);
      cartTests.push({ productId: p.productId, handle: p.handle, sku: v.sku ?? "", petCategory: p.petCategory, variantCount: p.variants.length, ...t });
      await new Promise(r => setTimeout(r, 100));
    }

    const addOk = cartTests.filter(t => t.addToCart.ok && t.cartReadBack.variantIdMatches).length;
    const addFail = cartTests.length - addOk;
    const checkoutOk = cartTests.filter(t => t.checkout.ok).length;
    const checkoutFail = cartTests.filter(t => t.checkout.attempted && !t.checkout.ok).length;

    // Phase 4
    const paymentReadiness = await (async () => {
      const q = `{ shop { name currencyCode primaryDomain { url } paymentSettings { supportedDigitalWallets acceptedCardBrands countryCode } } }`;
      try {
        const r = await shopifyAdminFetch<any>(q);
        const s = r.data?.shop;
        const brands: string[] = s?.paymentSettings?.acceptedCardBrands ?? [];
        return { ok: brands.length > 0, currency: s?.currencyCode ?? null, country: s?.paymentSettings?.countryCode ?? null, accepted_card_brands: brands, digital_wallets: s?.paymentSettings?.supportedDigitalWallets ?? [], errors: r.errors ?? null };
      } catch (e) { return { ok: false, error: String((e as Error).message).slice(0, 200) }; }
    })();

    // Phase 5
    const shippingOk = cartTests.some(t => t.checkout.ok);
    let end_status: string;
    if (addOk >= 10 && checkoutOk >= 3 && paymentReadiness.ok && shippingOk) end_status = "COMMERCE_PROVEN";
    else if (addOk === 0) end_status = "COMMERCE_BLOCKED_CART";
    else if (checkoutOk === 0) end_status = "COMMERCE_BLOCKED_SHIPPING";
    else if (!paymentReadiness.ok) end_status = "COMMERCE_BLOCKED_PAYMENT";
    else end_status = "COMMERCE_PARTIALLY_PROVEN";

    const rec = (() => {
      if (end_status === "COMMERCE_PROVEN") return "Launch Wave-1 paid acquisition on the 48 SELLABLE products; run Step D exception-recovery on the 167 blocked variants in parallel.";
      if (end_status === "COMMERCE_PARTIALLY_PROVEN") return "Investigate failed cart/checkout entries listed in cart_tests before scaling traffic.";
      if (end_status === "COMMERCE_BLOCKED_CART") return "Fix add-to-cart on the storefront theme/section before any traffic push.";
      if (end_status === "COMMERCE_BLOCKED_SHIPPING") return "Configure a US shipping zone/rate in Shopify → Settings → Shipping.";
      if (end_status === "COMMERCE_BLOCKED_PAYMENT") return "Activate a payment provider in Shopify → Settings → Payments.";
      return "Review report and retry.";
    })();

    return J(200, {
      run_id: RUN_ID, generated_at: new Date().toISOString(), shop_domain: domain,
      live_sellable_product_count: live.length,
      phase1_verification: phase1,
      phase2_cart: {
        tested_products: cartTests.length,
        single_variant_tested: cartTests.filter(t => t.variantCount === 1).length,
        multi_variant_tested: cartTests.filter(t => t.variantCount > 1).length,
        cat_products_tested: cartTests.filter(t => t.petCategory === "cat").length,
        dog_products_tested: cartTests.filter(t => t.petCategory === "dog").length,
        add_to_cart_success: addOk, add_to_cart_failure: addFail,
      },
      phase3_checkout: {
        checkout_start_success: checkoutOk, checkout_start_failure: checkoutFail,
        shipping_option_present: shippingOk, shipping_rate_visible: shippingOk,
        payment_step_reachable: shippingOk && paymentReadiness.ok,
      },
      phase4_payment_readiness: paymentReadiness,
      writes: { shopify_mutations: 0, cj_mutations: 0, cj_orders_created: 0, database_writes: 0 },
      end_status, recommended_next_step: rec,
      cart_tests: cartTests,
      products: live.map(p => ({
        productId: p.productId, handle: p.handle, title: p.title, status: p.status,
        publishedOnOnlineStore: p.publishedOnOnlineStore, variants: p.variants.length,
        anyAvailable: p.variants.some(v => v.availableForSale),
        inventoryTotal: p.variants.reduce((a, v) => a + (v.inventoryQuantity ?? 0), 0),
        pageStatus: p.pageStatus,
      })),
    });
  } catch (e) {
    return J(500, { error: String((e as Error).message).slice(0, 500) });
  }
});
