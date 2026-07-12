// shopify-inventory-levels-audit — READ-ONLY full sweep of all variants,
// InventoryItems, InventoryLevels, locations. No mutations.

import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VARIANTS_Q = `
query Variants($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        sku
        inventoryQuantity
        product { id title }
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 20) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                location { id name isActive }
                quantities(names: ["available", "on_hand", "committed", "incoming"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const LEVELS_MORE_Q = `
query LevelsMore($itemId: ID!, $cursor: String) {
  inventoryItem(id: $itemId) {
    inventoryLevels(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          location { id name isActive }
          quantities(names: ["available", "on_hand", "committed", "incoming"]) { name quantity }
        }
      }
    }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const started = Date.now();
    let cursor: string | null = null;
    let pages = 0;
    let variantsRead = 0;
    const variantIds = new Set<string>();
    const inventoryItemIds = new Set<string>();
    const inventoryLevelIds = new Set<string>();
    const locations = new Map<string, { name: string; active: boolean }>();
    let tracked = 0, untracked = 0;
    let variantsWith0Levels = 0, variantsWith1Level = 0, variantsWithManyLevels = 0;
    let availableGt0 = 0, availableEq0 = 0, availableLt0 = 0;
    const availableByLocation = new Map<string, number>();
    const onHandByLocation = new Map<string, number>();
    const levelsByLocation = new Map<string, number>();
    let inconsistencies = 0;
    let extraLevelPagesFetched = 0;
    let lastHasNextPage: boolean | null = null;
    let httpErrors = 0;
    const MAX_PAGES = 30; // 3000 variants — well above 781
    let truncated = false;

    while (true) {
      const { data, errors, status } = await shopifyAdminFetch<any>(VARIANTS_Q, { cursor });
      pages += 1;
      if (status !== 200 || errors) { httpErrors += 1; break; }
      const conn = data?.productVariants;
      const edges: any[] = conn?.edges ?? [];
      for (const e of edges) {
        const v = e.node;
        variantsRead += 1;
        variantIds.add(v.id);
        const item = v.inventoryItem;
        if (item?.id) {
          inventoryItemIds.add(item.id);
          if (item.tracked) tracked += 1; else untracked += 1;
        }
        // Collect levels (first page + paginate more if needed)
        const levelEdges: any[] = item?.inventoryLevels?.edges ?? [];
        let curCursor: string | null = item?.inventoryLevels?.pageInfo?.endCursor ?? null;
        let hasMore: boolean = !!item?.inventoryLevels?.pageInfo?.hasNextPage;
        const allLevels: any[] = levelEdges.map((le) => le.node);
        while (hasMore && item?.id && extraLevelPagesFetched < 200) {
          const more = await shopifyAdminFetch<any>(LEVELS_MORE_Q, { itemId: item.id, cursor: curCursor });
          extraLevelPagesFetched += 1;
          if (more.status !== 200) { httpErrors += 1; break; }
          const mconn = more.data?.inventoryItem?.inventoryLevels;
          (mconn?.edges ?? []).forEach((le: any) => allLevels.push(le.node));
          hasMore = !!mconn?.pageInfo?.hasNextPage;
          curCursor = mconn?.pageInfo?.endCursor ?? null;
        }
        const nLevels = allLevels.length;
        if (nLevels === 0) variantsWith0Levels += 1;
        else if (nLevels === 1) variantsWith1Level += 1;
        else variantsWithManyLevels += 1;

        let sumAvailable = 0;
        for (const lvl of allLevels) {
          inventoryLevelIds.add(lvl.id);
          const loc = lvl.location;
          if (loc?.id) locations.set(loc.id, { name: loc.name, active: !!loc.isActive });
          const qs: any[] = lvl.quantities ?? [];
          const availQ = qs.find((q) => q.name === "available")?.quantity ?? 0;
          const onHandQ = qs.find((q) => q.name === "on_hand")?.quantity ?? 0;
          const locKey = loc?.id ?? "unknown";
          levelsByLocation.set(locKey, (levelsByLocation.get(locKey) ?? 0) + 1);
          availableByLocation.set(locKey, (availableByLocation.get(locKey) ?? 0) + availQ);
          onHandByLocation.set(locKey, (onHandByLocation.get(locKey) ?? 0) + onHandQ);
          if (availQ > 0) availableGt0 += 1;
          else if (availQ === 0) availableEq0 += 1;
          else availableLt0 += 1;
          sumAvailable += availQ;
        }
        if (typeof v.inventoryQuantity === "number" && v.inventoryQuantity !== sumAvailable) {
          inconsistencies += 1;
        }
      }
      lastHasNextPage = !!conn?.pageInfo?.hasNextPage;
      if (!lastHasNextPage) break;
      cursor = conn.pageInfo.endCursor;
      if (pages >= MAX_PAGES) { truncated = true; break; }
    }

    const perLocation = Array.from(locations.entries()).map(([id, meta]) => ({
      location_id: id,
      location_name: meta.name,
      active: meta.active,
      inventory_levels: levelsByLocation.get(id) ?? 0,
      total_available: availableByLocation.get(id) ?? 0,
      total_on_hand: onHandByLocation.get(id) ?? 0,
    }));
    const active = perLocation.filter((l) => l.active).length;

    return new Response(JSON.stringify({
      ok: true,
      environment: "live",
      variants_read: variantsRead,
      unique_variant_ids: variantIds.size,
      unique_inventory_items: inventoryItemIds.size,
      unique_inventory_levels: inventoryLevelIds.size,
      tracked_inventory_items: tracked,
      untracked_inventory_items: untracked,
      variants_with_0_levels: variantsWith0Levels,
      variants_with_1_level: variantsWith1Level,
      variants_with_multiple_levels: variantsWithManyLevels,
      available_gt0: availableGt0,
      available_eq0: availableEq0,
      available_lt0: availableLt0,
      variant_quantity_vs_sum_inconsistencies: inconsistencies,
      total_locations: locations.size,
      active_locations: active,
      inactive_locations: locations.size - active,
      per_location: perLocation,
      pages_fetched: pages,
      extra_level_pages_fetched: extraLevelPagesFetched,
      last_has_next_page: lastHasNextPage,
      http_errors: httpErrors,
      truncated,
      elapsed_ms: Date.now() - started,
      writes_performed: 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e).slice(0, 300), writes_performed: 0 }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});