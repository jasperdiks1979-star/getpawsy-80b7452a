// Wave 6A — Commander Foundation Orchestrator (observation-only)
// SAFETY: never mutates business data, never publishes pins, never spends budget.
// It reads from existing engines, scores health, derives recommendations and writes
// to commander_* tables. Approvals/executions are out of scope for 6A.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type EngineSpec = {
  key: string;
  label: string;
  table: string;
  ts_col: string;
  status_col?: string;
  ok_values?: string[];
  stale_minutes: number;
};

// Each engine is observed via its most recent run row (no destructive reads).
const ENGINES: EngineSpec[] = [
  { key: "agp", label: "Autonomous Growth Platform", table: "agp_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 26 },
  { key: "aci", label: "Autonomous Commerce Intelligence", table: "aci_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 26 },
  { key: "cmdr_legacy", label: "Commander (legacy cmdr)", table: "cmdr_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 26 },
  { key: "pinterest_growth", label: "Pinterest Growth Engine", table: "pinterest_growth_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 6 },
  { key: "pinterest_scaling", label: "Pinterest Scaling Engine", table: "pinterest_scaling_runs", ts_col: "created_at", stale_minutes: 60 * 24 },
  { key: "pinterest_v2_engine", label: "Pinterest V2 Engine", table: "pinterest_v2_engine_runs", ts_col: "created_at", stale_minutes: 60 * 24 },
  { key: "pinterest_repair", label: "Pinterest Repair Loop", table: "pinterest_repair_runs", ts_col: "created_at", stale_minutes: 60 * 12 },
  { key: "cj_media", label: "CJ Media Orchestrator", table: "cj_media_sync_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 30 },
  { key: "cj_sync", label: "CJ Catalog Sync", table: "cj_sync_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 30 },
  { key: "cpe_pipeline", label: "Creative Production Engine", table: "cpe_pipeline_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 48 },
  { key: "seo_engine", label: "SEO Engine", table: "seo_engine_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 48 },
  { key: "monitoring", label: "Monitoring System", table: "monitoring_runs", ts_col: "created_at", status_col: "status", ok_values: ["success", "completed", "ok"], stale_minutes: 60 * 6 },
  { key: "cinematic_v3", label: "Cinematic V3 Jobs", table: "cinematic_v3_jobs", ts_col: "created_at", stale_minutes: 60 * 48 },
  { key: "stock_sync", label: "Stock Sync", table: "stock_sync_logs", ts_col: "created_at", status_col: "status", ok_values: ["success", "ok"], stale_minutes: 60 * 6 },
  { key: "background_jobs", label: "Background Jobs", table: "background_jobs", ts_col: "created_at", status_col: "status", ok_values: ["completed", "success", "ok"], stale_minutes: 60 * 6 },
];

function minutesSince(ts: string | null) {
  if (!ts) return null;
  return Math.round((Date.now() - new Date(ts).getTime()) / 60000);
}

async function observeEngine(sb: any, runId: string, spec: EngineSpec) {
  const { data: latest, error } = await sb
    .from(spec.table)
    .select("*")
    .order(spec.ts_col, { ascending: false })
    .limit(1)
    .maybeSingle();

  let status = "unknown";
  let lastRunAt: string | null = null;
  let lastSuccessAt: string | null = null;
  let notes = "";

  if (error) {
    notes = `read_error: ${error.message}`;
  } else if (!latest) {
    status = "no_data";
    notes = "no rows found";
  } else {
    lastRunAt = latest[spec.ts_col] ?? null;
    const age = minutesSince(lastRunAt);
    const isOk = spec.status_col && spec.ok_values
      ? spec.ok_values.includes(String(latest[spec.status_col] ?? "").toLowerCase())
      : true;
    if (isOk) lastSuccessAt = lastRunAt;
    if (age !== null && age > spec.stale_minutes) status = "stale";
    else if (!isOk) status = "degraded";
    else status = "healthy";
  }

  // 24h failure count when status column is present
  let failures24h = 0;
  if (spec.status_col) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb
      .from(spec.table)
      .select("*", { count: "exact", head: true })
      .gte(spec.ts_col, since)
      .not(spec.status_col, "in", `(${(spec.ok_values ?? []).map((v) => `"${v}"`).join(",") || '""'})`);
    failures24h = count ?? 0;
  }

  const ageMin = minutesSince(lastRunAt);
  await sb.from("commander_engine_health").insert({
    run_id: runId,
    engine_key: spec.key,
    engine_label: spec.label,
    status,
    last_run_at: lastRunAt,
    last_success_at: lastSuccessAt,
    age_minutes: ageMin,
    failures_24h: failures24h,
    notes,
    signals: { table: spec.table, stale_minutes: spec.stale_minutes },
  });

  return { spec, status, ageMin, failures24h, lastRunAt };
}

async function rollupBudget(sb: any) {
  const today = new Date().toISOString().slice(0, 10);
  const since = `${today}T00:00:00Z`;

  // AI gateway spend — best effort via cmdr_budget_ledger if present
  const ledgers: Array<{ channel: string; spend: number; units: number; details: any }> = [];

  // Pinterest credits used today
  try {
    const { data } = await sb.from("pinterest_credit_events").select("delta, created_at").gte("created_at", since);
    const units = (data ?? []).reduce((a: number, r: any) => a + Math.abs(Number(r.delta ?? 0)), 0);
    ledgers.push({ channel: "pinterest_credits", spend: 0, units, details: { events: data?.length ?? 0 } });
  } catch { /* ignore */ }

  // AI gateway approximated via cpe pipeline runs cost field if available
  try {
    const { data } = await sb.from("cpe_pipeline_runs").select("cost_usd, created_at").gte("created_at", since);
    const spend = (data ?? []).reduce((a: number, r: any) => a + Number(r.cost_usd ?? 0), 0);
    ledgers.push({ channel: "ai_creative", spend, units: data?.length ?? 0, details: {} });
  } catch { /* ignore */ }

  // Cinematic spend
  try {
    const { count } = await sb.from("cinematic_runway_jobs").select("*", { count: "exact", head: true }).gte("created_at", since);
    ledgers.push({ channel: "cinematic", spend: 0, units: count ?? 0, details: {} });
  } catch { /* ignore */ }

  for (const l of ledgers) {
    await sb.from("commander_budget_ledger").upsert(
      { day: today, channel: l.channel, spend_usd: l.spend, units: l.units, details: l.details },
      { onConflict: "day,channel" },
    );
  }

  return ledgers;
}

function scoreHealth(observations: any[]) {
  if (!observations.length) return 0;
  const weights: Record<string, number> = { healthy: 100, degraded: 55, stale: 30, no_data: 20, unknown: 40 };
  const sum = observations.reduce((a, o) => a + (weights[o.status] ?? 40), 0);
  return Math.round(sum / observations.length);
}

async function deriveRecommendations(sb: any, runId: string, observations: any[]) {
  let created = 0;
  for (const o of observations) {
    if (o.status === "healthy") continue;
    const dedupe = `wave6a:${o.spec.key}:${o.status}:${new Date().toISOString().slice(0, 10)}`;
    const risk = o.status === "degraded" ? "medium" : "low";
    const title =
      o.status === "stale"
        ? `${o.spec.label} has not run in ${o.ageMin ?? "?"} min`
        : o.status === "degraded"
          ? `${o.spec.label} reporting failures (${o.failures24h} in 24h)`
          : o.status === "no_data"
            ? `${o.spec.label} has no run history`
            : `${o.spec.label} status unknown`;
    const action =
      o.status === "stale"
        ? `Investigate cron for ${o.spec.table}; trigger a manual run if safe.`
        : o.status === "degraded"
          ? `Inspect latest failures and recent code changes for ${o.spec.label}.`
          : `Verify engine is wired and producing run rows in ${o.spec.table}.`;
    const { error } = await sb.from("commander_recommendations").upsert(
      {
        run_id: runId,
        title,
        reason: `Observed status=${o.status}, age=${o.ageMin ?? "n/a"}min, failures24h=${o.failures24h}.`,
        affected_engine: o.spec.key,
        estimated_cost_usd: 0,
        estimated_roi_usd: 0,
        risk_level: risk,
        confidence_score: 0.75,
        suggested_action: action,
        payload: { engine: o.spec.key, table: o.spec.table },
        status: "pending",
        dedupe_key: dedupe,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (!error) created += 1;
  }
  return created;
}

async function raiseAlerts(sb: any, runId: string, observations: any[]) {
  let count = 0;
  for (const o of observations) {
    if (o.status === "healthy") continue;
    const sev = o.status === "degraded" ? "warning" : o.status === "stale" ? "warning" : "info";
    const dedupe = `wave6a-alert:${o.spec.key}:${o.status}:${new Date().toISOString().slice(0, 10)}`;
    const { error } = await sb.from("commander_alerts").upsert(
      {
        run_id: runId,
        severity: sev,
        engine_key: o.spec.key,
        title: `${o.spec.label}: ${o.status}`,
        detail: `age=${o.ageMin ?? "n/a"}min, failures24h=${o.failures24h}`,
        status: "open",
        dedupe_key: dedupe,
        meta: { ageMin: o.ageMin, failures24h: o.failures24h },
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (!error) count += 1;
  }
  return count;
}

async function maybeGrowthScore(sb: any) {
  try {
    const { data } = await sb
      .from("agp_growth_scores")
      .select("overall_score, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!data?.length) return null;
    const avg = data.reduce((a: number, r: any) => a + Number(r.overall_score ?? 0), 0) / data.length;
    return Math.round(avg * 10) / 10;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Auth guard: internal secret OR admin JWT
  {
    const SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const internalOk = !!SECRET && req.headers.get("x-internal-secret") === SECRET;
    if (!internalOk) {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      let ok = false;
      if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
        const { data: u } = await sb.auth.getUser(token);
        if (u?.user) {
          const { data: role } = await sb.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
          ok = !!role;
        }
      }
      if (!ok) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const body = await req.json().catch(() => ({}));
  const trigger = String(body?.trigger ?? "manual");

  const { data: runRow, error: runErr } = await sb
    .from("commander_runs")
    .insert({ trigger, mode: "observe", status: "running" })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return new Response(JSON.stringify({ ok: false, error: runErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id;
  const startedAt = Date.now();

  try {
    const observations: any[] = [];
    for (const spec of ENGINES) {
      try {
        observations.push(await observeEngine(sb, runId, spec));
      } catch (e) {
        observations.push({ spec, status: "unknown", ageMin: null, failures24h: 0, lastRunAt: null });
      }
    }

    const ledgers = await rollupBudget(sb);
    const recs = await deriveRecommendations(sb, runId, observations);
    const alerts = await raiseAlerts(sb, runId, observations);
    const healthScore = scoreHealth(observations);
    const growthScore = await maybeGrowthScore(sb);

    const finishedAt = Date.now();
    await sb
      .from("commander_runs")
      .update({
        status: "completed",
        finished_at: new Date(finishedAt).toISOString(),
        duration_ms: finishedAt - startedAt,
        engines_scanned: observations.length,
        alerts_raised: alerts,
        recommendations_created: recs,
        executive_health_score: healthScore,
        growth_score: growthScore,
        summary: {
          ledgers,
          by_status: observations.reduce((a: any, o: any) => {
            a[o.status] = (a[o.status] ?? 0) + 1;
            return a;
          }, {}),
        },
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        ok: true,
        runId,
        executive_health_score: healthScore,
        growth_score: growthScore,
        engines: observations.length,
        alerts,
        recommendations: recs,
        ledgers,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    await sb
      .from("commander_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        error: String(e?.message ?? e),
      })
      .eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});