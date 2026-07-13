// catalog-recovery-batch-execute — ONE controlled DRAFT inventory recovery wave.
//
// End-to-end: policy pin → full read-only dry run over all Shopify variants →
// automatic dry-run stopgate → pre-mutation snapshot → up-to-10 bounded
// inventorySetOnHandQuantities mutations on DRAFT variants with proven
// byte-equal CJ variantSku identity → two live read-backs per variant →
// pre/post blast-radius aggregate diff → rollback on any anomaly.
//
// Hard rails baked in:
//   - Only DRAFT variants. Never ACTIVE, never ARCHIVED.
//   - Never mutates duplicate-SKU or malformed-SKU variants.
//   - Never mutates the previously proven canary SKU (CJBC254137101AZ) again.
//   - Never touches locations other than gid://shopify/Location/123641200972.
//   - Never issues any CJ mutation. Never writes to Shopify catalogue fields.
//   - Max 10 mutations. Aborts the batch on the first anomaly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import {
  CJ_RESOLVER_VERSION,
  getCjAccessToken,
  resolveCjVariant,
  type CjBudget,
} from "../_shared/cj-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const REQUIRED_LOCATION_ID = "gid://shopify/Location/123641200972";
const CANARY_ANCHOR_SKU = "CJBC254137101AZ";
const MAX_BATCH = 10;
const MIN_BATCH = 3;
const MAX_CJ_PROBES = 60;
const MIN_US_STOCK = 6; // strictly > 5
const TARGET_CAP = 20;

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (gid: string) => gid.split("?")[0];

// Malformed SKU heuristic: empty, whitespace, non-ASCII-printable, or contains spaces/tabs.
function skuIsMalformed(sku: string): boolean {
  if (!sku) return true;
  if (sku !== sku.trim()) return true;
  if (/\s/.test(sku)) return true;
  if (!/^[\x21-\x7E]{3,64}$/.test(sku)) return true;
  return false;
}

function targetFromUsStock(us: number): number {
  return Math.min(TARGET_CAP, Math.max(0, Math.floor(us * 0.5) - 5));
}

// CJ helpers now come from _shared/cj-resolver.ts (canonical resolver ladder).

// ─── Shopify queries ───────────────────────────────────────────────────────
const VARIANT_LIST_Q = `
query V($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id sku title inventoryQuantity
      product { id title status }
      inventoryItem {
        id tracked
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

const VARIANT_ONE_Q = `
query V($id: ID!) {
  productVariant(id: $id) {
    id sku title inventoryQuantity
    product { id title status }
    inventoryItem {
      id tracked
      inventoryLevels(first: 10) {
        edges { node {
          id
          location { id name isActive }
          quantities(names: ["available","on_hand"]) { name quantity }
        } }
      }
    }
  }
}`;

const SET_M = `
mutation Set($input: InventorySetOnHandQuantitiesInput!, $key: String!) {
  inventorySetOnHandQuantities(input: $input) @idempotent(key: $key) {
    inventoryAdjustmentGroup {
      createdAt reason referenceDocumentUri
      changes { name delta quantityAfterChange item { id } location { id } }
    }
    userErrors { field code message }
  }
}`;

interface Level {
  levelId: string; locationId: string; locationName: string; locationActive: boolean;
  available: number; onHand: number | null;
}
interface Snap {
  variantId: string; productId: string; sku: string;
  productTitle: string; variantTitle: string; productStatus: string;
  inventoryQuantity: number; tracked: boolean;
  inventoryItemId: string | null; levels: Level[];
}

function shape(node: any): Snap {
  const levels: Level[] = (node?.inventoryItem?.inventoryLevels?.edges ?? []).map((e: any) => {
    const qs = e.node?.quantities ?? [];
    return {
      levelId: String(e.node?.id ?? ""),
      locationId: String(e.node?.location?.id ?? ""),
      locationName: String(e.node?.location?.name ?? ""),
      locationActive: !!e.node?.location?.isActive,
      available: Number(qs.find((q: any) => q.name === "available")?.quantity ?? 0),
      onHand: qs.find((q: any) => q.name === "on_hand")?.quantity ?? null,
    };
  });
  return {
    variantId: String(node?.id ?? ""),
    productId: String(node?.product?.id ?? ""),
    sku: String(node?.sku ?? ""),
    productTitle: String(node?.product?.title ?? ""),
    variantTitle: String(node?.title ?? ""),
    productStatus: String(node?.product?.status ?? ""),
    inventoryQuantity: Number(node?.inventoryQuantity ?? 0),
    tracked: !!node?.inventoryItem?.tracked,
    inventoryItemId: node?.inventoryItem?.id ?? null,
    levels,
  };
}

async function readVariant(gid: string) {
  const r = await shopifyAdminFetch<any>(VARIANT_ONE_Q, { id: gid });
  if (r.status !== 200 || r.errors) return { snap: null as Snap | null, status: r.status, errors: r.errors };
  return { snap: shape(r.data?.productVariant), status: r.status, errors: null };
}

// Full catalogue sweep (aggregates + per-variant snapshot).
async function sweepAll(): Promise<{ snaps: Snap[]; pages: number; hasNextPage: boolean; truncated: boolean; errors: unknown[] }> {
  const snaps: Snap[] = [];
  const errors: unknown[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let hasNext = false;
  let truncated = false;
  const MAX_PAGES = 20;
  while (true) {
    const r: any = await shopifyAdminFetch<any>(VARIANT_LIST_Q, { cursor });
    pages += 1;
    if (r.status !== 200 || r.errors) { errors.push({ page: pages, status: r.status, errors: r.errors }); break; }
    const conn = r.data?.productVariants;
    for (const e of conn?.edges ?? []) snaps.push(shape(e.node));
    hasNext = !!conn?.pageInfo?.hasNextPage;
    if (!hasNext) break;
    if (pages >= MAX_PAGES) { truncated = true; break; }
    cursor = conn.pageInfo.endCursor;
  }
  return { snaps, pages, hasNextPage: hasNext, truncated, errors };
}

function aggregate(snaps: Snap[]) {
  let withStock = 0, zero = 0, totalAvail = 0;
  for (const s of snaps) {
    const sum = s.levels.reduce((a, l) => a + l.available, 0);
    totalAvail += sum;
    if (sum > 0) withStock += 1; else zero += 1;
  }
  return { totalVariants: snaps.length, withStock, zeroStock: zero, totalAvailable: totalAvail };
}

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = nowIso();
  const startMs = Date.now();
  const runId = `batch-${Date.now()}`;
  const report: any = {
    ok: false,
    run_id: runId,
    started_at: started,
    policy: {
      version: "policy@1.0.0-batch",
      formula: "target_available = min(20, max(0, floor(cj_us_stock * 0.50) - 5))",
      us_stock_min: MIN_US_STOCK,
      target_cap: TARGET_CAP,
      max_batch: MAX_BATCH,
      min_batch: MIN_BATCH,
      required_location_id: REQUIRED_LOCATION_ID,
      canary_anchor_sku_excluded: CANARY_ANCHOR_SKU,
    },
    counters: {
      shopify_variants_scanned: 0,
      cj_requests: 0,
      shopify_mutations_performed: 0,
      cj_mutations_performed: 0,
      database_writes_performed: 0,
      other_writes_performed: 0,
    },
    phases: {},
    status: "BLOCKED_DRY_RUN",
    recommended_next_action: "Investigate blocked gate before any further recovery action.",
  };

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    if (body?.confirm !== "EXECUTE_DRAFT_BATCH") {
      report.phases.pre = { error: 'Missing body { "confirm": "EXECUTE_DRAFT_BATCH" }' };
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 400 });
    }

    // ── FASE 2: full read-only sweep ─────────────────────────────────────
    const sweep = await sweepAll();
    report.counters.shopify_variants_scanned = sweep.snaps.length;
    const preAgg = aggregate(sweep.snaps);
    report.phases.sweep = {
      at: nowIso(),
      pages: sweep.pages,
      has_next_page: sweep.hasNextPage,
      truncated: sweep.truncated,
      errors: sweep.errors,
      pre_aggregate: preAgg,
    };
    if (sweep.truncated || sweep.hasNextPage || sweep.errors.length > 0) {
      report.phases.sweep.reason = "shopify_sweep_incomplete_or_errors";
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }

    // ── SKU occurrence map & classification pre-CJ ───────────────────────
    const skuCount = new Map<string, number>();
    for (const s of sweep.snaps) {
      const k = s.sku ?? "";
      skuCount.set(k, (skuCount.get(k) ?? 0) + 1);
    }

    type Row = {
      snap: Snap;
      sku_count: number;
      malformed: boolean;
      classification: string;
      cj?: {
        pid?: string; vid?: string; variantSku?: string;
        productStatus?: string; productName?: string; variantName?: string;
        usStock?: number; otherStock?: Array<{ area: string; stock: number }>;
        semanticMatch?: boolean; probeError?: string;
      };
      targetLevel?: Level;
      proposedTarget?: number;
      proposedDelta?: number;
      blockReason?: string;
    };

    const rows: Row[] = sweep.snaps.map((s): Row => {
      const count = skuCount.get(s.sku) ?? 0;
      const malformed = skuIsMalformed(s.sku);
      const targetLevel = s.levels.find((l) => l.locationId === REQUIRED_LOCATION_ID);
      let cls = "";
      if (!s.sku) cls = "BLOCKED_MISSING_SKU";
      else if (malformed) cls = "BLOCKED_MALFORMED_SKU";
      else if (count > 1) cls = "BLOCKED_DUPLICATE_SKU";
      else if (s.productStatus === "ACTIVE") cls = "SKIP_ACTIVE";
      else if (s.productStatus === "ARCHIVED") cls = "SKIP_ARCHIVED";
      else if (s.productStatus !== "DRAFT") cls = "SKIP_ACTIVE"; // treat unknown as skip
      else if (!s.tracked) cls = "BLOCKED_INVENTORY_STRUCTURE";
      else if (s.levels.length !== 1) cls = "BLOCKED_INVENTORY_STRUCTURE";
      else if (!targetLevel || !targetLevel.locationActive) cls = "BLOCKED_INVENTORY_STRUCTURE";
      else if (s.sku === CANARY_ANCHOR_SKU) cls = "UNCHANGED_ALREADY_CORRECT"; // anchor excluded
      return { snap: s, sku_count: count, malformed, classification: cls, targetLevel };
    });

    // Candidates that still need a CJ probe (empty classification so far).
    const candidates = rows.filter((r) => r.classification === "");
    // Order candidates: simple single-variant products first (heuristic: shorter title),
    // then alphabetical for determinism.
    candidates.sort((a, b) => {
      const at = (a.snap.variantTitle || "").length + (a.snap.productTitle || "").length;
      const bt = (b.snap.variantTitle || "").length + (b.snap.productTitle || "").length;
      if (at !== bt) return at - bt;
      return a.snap.sku.localeCompare(b.snap.sku);
    });

    // ── CJ authentication ────────────────────────────────────────────────
    let token = "";
    let cjAuthStatus = 0;
    try {
      const t = await cjToken();
      token = t.token; cjAuthStatus = t.status;
    } catch (e) {
      report.phases.cj_auth = { at: nowIso(), error: String((e as Error).message ?? e) };
      report.status = "BLOCKED_DRY_RUN";
      report.phases.dry_run_gate = { reason: "cj_authentication_failed" };
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }
    report.phases.cj_auth = { at: nowIso(), status: cjAuthStatus, ok: cjAuthStatus === 200 };

    // ── CJ resolve per candidate (bounded) ───────────────────────────────
    let cjRequests = 0;
    let probes = 0;
    const eligible: Row[] = [];

    for (const row of candidates) {
      if (probes >= MAX_CJ_PROBES) break;
      if (eligible.length >= MAX_BATCH) break;
      probes += 1;
      const sku = row.snap.sku;

      // Step 1: queryBySku for stock (also validates existence).
      const stockRes = await cjGet(`/product/stock/queryBySku?sku=${encodeURIComponent(sku)}`, token);
      cjRequests += 1;
      const stockAreas: any[] = Array.isArray(stockRes.body?.data) ? stockRes.body.data : [];
      const usArea = stockAreas.find((a) =>
        String(a?.countryCode ?? "").toUpperCase() === "US" ||
        /united states|^us$|america/i.test(String(a?.areaEn ?? a?.countryNameEn ?? ""))
      );
      const usStock = Number(usArea?.totalInventoryNum ?? 0);
      const otherStock = stockAreas
        .filter((a) => a !== usArea)
        .map((a) => ({ area: String(a?.areaEn ?? a?.countryNameEn ?? a?.countryCode ?? "?"), stock: Number(a?.totalInventoryNum ?? 0) }));

      if (stockRes.status !== 200) {
        row.classification = "BLOCKED_API_ERROR";
        row.cj = { usStock, otherStock, probeError: `stock http ${stockRes.status}` };
        continue;
      }
      if (stockAreas.length === 0) {
        row.classification = "BLOCKED_CJ_NOT_FOUND";
        row.cj = { usStock: 0, otherStock: [] };
        continue;
      }

      // Step 2: resolve pid + vid via queryByVariantSku (or product query).
      const varRes = await cjGet(`/product/variant/queryByVariantSku?variantSku=${encodeURIComponent(sku)}`, token);
      cjRequests += 1;
      const vlist: any[] = Array.isArray(varRes.body?.data) ? varRes.body.data
        : varRes.body?.data ? [varRes.body.data] : [];
      const exact = vlist.filter((v) => String(v?.variantSku ?? "") === sku);
      if (varRes.status !== 200) {
        row.classification = "BLOCKED_API_ERROR";
        row.cj = { usStock, otherStock, probeError: `variant http ${varRes.status}` };
        continue;
      }
      if (exact.length === 0) {
        row.classification = "BLOCKED_CJ_NOT_FOUND";
        row.cj = { usStock, otherStock };
        continue;
      }
      if (exact.length > 1) {
        row.classification = "BLOCKED_MULTIPLE_CJ_MATCHES";
        row.cj = { usStock, otherStock };
        continue;
      }
      const v = exact[0];
      const pid = String(v?.pid ?? "");
      const vid = String(v?.vid ?? "");
      const variantSku = String(v?.variantSku ?? "");
      if (!pid || !vid) {
        row.classification = "BLOCKED_MASTER_SKU_ONLY";
        row.cj = { usStock, otherStock, variantSku };
        continue;
      }

      // Step 3: product query for status + semantic labels.
      const prodRes = await cjGet(`/product/query?pid=${encodeURIComponent(pid)}`, token);
      cjRequests += 1;
      const pd = prodRes.body?.data;
      const productStatusRaw = String(pd?.status ?? pd?.productStatus ?? "");
      const activeLike = /(3|active|上架|on ?sale|onsell)/i.test(productStatusRaw);
      const productName = pd?.productNameEn ?? pd?.productName ?? "";
      const variantsList: any[] = Array.isArray(pd?.variants) ? pd.variants : [];
      const cjVariant = variantsList.find((x) => String(x?.vid ?? "") === vid);
      const variantName = cjVariant?.variantNameEn ?? cjVariant?.variantName ?? "";

      // Semantic match: overlap between Shopify product title and CJ product name tokens.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 4);
      const stops = new Set(["with","and","for","the","from","your","this","that","have","made","dogs","cats","pets"]);
      const st = new Set(norm(row.snap.productTitle).filter((t) => !stops.has(t)));
      const ct = new Set(norm(String(productName)).filter((t) => !stops.has(t)));
      let overlap = 0; for (const t of st) if (ct.has(t)) overlap += 1;
      const semanticMatch = overlap >= 2 || (st.size <= 3 && overlap >= 1);

      row.cj = {
        pid, vid, variantSku, productStatus: productStatusRaw, productName, variantName,
        usStock, otherStock, semanticMatch,
      };

      if (!activeLike) { row.classification = "BLOCKED_DISCONTINUED"; continue; }
      if (!semanticMatch) { row.classification = "BLOCKED_IDENTITY_CONFLICT"; continue; }
      if (usStock <= 0) { row.classification = "BLOCKED_NO_US_STOCK"; continue; }
      if (usStock < MIN_US_STOCK) { row.classification = "BLOCKED_LOW_US_STOCK"; continue; }

      const target = targetFromUsStock(usStock);
      const currentAvail = row.targetLevel?.available ?? 0;
      row.proposedTarget = target;
      row.proposedDelta = target - currentAvail;
      if (target <= 0) { row.classification = "BLOCKED_LOW_US_STOCK"; continue; }
      if (target === currentAvail) { row.classification = "UNCHANGED_ALREADY_CORRECT"; continue; }

      row.classification = "ELIGIBLE_DRAFT";
      eligible.push(row);
    }

    report.counters.cj_requests = cjRequests;

    // For rows we never probed, keep classification "" → mark as SKIPPED_UNSCANNED.
    for (const r of rows) if (r.classification === "") r.classification = "SKIP_UNPROBED_DRAFT";

    // Classification tallies.
    const tally: Record<string, number> = {};
    for (const r of rows) tally[r.classification] = (tally[r.classification] ?? 0) + 1;

    const dryRun = {
      total_variants_scanned: sweep.snaps.length,
      has_next_page: sweep.hasNextPage,
      truncated: sweep.truncated,
      classification_counts: tally,
      eligible_draft_count: eligible.length,
      cj_probes_attempted: probes,
      cj_probe_cap: MAX_CJ_PROBES,
      duplicate_sku_variants: tally["BLOCKED_DUPLICATE_SKU"] ?? 0,
      malformed_sku_variants: tally["BLOCKED_MALFORMED_SKU"] ?? 0,
      selected_batch: eligible.slice(0, MAX_BATCH).map((r) => ({
        variant_id: r.snap.variantId,
        product_id: r.snap.productId,
        inventory_item_id: r.snap.inventoryItemId,
        inventory_level_id: r.targetLevel?.levelId,
        location_id: r.targetLevel?.locationId,
        product_status: r.snap.productStatus,
        product_title: r.snap.productTitle,
        variant_title: r.snap.variantTitle,
        sku: r.snap.sku,
        sku_count: r.sku_count,
        tracked: r.snap.tracked,
        current_available: r.targetLevel?.available ?? 0,
        current_on_hand: r.targetLevel?.onHand ?? 0,
        cj_pid: r.cj?.pid,
        cj_vid: r.cj?.vid,
        cj_variant_sku: r.cj?.variantSku,
        cj_product_status: r.cj?.productStatus,
        semantic_match: r.cj?.semanticMatch,
        us_stock: r.cj?.usStock,
        proposed_target: r.proposedTarget,
        proposed_delta: r.proposedDelta,
      })),
    };
    report.phases.dry_run = dryRun;

    // ── FASE 3: dry-run stopgate ─────────────────────────────────────────
    const gateFailures: string[] = [];
    if (sweep.truncated) gateFailures.push("shopify_sweep_truncated");
    if (sweep.hasNextPage) gateFailures.push("shopify_has_next_page");
    if (sweep.errors.length > 0) gateFailures.push("shopify_graphql_errors");
    if (cjAuthStatus !== 200) gateFailures.push("cj_auth_failed");
    if (eligible.length < MIN_BATCH) gateFailures.push(`eligible_below_minimum_${eligible.length}<${MIN_BATCH}`);
    if (eligible.length > MAX_BATCH) gateFailures.push("eligible_above_maximum");
    // Per-variant gate cross-check.
    for (const r of eligible.slice(0, MAX_BATCH)) {
      if (r.snap.productStatus !== "DRAFT") gateFailures.push(`not_draft_${r.snap.sku}`);
      if (r.sku_count !== 1) gateFailures.push(`sku_not_unique_${r.snap.sku}`);
      if (!r.snap.tracked) gateFailures.push(`not_tracked_${r.snap.sku}`);
      if (r.snap.levels.length !== 1) gateFailures.push(`levels_not_one_${r.snap.sku}`);
      if (r.targetLevel?.locationId !== REQUIRED_LOCATION_ID) gateFailures.push(`wrong_location_${r.snap.sku}`);
      if (!r.cj?.pid || !r.cj?.vid) gateFailures.push(`cj_ids_missing_${r.snap.sku}`);
      if (!r.cj?.semanticMatch) gateFailures.push(`semantic_mismatch_${r.snap.sku}`);
      if ((r.cj?.usStock ?? 0) < MIN_US_STOCK) gateFailures.push(`us_stock_low_${r.snap.sku}`);
      if ((r.proposedTarget ?? 0) <= 0 || (r.proposedTarget ?? 0) > TARGET_CAP) gateFailures.push(`bad_target_${r.snap.sku}`);
      if (r.snap.sku === CANARY_ANCHOR_SKU) gateFailures.push("canary_anchor_included");
    }
    report.phases.dry_run_gate = { at: nowIso(), failures: gateFailures, passed: gateFailures.length === 0 };
    if (gateFailures.length > 0) {
      report.status = "BLOCKED_DRY_RUN";
      report.recommended_next_action = `Resolve dry-run gate failures (${gateFailures[0]}) before retrying.`;
      report.finished_at = nowIso();
      report.runtime_ms = Date.now() - startMs;
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }

    const batch = eligible.slice(0, MAX_BATCH);

    // ── FASE 4: pre-mutation snapshot (fresh live read per variant) ──────
    const preSnapshots: Array<{ row: Row; snap: Snap; level: Level | null; idem: string }> = [];
    for (const r of batch) {
      const rr = await readVariant(r.snap.variantId);
      if (!rr.snap) {
        report.status = "BLOCKED_DRY_RUN";
        report.phases.pre_snapshot_error = { sku: r.snap.sku, reason: "reread_failed" };
        return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
      }
      const lvl = rr.snap.levels.find((l) => l.locationId === REQUIRED_LOCATION_ID) ?? null;
      if (!lvl) {
        report.status = "BLOCKED_DRY_RUN";
        report.phases.pre_snapshot_error = { sku: r.snap.sku, reason: "target_level_missing_on_reread" };
        return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
      }
      if (rr.snap.productStatus !== "DRAFT" || rr.snap.sku !== r.snap.sku || rr.snap.inventoryItemId !== r.snap.inventoryItemId) {
        report.status = "BLOCKED_DRY_RUN";
        report.phases.pre_snapshot_error = { sku: r.snap.sku, reason: "identity_drift_on_reread" };
        return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
      }
      const idem = `${runId}:${r.snap.variantId}:${r.snap.inventoryItemId}:${REQUIRED_LOCATION_ID}:${r.snap.sku}:${r.cj?.vid}:${r.cj?.usStock}:${r.proposedTarget}`;
      preSnapshots.push({ row: r, snap: rr.snap, level: lvl, idem });
    }
    report.phases.pre_snapshots = preSnapshots.map((p) => ({
      sku: p.snap.sku, variant_id: p.snap.variantId, product_status: p.snap.productStatus,
      previous_available: p.level!.available, previous_on_hand: p.level!.onHand,
      target: p.row.proposedTarget, idempotency_key_sha_prefix: p.idem.slice(0, 24),
    }));

    // Pre-batch controls: 3 DRAFT non-selected + 2 ACTIVE + 1 duplicate + canary anchor.
    const selectedIds = new Set(batch.map((b) => b.snap.variantId));
    const draftControls = rows.filter((r) => r.snap.productStatus === "DRAFT" && !selectedIds.has(r.snap.variantId)).slice(0, 3);
    const activeControls = rows.filter((r) => r.snap.productStatus === "ACTIVE").slice(0, 2);
    const dupControl = rows.find((r) => r.classification === "BLOCKED_DUPLICATE_SKU");
    const canaryControl = rows.find((r) => r.snap.sku === CANARY_ANCHOR_SKU);
    const controlSnaps = [...draftControls, ...activeControls, ...(dupControl ? [dupControl] : []), ...(canaryControl ? [canaryControl] : [])].map((c) => ({
      variant_id: c.snap.variantId, sku: c.snap.sku, product_status: c.snap.productStatus,
      available_sum: c.snap.levels.reduce((a, l) => a + l.available, 0),
      inventory_quantity: c.snap.inventoryQuantity,
    }));
    report.phases.controls_pre = controlSnaps;

    // ── FASE 5: execute mutations one-by-one ─────────────────────────────
    const mutations: any[] = [];
    const readbacks: any[] = [];
    const rolledBack: any[] = [];
    let anomaly: string | null = null;

    for (const p of preSnapshots) {
      const input = {
        reason: "correction",
        referenceDocumentUri: `getpawsy://catalog-recovery/batch/${runId}/${p.snap.sku}`,
        setQuantities: [{
          inventoryItemId: p.snap.inventoryItemId,
          locationId: REQUIRED_LOCATION_ID,
          quantity: p.row.proposedTarget,
          changeFromQuantity: p.level!.onHand ?? 0,
        }],
      };
      const mut: any = await shopifyAdminFetch<any>(SET_M, { input, key: p.idem });
      report.counters.shopify_mutations_performed += 1;
      const ue = mut.data?.inventorySetOnHandQuantities?.userErrors ?? [];
      const changes = mut.data?.inventorySetOnHandQuantities?.inventoryAdjustmentGroup?.changes ?? [];
      const mutRec = {
        sku: p.snap.sku, variant_id: p.snap.variantId,
        http_status: mut.status, graphql_errors: mut.errors ?? null, user_errors: ue,
        changes, previous_available: p.level!.available, target: p.row.proposedTarget, at: nowIso(),
      };
      mutations.push(mutRec);

      if (mut.status !== 200 || (mut.errors && (Array.isArray(mut.errors) ? mut.errors.length : true)) || ue.length > 0) {
        anomaly = `mutation_error_${p.snap.sku}`; break;
      }
      // Guard: mutation must only touch selected item + required location.
      const touched = changes.find((c: any) =>
        c?.item?.id !== p.snap.inventoryItemId || c?.location?.id !== REQUIRED_LOCATION_ID);
      if (touched) { anomaly = `mutation_out_of_scope_${p.snap.sku}`; break; }

      // Read-back 1 & 2.
      const rb1 = await readVariant(p.snap.variantId);
      await sleep(2200);
      const rb2 = await readVariant(p.snap.variantId);
      const lv1 = rb1.snap?.levels.find((l) => l.locationId === REQUIRED_LOCATION_ID);
      const lv2 = rb2.snap?.levels.find((l) => l.locationId === REQUIRED_LOCATION_ID);
      const rbRec = {
        sku: p.snap.sku, variant_id: p.snap.variantId, target: p.row.proposedTarget,
        readback_1: { at: nowIso(), available: lv1?.available, on_hand: lv1?.onHand, inventoryQuantity: rb1.snap?.inventoryQuantity },
        readback_2: { at: nowIso(), available: lv2?.available, on_hand: lv2?.onHand, inventoryQuantity: rb2.snap?.inventoryQuantity },
      };
      readbacks.push(rbRec);
      if (lv1?.available !== p.row.proposedTarget || lv2?.available !== p.row.proposedTarget ||
          rb1.snap?.inventoryQuantity !== p.row.proposedTarget || rb2.snap?.inventoryQuantity !== p.row.proposedTarget) {
        anomaly = `readback_mismatch_${p.snap.sku}`; break;
      }
    }
    report.phases.mutations = mutations;
    report.phases.readbacks = readbacks;

    // ── FASE 7: post-aggregate + controls_post ───────────────────────────
    const postSweep = await sweepAll();
    const postAgg = aggregate(postSweep.snaps);
    report.phases.post_aggregate = { at: nowIso(), pre: preAgg, post: postAgg };

    const postById = new Map<string, Snap>();
    for (const s of postSweep.snaps) postById.set(s.variantId, s);
    const controlsPost = controlSnaps.map((c) => {
      const s = postById.get(c.variant_id);
      const sumPost = s?.levels.reduce((a, l) => a + l.available, 0) ?? null;
      return {
        variant_id: c.variant_id, sku: c.sku, product_status: s?.productStatus,
        available_sum_pre: c.available_sum, available_sum_post: sumPost,
        inventoryQuantity_pre: c.inventory_quantity, inventoryQuantity_post: s?.inventoryQuantity ?? null,
        unchanged: sumPost === c.available_sum && (s?.inventoryQuantity ?? null) === c.inventory_quantity,
      };
    });
    report.phases.controls_post = controlsPost;

    // Expected aggregate delta = sum of successful mutation targets - sum of previous availables (for successful ones only).
    const successCount = readbacks.length;
    const successPre = preSnapshots.slice(0, successCount).reduce((a, p) => a + (p.level!.available), 0);
    const successTarget = preSnapshots.slice(0, successCount).reduce((a, p) => a + (p.row.proposedTarget ?? 0), 0);
    const expectedDelta = successTarget - successPre;
    const actualDelta = postAgg.totalAvailable - preAgg.totalAvailable;
    report.phases.blast_radius = {
      expected_delta: expectedDelta,
      actual_delta: actualDelta,
      match: expectedDelta === actualDelta,
      controls_all_unchanged: controlsPost.every((c) => c.unchanged),
    };

    if (!anomaly && (expectedDelta !== actualDelta || !controlsPost.every((c) => c.unchanged))) {
      anomaly = "blast_radius_mismatch";
    }

    // ── FASE 8: rollback if anomaly ──────────────────────────────────────
    if (anomaly) {
      for (const p of preSnapshots.slice(0, successCount)) {
        const rb = await shopifyAdminFetch<any>(SET_M, {
          input: {
            reason: "correction",
            referenceDocumentUri: `getpawsy://catalog-recovery/batch/${runId}/${p.snap.sku}/rollback`,
            setQuantities: [{
              inventoryItemId: p.snap.inventoryItemId,
              locationId: REQUIRED_LOCATION_ID,
              quantity: p.level!.available,
              changeFromQuantity: p.row.proposedTarget ?? 0,
            }],
          },
          key: `${p.idem}:rollback`,
        });
        report.counters.shopify_mutations_performed += 1;
        const rbA = await readVariant(p.snap.variantId); await sleep(2000);
        const rbB = await readVariant(p.snap.variantId);
        const la = rbA.snap?.levels.find((l) => l.locationId === REQUIRED_LOCATION_ID);
        const lb = rbB.snap?.levels.find((l) => l.locationId === REQUIRED_LOCATION_ID);
        rolledBack.push({
          sku: p.snap.sku, restored_to: p.level!.available,
          http_status: (rb as any).status, user_errors: rb.data?.inventorySetOnHandQuantities?.userErrors ?? [],
          readback_a: la?.available, readback_b: lb?.available,
          verified: la?.available === p.level!.available && lb?.available === p.level!.available,
        });
      }
      report.phases.rollback = { anomaly, rolled_back: rolledBack };
      report.status = rolledBack.every((r) => r.verified) ? "BATCH_FAILED_ROLLED_BACK" : "BATCH_FAILED_ROLLBACK_UNVERIFIED";
      report.recommended_next_action = "Halt further recovery. Investigate anomaly root cause before retry.";
    } else {
      report.status = "BATCH_SUCCESS";
      report.ok = true;
      report.recommended_next_action = "Hold. Do not scale, activate, or schedule. Await explicit human authorization for the next bounded DRAFT batch.";
    }

    report.finished_at = nowIso();
    report.runtime_ms = Date.now() - startMs;
    return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
  } catch (e) {
    report.phases.fatal = { at: nowIso(), error: String((e as Error).message ?? e) };
    report.status = "BLOCKED_DRY_RUN";
    report.finished_at = nowIso();
    report.runtime_ms = Date.now() - startMs;
    return new Response(JSON.stringify(report), { headers: corsHeaders, status: 500 });
  }
});