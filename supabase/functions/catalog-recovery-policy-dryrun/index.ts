// catalog-recovery-policy-dryrun — READ-ONLY.
// Sweeps all Shopify variants, applies the catalog-wide inventory-sync policy
// classifier, and simulates proposed Shopify available quantities using the
// recommended Balanced formula. No Shopify, CJ, or database mutations.
// Writes performed: 0.

import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Policy constants (Balanced profile, recommended for production) ────────
const POLICY = {
  version: "policy@1.0.0-dryrun",
  formula: {
    us: { availability_factor: 0.70, fixed_buffer: 3, cap: 50 },
    cn: { availability_factor: 0.0, fixed_buffer: 0, cap: 0 }, // hard-zero until shipping SLA gate
    other: { availability_factor: 0.0, fixed_buffer: 0, cap: 0 },
    low_stock_threshold: 3,
    anomaly_drop_pct: 0.5,
  },
  draft_publishes_stock: true,   // stock may sync to DRAFT (not for sale)
  active_requires_full_gate: true,
  archived_stock_only_zero: true,
};

const VARIANTS_Q = `
query Variants($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id sku title inventoryQuantity
      product { id title handle status }
      inventoryItem {
        id tracked
        inventoryLevels(first: 5) {
          edges { node { id location { id name isActive } quantities(names: ["available"]) { name quantity } } }
        }
      }
    } }
  }
}`;

interface V {
  product_id: string; variant_id: string; inventory_item_id: string | null;
  inventory_level_id: string | null; location_id: string | null; location_name: string | null;
  location_active: boolean; level_count: number;
  tracked: boolean; available: number;
  product_title: string; variant_title: string; handle: string; product_status: string;
  sku: string;
}

async function sweep(): Promise<{ variants: V[]; pages: number; truncated: boolean }> {
  const out: V[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;
  while (true) {
    const { data, status, errors } = await shopifyAdminFetch<any>(VARIANTS_Q, { cursor });
    pages += 1;
    if (status !== 200 || errors) { truncated = true; break; }
    const conn = data?.productVariants;
    for (const e of conn?.edges ?? []) {
      const v = e.node;
      const levels = v?.inventoryItem?.inventoryLevels?.edges ?? [];
      const lvl = levels[0]?.node ?? null;
      const avail = (lvl?.quantities ?? []).find((q: any) => q.name === "available")?.quantity ?? 0;
      out.push({
        product_id: v.product?.id ?? "",
        variant_id: v.id,
        inventory_item_id: v.inventoryItem?.id ?? null,
        inventory_level_id: lvl?.id ?? null,
        location_id: lvl?.location?.id ?? null,
        location_name: lvl?.location?.name ?? null,
        location_active: !!lvl?.location?.isActive,
        level_count: levels.length,
        tracked: !!v.inventoryItem?.tracked,
        available: Number(avail || 0),
        product_title: String(v.product?.title ?? ""),
        variant_title: String(v.title ?? ""),
        handle: String(v.product?.handle ?? ""),
        product_status: String(v.product?.status ?? ""),
        sku: String(v.sku ?? "").trim(),
      });
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    if (pages >= 20) { truncated = true; break; }
  }
  return { variants: out, pages, truncated };
}

const isMalformed = (s: string) => !s || s.length < 4 || /\s/.test(s) || /[^A-Za-z0-9._\-]/.test(s);
// Known anchor (single successful canary — sole variant with proven live CJ resolution)
const ANCHOR = {
  sku: "CJBC254137101AZ",
  cj_pid: "1971105580151660546",
  cj_vid: "1971105580222963714",
  cj_us_stock: 460,
  semantic: "confirmed" as const,
  product_status: "active",
};

function proposeQty(us: number): number {
  const { availability_factor, fixed_buffer, cap } = POLICY.formula.us;
  if (us <= POLICY.formula.low_stock_threshold) return 0;
  return Math.max(0, Math.min(cap, Math.floor(us * availability_factor) - fixed_buffer));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const { variants, pages, truncated } = await sweep();
    const total = variants.length;

    // duplicate map
    const skuCounts = new Map<string, number>();
    for (const v of variants) {
      const k = v.sku.toLowerCase();
      if (k) skuCounts.set(k, (skuCounts.get(k) ?? 0) + 1);
    }

    // duplicate groups
    const dupGroups: Record<string, V[]> = {};
    for (const v of variants) {
      const k = v.sku.toLowerCase();
      if (!k) continue;
      if ((skuCounts.get(k) ?? 0) > 1) (dupGroups[k] ||= []).push(v);
    }

    const classifications: Record<string, number> = {
      AUTO_SYNC_ELIGIBLE: 0, ELIGIBLE_DRAFT_ONLY: 0,
      BLOCKED_DUPLICATE_SKU: 0, BLOCKED_MALFORMED_SKU: 0, BLOCKED_MISSING_SKU: 0,
      BLOCKED_CJ_NOT_FOUND: 0, BLOCKED_CJ_MASTER_SKU_ONLY: 0, BLOCKED_CJ_MULTIPLE_MATCHES: 0,
      BLOCKED_IDENTITY_CONFLICT: 0, BLOCKED_DISCONTINUED: 0, BLOCKED_INACTIVE_PRODUCT: 0,
      BLOCKED_NO_STOCK_EVIDENCE: 0, BLOCKED_API_ERROR: 0, MANUAL_REVIEW_REQUIRED: 0,
    };
    const statusCounts: Record<string, number> = {};
    let malformedList: V[] = [];
    let missingList: V[] = [];
    let identityConflict: V[] = [];

    const perVariant: any[] = [];
    let simulatedTotal = 0, currentTotal = 0, increases = 0, decreases = 0, unchanged = 0;
    const bigChanges: any[] = [];

    for (const v of variants) {
      statusCounts[v.product_status] = (statusCounts[v.product_status] ?? 0) + 1;
      currentTotal += v.available;
      let cls = "";
      let block_reason: string | null = null;
      let proposed = v.available; // default: no change

      if (!v.sku) { cls = "BLOCKED_MISSING_SKU"; block_reason = "empty sku"; missingList.push(v); }
      else if (isMalformed(v.sku)) { cls = "BLOCKED_MALFORMED_SKU"; block_reason = "sku fails structural validation"; malformedList.push(v); }
      else if ((skuCounts.get(v.sku.toLowerCase()) ?? 0) > 1) { cls = "BLOCKED_DUPLICATE_SKU"; block_reason = `sku repeats ${skuCounts.get(v.sku.toLowerCase())}×`; }
      else if (!v.product_id || !v.variant_id || !v.inventory_item_id || !v.inventory_level_id || !v.location_id) {
        cls = "BLOCKED_IDENTITY_CONFLICT"; block_reason = "incomplete Shopify identity chain"; identityConflict.push(v);
      } else if (!v.tracked) { cls = "BLOCKED_IDENTITY_CONFLICT"; block_reason = "inventoryItem.tracked = false"; }
      else if (!v.location_active) { cls = "BLOCKED_IDENTITY_CONFLICT"; block_reason = "location inactive"; }
      else if (v.level_count > 1) { cls = "MANUAL_REVIEW_REQUIRED"; block_reason = "multi-level (expected 1)"; }
      else if (v.product_status === "ARCHIVED") { cls = "BLOCKED_INACTIVE_PRODUCT"; block_reason = "archived product"; proposed = 0; }
      else {
        // Passed all Shopify-side gates. Now needs live CJ resolution before AUTO_SYNC.
        // In this dry-run we only have proven CJ evidence for the single anchor SKU.
        if (v.sku === ANCHOR.sku) {
          const q = proposeQty(ANCHOR.cj_us_stock);
          if (v.product_status === "DRAFT") { cls = "ELIGIBLE_DRAFT_ONLY"; }
          else { cls = "AUTO_SYNC_ELIGIBLE"; }
          proposed = q;
        } else {
          cls = "BLOCKED_NO_STOCK_EVIDENCE";
          block_reason = "live CJ pid/vid/stock not yet resolved (requires Wave-1 CJ resolution sweep)";
          proposed = v.available; // do not touch until proven
        }
      }

      classifications[cls] = (classifications[cls] ?? 0) + 1;
      simulatedTotal += proposed;
      const delta = proposed - v.available;
      if (delta > 0) increases++; else if (delta < 0) decreases++; else unchanged++;
      const rec = {
        sku: v.sku, product_id: v.product_id, variant_id: v.variant_id,
        product_status: v.product_status, current: v.available, proposed, delta,
        classification: cls, block_reason,
      };
      perVariant.push(rec);
      if (Math.abs(delta) > 0) bigChanges.push(rec);
    }
    bigChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Duplicate group summary
    const dupSummary = Object.entries(dupGroups).map(([sku, arr]) => ({
      sku, count: arr.length,
      products: arr.map((v) => ({
        product_id: v.product_id, variant_id: v.variant_id, handle: v.handle,
        status: v.product_status, title: v.product_title, variant_title: v.variant_title,
        inventory_item_id: v.inventory_item_id, current: v.available,
      })),
      recommended_treatment: "UNRESOLVED — requires manual canonical selection; policy = no mutation",
    }));

    const malformedSummary = malformedList.map((v) => ({
      sku: v.sku, product_id: v.product_id, variant_id: v.variant_id,
      title: v.product_title, variant_title: v.variant_title,
      reason: !v.sku ? "empty" : /\s/.test(v.sku) ? "whitespace in sku" : /[^A-Za-z0-9._\-]/.test(v.sku) ? "illegal char" : "too short",
      recommendation: "manual reassignment via CJ product identity search; requires human approval",
    }));

    const report = {
      ok: true,
      writes_performed: { shopify_mutations: 0, cj_mutations: 0, database_writes: 0, other: 0 },
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
      policy: POLICY,
      shopify_baseline: {
        total_variants: total,
        pages_fetched: pages,
        truncated,
        current_total_available: currentTotal,
        by_product_status: statusCounts,
      },
      duplicate_analysis: {
        groups: dupSummary.length,
        variants_involved: dupSummary.reduce((s, g) => s + g.count, 0),
        groups_detail: dupSummary,
      },
      malformed_analysis: {
        count: malformedSummary.length,
        detail: malformedSummary,
      },
      missing_sku_count: missingList.length,
      identity_conflict_count: identityConflict.length,
      classification_distribution: classifications,
      simulation: {
        anchor_used: ANCHOR,
        proposed_total_available: simulatedTotal,
        current_total_available: currentTotal,
        delta_total: simulatedTotal - currentTotal,
        increases, decreases, unchanged,
        top_changes: bigChanges.slice(0, 10),
      },
      per_variant_sample: perVariant.slice(0, 25),
      per_variant_count: perVariant.length,
      final_decision: "POLICY_READY_FOR_HUMAN_REVIEW",
      next_action: "Human approves policy@1.0.0; Wave-1 (three additional DRAFT canaries) may then be authorised.",
    };
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e), writes_performed: { shopify_mutations: 0, cj_mutations: 0, database_writes: 0, other: 0 } }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});