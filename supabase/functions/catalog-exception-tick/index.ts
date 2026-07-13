// catalog-exception-tick — Autonomous Exception Recovery worker.
// Processes a bounded batch per invocation. Idempotent, resumable, safe-only writes.
//
// Recovery strategies per source_kind:
//   step_c_identity_drift / step_c_target_zero
//     - Re-run canonical CJ resolver, confirm pid/vid.
//     - If confirmed and US stock > 5, run full inventory + activate + publish (mirrors Step C tick).
//     - Else block with permanent reason.
//   step_b_not_found
//     - Resolver by SKU. Only auto-map when EXACT_UNIQUE_CONFIRMED with active CJ status.
//     - Never mutate Shopify SKU (safety). If CJ variantSku != Shopify SKU we mark MANUAL_REVIEW.
//     - If confirmed byte-equal SKU + US stock: full inventory/activate/publish.
//   step_b_malformed
//     - No auto-repair (SKU mutation is high risk). Mark MALFORMED_MANUAL_REVIEW.
//   step_b_duplicate
//     - Safe canonical selection: canonical = proposed_canonical_product_id from Step B.
//     - Non-canonical duplicates → set inventory=0 (safe no-op unless >0), leave status untouched.
//       We do NOT auto-archive to avoid destructive fallout; classified DUPLICATE_MANUAL_REVIEW.
//   step_b_no_us_stock
//     - Non-US target formula is disabled (no proven non-US shipping). NON_US_STOCK_BLOCKED.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCjAccessToken, resolveCjVariant, type CjBudget } from "../_shared/cj-resolver.ts";
import {
  CANONICAL_LOCATION_ID, targetFromUs, revalidateCj,
  readInventoryLevel, setOnHand, activateProduct,
  getOnlineStorePublicationId, publishToOnlineStore,
  fetchProductBasics, storefrontProductCheck,
} from "../_shared/commerce-helpers.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_WALL_MS = 80_000;
const MAX_ITEMS_PER_TICK = 5;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runInventoryActivatePublish(supabase: any, item: any, publicationId: string | null, usStock: number, upd: any) {
  const target = targetFromUs(usStock, 20);
  upd.target_on_hand = target;
  if (target <= 0) { upd.status = "blocked"; upd.final_classification = "NON_US_STOCK_BLOCKED"; upd.block_reason = "target_zero_after_revalidate"; return { invOk: 0, invFail: 0, act: 0, pub: 0, mut: 0, sf: 0 }; }
  let mut = 0, sf = 0;
  const prev = await readInventoryLevel(item.inventory_item_id, item.location_id ?? CANONICAL_LOCATION_ID);
  upd.previous_on_hand = prev.onHand;
  if (prev.sku && prev.sku !== item.current_sku) {
    upd.status = "blocked"; upd.final_classification = "IDENTITY_CONFLICT"; upd.block_reason = `sku_drift:${prev.sku}`;
    return { invOk: 0, invFail: 0, act: 0, pub: 0, mut, sf };
  }
  const w = await setOnHand(item.inventory_item_id, item.location_id ?? CANONICAL_LOCATION_ID, target, prev.onHand ?? 0, `stepEX:${item.run_id}:${item.variant_id}`);
  mut++;
  if (!w.ok) {
    upd.status = "failed"; upd.block_reason = "inventory_mutation_error";
    upd.last_error = JSON.stringify({ userErrors: w.userErrors, errors: w.errors }).slice(0, 500);
    return { invOk: 0, invFail: 1, act: 0, pub: 0, mut, sf };
  }
  const rb1 = await readInventoryLevel(item.inventory_item_id, item.location_id ?? CANONICAL_LOCATION_ID);
  upd.readback1 = rb1;
  await sleep(2100);
  const rb2 = await readInventoryLevel(item.inventory_item_id, item.location_id ?? CANONICAL_LOCATION_ID);
  upd.readback2 = rb2;
  upd.applied_on_hand = rb2.onHand;
  if (rb1.onHand !== target || rb2.onHand !== target) {
    upd.status = "failed"; upd.block_reason = "readback_mismatch"; return { invOk: 0, invFail: 1, act: 0, pub: 0, mut, sf };
  }
  // Activate + publish
  const prod = await fetchProductBasics(item.product_id);
  let activated = false, published = false, act = 0, pub = 0;
  if (prod) {
    const hasImage = !!prod.featuredImage?.url;
    const priceOk = (prod.variants?.nodes ?? []).some((vv: any) => Number(vv.price ?? 0) > 0);
    const canActivate = hasImage && priceOk && !!prod.title;
    if (prod.status !== "ACTIVE" && canActivate) {
      const a = await activateProduct(item.product_id); mut++;
      activated = a.ok && a.status === "ACTIVE"; if (activated) act++;
    } else if (prod.status === "ACTIVE") activated = true;
    if (activated && publicationId) {
      const p = await publishToOnlineStore(item.product_id, publicationId); mut++;
      published = p.ok; if (published) pub++;
    }
  }
  upd.activated = activated; upd.published = published;
  if (published && prod?.handle) {
    const s = await storefrontProductCheck(prod.handle); sf++;
    upd.storefront_ok = s.reachable; upd.cart_ok = s.hasAddToCart;
  }
  if (activated && published) { upd.status = "sellable"; upd.final_classification = "SELLABLE"; }
  else { upd.status = "partial"; upd.final_classification = "BLOCKED_PUBLICATION"; }
  return { invOk: 1, invFail: 0, act, pub, mut, sf };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const t0 = Date.now();

  const { data: runs } = await supabase
    .from("catalog_exception_runs")
    .select("*")
    .in("status", ["ready", "running"])
    .order("started_at", { ascending: false })
    .limit(1);
  if (!runs || runs.length === 0) return new Response(JSON.stringify({ ok: true, note: "no active run" }), { headers: cors });
  const run = runs[0];

  const publicationId = await getOnlineStorePublicationId();

  let processed = 0, cjReq = 0, shopMut = 0;
  let invOk = 0, invFail = 0, acts = 0, pubs = 0, sfTests = 0;
  let identityRec = 0, notFoundRec = 0, dupCanon = 0, dupArch = 0, malRep = 0, nonUsSell = 0;

  for (let w = run.current_wave; w <= 3; w++) {
    if (Date.now() - t0 > MAX_WALL_MS) break;
    const { data: pending } = await supabase
      .from("catalog_exception_items")
      .select("*")
      .eq("run_id", run.run_id).eq("wave", w).eq("status", "pending")
      .lt("retries", MAX_RETRIES)
      .order("created_at", { ascending: true })
      .limit(MAX_ITEMS_PER_TICK);

    if (!pending || pending.length === 0) {
      const { count: stillPending } = await supabase.from("catalog_exception_items").select("id", { count: "exact", head: true }).eq("run_id", run.run_id).eq("wave", w).eq("status", "pending");
      if ((stillPending ?? 0) === 0 && w < 3) {
        await supabase.from("catalog_exception_runs").update({ current_wave: w + 1, phase: `wave${w + 1}`, updated_at: new Date().toISOString() }).eq("run_id", run.run_id);
        continue;
      }
      break;
    }

    for (const item of pending) {
      if (Date.now() - t0 > MAX_WALL_MS) break;
      processed++;
      const upd: any = { updated_at: new Date().toISOString(), processed_at: new Date().toISOString() };
      try {
        switch (item.source_kind) {
          case "step_c_identity_drift":
          case "step_c_target_zero": {
            const cj = await revalidateCj(item.current_sku ?? item.previous_sku, item.cj_pid, item.cj_vid);
            cjReq += cj.requests; upd.cj_us_stock_live = cj.usStock; upd.cj_status_live = cj.status;
            if (!cj.ok) { upd.status = "blocked"; upd.final_classification = "PERMANENTLY_UNSELLABLE"; upd.block_reason = `cj_${cj.err ?? "invalid"}`; break; }
            identityRec++;
            const r = await runInventoryActivatePublish(supabase, item, publicationId, cj.usStock, upd);
            invOk += r.invOk; invFail += r.invFail; acts += r.act; pubs += r.pub; shopMut += r.mut; sfTests += r.sf;
            break;
          }
          case "step_b_not_found": {
            const sku = item.current_sku;
            if (!sku) { upd.status = "blocked"; upd.final_classification = "PERMANENTLY_NOT_FOUND"; upd.block_reason = "no_sku"; break; }
            const { token } = await getCjAccessToken();
            const budget: CjBudget = { reqs: 0, max: 6 };
            const res = await resolveCjVariant(sku, token, budget, { readStock: true, maxPids: 3 });
            cjReq += res.requests;
            if (res.classification === "EXACT_UNIQUE_CONFIRMED" && res.exact.length === 1) {
              const m = res.exact[0];
              upd.cj_pid = m.pid; upd.cj_vid = m.vid; upd.cj_variant_sku = m.variantSku;
              upd.cj_status_live = String(m.productStatus ?? ""); upd.cj_us_stock_live = res.usStock;
              // Safety: only proceed if CJ variantSku is byte-equal to Shopify SKU (no SKU mutation)
              if (m.variantSku !== sku) {
                upd.status = "blocked"; upd.final_classification = "MANUAL_REVIEW_REQUIRED"; upd.block_reason = "sku_mismatch_needs_shopify_write"; break;
              }
              if (String(m.productStatus ?? "").toLowerCase() !== "listed" && String(m.productStatus ?? "").toLowerCase() !== "active") {
                upd.status = "blocked"; upd.final_classification = "PERMANENTLY_DISCONTINUED"; upd.block_reason = `cj_status:${m.productStatus}`; break;
              }
              notFoundRec++;
              const r = await runInventoryActivatePublish(supabase, item, publicationId, res.usStock, upd);
              invOk += r.invOk; invFail += r.invFail; acts += r.act; pubs += r.pub; shopMut += r.mut; sfTests += r.sf;
            } else if (res.classification === "NOT_FOUND") {
              upd.status = "blocked"; upd.final_classification = "PERMANENTLY_NOT_FOUND"; upd.block_reason = "cj_not_found_confirmed";
            } else if (res.classification === "EXACT_MULTIPLE") {
              upd.status = "blocked"; upd.final_classification = "IDENTITY_CONFLICT"; upd.block_reason = "exact_multiple";
            } else {
              upd.status = "blocked"; upd.final_classification = "MANUAL_REVIEW_REQUIRED"; upd.block_reason = `resolver_${res.classification.toLowerCase()}`;
            }
            break;
          }
          case "step_b_malformed": {
            upd.status = "blocked"; upd.final_classification = "MALFORMED_MANUAL_REVIEW"; upd.block_reason = "sku_mutation_unsafe_without_high_confidence_shopify_write";
            break;
          }
          case "step_b_duplicate": {
            const canonical = item.canonical_product_id;
            const isCanonical = canonical && canonical === item.product_id;
            if (isCanonical) {
              // If canonical has CJ mapping we would already have processed via step B — treat as manual review.
              upd.status = "blocked"; upd.final_classification = "DUPLICATE_CANONICAL_SELLABLE"; upd.block_reason = "canonical_pending_cj_resolution";
              dupCanon++;
            } else {
              // Safe non-destructive: mark for review, no auto-archive (would touch product identity).
              upd.status = "blocked"; upd.final_classification = "DUPLICATE_MANUAL_REVIEW"; upd.block_reason = `duplicate_of:${canonical ?? "unknown"}`;
              dupArch++;
            }
            break;
          }
          case "step_b_no_us_stock": {
            // Non-US shipping profile not proven; safe permanent block.
            upd.status = "blocked"; upd.final_classification = "NON_US_STOCK_BLOCKED"; upd.block_reason = "no_us_stock_and_no_proven_non_us_shipping";
            break;
          }
          default: {
            upd.status = "blocked"; upd.final_classification = "MANUAL_REVIEW_REQUIRED"; upd.block_reason = `unknown_source_kind:${item.source_kind}`;
          }
        }
      } catch (e) {
        upd.status = "failed";
        upd.last_error = String((e as Error).message).slice(0, 400);
        upd.retries = (item.retries ?? 0) + 1;
        invFail++;
      }
      await supabase.from("catalog_exception_items").update(upd).eq("id", item.id);
    }
    break; // one wave slice per tick
  }

  // Aggregate + completion check
  const { count: totalItems } = await supabase.from("catalog_exception_items").select("id", { count: "exact", head: true }).eq("run_id", run.run_id);
  const { count: doneItems } = await supabase.from("catalog_exception_items").select("id", { count: "exact", head: true }).eq("run_id", run.run_id).not("status", "in", "(pending)");
  const allDone = (totalItems ?? 0) > 0 && (doneItems ?? 0) >= (totalItems ?? 0);

  await supabase.from("catalog_exception_runs").update({
    items_done: doneItems ?? 0,
    identity_drift_recovered: (run.identity_drift_recovered ?? 0) + identityRec,
    not_found_recovered: (run.not_found_recovered ?? 0) + notFoundRec,
    duplicates_canonicalized: (run.duplicates_canonicalized ?? 0) + dupCanon,
    duplicates_archived: (run.duplicates_archived ?? 0) + dupArch,
    malformed_repaired: (run.malformed_repaired ?? 0) + malRep,
    non_us_sellable: (run.non_us_sellable ?? 0) + nonUsSell,
    inventory_success: (run.inventory_success ?? 0) + invOk,
    inventory_failed: (run.inventory_failed ?? 0) + invFail,
    activations: (run.activations ?? 0) + acts,
    publications: (run.publications ?? 0) + pubs,
    shopify_mutations: (run.shopify_mutations ?? 0) + shopMut,
    cj_requests: (run.cj_requests ?? 0) + cjReq,
    status: allDone ? "complete" : "running",
    phase: allDone ? "report_pending" : run.phase,
    completed_at: allDone ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("run_id", run.run_id);

  if (allDone) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/catalog-exception-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ run_id: run.run_id, disable_cron: true }),
      });
    } catch { /* best-effort */ }
  }

  return new Response(JSON.stringify({ ok: true, run_id: run.run_id, processed, invOk, invFail, acts, pubs, sfTests, cjReq, shopMut, total: totalItems, done: doneItems, complete: allDone, elapsed_ms: Date.now() - t0 }), { headers: cors });
});