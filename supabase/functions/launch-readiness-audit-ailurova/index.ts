// READ-ONLY launch-readiness audit for exactly ONE mapped Shopify product.
// Target: gid://shopify/Product/15889810194764 (Ailurova XL Enclosed Cat Litter Box)
// Zero mutations. Zero inventory writes. Zero publication writes. Zero orders.
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const VARIANT_GID = "gid://shopify/ProductVariant/58044850536780";
const SKU = "CJFT268927601AZ";
const CJ_PID = "2004080752018214914";
const CJ_VID = "2004080752219541505";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const Q_PRODUCT = `query($id: ID!) {
  product(id: $id) {
    id title handle status vendor productType tags totalInventory tracksInventory
    onlineStoreUrl onlineStorePreviewUrl
    publishedOnCurrentPublication
    resourcePublicationsCount { count }
    resourcePublications(first: 25) {
      edges { node { publication { id name } isPublished publishDate } }
    }
    media(first: 20) { edges { node { mediaContentType alt } } }
    variants(first: 5) {
      edges { node {
        id sku title price compareAtPrice inventoryPolicy inventoryQuantity
        inventoryItem { id tracked requiresShipping
          inventoryLevels(first: 10) {
            edges { node { location { id name isActive fulfillsOnlineOrders shipsInventory address { country } }
              quantities(names: ["available","on_hand","committed"]) { name quantity } } }
          } } } }
    }
  }
}`;

const Q_CTX = `query($id: ID!) {
  productVariant(id: $id) {
    id sku
    contextualPricing(context: { country: US }) {
      price { amount currencyCode }
      compareAtPrice { amount currencyCode }
    }
  }
}`;

const Q_SHOP = `{ shop { name primaryDomain { url host } currencyCode myshopifyDomain
  paymentSettings { supportedDigitalWallets acceptedCardBrands countryCode currencyCode }
  contactEmail email }
  markets(first: 20) { edges { node { id name enabled primary regions(first:5){edges{node{name}}}
    webPresence { rootUrls { url locale } } } } }
  locations(first: 25) { edges { node { id name isActive fulfillsOnlineOrders shipsInventory
    fulfillmentService { serviceName handle type } address { country city } } } }
  publications: publications(first: 20) { edges { node { id name } } }
  fulfillmentServices { serviceName handle type location { id name } }
}`;

const Q_PUBLISHED = `{
  products(first: 25, query: "status:active") {
    edges { node { id title handle status publishedOnCurrentPublication } }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  const report: Record<string, unknown> = {
    version: "launch-readiness-audit-ailurova@1.0.0",
    mutations: 0,
    inventory_writes: 0,
    publication_writes: 0,
    orders_created: 0,
    target: { product_gid: PRODUCT_GID, variant_gid: VARIANT_GID, sku: SKU, cj_pid: CJ_PID, cj_vid: CJ_VID },
  };

  try {
    // Fetch in parallel
    const [pRes, cRes, sRes, apRes] = await Promise.all([
      shopifyAdminFetch<any>(Q_PRODUCT, { id: PRODUCT_GID }),
      shopifyAdminFetch<any>(Q_CTX, { id: VARIANT_GID }),
      shopifyAdminFetch<any>(Q_SHOP, {}),
      shopifyAdminFetch<any>(Q_PUBLISHED, {}),
    ]);

    report.http = { product: pRes.status, ctx: cRes.status, shop: sRes.status, active_products: apRes.status };
    report.graphql_errors = {
      product: pRes.errors ?? null, ctx: cRes.errors ?? null,
      shop: sRes.errors ?? null, active_products: apRes.errors ?? null,
    };

    const product = pRes.data?.product;
    const variant = product?.variants?.edges?.[0]?.node;
    const invLevels = variant?.inventoryItem?.inventoryLevels?.edges ?? [];
    const shop = sRes.data?.shop;
    const markets = (sRes.data?.markets?.edges ?? []).map((e: any) => e.node);
    const usMarket = markets.find((m: any) =>
      (m.regions?.edges ?? []).some((r: any) => /united states|^us$/i.test(r.node?.name ?? "")));
    const locations = (sRes.data?.locations?.edges ?? []).map((e: any) => e.node);
    const publications = (sRes.data?.publications?.edges ?? []).map((e: any) => e.node);
    const activeProducts = (apRes.data?.products?.edges ?? []).map((e: any) => e.node);

    // -- Phase 1 Inventory --
    const invByLocation = invLevels.map((e: any) => {
      const n = e.node;
      const q = (n.quantities ?? []).reduce((a: any, x: any) => (a[x.name] = x.quantity, a), {} as any);
      return {
        location_id: n.location?.id, location_name: n.location?.name,
        active: n.location?.isActive, fulfills_online_orders: n.location?.fulfillsOnlineOrders,
        ships_inventory: n.location?.shipsInventory, country: n.location?.address?.country ?? null,
        available: q.available ?? null, on_hand: q.on_hand ?? null, committed: q.committed ?? null,
      };
    });
    const cjFulfillmentLocation = locations.find((l: any) =>
      /cj|dropshipping|fulfillment/i.test(l.name ?? "") || l.fulfillmentService);
    const winkelLoc = locations.find((l: any) => /winkel/i.test(l.name ?? ""));
    report.phase1_inventory = {
      tracked: variant?.inventoryItem?.tracked,
      requires_shipping: variant?.inventoryItem?.requiresShipping,
      inventory_policy: variant?.inventoryPolicy,
      total_inventory: variant?.inventoryQuantity ?? product?.totalInventory,
      inventory_by_location: invByLocation,
      all_shop_locations: locations,
      cj_fulfillment_location_present: !!cjFulfillmentLocation,
      cj_fulfillment_location: cjFulfillmentLocation ?? null,
      winkellocatie: winkelLoc ?? null,
      cj_us_stock_expected: 74,
      safety_buffer_recommended: 60,
    };

    // -- Phase 2 Checkout --
    const ctx = cRes.data?.productVariant?.contextualPricing;
    report.phase2_checkout = {
      us_price: ctx?.price ?? null,
      us_compare_at: ctx?.compareAtPrice ?? null,
      us_price_matches_target: ctx?.price?.amount === "99.0" && ctx?.price?.currencyCode === "USD",
      shop_currency: shop?.currencyCode,
      primary_domain: shop?.primaryDomain,
      myshopify_domain: shop?.myshopifyDomain,
      shop_name: shop?.name,
      payment_settings: shop?.paymentSettings ?? null,
      us_market: usMarket ?? null,
      us_market_web_presence: usMarket?.webPresence ?? null,
      us_market_enabled: usMarket?.enabled ?? null,
      product_status: product?.status,
      product_published_on_current: product?.publishedOnCurrentPublication,
      publication_count: product?.resourcePublicationsCount?.count ?? 0,
      publications_of_product: (product?.resourcePublications?.edges ?? []).map((e: any) => ({
        publication: e.node.publication?.name, id: e.node.publication?.id,
        is_published: e.node.isPublished, publish_date: e.node.publishDate,
      })),
    };

    // -- Phase 3 Fulfillment --
    let mapping: any = null;
    try {
      const supabase = createClient(SUPABASE_URL, SRK);
      const { data } = await supabase.from("catalog_recovery_mappings")
        .select("*").eq("shopify_variant_gid", VARIANT_GID).maybeSingle();
      mapping = data;
    } catch (e) { mapping = { error: String(e).slice(0, 200) }; }
    report.phase3_fulfillment = {
      mapping_row: mapping,
      mapping_present: !!mapping && !mapping.error,
      fulfillment_services: (sRes.data?.fulfillmentServices ?? []),
      shipping_method_target: "FedEx US to US #6",
      requires_manual_first_order: !cjFulfillmentLocation,
      note: "CJ order submission is manual via create-cj-order function unless a CJ fulfillmentService location auto-relays.",
    };

    // -- Phase 4 Storefront --
    const media = product?.media?.edges ?? [];
    report.phase4_storefront = {
      title: product?.title,
      handle: product?.handle,
      vendor: product?.vendor,
      tags: product?.tags,
      media_count: media.length,
      media_types: media.map((m: any) => m.node.mediaContentType),
      online_store_url: product?.onlineStoreUrl,
      online_store_preview_url: product?.onlineStorePreviewUrl,
      brand_vendor_is_ailurova: /ailurova/i.test(product?.vendor ?? ""),
      shop_name_is_ailurova: /ailurova/i.test(shop?.name ?? ""),
      shop_contact_email: shop?.contactEmail ?? shop?.email ?? null,
      currently_active_products_count: activeProducts.length,
      currently_active_products: activeProducts.map((p: any) => ({
        id: p.id, title: p.title, handle: p.handle,
        is_target: p.id === PRODUCT_GID,
      })),
      unrelated_active_products: activeProducts.filter((p: any) => p.id !== PRODUCT_GID),
    };

    // -- Phase 5 Activation Plan (STATIC — no execution) --
    report.phase5_activation_plan = {
      pre_flight: [
        "Take snapshot of product.status, publications, inventoryLevels, activeProducts list.",
      ],
      inventory: [
        "Ensure variant.inventoryItem.tracked = true (currently: " + variant?.inventoryItem?.tracked + ").",
        "Set inventoryPolicy = DENY (already DENY).",
        "Choose ONE Shopify location for CJ-fulfilled stock: prefer a CJ fulfillmentService location; if none, create one via fulfillmentServiceCreate (mutation) before inventory is set.",
        "Set inventory available quantity to 60 (safety buffer < CJ US stock 74) via inventorySetOnHandQuantities or inventoryAdjustQuantities.",
      ],
      product_status: [
        "productUpdate: status=ACTIVE (currently DRAFT).",
      ],
      publication: [
        "publishablePublish for exactly Online Store publication ID discovered above.",
        "Do NOT publish to any other channel (POS, Shop, marketplaces).",
      ],
      unrelated_products: [
        "Unpublish/archive the currently-active unrelated products BEFORE activation to prevent unintended purchases.",
        "Use productUnpublish or productUpdate status=DRAFT for each unrelated product id listed in phase4_storefront.unrelated_active_products.",
      ],
      readback: [
        "Re-run this audit; confirm status=ACTIVE, publication count = 1 (Online Store), inventory available = 60, contextual US price = $99.00 USD.",
      ],
      rollback: [
        "productUpdate status=DRAFT; publishableUnpublish from Online Store; inventorySetOnHandQuantities back to 0; restore unrelated product statuses from snapshot.",
      ],
      manual_us_checkout_test: [
        "Load canonical storefront URL from a US IP (VPN); confirm price shows $99.00 USD, no EUR.",
        "Add to cart, proceed to checkout, enter a US shipping address, confirm at least one shipping rate returned.",
        "Abandon checkout at payment step. Do NOT complete.",
      ],
      first_order_fulfillment: [
        "Disable automatic capture and automatic fulfillment in Shopify settings before first live order.",
        "On real order: verify PID/VID/SKU/qty/address/shipping method map correctly; submit via create-cj-order manually; capture payment only after CJ accepts the order.",
      ],
    };

    // Derive final verdict
    const blocks: string[] = [];
    if (!cjFulfillmentLocation) blocks.push("no_cj_fulfillment_location");
    if (invByLocation.length === 0) blocks.push("no_inventory_levels_on_variant");
    if (variant?.inventoryItem?.tracked === false) blocks.push("inventory_not_tracked");
    if (!ctx?.price || ctx.price.amount !== "99.0" || ctx.price.currencyCode !== "USD") blocks.push("us_price_mismatch");
    if (!usMarket?.enabled) blocks.push("us_market_not_enabled");
    if ((report.phase4_storefront as any).unrelated_active_products.length > 0) blocks.push("unrelated_active_products_present");
    if (!mapping || mapping.error) blocks.push("mapping_missing");

    let verdict = "READY_FOR_SAFE_ACTIVATION";
    if (blocks.some((b) => /inventory|cj_fulfillment/.test(b))) verdict = "BLOCKED_INVENTORY_CONFIGURATION";
    else if (blocks.some((b) => /price|market/.test(b))) verdict = "BLOCKED_CHECKOUT_CONFIGURATION";
    else if (blocks.includes("mapping_missing")) verdict = "BLOCKED_FULFILLMENT_CONFIGURATION";
    else if (blocks.includes("unrelated_active_products_present")) verdict = "BLOCKED_STOREFRONT_CONFIGURATION";

    report.blocking_reasons = blocks;
    report.final_verdict = verdict;
    report.elapsed_ms = Date.now() - started;

    return new Response(JSON.stringify({ ok: true, ...report }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 500), ...report }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});