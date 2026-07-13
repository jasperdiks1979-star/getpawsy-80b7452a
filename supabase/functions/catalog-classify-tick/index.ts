// catalog-classify-tick — Step B Phase 3.
// READ-ONLY. Processes bounded batch of pending variants per invocation
// using canonical cj-resolver@1.0.0-canonical. Writes classification
// results back to catalog_classification_variants. No Shopify/CJ mutations.
// When all variants have final_classification, flips run to
// classification_complete and disables the cron job.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_WALL_MS = 85_000;
const MAX_VARIANTS_PER_TICK = 25;
const CJ_BUDGET_PER_TICK = 80;
const TARGET_CAP = 20;

function targetFromUs(us: number): number {
  if (us <= 5) return 0;
  if (us <= 10) return Math.min(1, Math.max(0, Math.floor(us * 0.5) - 5));
  if (us <= 20) return Math.min(5, Math.max(0, Math.floor(us * 0.5) - 5));
  return Math.min(TARGET_CAP, Math.max(0, Math.floor(us * 0.5) - 5));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const t0 = Date.now();

  // Find the active run (running / ready_for_classification, not complete)
  const { data: runs, error: runErr } = await supabase
    .from("catalog_classification_runs")
    .select("*")
    .in("status", ["ready_for_classification", "running"])
    .order("started_at", { ascending: false })
    .limit(1);
  if (runErr) return new Response(JSON.stringify({ ok: false, error: runErr.message }), { headers: corsHeaders, status: 500 });
  if (!runs || runs.length === 0) {
    return new Response(JSON.stringify({ ok: true, note: "no active run" }), { headers: corsHeaders });
  }
  const run = runs[0];

  // Flip to running
  if (run.status === "ready_for_classification") {
    await supabase.from("catalog_classification_runs").update({
      status: "running", phase: "cj_resolution", updated_at: new Date().toISOString(),
    }).eq("run_id", run.run_id);
  }

  // Pull pending variants (READY_FOR_CJ_RESOLUTION with no final classification)
  const { data: pending, error: pErr } = await supabase
    .from("catalog_classification_variants")
    .select("id, variant_id, sku, preclassification, retry_count")
    .eq("run_id", run.run_id)
    .is("final_classification", null)
    .eq("preclassification", "READY_FOR_CJ_RESOLUTION")
    .lt("retry_count", 3)
    .order("created_at", { ascending: true })
    .limit(MAX_VARIANTS_PER_TICK);
  if (pErr) return new Response(JSON.stringify({ ok: false, error: pErr.message }), { headers: corsHeaders, status: 500 });

  let processed = 0;
  let requests = 0;
  let errors = 0;
  let retries = 0;
  const budget: CjBudget = { reqs: 0, max: CJ_BUDGET_PER_TICK };

  if (pending && pending.length > 0) {
    let token: string;
    try {
      const t = await getCjAccessToken();
      token = t.token;
    } catch (e) {
      // Cannot get CJ token — mark as retriable and exit
      return new Response(JSON.stringify({ ok: false, run_id: run.run_id, error: `cj_auth: ${(e as Error).message}` }), { headers: corsHeaders, status: 200 });
    }

    for (const row of pending) {
      if (Date.now() - t0 > MAX_WALL_MS) break;
      if (budget.reqs >= budget.max) break;

      try {
        const res = await resolveCjVariant(row.sku, token, budget, { readStock: true, maxPids: 4 });
        requests += res.requests;

        let cls: string;
        let block: string | null = null;
        const upd: any = {
          resolver_requests: res.requests,
          classified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (res.classification === "UPSTREAM_ERROR" || res.classification === "SKIPPED_BUDGET") {
          // Retriable
          upd.retry_count = (row.retry_count ?? 0) + 1;
          upd.last_error = `resolver=${res.classification} http=${JSON.stringify(res.http)}`;
          retries += 1;
          if (upd.retry_count >= 3) {
            upd.final_classification = "CJ_API_ERROR";
            upd.block_reason = "cj_upstream_error_max_retries";
            errors += 1;
          }
          await supabase.from("catalog_classification_variants").update(upd).eq("id", row.id);
          processed += 1;
          continue;
        }

        if (res.classification === "NOT_FOUND") {
          cls = "NOT_FOUND";
          block = "cj_not_found";
          upd.final_classification = cls;
          upd.block_reason = block;
          upd.proposed_target_available = 0;
          upd.future_mutation_eligible = false;
          upd.future_activation_eligible = false;
        } else if (res.classification === "EXACT_MULTIPLE") {
          cls = "EXACT_MULTIPLE";
          upd.final_classification = cls;
          upd.block_reason = "multiple_cj_matches";
          upd.proposed_target_available = 0;
          upd.future_mutation_eligible = false;
          upd.future_activation_eligible = false;
        } else {
          // EXACT_UNIQUE_CONFIRMED
          const m = res.exact[0];
          const cjStatus = String(m.productStatus ?? "").toLowerCase();
          const isDiscontinued = /discontin|removed|delist|offline|deactivat/.test(cjStatus);
          const isMasterOnly = !m.vid || m.vid === "";
          const cnStock = res.warehouses.filter(w => (w.country_code ?? "").toUpperCase() === "CN").reduce((a, w) => a + w.stock, 0);
          const otherStock = res.totalStock - res.usStock - cnStock;

          if (isMasterOnly) {
            cls = "MASTER_SKU_ONLY";
            block = "master_sku_no_vid";
          } else if (isDiscontinued) {
            cls = "DISCONTINUED";
            block = `cj_status=${cjStatus}`;
          } else if (res.usStock <= 0) {
            cls = "EXACT_UNIQUE_NO_US_STOCK";
            block = "no_us_stock";
          } else {
            cls = "EXACT_UNIQUE_CONFIRMED";
          }
          const target = cls === "EXACT_UNIQUE_CONFIRMED" ? targetFromUs(res.usStock) : 0;

          upd.final_classification = cls;
          upd.block_reason = block;
          upd.cj_pid = m.pid;
          upd.cj_vid = m.vid;
          upd.cj_variant_sku = m.variantSku;
          upd.cj_product_status = m.productStatus;
          upd.semantic_match = true;
          upd.us_stock = res.usStock;
          upd.cn_stock = cnStock;
          upd.other_stock = otherStock;
          upd.proposed_target_available = target;
          upd.future_mutation_eligible = cls === "EXACT_UNIQUE_CONFIRMED" && target > 0;
          upd.future_activation_eligible = cls === "EXACT_UNIQUE_CONFIRMED" && target > 0;
        }

        await supabase.from("catalog_classification_variants").update(upd).eq("id", row.id);
        processed += 1;
      } catch (e) {
        errors += 1;
        const nextRetry = (row.retry_count ?? 0) + 1;
        await supabase.from("catalog_classification_variants").update({
          retry_count: nextRetry,
          last_error: String((e as Error).message).slice(0, 500),
          final_classification: nextRetry >= 3 ? "CJ_API_ERROR" : null,
          block_reason: nextRetry >= 3 ? "exception_max_retries" : null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    }
  }

  // Recompute run counters
  const { count: totalCount } = await supabase
    .from("catalog_classification_variants")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.run_id);
  const { count: classifiedCount } = await supabase
    .from("catalog_classification_variants")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.run_id)
    .not("final_classification", "is", null);

  const done = (totalCount ?? 0) > 0 && (classifiedCount ?? 0) >= (totalCount ?? 0);

  await supabase.from("catalog_classification_runs").update({
    classified_variants: classifiedCount ?? 0,
    requests_used: (run.requests_used ?? 0) + requests,
    retries_used: (run.retries_used ?? 0) + retries,
    errors_count: (run.errors_count ?? 0) + errors,
    status: done ? "classification_complete" : "running",
    phase: done ? "report_pending" : "cj_resolution",
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("run_id", run.run_id);

  // Auto-generate report and disable cron when done
  if (done) {
    try {
      const url = `${SUPABASE_URL}/functions/v1/catalog-classify-report`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "", "Authorization": `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ run_id: run.run_id, disable_cron: true }),
      });
    } catch (_) { /* best-effort */ }
  }

  return new Response(JSON.stringify({
    ok: true,
    run_id: run.run_id,
    resolver: CJ_RESOLVER_VERSION,
    processed,
    requests,
    retries,
    errors,
    total: totalCount,
    classified: classifiedCount,
    done,
    elapsed_ms: Date.now() - t0,
  }), { headers: corsHeaders });
});