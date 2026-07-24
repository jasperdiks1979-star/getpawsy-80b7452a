// Strictly READ-ONLY existing-CJ-location binding audit for exactly one Shopify variant.
// Zero mutations. Phases 1-4 only. Phase 5 intentionally NOT executed here — this
// function returns a verdict/plan; any activation is a separate approved step.

import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const TARGET = {
  shop: "ukz3v8-0n.myshopify.com",
  productGid: "gid://shopify/Product/15889810194764",
  variantGid: "gid://shopify/ProductVariant/58044850536780",
  inventoryItemGid: "gid://shopify/InventoryItem/57552750412108",
  sku: "CJFT268927601AZ",
  cjPid: "2004080752018214914",
  cjVid: "2004080752219541505",
  mappingRowId: "e05d929a-8a1b-439c-b87a-3c54e3ead484",
};

const counters = { shopifyMutations: 0, cjMutations: 0, mappingWrites: 0, inventoryWrites: 0, publicationWrites: 0, ordersCreated: 0 };

async function phase1_locations() {
  const q = `query Locs {
    locations(first: 50, includeInactive: true, includeLegacy: true) {
      edges { node {
        id name isActive legacyResourceId fulfillsOnlineOrders
        address { country countryCode }
        fulfillmentService { handle serviceName type inventoryManagement permitsSkuSharing }
        localPickupSettingsV2 { instructions }
      } }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q);
  const nodes = r.data?.locations?.edges?.map((e: any) => e.node) ?? [];
  const winkel = nodes.find((n: any) => /winkel/i.test(n.name)) ?? null;
  const cjLoc = nodes.find((n: any) => /cjdropship/i.test(n.name) || /cj/i.test(n.fulfillmentService?.handle ?? "")) ?? null;
  const scopeHint = (r.errors as any[])?.find?.((e) => /access|scope/i.test(JSON.stringify(e)));
  return { status: r.status, errors: r.errors ?? null, count: nodes.length, all: nodes, winkellocatie: winkel, cjdropshipping: cjLoc, missingScopeHint: scopeHint ?? null };
}

async function phase2_inventoryLevels() {
  const q = `query Item($id: ID!) {
    inventoryItem(id: $id) {
      id sku tracked requiresShipping
      variant { id sku product { id status } }
      inventoryLevels(first: 20) {
        edges { node {
          id
          location { id name isActive fulfillmentService { handle type } }
          quantities(names: ["available","on_hand","committed","incoming","reserved"]) { name quantity }
        } }
      }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: TARGET.inventoryItemGid });
  const item = r.data?.inventoryItem ?? null;
  const levels = item?.inventoryLevels?.edges?.map((e: any) => e.node) ?? [];
  const at = (matcher: RegExp) => levels.find((lv: any) => matcher.test(lv.location?.name ?? "") || matcher.test(lv.location?.fulfillmentService?.handle ?? ""));
  return {
    status: r.status,
    errors: r.errors ?? null,
    item,
    levelCount: levels.length,
    levels,
    activatedAtWinkellocatie: !!at(/winkel/i),
    activatedAtCjdropshipping: !!at(/cjdropship|^cj$/i),
  };
}

async function phase3_cjAppConnection(supabase: any) {
  // (1) Supabase mapping row
  const { data: mapRow, error: mapErr } = await supabase
    .from("catalog_recovery_mappings")
    .select("*")
    .eq("id", TARGET.mappingRowId)
    .maybeSingle();

  // (2) Official CJ Shopify-app connection: we CANNOT query CJ app-internal state
  // from the Admin API directly (that data lives inside the CJ app's private DB).
  // The only Shopify-visible signal is whether a fulfillment service of type
  // "third_party" with handle 'cjdropshipping' exists AND owns the inventory
  // level for this item. We derive that from Phase 1 + Phase 2 rather than
  // asserting it here.
  return {
    supabaseMappingRow: mapRow ?? null,
    supabaseMappingError: mapErr?.message ?? null,
    officialCjAppConnection: {
      queryable_via_admin_api: false,
      note: "Shopify Admin API exposes only Location/FulfillmentService presence, not CJ app-internal product bindings. Must be confirmed inside the CJ app UI or via CJ's own connection API.",
    },
  };
}

function phase4_method(p1: any, p2: any) {
  const cjLoc = p1.cjdropshipping;
  const cjFsType = cjLoc?.fulfillmentService?.type ?? null;
  const alreadyAtCj = p2.activatedAtCjdropshipping === true;

  if (alreadyAtCj) {
    return { method: "METHOD_A_OFFICIAL_CJ_APP_CONNECTION", reason: "Inventory item already activated at cjdropshipping location — official CJ app appears to own this SKU.", safeToBind: false, action: "NO_OP" };
  }
  if (!cjLoc) {
    return { method: "BLOCKED_APP_MANAGED_LOCATION", reason: "cjdropshipping location not visible with current token/scopes.", safeToBind: false };
  }
  // App-managed locations (fulfillmentService.type === 'THIRD_PARTY') generally
  // forbid inventoryActivate from outside the owning app. Shopify only permits
  // manual activation on 'MANUAL' fulfillment services.
  if (cjFsType && cjFsType !== "MANUAL") {
    return {
      method: "METHOD_A_OFFICIAL_CJ_APP_CONNECTION",
      reason: `cjdropshipping is an app-managed location (fulfillmentService.type=${cjFsType}). Shopify inventoryActivate from an external caller would violate the CJ app contract. Binding must be initiated inside the official CJdropshipping app so it creates the connection and activates inventory itself.`,
      safeToBind: false,
      action: "USE_OFFICIAL_CJ_APP_UI",
    };
  }
  return {
    method: "METHOD_B_SHOPIFY_INVENTORY_ACTIVATE_AT_EXISTING_CJ_LOCATION",
    reason: "cjdropshipping location is MANUAL type; inventoryActivate would be permitted. Still requires explicit GO.",
    safeToBind: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cfg = getShopifyConfig();
    if (!cfg.domain.startsWith("ukz3v8-0n.")) {
      return new Response(JSON.stringify({ error: "SHOPIFY_STORE_DOMAIN mismatch", expected: TARGET.shop, actual: cfg.domain }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const phase1 = await phase1_locations();
    const phase2 = await phase2_inventoryLevels();
    const phase3 = await phase3_cjAppConnection(supabase);
    const phase4 = phase4_method(phase1, phase2);

    // Verdict
    let verdict = "BLOCKED_CJ_APP_CONNECTION_NOT_FOUND";
    if (phase1.missingScopeHint) verdict = "BLOCKED_MISSING_SHOPIFY_SCOPE";
    else if (!phase1.cjdropshipping) verdict = "BLOCKED_APP_MANAGED_LOCATION";
    else if (phase2.activatedAtCjdropshipping) verdict = "OFFICIAL_CJ_CONNECTION_ALREADY_ACTIVE";
    else if (phase4.method === "METHOD_B_SHOPIFY_INVENTORY_ACTIVATE_AT_EXISTING_CJ_LOCATION") verdict = "READY_FOR_SAFE_EXISTING_LOCATION_BINDING";
    else if (phase4.method === "METHOD_A_OFFICIAL_CJ_APP_CONNECTION") verdict = "BLOCKED_CJ_APP_CONNECTION_NOT_FOUND";

    return new Response(JSON.stringify({
      target: TARGET,
      phase1_locations: phase1,
      phase2_inventory_levels: phase2,
      phase3_cj_app_connection: phase3,
      phase4_binding_method: phase4,
      phase5_mutation: { executed: false, reason: "read-only audit — no mutation permitted this run" },
      verdict,
      compliance: {
        no_new_fulfillment_service: true,
        no_new_location: true,
        no_product_publication: true,
        no_unrelated_product_mutations: true,
        counters,
      },
    }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message, counters }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});