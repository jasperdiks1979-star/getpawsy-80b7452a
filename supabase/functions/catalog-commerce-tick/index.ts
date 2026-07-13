// catalog-commerce-tick — Step C Phase 2.
// Processes bounded batch of pending items for the active Step C run:
// - Live CJ revalidate
// - Recompute target with safety caps
// - Shopify inventorySetOnHandQuantities
// - Two read-backs 2s apart
// - Product activation (if DRAFT) + Online Store publish
// - Storefront reachability check
// When all items processed for the run, invokes catalog-commerce-report and disables cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
const MAX_ITEMS_PER_TICK = 6;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const t0 = Date.now();

  const { data: runs } = await supabase
    .from("catalog_commerce_runs")
    .select("*")
    .in("status", ["ready", "running"])
    .order("started_at", { ascending: false })
    .limit(1);
  if (!runs || runs.length === 0) return new Response(JSON.stringify({ ok: true, note: "no active run" }), { headers: cors });
  const run = runs[0];

  if (run.status === "ready") {
    await supabase.from("catalog_commerce_runs").update({ status: "running", updated_at: new Date().toISOString() }).eq("run_id", run.run_id);
  }

  // Cache online store publication id per tick
  const publicationId = await getOnlineStorePublicationId();

  let processed = 0;
  let cjReq = 0;
  let shopMutations = 0;
  let invOk = 0, invFail = 0, acts = 0, pubs = 0, sfTests = 0;

  // Process items in current wave first
  for (let w = run.current_wave; w <= 3; w++) {
    if (Date.now() - t0 > MAX_WALL_MS) break;
    const { data: pending } = await supabase
      .from("catalog_commerce_items")
      .select("*")
      .eq("run_id", run.run_id)
      .eq("wave", w)
      .eq("status", "pending")
      .lt("retries", 3)
      .order("created_at", { ascending: true })
      .limit(MAX_ITEMS_PER_TICK);
    if (!pending || pending.length === 0) {
      // Wave empty — check if all items in this wave are terminal, then advance
      const { count: stillPending } = await supabase.from("catalog_commerce_items").select("id", { count: "exact", head: true }).eq("run_id", run.run_id).eq("wave", w).eq("status", "pending");
      if ((stillPending ?? 0) === 0 && w < 3) {
        await supabase.from("catalog_commerce_runs").update({ current_wave: w + 1, phase: `wave${w + 1}`, updated_at: new Date().toISOString() }).eq("run_id", run.run_id);
        continue;
      }
      break;
    }

    for (const item of pending) {
      if (Date.now() - t0 > MAX_WALL_MS) break;
      processed++;
      const upd: any = { updated_at: new Date().toISOString(), processed_at: new Date().toISOString() };
      try {
        // 1) CJ revalidate
        const cj = await revalidateCj(item.sku, item.cj_pid, item.cj_vid);
        cjReq += cj.requests;
        upd.cj_us_stock_live = cj.usStock;
        upd.cj_status_live = cj.status;
        if (!cj.ok) {
          upd.status = "blocked"; upd.block_reason = `cj_${cj.err ?? "invalid"}`;
          await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
          continue;
        }

        // 2) Recompute target
        const target = targetFromUs(cj.usStock, item.target_on_hand ?? 0);
        upd.target_on_hand = target;
        if (target <= 0) {
          upd.status = "blocked"; upd.block_reason = "target_zero_after_revalidate";
          await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
          continue;
        }

        // 3) Read previous
        const prev = await readInventoryLevel(item.inventory_item_id, item.location_id);
        upd.previous_on_hand = prev.onHand;
        upd.previous_available = prev.available;
        if (prev.sku && prev.sku !== item.sku) {
          upd.status = "blocked"; upd.block_reason = `sku_drift:${prev.sku}`;
          await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
          continue;
        }

        // 4) inventorySetOnHandQuantities
        const mut = await setOnHand(item.inventory_item_id, item.location_id, target, prev.onHand ?? 0, `stepC:${run.run_id}:${item.variant_id}`);
        shopMutations++;
        if (!mut.ok) {
          upd.status = "failed"; upd.block_reason = "inventory_mutation_error";
          upd.last_error = JSON.stringify({ userErrors: mut.userErrors, errors: mut.errors }).slice(0, 500);
          upd.retries = (item.retries ?? 0) + 1;
          invFail++;
          await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
          continue;
        }

        // 5) Read-back 1
        const rb1 = await readInventoryLevel(item.inventory_item_id, item.location_id);
        upd.readback1 = rb1;
        await sleep(2100);
        // 6) Read-back 2
        const rb2 = await readInventoryLevel(item.inventory_item_id, item.location_id);
        upd.readback2 = rb2;
        upd.applied_on_hand = rb2.onHand;
        if (rb1.onHand !== target || rb2.onHand !== target) {
          upd.status = "failed"; upd.block_reason = "readback_mismatch"; invFail++;
          await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
          continue;
        }
        invOk++;

        // 7) Product activation + publish (idempotent — only if needed)
        const prod = await fetchProductBasics(item.product_id);
        let activated = false, published = false;
        if (prod) {
          const hasImage = !!prod.featuredImage?.url;
          const priceOk = (prod.variants?.nodes ?? []).some((vv: any) => Number(vv.price ?? 0) > 0);
          const canActivate = hasImage && priceOk && !!prod.title;
          if (prod.status !== "ACTIVE" && canActivate) {
            const act = await activateProduct(item.product_id);
            shopMutations++;
            activated = act.ok && act.status === "ACTIVE";
            if (activated) acts++;
          } else if (prod.status === "ACTIVE") {
            activated = true;
          }

          if (activated && publicationId) {
            const pub = await publishToOnlineStore(item.product_id, publicationId);
            shopMutations++;
            published = pub.ok;
            if (published) pubs++;
          }
        }
        upd.activated = activated;
        upd.published = published;

        // 8) Storefront reachability
        if (published && prod?.handle) {
          const sf = await storefrontProductCheck(prod.handle);
          upd.storefront_ok = sf.reachable;
          upd.cart_ok = sf.hasAddToCart;
          sfTests++;
        }

        upd.status = (invOk && activated && published) ? "sellable" : "partial";
        await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
      } catch (e) {
        upd.status = "failed";
        upd.last_error = String((e as Error).message).slice(0, 400);
        upd.retries = (item.retries ?? 0) + 1;
        invFail++;
        await supabase.from("catalog_commerce_items").update(upd).eq("id", item.id);
      }
    }
    break; // one wave slice per tick
  }

  // Aggregate counters
  const { count: totalItems } = await supabase.from("catalog_commerce_items").select("id", { count: "exact", head: true }).eq("run_id", run.run_id);
  const { count: doneItems } = await supabase.from("catalog_commerce_items").select("id", { count: "exact", head: true }).eq("run_id", run.run_id).not("status", "in", "(pending)");

  const allDone = (totalItems ?? 0) > 0 && (doneItems ?? 0) >= (totalItems ?? 0);

  await supabase.from("catalog_commerce_runs").update({
    inventory_success: (run.inventory_success ?? 0) + invOk,
    inventory_failed: (run.inventory_failed ?? 0) + invFail,
    activations: (run.activations ?? 0) + acts,
    publications: (run.publications ?? 0) + pubs,
    storefront_tests: (run.storefront_tests ?? 0) + sfTests,
    shopify_mutations: (run.shopify_mutations ?? 0) + shopMutations,
    cj_requests: (run.cj_requests ?? 0) + cjReq,
    status: allDone ? "commerce_complete" : "running",
    phase: allDone ? "report_pending" : run.phase,
    completed_at: allDone ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("run_id", run.run_id);

  if (allDone) {
    try {
      const url = `${SUPABASE_URL}/functions/v1/catalog-commerce-report`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "", "Authorization": `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ run_id: run.run_id, disable_cron: true }),
      });
    } catch { /* best-effort */ }
  }

  return new Response(JSON.stringify({ ok: true, run_id: run.run_id, processed, invOk, invFail, acts, pubs, sfTests, cjReq, shopMutations, elapsed_ms: Date.now() - t0, done: allDone, total: totalItems, complete: doneItems }), { headers: cors });
});