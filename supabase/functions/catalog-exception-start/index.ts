// catalog-exception-start — Autonomous Exception Recovery mission bootstrap.
// Seeds catalog_exception_items from Step B unresolved + Step C blocked items,
// activates a temporary pg_cron ticker every 2 minutes, and triggers first tick.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const STEP_B = "stepB-1783921456385";
const STEP_C = "stepC-1783924943151";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Reuse if a live run already exists
  const { data: existing } = await supabase
    .from("catalog_exception_runs")
    .select("*")
    .in("status", ["ready", "running"])
    .order("started_at", { ascending: false })
    .limit(1);
  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ ok: true, reused: true, run_id: existing[0].run_id }), { headers: cors });
  }

  const runId = `stepEX-${Date.now()}`;
  await supabase.from("catalog_exception_runs").insert({
    run_id: runId, source_step_b_run: STEP_B, source_step_c_run: STEP_C,
    status: "ready", phase: "seed", current_wave: 1,
  });

  // ---- Seed items ----
  // 1) Step C blocked (cj_identity_drift, target_zero_after_revalidate)
  const { data: cBlocked } = await supabase
    .from("catalog_commerce_items")
    .select("product_id,variant_id,inventory_item_id,location_id,sku,cj_pid,cj_vid,cj_variant_sku,previous_on_hand,target_on_hand,block_reason")
    .eq("run_id", STEP_C)
    .eq("status", "blocked");

  // 2) Step B unresolved variant classifications
  const { data: bVars } = await supabase
    .from("catalog_classification_variants")
    .select("product_id,variant_id,inventory_item_id,location_id,sku,handle,product_title,product_status,published_to_online_store,cj_pid,cj_vid,cj_variant_sku,cj_product_status,final_classification,duplicate_group_key,duplicate_classification,proposed_canonical_product_id,malformed_reason,proposed_sku_correction,proposed_sku_auto_safe,us_stock,cn_stock,other_stock,proposed_target_available")
    .eq("run_id", STEP_B)
    .in("final_classification", ["NOT_FOUND", "DUPLICATE_SHOPIFY_SKU", "MALFORMED_SHOPIFY_SKU", "EXACT_UNIQUE_NO_US_STOCK"]);

  const seenVars = new Set<string>();
  const rows: any[] = [];

  for (const it of (cBlocked ?? [])) {
    if (!it.variant_id) continue;
    seenVars.add(it.variant_id);
    const kind = it.block_reason === "target_zero_after_revalidate" ? "step_c_target_zero" : "step_c_identity_drift";
    rows.push({
      run_id: runId, wave: 1, source_kind: kind, source_classification: it.block_reason,
      product_id: it.product_id, variant_id: it.variant_id,
      inventory_item_id: it.inventory_item_id, location_id: it.location_id,
      previous_sku: it.sku, current_sku: it.sku,
      cj_pid: it.cj_pid, cj_vid: it.cj_vid, cj_variant_sku: it.cj_variant_sku,
      previous_on_hand: it.previous_on_hand, target_on_hand: it.target_on_hand,
    });
  }

  for (const v of (bVars ?? [])) {
    if (!v.variant_id || seenVars.has(v.variant_id)) continue;
    seenVars.add(v.variant_id);
    let kind = "step_b_unknown";
    let wave = 2;
    switch (v.final_classification) {
      case "MALFORMED_SHOPIFY_SKU": kind = "step_b_malformed"; wave = 2; break;
      case "EXACT_UNIQUE_NO_US_STOCK": kind = "step_b_no_us_stock"; wave = 2; break;
      case "DUPLICATE_SHOPIFY_SKU": kind = "step_b_duplicate"; wave = 3; break;
      case "NOT_FOUND": kind = "step_b_not_found"; wave = 3; break;
    }
    rows.push({
      run_id: runId, wave, source_kind: kind, source_classification: v.final_classification,
      product_id: v.product_id, variant_id: v.variant_id,
      inventory_item_id: v.inventory_item_id, location_id: v.location_id,
      handle: v.handle, product_title: v.product_title,
      previous_sku: v.sku, current_sku: v.sku,
      previous_status: v.product_status, previous_published: v.published_to_online_store,
      cj_pid: v.cj_pid, cj_vid: v.cj_vid, cj_variant_sku: v.cj_variant_sku,
      cj_status_live: v.cj_product_status,
      duplicate_group_key: v.duplicate_group_key,
      canonical_product_id: v.proposed_canonical_product_id,
      proposed_sku: v.proposed_sku_correction,
      target_on_hand: v.proposed_target_available,
    });
  }

  // Batch insert
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    if (slice.length) await supabase.from("catalog_exception_items").insert(slice);
  }

  await supabase.from("catalog_exception_runs")
    .update({ items_total: rows.length, phase: "wave1", status: "running", updated_at: new Date().toISOString() })
    .eq("run_id", runId);

  const tickUrl = `${SUPABASE_URL}/functions/v1/catalog-exception-tick`;
  // Kick first tick immediately (fire-and-forget); cron is scheduled externally by mission operator.
  fetch(tickUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ triggered_by: "start" }),
  }).catch(() => {});

  return new Response(JSON.stringify({ ok: true, run_id: runId, seeded: rows.length }), { headers: cors });
});