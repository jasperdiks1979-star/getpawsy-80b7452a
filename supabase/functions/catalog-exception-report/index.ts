// catalog-exception-report — Writes final report to catalog_exception_runs.final_report
// and disables the temporary pg_cron ticker.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as any));
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: runs } = await supabase
    .from("catalog_exception_runs")
    .select("*")
    .eq("run_id", body.run_id ?? "")
    .limit(1);
  const run = runs?.[0];
  if (!run) {
    const { data: latest } = await supabase.from("catalog_exception_runs").select("*").order("started_at", { ascending: false }).limit(1);
    if (!latest || latest.length === 0) return new Response(JSON.stringify({ ok: false, error: "no run" }), { headers: cors, status: 404 });
    return new Response(JSON.stringify({ ok: true, report: latest[0].final_report ?? null }), { headers: cors });
  }

  // Aggregate final classifications
  const { data: items } = await supabase.from("catalog_exception_items")
    .select("final_classification,status,source_kind,block_reason,cart_ok,storefront_ok")
    .eq("run_id", run.run_id);

  const byFinal: Record<string, number> = {};
  const byBlock: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let sellable = 0, cartTests = 0, cartOk = 0;
  for (const it of items ?? []) {
    const fc = it.final_classification ?? it.status ?? "UNKNOWN";
    byFinal[fc] = (byFinal[fc] ?? 0) + 1;
    if (it.block_reason) byBlock[it.block_reason] = (byBlock[it.block_reason] ?? 0) + 1;
    bySource[it.source_kind] = (bySource[it.source_kind] ?? 0) + 1;
    if (it.status === "sellable") sellable++;
    if (it.storefront_ok !== null && it.storefront_ok !== undefined) cartTests++;
    if (it.cart_ok) cartOk++;
  }

  const totalBlocked = (items?.length ?? 0) - sellable;
  const permanentReasons = ["PERMANENTLY_NOT_FOUND", "PERMANENTLY_DISCONTINUED", "PERMANENTLY_REMOVED", "IDENTITY_CONFLICT", "NON_US_STOCK_BLOCKED", "PERMANENTLY_UNSELLABLE"];
  const manualReasons = ["MANUAL_REVIEW_REQUIRED", "MALFORMED_MANUAL_REVIEW", "DUPLICATE_MANUAL_REVIEW", "DUPLICATE_CANONICAL_SELLABLE"];
  const permanentCount = Object.entries(byFinal).filter(([k]) => permanentReasons.includes(k)).reduce((a, [, v]) => a + v, 0);
  const manualCount = Object.entries(byFinal).filter(([k]) => manualReasons.includes(k)).reduce((a, [, v]) => a + v, 0);

  let endStatus: string;
  if (run.circuit_breaker_triggered) endStatus = "RECOVERY_FAILED_ROLLED_BACK";
  else if (sellable > 0 && permanentCount + manualCount === totalBlocked) endStatus = "COMMERCE_READY_WITH_PERMANENT_EXCEPTIONS";
  else if (sellable > 0) endStatus = "PARTIALLY_COMMERCE_READY";
  else endStatus = "COMMERCE_BLOCKED_SYSTEMIC";

  const nextStep = manualCount > 0
    ? `Run manual-review flow for ${manualCount} items (duplicates/malformed/identity conflict) via Shopify admin.`
    : (sellable === 0 ? "Re-run Step B classification — no items became sellable." : "Deploy final commerce-proof runner with persistent session and confirm cart/checkout for new sellable set.");

  const report = {
    run_id: run.run_id,
    started_at: run.started_at,
    completed_at: new Date().toISOString(),
    runtime_seconds: Math.round((new Date().getTime() - new Date(run.started_at).getTime()) / 1000),
    source_step_b_run: run.source_step_b_run,
    source_step_c_run: run.source_step_c_run,
    items_total: run.items_total,
    items_done: items?.length ?? 0,
    by_source_kind: bySource,
    by_final_classification: byFinal,
    by_block_reason: byBlock,
    counters: {
      identity_drift_recovered: run.identity_drift_recovered,
      not_found_recovered: run.not_found_recovered,
      duplicates_canonicalized: run.duplicates_canonicalized,
      duplicates_archived: run.duplicates_archived,
      malformed_repaired: run.malformed_repaired,
      non_us_sellable: run.non_us_sellable,
      inventory_success: run.inventory_success,
      inventory_failed: run.inventory_failed,
      activations: run.activations,
      publications: run.publications,
      shopify_mutations: run.shopify_mutations,
      cj_requests: run.cj_requests,
      rollbacks: run.rollbacks,
    },
    sellable_variants: sellable,
    permanent_exceptions: permanentCount,
    manual_review_cases: manualCount,
    cart_tests_run: cartTests,
    cart_tests_ok: cartOk,
    checkout_tests_run: 0,
    cj_orders_created: 0,
    cj_mutations: 0,
    end_status: endStatus,
    recommended_next_step: nextStep,
  };

  // Disable cron
  let cronDisabled = false;
  if (body.disable_cron) {
    try {
      // Best-effort unschedule via SQL RPC (guarded — if not present, silently skip)
      await supabase.rpc("cron_unschedule_if_exists", { p_name: `catalog-exception-tick-${run.run_id}` });
      cronDisabled = true;
    } catch { /* mission operator will disable manually */ }
  }

  await supabase.from("catalog_exception_runs").update({
    final_report: report, cron_active: false, updated_at: new Date().toISOString(),
    completed_at: new Date().toISOString(), status: "complete", phase: "reported",
  }).eq("run_id", run.run_id);

  return new Response(JSON.stringify({ ok: true, report, cron_disabled: cronDisabled }), { headers: cors });
});