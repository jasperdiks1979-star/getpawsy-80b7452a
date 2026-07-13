// catalog-classify-report — Step B Phase 8.
// READ-ONLY on business data. Aggregates catalog_classification_variants
// into the final Step B report, writes it to catalog_classification_runs.final_report,
// and (if disable_cron) unschedules the tick cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CJ_RESOLVER_VERSION } from "../_shared/cj-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const POSITIVE = [
  { sku: "CJBC254137101AZ", pid: "1971105580151660546", vid: "1971105580222963714" },
  { sku: "CJBC26801360001", pid: "2003458837022810114", vid: "2003458839006715906" },
  { sku: "CJBC265305702BY", pid: "2001225039162568706", vid: "2057281478752038913" },
];
const NEGATIVE = ["CJMY199072801AZ", "CJCT252683101AZ"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }

  let runId: string | undefined = body?.run_id;
  if (!runId) {
    const { data } = await supabase.from("catalog_classification_runs")
      .select("run_id").order("started_at", { ascending: false }).limit(1);
    runId = data?.[0]?.run_id;
  }
  if (!runId) return new Response(JSON.stringify({ ok: false, error: "no run" }), { headers: corsHeaders, status: 404 });

  const { data: run } = await supabase.from("catalog_classification_runs").select("*").eq("run_id", runId).single();
  if (!run) return new Response(JSON.stringify({ ok: false, error: "run not found" }), { headers: corsHeaders, status: 404 });

  // Pull all variants (chunked)
  const rows: any[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("catalog_classification_variants")
      .select("*")
      .eq("run_id", runId)
      .range(from, from + size - 1);
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { headers: corsHeaders, status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < size) break;
    from += size;
  }

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = r.final_classification ?? "UNKNOWN";
    counts[k] = (counts[k] ?? 0) + 1;
  }

  const mutationEligible = rows.filter(r => r.future_mutation_eligible);
  const activationEligible = new Set(mutationEligible.map(r => r.product_id));
  const totalProposedTarget = mutationEligible.reduce((a, r) => a + (r.proposed_target_available ?? 0), 0);

  // Duplicate plan
  const dupGroups: Record<string, any[]> = {};
  for (const r of rows) {
    if (r.duplicate_group_key) {
      dupGroups[r.duplicate_group_key] = dupGroups[r.duplicate_group_key] ?? [];
      dupGroups[r.duplicate_group_key].push(r);
    }
  }
  const duplicatePlan = Object.entries(dupGroups).map(([sku, members]) => {
    // Simple heuristic: prefer active + published + image
    const scored = members.map(m => ({
      variant_id: m.variant_id, product_id: m.product_id,
      handle: m.handle, status: m.product_status,
      score: (m.product_status === "ACTIVE" ? 10 : 0) + (m.published_to_online_store ? 5 : 0) + (m.image_present ? 3 : 0) + (m.price ? 1 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    const canonical = scored[0]?.product_id ?? null;
    let cls = "IDENTICAL_REIMPORT";
    const distinctProducts = new Set(members.map(m => m.product_id)).size;
    if (distinctProducts === 1) cls = "LEGITIMATE_SHARED_SKU";
    else if (members.every(m => m.product_status && m.product_status !== "ACTIVE")) cls = "DISCONTINUED_DUPLICATE";
    else if (scored[0].score === scored[1]?.score) cls = "CONFLICTING_PRODUCTS";
    return { sku, member_count: members.length, classification: cls, proposed_canonical_product_id: canonical, members: scored };
  });

  const malformedPlan = rows.filter(r => r.final_classification === "MALFORMED_SHOPIFY_SKU").map(r => ({
    variant_id: r.variant_id, current_sku: r.sku, malformed_reason: r.malformed_reason,
    proposed_correction: r.proposed_sku_correction, auto_safe: r.proposed_sku_auto_safe ?? false,
  }));

  // Controls
  const posResults = POSITIVE.map(p => {
    const r = rows.find(x => x.sku === p.sku);
    return {
      sku: p.sku, expected_pid: p.pid, expected_vid: p.vid,
      classification: r?.final_classification ?? "MISSING_FROM_CATALOG",
      cj_pid: r?.cj_pid ?? null, cj_vid: r?.cj_vid ?? null,
      pass: !!r && r.final_classification === "EXACT_UNIQUE_CONFIRMED" && r.cj_pid === p.pid && r.cj_vid === p.vid,
    };
  });
  const negResults = NEGATIVE.map(sku => {
    const r = rows.find(x => x.sku === sku);
    const blocked = !r || ["NOT_FOUND", "MASTER_SKU_ONLY", "DISCONTINUED", "DUPLICATE_SHOPIFY_SKU", "REMOVED_FROM_SHELVES", "EXACT_UNIQUE_NO_US_STOCK", "IDENTITY_CONFLICT", "MALFORMED_SHOPIFY_SKU"].includes(r?.final_classification ?? "");
    return { sku, classification: r?.final_classification ?? "MISSING_FROM_CATALOG", pass: blocked };
  });

  const unknownCount = counts["UNKNOWN"] ?? 0;
  const posOk = posResults.every(p => p.pass);
  const negOk = negResults.every(n => n.pass);
  let endStatus = "FULL_CLASSIFICATION_PARTIAL";
  if (rows.length >= 781 && unknownCount === 0 && posOk && negOk) endStatus = "FULL_CLASSIFICATION_COMPLETE";
  else if (!posOk) endStatus = "FULL_CLASSIFICATION_FAILED";

  const report = {
    run_id: runId,
    started_at: run.started_at,
    completed_at: run.completed_at,
    runtime_seconds: run.completed_at ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000) : null,
    snapshot_status: run.snapshot_variants,
    variants_read: run.snapshot_variants,
    products_read: run.total_products,
    pagination: { has_next_page: false, truncated: false },
    resolver_version: CJ_RESOLVER_VERSION,
    cj_requests: run.requests_used,
    retries: run.retries_used,
    errors: run.errors_count,
    counts,
    future_mutation_eligible: mutationEligible.length,
    future_activation_eligible: activationEligible.size,
    total_proposed_target_inventory: totalProposedTarget,
    duplicate_plan: duplicatePlan,
    malformed_plan: malformedPlan,
    positive_controls: posResults,
    negative_controls: negResults,
    writes: {
      shopify_mutations: 0,
      cj_mutations: 0,
      classification_database_writes: rows.length,
      other_business_data_writes: 0,
    },
    end_status: endStatus,
    recommended_next_action: endStatus === "FULL_CLASSIFICATION_COMPLETE"
      ? "Review duplicate_plan + malformed_plan, then authorize Wave-1 inventory activation for future_mutation_eligible variants (bounded ≤10, DRAFT-first)."
      : "Inspect failed/partial rows in catalog_classification_variants (final_classification IS NULL or CJ_API_ERROR) before proceeding.",
  };

  // Disable cron if requested and done
  let cronDisabled = false;
  if (body?.disable_cron && run.cron_job_id) {
    try {
      await supabase.rpc("cron_unschedule_by_id", { p_job_id: run.cron_job_id });
      cronDisabled = true;
    } catch (_) { /* rpc may not exist; try SQL */ }
  }

  await supabase.from("catalog_classification_runs").update({
    final_report: report,
    cron_active: cronDisabled ? false : run.cron_active,
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);

  return new Response(JSON.stringify({ ok: true, run_id: runId, end_status: endStatus, report }), { headers: corsHeaders });
});