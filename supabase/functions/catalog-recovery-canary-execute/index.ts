// catalog-recovery-canary-execute — single-variant Shopify inventory canary.
//
// Performs ONE strictly bounded inventoryLevel available mutation:
//   InventoryItem gid://shopify/InventoryItem/57552763486540
//   Location      gid://shopify/Location/123641200972
//   available     0 -> 1
//
// Executes: preflight (Shopify + CJ live re-read, byte-equal identity check),
// pre-snapshot of catalogue aggregates + control variants, single
// inventorySetQuantities mutation (name="available", reason="correction",
// reference URI), two live read-backs, post-snapshot + blast-radius diff,
// automatic rollback on any anomaly with rollback verification.
//
// Writes on success: Shopify=1, CJ=0, DB=0.
// Guard rails: refuses to mutate anything other than the exact identity above.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Canary constants (hard-coded; refuse anything else) ───────────────────
const CANARY = {
  productId: "gid://shopify/Product/15889816486220",
  variantId: "gid://shopify/ProductVariant/58044862497100",
  inventoryItemId: "gid://shopify/InventoryItem/57552763486540",
  inventoryLevelId: "gid://shopify/InventoryLevel/162799878476",
  locationId: "gid://shopify/Location/123641200972",
  locationName: "Winkellocatie",
  sku: "CJBC254137101AZ",
  cjPid: "1971105580151660546",
  cjVid: "1971105580222963714",
  targetAvailable: 1,
  rollbackAvailable: 0,
  referenceUri: "getpawsy://catalog-recovery/canary/CJBC254137101AZ",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const stripSuffix = (gid: string) => gid.split("?")[0];
const matchesLevel = (l: { levelId: string; locationId: string }) =>
  stripSuffix(l.levelId) === stripSuffix(CANARY.inventoryLevelId) &&
  l.locationId === CANARY.locationId;

// ─── CJ helpers (read-only) ────────────────────────────────────────────────
async function cjToken(): Promise<{ token: string; status: number }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: cached } = await supabase
    .from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").single();
  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return { token: cached.access_token, status: 200 };
  }
  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data?.result) throw new Error(`CJ auth failed status=${res.status}`);
  const expiry = new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 5 * 60_000);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton", access_token: data.data.accessToken,
    token_expiry: expiry.toISOString(), updated_at: new Date().toISOString(),
  });
  return { token: data.data.accessToken, status: res.status };
}

async function cjGet(path: string, token: string) {
  const res = await fetch(`${CJ_API_BASE}${path}`, {
    headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ─── Shopify queries ───────────────────────────────────────────────────────
const VARIANT_Q = `
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

const AGG_Q = `
query Agg($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id sku inventoryQuantity
      inventoryItem { id inventoryLevels(first: 5) { edges { node {
        id quantities(names: ["available"]) { name quantity }
      } } } }
    } }
  }
}`;

const SET_M = `
mutation Set($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt reason referenceDocumentUri
      changes { name delta quantityAfterChange item { id } location { id } }
    }
    userErrors { field code message }
  }
}`;

// ─── Shopify variant reader (canonical shape) ──────────────────────────────
interface Snapshot {
  variantId: string; productId: string; sku: string;
  productTitle: string; variantTitle: string; productStatus: string;
  inventoryQuantity: number; tracked: boolean;
  inventoryItemId: string | null;
  levels: Array<{
    levelId: string; locationId: string; locationName: string; locationActive: boolean;
    available: number; onHand: number | null;
  }>;
}

function shapeVariant(node: any): Snapshot {
  const levels = (node?.inventoryItem?.inventoryLevels?.edges ?? []).map((e: any) => {
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

async function readVariant(gid: string): Promise<{ snap: Snapshot | null; status: number; errors: unknown }> {
  const r = await shopifyAdminFetch<any>(VARIANT_Q, { id: gid });
  if (r.status !== 200 || r.errors) return { snap: null, status: r.status, errors: r.errors };
  return { snap: shapeVariant(r.data?.productVariant), status: r.status, errors: null };
}

async function catalogueAggregate(): Promise<{
  totalVariants: number; withStock: number; zeroStock: number; totalAvailable: number;
  pages: number; skuOccurrences: number;
}> {
  let cursor: string | null = null;
  let pages = 0, total = 0, withStock = 0, zero = 0, totalAvail = 0, skuOcc = 0;
  while (true) {
    const r = await shopifyAdminFetch<any>(AGG_Q, { cursor });
    pages += 1;
    if (r.status !== 200 || r.errors) break;
    const conn = r.data?.productVariants;
    for (const e of conn?.edges ?? []) {
      const v = e.node;
      total += 1;
      if (String(v.sku ?? "").trim() === CANARY.sku) skuOcc += 1;
      let sum = 0;
      for (const le of v?.inventoryItem?.inventoryLevels?.edges ?? []) {
        const q = (le.node?.quantities ?? []).find((x: any) => x.name === "available")?.quantity ?? 0;
        sum += Number(q);
      }
      totalAvail += sum;
      if (sum > 0) withStock += 1; else zero += 1;
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    if (pages >= 20) break;
  }
  return { totalVariants: total, withStock, zeroStock: zero, totalAvailable: totalAvail, pages, skuOccurrences: skuOcc };
}

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = nowIso();
  const report: any = {
    ok: false,
    started_at: started,
    canary_identity: {
      variant_id: CANARY.variantId,
      inventory_item_id: CANARY.inventoryItemId,
      inventory_level_id: CANARY.inventoryLevelId,
      location_id: CANARY.locationId,
      sku: CANARY.sku,
      cj_pid: CANARY.cjPid,
      cj_vid: CANARY.cjVid,
    },
    counters: { shopify_mutations_performed: 0, cj_mutations_performed: 0, other_writes_performed: 0 },
    phases: {},
    status: "BLOCKED_PRECHECK",
    recommended_next_action: "Investigate preflight failure before any further recovery action.",
  };

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    if (body?.confirm !== "EXECUTE_SINGLE_CANARY") {
      report.status = "BLOCKED_PRECHECK";
      report.phases.pre = { error: 'Missing body { "confirm": "EXECUTE_SINGLE_CANARY" }' };
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 400 });
    }

    // ── FASE 1a: Shopify identity re-read ────────────────────────────────
    const preShop = await readVariant(CANARY.variantId);
    report.phases.shopify_preflight = { at: nowIso(), status: preShop.status, snapshot: preShop.snap, errors: preShop.errors };
    if (!preShop.snap) {
      report.phases.shopify_preflight.reason = "variant_not_readable";
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }
    const s = preShop.snap;
    const targetLevel = s.levels.find(matchesLevel);
    const identityChecks = {
      product_id: s.productId === CANARY.productId,
      variant_id: s.variantId === CANARY.variantId,
      sku_byte_equal: s.sku === CANARY.sku,
      inventory_item_id: s.inventoryItemId === CANARY.inventoryItemId,
      tracked: s.tracked === true,
      inventory_level_present: !!targetLevel,
      location_active: !!targetLevel?.locationActive,
      exactly_one_level_for_item: s.levels.length === 1,
    };
    report.phases.shopify_preflight.identity_checks = identityChecks;
    report.phases.shopify_preflight.target_level = targetLevel ?? null;
    if (Object.values(identityChecks).some((v) => v !== true)) {
      report.phases.shopify_preflight.reason = "identity_mismatch";
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }

    // ── FASE 1b: SKU uniqueness across catalogue + pre-aggregate ─────────
    const preAgg = await catalogueAggregate();
    report.phases.pre_aggregate = { at: nowIso(), ...preAgg };
    if (preAgg.skuOccurrences !== 1) {
      report.phases.pre_aggregate.reason = "sku_not_unique";
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }

    // ── FASE 1c: CJ live re-read ─────────────────────────────────────────
    const { token, status: cjAuthStatus } = await cjToken();
    const cjProd = await cjGet(`/product/query?pid=${encodeURIComponent(CANARY.cjPid)}`, token);
    const cjStock = await cjGet(`/product/stock/queryBySku?sku=${encodeURIComponent(CANARY.sku)}`, token);
    const pd = cjProd.body?.data;
    const variants: any[] = Array.isArray(pd?.variants) ? pd.variants : [];
    const cjMatch = variants.find((v) => String(v?.vid ?? "") === CANARY.cjVid);
    const stockAreas: any[] = Array.isArray(cjStock.body?.data) ? cjStock.body.data : [];
    const stockTotal = stockAreas.reduce((a, w) => a + Number(w?.totalInventoryNum ?? 0), 0);
    const cjChecks = {
      auth_ok: cjAuthStatus === 200,
      product_query_ok: cjProd.status === 200,
      stock_query_ok: cjStock.status === 200,
      pid_match: String(pd?.pid ?? "") === CANARY.cjPid,
      vid_match: !!cjMatch,
      variant_sku_byte_equal: String(cjMatch?.variantSku ?? "") === CANARY.sku,
      product_status_active_like: /(3|active|上架|on ?sale|onsell)/i.test(String(pd?.status ?? pd?.productStatus ?? "")),
      stock_gt_zero: stockTotal > 0,
    };
    report.phases.cj_preflight = {
      at: nowIso(), checks: cjChecks, stock_total: stockTotal,
      warehouses: stockAreas.map((a) => ({
        area_id: a?.areaId ?? null, country_code: a?.countryCode ?? null,
        area_en: a?.areaEn ?? a?.countryNameEn ?? null,
        stock: Number(a?.totalInventoryNum ?? 0),
      })),
      product_name: pd?.productNameEn ?? pd?.productName ?? null,
      variant_name: cjMatch?.variantNameEn ?? cjMatch?.variantName ?? null,
      product_status_raw: pd?.status ?? pd?.productStatus ?? null,
    };
    if (Object.values(cjChecks).some((v) => v !== true)) {
      report.phases.cj_preflight.reason = "cj_identity_or_stock_mismatch";
      return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
    }

    // ── FASE 2: pick 2 control variants + snapshot ───────────────────────
    const controlSweep = await shopifyAdminFetch<any>(AGG_Q, { cursor: null });
    const controlIds: string[] = [];
    for (const e of controlSweep.data?.productVariants?.edges ?? []) {
      const id = String(e.node?.id ?? "");
      if (id && id !== CANARY.variantId) controlIds.push(id);
      if (controlIds.length >= 2) break;
    }
    const controlsPre: any[] = [];
    for (const id of controlIds) {
      const r = await readVariant(id);
      controlsPre.push({ id, snap: r.snap });
    }
    report.phases.controls_pre = controlsPre;

    // ── FASE 3: SINGLE Shopify mutation ──────────────────────────────────
    const previousAvailable = targetLevel?.available ?? 0;
    const mutInput = {
      reason: "correction",
      name: "available",
      referenceDocumentUri: CANARY.referenceUri,
      quantities: [{
        inventoryItemId: CANARY.inventoryItemId,
        locationId: CANARY.locationId,
        quantity: CANARY.targetAvailable,
        compareQuantity: previousAvailable,
      }],
    };
    const mut = await shopifyAdminFetch<any>(SET_M, { input: mutInput });
    report.counters.shopify_mutations_performed = 1;
    const userErrors = mut.data?.inventorySetQuantities?.userErrors ?? [];
    const changes = mut.data?.inventorySetQuantities?.inventoryAdjustmentGroup?.changes ?? [];
    report.phases.mutation = {
      at: nowIso(),
      http_status: mut.status,
      graphql_errors: mut.errors ?? null,
      user_errors: userErrors,
      changes,
      previous_available: targetLevel?.available ?? null,
      previous_on_hand: targetLevel?.onHand ?? null,
      target_available: CANARY.targetAvailable,
      reason: "Bounded canary quantity=1 to prove single write chain without publishing full CJ stock (460).",
    };

    const mutationFailed = mut.status !== 200 || (mut.errors && (Array.isArray(mut.errors) ? mut.errors.length : true)) || userErrors.length > 0;

    // ── FASE 4: read-back 1 + read-back 2 ────────────────────────────────
    const rb1 = await readVariant(CANARY.variantId);
    await sleep(1500);
    const rb2 = await readVariant(CANARY.variantId);
    const rbLevel1 = rb1.snap?.levels.find(matchesLevel) ?? null;
    const rbLevel2 = rb2.snap?.levels.find(matchesLevel) ?? null;
    report.phases.readback_1 = { at: nowIso(), snapshot: rb1.snap, target_level: rbLevel1 };
    report.phases.readback_2 = { at: nowIso(), snapshot: rb2.snap, target_level: rbLevel2 };

    const readbackOk =
      !!rb1.snap && !!rb2.snap &&
      rb1.snap.variantId === CANARY.variantId &&
      rb1.snap.sku === CANARY.sku &&
      rb1.snap.tracked === true &&
      rbLevel1?.available === CANARY.targetAvailable &&
      rbLevel2?.available === CANARY.targetAvailable &&
      rb1.snap.inventoryQuantity === CANARY.targetAvailable &&
      rb2.snap.inventoryQuantity === CANARY.targetAvailable &&
      rb1.snap.levels.reduce((a, l) => a + l.available, 0) === CANARY.targetAvailable;

    // ── FASE 5: blast radius ─────────────────────────────────────────────
    const postAgg = await catalogueAggregate();
    report.phases.post_aggregate = { at: nowIso(), ...postAgg };
    const controlsPost: any[] = [];
    for (const id of controlIds) {
      const r = await readVariant(id);
      controlsPost.push({ id, snap: r.snap });
    }
    report.phases.controls_post = controlsPost;
    const controlsUnchanged = controlsPre.every((pre, i) => {
      const post = controlsPost[i]?.snap; const prev = pre.snap;
      if (!post || !prev) return false;
      if (post.inventoryQuantity !== prev.inventoryQuantity) return false;
      const sumPre = prev.levels.reduce((a: number, l: any) => a + l.available, 0);
      const sumPost = post.levels.reduce((a: number, l: any) => a + l.available, 0);
      return sumPre === sumPost;
    });
    const aggregateOk =
      postAgg.totalVariants === preAgg.totalVariants &&
      postAgg.totalAvailable === preAgg.totalAvailable + CANARY.targetAvailable &&
      postAgg.withStock === preAgg.withStock + 1 &&
      postAgg.zeroStock === preAgg.zeroStock - 1;
    report.phases.blast_radius = { controls_unchanged: controlsUnchanged, aggregate_ok: aggregateOk };

    // ── FASE 6: rollback decisioning ─────────────────────────────────────
    const needRollback = mutationFailed || !readbackOk || !aggregateOk || !controlsUnchanged;
    if (needRollback) {
      // Best-effort read to obtain the current compareQuantity for rollback.
      const preRb = await readVariant(CANARY.variantId);
      const preRbLevel = preRb.snap?.levels.find(matchesLevel) ?? null;
      const rbMut = await shopifyAdminFetch<any>(SET_M, {
        input: {
          reason: "correction",
          name: "available",
          referenceDocumentUri: CANARY.referenceUri + "#rollback",
          quantities: [{
            inventoryItemId: CANARY.inventoryItemId,
            locationId: CANARY.locationId,
            quantity: CANARY.rollbackAvailable,
            compareQuantity: preRbLevel?.available ?? CANARY.targetAvailable,
          }],
        },
      });
      report.counters.shopify_mutations_performed += 1;
      const rbErrors = rbMut.data?.inventorySetQuantities?.userErrors ?? [];
      await sleep(1500);
      const verify = await readVariant(CANARY.variantId);
      const verifyLevel = verify.snap?.levels.find(matchesLevel) ?? null;
      const verifyAgg = await catalogueAggregate();
      const rollbackVerified =
        rbMut.status === 200 && rbErrors.length === 0 &&
        verifyLevel?.available === CANARY.rollbackAvailable &&
        verify.snap?.inventoryQuantity === CANARY.rollbackAvailable &&
        verifyAgg.totalAvailable === preAgg.totalAvailable &&
        verifyAgg.withStock === preAgg.withStock &&
        verifyAgg.zeroStock === preAgg.zeroStock;
      report.phases.rollback = {
        at: nowIso(),
        http_status: rbMut.status,
        user_errors: rbErrors,
        verify_snapshot: verify.snap,
        verify_level: verifyLevel,
        verify_aggregate: verifyAgg,
        verified: rollbackVerified,
      };
      report.status = !aggregateOk || !controlsUnchanged
        ? (rollbackVerified ? "FAILED_BLAST_RADIUS" : "FAILED_ROLLBACK_UNVERIFIED")
        : rollbackVerified ? "FAILED_ROLLED_BACK" : "FAILED_ROLLBACK_UNVERIFIED";
      report.recommended_next_action = rollbackVerified
        ? "Investigate the anomaly reported in phases.mutation / phases.blast_radius before re-attempting the canary. No further recovery until root cause is understood."
        : "URGENT: rollback could not be verified. Manually inspect InventoryLevel " + CANARY.inventoryLevelId + " in Shopify Admin before any further action.";
    } else {
      report.status = "CANARY_SUCCESS";
      report.recommended_next_action =
        "Stop. Do not scale to any second variant. Await explicit human GO to design a batched inventory sync policy (safety margin, reservation buffer, cadence) before touching more variants.";
    }

    report.ok = true;
    report.finished_at = nowIso();
    return new Response(JSON.stringify(report), { headers: corsHeaders, status: 200 });
  } catch (e: any) {
    report.error = String(e?.message ?? e);
    report.finished_at = nowIso();
    return new Response(JSON.stringify(report), { headers: corsHeaders, status: 500 });
  }
});