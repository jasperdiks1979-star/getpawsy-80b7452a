// Evolution Engine — Nightly Rollup (Phase 1, disabled by default)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const t0 = Date.now();

  const { data: setting } = await sb.from("ee_settings").select("value").eq("key", "nightly_rollup_enabled").maybeSingle();
  const enabled = setting?.value === true;

  const { data: runRow } = await sb.from("ee_runs").insert({ kind: "nightly_rollup", status: "running", triggered_by: "cron", notes: enabled ? "enabled" : "disabled_dry_run" }).select().single();
  const runId = runRow?.id as string | undefined;
  const stats: Record<string, unknown> = { enabled };

  try {
    if (!enabled) {
      await sb.from("ee_runs").update({ status: "ok", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, stats: { ...stats, skipped: true } }).eq("id", runId);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "nightly_rollup_enabled=false" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ingest = await sb.functions.invoke("evolution-learning-ingest", { body: { triggered_by: "nightly_rollup" } });
    const score = await sb.functions.invoke("evolution-predictive-score", { body: { triggered_by: "nightly_rollup" } });

    const { data: openPreds } = await sb.from("ee_predictions").select("id, product_id").is("actual_recorded_at", null).limit(500);
    let backfilled = 0;
    for (const p of (openPreds ?? []) as any[]) {
      if (!p.product_id) continue;
      const { data: prod } = await sb.from("ee_learning_products").select("avg_ctr, revenue_total, pins_count").eq("product_id", p.product_id).maybeSingle();
      if (!prod || !prod.pins_count) continue;
      await sb.from("ee_predictions").update({
        actual_ctr: prod.avg_ctr,
        actual_revenue: prod.revenue_total ? Number(prod.revenue_total) / prod.pins_count : null,
        actual_recorded_at: new Date().toISOString(),
      }).eq("id", p.id);
      backfilled += 1;
    }
    stats.backfilled = backfilled;
    stats.ingest = ingest.data ?? ingest.error?.message ?? null;
    stats.score = score.data ?? score.error?.message ?? null;

    await sb.from("ee_runs").update({ status: "ok", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, stats }).eq("id", runId);
    return new Response(JSON.stringify({ ok: true, runId, stats }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = (e as Error)?.message ?? String(e);
    await sb.from("ee_runs").update({ status: "error", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, error: err, stats }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: err }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});