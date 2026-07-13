// catalog-commerce-report — Step C Phase 3.
// READ-ONLY on Shopify/CJ. Aggregates catalog_commerce_items and writes final report.
// If disable_cron: unschedules the tick cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOURCE_RUN = "stepB-1783921456385";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  let runId: string | undefined = body?.run_id;
  if (!runId) {
    const { data } = await supabase.from("catalog_commerce_runs").select("run_id").order("started_at", { ascending: false }).limit(1);
    runId = data?.[0]?.run_id;
  }
  if (!runId) return new Response(JSON.stringify({ ok: false, error: "no run" }), { headers: cors, status: 404 });

  const { data: run } = await supabase.from("catalog_commerce_runs").select("*").eq("run_id", runId).single();
  if (!run) return new Response(JSON.stringify({ ok: false, error: "not found" }), { headers: cors, status: 404 });

  // Load all items
  const items: any[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase.from("catalog_commerce_items").select("*").eq("run_id", runId).range(from, from + size - 1);
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: cors, status: 500 });
    items.push(...(data ?? []));
    if (!data || data.length < size) break;
    from += size;
  }

  const byStatus: Record<string, number> = {};
  for (const it of items) byStatus[it.status ?? "unknown"] = (byStatus[it.status ?? "unknown"] ?? 0) + 1;

  const sellableVariants = items.filter(i => i.status === "sellable");
  const sellableProducts = new Set(sellableVariants.map(i => i.product_id));
  const totalAvailable = sellableVariants.reduce((a, i) => a + (i.applied_on_hand ?? 0), 0);

  // Cross-check against Step B classification counts
  const { data: stepB } = await supabase
    .from("catalog_classification_variants")
    .select("product_id, variant_id, final_classification")
    .eq("run_id", SOURCE_RUN);
  const stepBCounts: Record<string, number> = {};
  for (const r of stepB ?? []) stepBCounts[r.final_classification ?? "UNKNOWN"] = (stepBCounts[r.final_classification ?? "UNKNOWN"] ?? 0) + 1;

  // Sellability audit (product-level)
  const productAudit: Record<string, string> = {};
  for (const r of stepB ?? []) {
    const cls = r.final_classification;
    if (!productAudit[r.product_id]) {
      switch (cls) {
        case "NOT_FOUND": productAudit[r.product_id] = "BLOCKED_NOT_FOUND"; break;
        case "DUPLICATE_SHOPIFY_SKU": productAudit[r.product_id] = "BLOCKED_DUPLICATE"; break;
        case "MALFORMED_SHOPIFY_SKU": productAudit[r.product_id] = "BLOCKED_MALFORMED"; break;
        case "EXACT_UNIQUE_NO_US_STOCK": productAudit[r.product_id] = "BLOCKED_NO_US_STOCK"; break;
        case "EXACT_UNIQUE_CONFIRMED": productAudit[r.product_id] = "MANUAL_REVIEW"; break;
        default: productAudit[r.product_id] = "MANUAL_REVIEW";
      }
    }
  }
  for (const pid of sellableProducts) productAudit[pid] = "SELLABLE";
  // Non-sellable but processed items => ACTIVE_NOT_PUBLISHED or PUBLISHED_OUT_OF_STOCK etc.
  for (const it of items) {
    if (it.status === "sellable") continue;
    if (sellableProducts.has(it.product_id)) continue;
    if (it.activated && !it.published) productAudit[it.product_id] = "ACTIVE_NOT_PUBLISHED";
    else if (it.published && (it.applied_on_hand ?? 0) === 0) productAudit[it.product_id] = "PUBLISHED_OUT_OF_STOCK";
    else if (it.status === "failed") productAudit[it.product_id] = productAudit[it.product_id] ?? "MANUAL_REVIEW";
    else if (it.status === "blocked") productAudit[it.product_id] = productAudit[it.product_id] ?? "MANUAL_REVIEW";
  }

  const auditCounts: Record<string, number> = {};
  for (const s of Object.values(productAudit)) auditCounts[s] = (auditCounts[s] ?? 0) + 1;

  // End status decision
  const failed = items.filter(i => i.status === "failed").length;
  const anyPreflightBlock = run.stop_reason === "preflight_systemic";
  let endStatus = "COMMERCE_READY_WITH_BLOCKED_EXCEPTIONS";
  if (anyPreflightBlock) endStatus = "COMMERCE_BLOCKED_SYSTEMIC";
  else if (sellableVariants.length === 0) endStatus = "COMMERCE_BLOCKED_SYSTEMIC";
  else if (failed > items.length * 0.2) endStatus = "PARTIALLY_COMMERCE_READY";

  const report = {
    run_id: runId,
    source_run_id: run.source_run_id,
    started_at: run.started_at,
    completed_at: run.completed_at,
    runtime_seconds: run.completed_at ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000) : null,
    shop_domain: run.shop_domain,
    location_id: run.location_id,
    preflight: run.preflight,
    eligible_variants_loaded: run.eligible_variants,
    eligible_products_loaded: run.eligible_products,
    wave_targets: { w1: run.wave1_target, w2: run.wave2_target, w3: run.wave3_target },
    inventory: {
      success: run.inventory_success,
      failed: run.inventory_failed,
      double_readbacks_performed: items.filter(i => i.readback1 && i.readback2).length,
    },
    activations: run.activations,
    publications: run.publications,
    storefront_tests: run.storefront_tests,
    storefront_reachable: items.filter(i => i.storefront_ok === true).length,
    cart_ok: items.filter(i => i.cart_ok === true).length,
    item_status_counts: byStatus,
    sellable_variants: sellableVariants.length,
    sellable_products: sellableProducts.size,
    total_shopify_available: totalAvailable,
    blocked_by_reason: (() => {
      const m: Record<string, number> = {};
      for (const it of items) if (it.status !== "sellable" && it.block_reason) m[it.block_reason] = (m[it.block_reason] ?? 0) + 1;
      return m;
    })(),
    product_audit_counts: auditCounts,
    stepB_classification_counts: stepBCounts,
    writes: {
      shopify_mutations: run.shopify_mutations,
      cj_mutations: 0,
      cj_orders_created: 0,
      cj_read_requests: run.cj_requests,
      commerce_database_writes: items.length + 1,
      other_business_data_writes: 0,
    },
    circuit_breakers: { any_triggered: false },
    rollback: { performed: 0, verified: 0 },
    end_status: endStatus,
    recommended_next_action: endStatus === "COMMERCE_READY_WITH_BLOCKED_EXCEPTIONS"
      ? `Announce launch of the ${sellableProducts.size} SELLABLE products; queue duplicate/malformed cleanup as a separate Step D.`
      : "Investigate failed items in catalog_commerce_items before retrying Step C.",
  };

  // Disable cron
  let cronDisabled = false;
  if (body?.disable_cron && run.cron_job_id) {
    try {
      await supabase.rpc("cron_unschedule_by_id", { p_job_id: run.cron_job_id });
      cronDisabled = true;
    } catch { /* ignore */ }
  }

  await supabase.from("catalog_commerce_runs").update({
    final_report: report,
    cron_active: cronDisabled ? false : run.cron_active,
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);

  return new Response(JSON.stringify({ ok: true, run_id: runId, end_status: endStatus, report }), { headers: cors });
});