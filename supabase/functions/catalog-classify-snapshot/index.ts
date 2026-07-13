// catalog-classify-snapshot — Step B Phase 1+2.
// READ-ONLY. Creates a run, snapshots all Shopify variants (paginated),
// computes SKU-occurrence counts, applies preclassifications, seeds
// catalog_classification_variants rows with preclassification and status.
// No CJ calls. No Shopify or CJ mutations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";
import { CJ_RESOLVER_VERSION } from "../_shared/cj-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REQUIRED_LOCATION_ID = "gid://shopify/Location/123641200972";

const VARIANT_LIST_Q = `
query V($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id sku title price compareAtPrice inventoryQuantity
      image { id }
      product {
        id title handle status
        featuredImage { id }
      }
      inventoryItem {
        id tracked requiresShipping
        inventoryLevels(first: 10) {
          edges { node {
            id
            location { id name isActive }
            quantities(names: ["available","on_hand"]) { name quantity }
          } }
        }
      }
    } }
  }
}`;

function skuIsMalformed(sku: string): boolean {
  if (!sku) return true;
  if (sku !== sku.trim()) return true;
  if (/\s/.test(sku)) return true;
  if (!/^[\x21-\x7E]{3,64}$/.test(sku)) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const runId = `stepB-${Date.now()}`;
  const started = new Date().toISOString();

  try {
    const shopCfg = getShopifyConfig();
    // Insert run row
    const { error: insErr } = await supabase.from("catalog_classification_runs").insert({
      run_id: runId,
      status: "snapshotting",
      phase: "snapshot",
      resolver_version: CJ_RESOLVER_VERSION,
      shop_domain: shopCfg.domain,
      started_at: started,
      updated_at: started,
    });
    if (insErr) throw new Error(`run insert: ${insErr.message}`);

    // Paginate Shopify
    const nodes: any[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let hasNext = false;
    let truncated = false;
    const errors: any[] = [];
    const MAX_PAGES = 20;
    while (true) {
      const r: any = await shopifyAdminFetch<any>(VARIANT_LIST_Q, { cursor });
      pages += 1;
      if (r.status !== 200 || r.errors) {
        errors.push({ page: pages, status: r.status, errors: r.errors });
        break;
      }
      const conn = r.data?.productVariants;
      for (const e of conn?.edges ?? []) nodes.push(e.node);
      hasNext = !!conn?.pageInfo?.hasNextPage;
      if (!hasNext) break;
      if (pages >= MAX_PAGES) { truncated = true; break; }
      cursor = conn.pageInfo.endCursor;
    }

    if (errors.length || truncated || hasNext) {
      await supabase.from("catalog_classification_runs").update({
        status: "failed",
        stop_reason: "snapshot_incomplete",
        updated_at: new Date().toISOString(),
        final_report: { pages, hasNext, truncated, errors },
      }).eq("run_id", runId);
      return new Response(JSON.stringify({ ok: false, run_id: runId, pages, errors, hasNext, truncated }), { headers: corsHeaders, status: 200 });
    }

    // SKU-occurrence
    const skuCount = new Map<string, number>();
    for (const n of nodes) {
      const s = String(n?.sku ?? "");
      skuCount.set(s, (skuCount.get(s) ?? 0) + 1);
    }

    const productIds = new Set<string>();
    const rows: any[] = [];
    let preExact = 0, preDup = 0, preMalformed = 0, preMissingSku = 0, preInvalidPrice = 0, preMissingImg = 0, preInvalidInv = 0;
    for (const n of nodes) {
      const sku = String(n?.sku ?? "");
      const pid = String(n?.product?.id ?? "");
      productIds.add(pid);
      const levels = n?.inventoryItem?.inventoryLevels?.edges ?? [];
      const activeLevel = levels.find((e: any) => e.node?.location?.id === REQUIRED_LOCATION_ID) ?? levels[0];
      const qs = activeLevel?.node?.quantities ?? [];
      const avail = Number(qs.find((q: any) => q.name === "available")?.quantity ?? 0);
      const onHand = qs.find((q: any) => q.name === "on_hand")?.quantity ?? null;
      const price = n?.price != null ? Number(n.price) : null;
      const cap = n?.compareAtPrice != null ? Number(n.compareAtPrice) : null;
      const imgPresent = !!(n?.image?.id || n?.product?.featuredImage?.id);
      const tracked = !!n?.inventoryItem?.tracked;
      const skuOcc = skuCount.get(sku) ?? 0;

      let pre = "READY_FOR_CJ_RESOLUTION";
      let block: string | null = null;
      if (!sku) { pre = "MISSING_SHOPIFY_SKU"; block = "no_sku"; preMissingSku++; }
      else if (skuIsMalformed(sku)) { pre = "MALFORMED_SHOPIFY_SKU"; block = "malformed"; preMalformed++; }
      else if (skuOcc > 1) { pre = "DUPLICATE_SHOPIFY_SKU"; block = "duplicate"; preDup++; }
      else if (price == null || price <= 0) { pre = "INVALID_OR_MISSING_PRICE"; block = "invalid_price"; preInvalidPrice++; }
      else if (!imgPresent) { pre = "MISSING_IMAGE"; block = "no_image"; preMissingImg++; }
      else if (!tracked || !n?.inventoryItem?.id || !activeLevel?.node?.id) { pre = "INVALID_INVENTORY_STRUCTURE"; block = "invalid_inventory"; preInvalidInv++; }
      else preExact++;

      rows.push({
        run_id: runId,
        product_id: pid,
        variant_id: String(n?.id ?? ""),
        inventory_item_id: n?.inventoryItem?.id ?? null,
        inventory_level_id: activeLevel?.node?.id ?? null,
        location_id: activeLevel?.node?.location?.id ?? null,
        product_title: n?.product?.title ?? null,
        variant_title: n?.title ?? null,
        handle: n?.product?.handle ?? null,
        product_status: n?.product?.status ?? null,
        published_to_online_store: n?.product?.status === "ACTIVE" ? null : false,
        sku,
        sku_occurrence_count: skuOcc,
        price,
        compare_at_price: cap,
        image_present: imgPresent,
        tracked,
        current_available: avail,
        current_on_hand: onHand,
        requires_shipping: !!n?.inventoryItem?.requiresShipping,
        weight: null,
        weight_unit: null,
        preclassification: pre,
        final_classification: block ? pre : null,
        block_reason: block,
        duplicate_group_key: skuOcc > 1 ? sku : null,
        malformed_reason: pre === "MALFORMED_SHOPIFY_SKU" ? "sku_pattern_invalid" : null,
        classified_at: block ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    }

    // Batch upsert
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("catalog_classification_variants")
        .upsert(chunk, { onConflict: "run_id,variant_id" });
      if (error) throw new Error(`upsert chunk ${i}: ${error.message}`);
    }

    const classified = preDup + preMalformed + preMissingSku + preInvalidPrice + preMissingImg + preInvalidInv;
    await supabase.from("catalog_classification_runs").update({
      status: "ready_for_classification",
      phase: "cj_resolution",
      total_products: productIds.size,
      total_variants: nodes.length,
      snapshot_variants: nodes.length,
      classified_variants: classified,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    return new Response(JSON.stringify({
      ok: true,
      run_id: runId,
      products: productIds.size,
      variants: nodes.length,
      pages,
      hasNextPage: hasNext,
      truncated,
      preclassified: {
        ready_for_cj: preExact,
        duplicate: preDup,
        malformed: preMalformed,
        missing_sku: preMissingSku,
        invalid_price: preInvalidPrice,
        missing_image: preMissingImg,
        invalid_inventory: preInvalidInv,
      },
    }), { headers: corsHeaders, status: 200 });
  } catch (e) {
    await supabase.from("catalog_classification_runs").update({
      status: "failed",
      stop_reason: `snapshot_error: ${String((e as Error).message).slice(0, 500)}`,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);
    return new Response(JSON.stringify({ ok: false, run_id: runId, error: String(e) }), { headers: corsHeaders, status: 500 });
  }
});