// AILUROVA AVAILABILITY FIX — assign existing location to existing delivery group.
// Default mode = readback (READ-ONLY). Mutation only with ?mode=execute&confirm=ASSIGN-146177655116
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PROFILE_GID = "gid://shopify/DeliveryProfile/146220056908";
const GROUP_GID = "gid://shopify/DeliveryLocationGroup/146177655116";
const LOCATION_GID = "gid://shopify/Location/123641200972";
const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const VARIANT_GID = "gid://shopify/ProductVariant/58044850536780";
const HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const CONFIRM = "ASSIGN-146177655116";

const Q = `
query RB($pid: ID!, $vid: ID!, $lid: ID!, $prof: ID!) {
  location(id: $lid) { id name isActive fulfillsOnlineOrders shipsInventory address { countryCode zip } }
  deliveryProfile(id: $prof) {
    id name default locationsWithoutRatesCount
    unassignedLocations { id name }
    profileLocationGroups {
      locationGroup { id locations(first: 50) { nodes { id name } } }
      locationGroupZones(first: 30) { nodes {
        zone { id name countries { code { countryCode restOfWorld } } }
        methodDefinitions(first: 20) { nodes { id name active
          rateProvider { __typename ... on DeliveryRateDefinition { id price { amount currencyCode } } } } }
      } }
    }
  }
  productVariant(id: $vid) {
    id sku availableForSale inventoryQuantity sellableOnlineQuantity
    inventoryPolicy price compareAtPrice
    contextualPricing(context: { country: US }) {
      price { amount currencyCode } compareAtPrice { amount currencyCode }
    }
    inventoryItem { id tracked requiresShipping
      inventoryLevels(first: 10) { nodes { location { id name }
        quantities(names: ["available","on_hand","committed"]) { name quantity } } } }
  }
  product(id: $pid) { id title status publishedOnCurrentPublication
    resourcePublicationsV2(first: 20) { nodes { isPublished publication { id name } } } }
}`;

const M = `
mutation Fix($id: ID!, $profile: DeliveryProfileInput!) {
  deliveryProfileUpdate(id: $id, profile: $profile) {
    profile { id name locationsWithoutRatesCount
      unassignedLocations { id name }
      profileLocationGroups { locationGroup { id locations(first: 50) { nodes { id name } } } } }
    userErrors { field message }
  }
}`;

export const MUTATION_PAYLOAD = {
  id: PROFILE_GID,
  profile: { locationGroupsToUpdate: [{ id: GROUP_GID, locationsToAdd: [LOCATION_GID] }] },
};

async function publicAvailability(domain: string) {
  const out: Record<string, unknown> = {};
  try {
    const r = await fetch(`https://${domain}/products/${HANDLE}.js`, { headers: { accept: "application/json" } });
    out.status = r.status;
    if (r.ok) {
      const j = await r.json();
      out.available = j.available;
      out.variants = (j.variants ?? []).map((v: any) => ({ id: v.id, available: v.available, price: v.price }));
    }
  } catch (e) { out.error = String(e); }
  return out;
}

async function cartProbe(domain: string, variantId: string) {
  try {
    const r = await fetch(`https://${domain}/cart/add.js`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
    });
    const body = await r.text();
    return { status: r.status, ok: r.ok, body: body.slice(0, 400) };
  } catch (e) { return { error: String(e) }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "readback";
  const confirm = url.searchParams.get("confirm") ?? "";
  const { domain } = getShopifyConfig();
  const report: Record<string, unknown> = { domain, mode, mutationPayload: MUTATION_PAYLOAD };

  try {
    const before = await shopifyAdminFetch(Q, { pid: PRODUCT_GID, vid: VARIANT_GID, lid: LOCATION_GID, prof: PROFILE_GID });
    report.before = before?.data ?? before;
    report.beforePublic = await publicAvailability(domain);

    const d: any = (before as any)?.data ?? before;
    const grp = d?.deliveryProfile?.profileLocationGroups?.find((g: any) => g.locationGroup?.id === GROUP_GID);
    const checks = {
      profileIdMatches: d?.deliveryProfile?.id === PROFILE_GID,
      groupFound: !!grp,
      groupLocationCount: grp?.locationGroup?.locations?.nodes?.length ?? null,
      locationActive: d?.location?.isActive === true,
      locationUnassigned: (d?.deliveryProfile?.unassignedLocations ?? []).some((l: any) => l.id === LOCATION_GID),
      available: d?.productVariant?.inventoryItem?.inventoryLevels?.nodes
        ?.find((n: any) => n.location?.id === LOCATION_GID)?.quantities
        ?.find((q: any) => q.name === "available")?.quantity ?? null,
      productStatus: d?.product?.status,
      usPrice: d?.productVariant?.contextualPricing?.price?.amount,
      usCompareAt: d?.productVariant?.contextualPricing?.compareAtPrice?.amount,
    };
    report.preflightChecks = checks;

    if (mode !== "execute") {
      report.executed = false;
      report.note = "READ-ONLY readback. Re-call with ?mode=execute&confirm=" + CONFIRM;
      return new Response(JSON.stringify(report, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    if (confirm !== CONFIRM) {
      report.executed = false;
      report.error = "confirm token mismatch";
      return new Response(JSON.stringify(report, null, 2), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const gate = checks.profileIdMatches && checks.groupFound && checks.locationActive;
    if (!gate) {
      report.executed = false;
      report.error = "preflight gate failed — no mutation performed";
      return new Response(JSON.stringify(report, null, 2), { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const res: any = await shopifyAdminFetch(M, MUTATION_PAYLOAD);
    report.executed = true;
    report.mutationResult = res?.data?.deliveryProfileUpdate ?? res;
    report.userErrors = res?.data?.deliveryProfileUpdate?.userErrors ?? [];

    const after = await shopifyAdminFetch(Q, { pid: PRODUCT_GID, vid: VARIANT_GID, lid: LOCATION_GID, prof: PROFILE_GID });
    report.after = (after as any)?.data ?? after;
    await new Promise((r) => setTimeout(r, 2000));
    report.afterPublic = await publicAvailability(domain);
    const afterVariantId = VARIANT_GID.split("/").pop()!;
    report.cartProbe = await cartProbe(domain, afterVariantId);

    return new Response(JSON.stringify(report, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    report.error = String(e);
    return new Response(JSON.stringify(report, null, 2), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
