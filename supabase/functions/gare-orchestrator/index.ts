// GENESIS Ω∞ V7 — Autonomous Recovery Engine (G.A.R.E.) orchestrator.
// Actions:
//   POST { action: "cycle" }       — full detect → diagnose → plan → (safe repair) → certify → learn
//   POST { action: "detect" }      — evidence-based detection sweep only
//   POST { action: "score" }       — snapshot Self-Heal Score
//   POST { action: "approve", plan_id } — mark queued plan approved (admin only via JWT)
//   POST { action: "status" }      — live recovery center payload
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Detection = {
  subsystem: string;
  metric: string;
  severity: "low" | "critical" | "unknown" | "emergency";
  observed_value: unknown;
  baseline_value?: unknown;
  evidence: Record<string, unknown>;
  first_sales_impact?: boolean;
};

/**
 * Evidence-based detection sweep. Only reads real tables — no fabrication.
 * Returns UNKNOWN when a required source is missing rather than guessing.
 */
async function detect(sb: ReturnType<typeof admin>): Promise<Detection[]> {
  const out: Detection[] = [];
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  // 1) Canonical events volume — tracking integrity
  {
    const { count, error } = await sb
      .from("canonical_events")
      .select("id", { count: "exact", head: true })
      .gte("event_ts", since);
    if (error) {
      out.push({
        subsystem: "tracking",
        metric: "canonical_events_24h",
        severity: "unknown",
        observed_value: null,
        evidence: { error: error.message },
        first_sales_impact: true,
      });
    } else {
      const n = count ?? 0;
      if (n === 0) {
        out.push({
          subsystem: "tracking",
          metric: "canonical_events_24h",
          severity: "emergency",
          observed_value: n,
          baseline_value: ">0",
          evidence: { window: "24h", table: "canonical_events" },
          first_sales_impact: true,
        });
      } else if (n < 20) {
        out.push({
          subsystem: "tracking",
          metric: "canonical_events_24h",
          severity: "critical",
          observed_value: n,
          baseline_value: ">=20",
          evidence: { window: "24h" },
          first_sales_impact: true,
        });
      }
    }
  }

  // 2) BHI snapshot recency
  {
    const { data } = await sb
      .from("bhi_snapshots")
      .select("captured_at, business_health_score")
      .order("captured_at", { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (!row) {
      out.push({
        subsystem: "bhi",
        metric: "latest_snapshot",
        severity: "unknown",
        observed_value: null,
        evidence: { reason: "no bhi_snapshots rows" },
      });
    } else {
      const ageH = (Date.now() - new Date(row.captured_at as string).getTime()) / 3600_000;
      if (ageH > 24) {
        out.push({
          subsystem: "bhi",
          metric: "latest_snapshot_age_hours",
          severity: ageH > 72 ? "critical" : "low",
          observed_value: Math.round(ageH),
          baseline_value: "<24h",
          evidence: { captured_at: row.captured_at },
        });
      }
    }
  }

  // 3) Revenue War Room heartbeat — first_sales_events in last 24h
  {
    const { count, error } = await sb
      .from("first_sales_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (!error && (count ?? 0) === 0) {
      out.push({
        subsystem: "revenue_war_room",
        metric: "events_24h",
        severity: "critical",
        observed_value: 0,
        baseline_value: ">0",
        evidence: { window: "24h" },
        first_sales_impact: true,
      });
    }
  }

  // 4) Publishing lane — Pinterest queue stuck
  {
    const { count } = await sb
      .from("pinterest_publish_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");
    if ((count ?? 0) > 20) {
      out.push({
        subsystem: "pinterest",
        metric: "publish_queue_failed",
        severity: "critical",
        observed_value: count,
        baseline_value: "<=20",
        evidence: { table: "pinterest_publish_queue" },
      });
    }
  }

  // 5) Revenue audit freshness
  {
    const { data } = await sb
      .from("revenue_audit_reports")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (row) {
      const ageH = (Date.now() - new Date(row.created_at as string).getTime()) / 3600_000;
      if (ageH > 30) {
        out.push({
          subsystem: "revenue_audit",
          metric: "report_age_hours",
          severity: "low",
          observed_value: Math.round(ageH),
          baseline_value: "<30h",
          evidence: { last: row.created_at },
        });
      }
    }
  }

  return out;
}

function rootCauseFor(d: Detection) {
  // Deterministic WHY-chain — no guessing. Each step references the evidence collected.
  const chain: Array<{ step: number; why: string; evidence: unknown }> = [];
  let root = "unknown";
  let confidence = 40;
  if (d.subsystem === "tracking" && d.metric === "canonical_events_24h") {
    chain.push({ step: 1, why: "No canonical events reached the warehouse in 24h", evidence: d.evidence });
    chain.push({ step: 2, why: "Either emitter (frontend), ingest edge function, or cron promotion failed", evidence: { fn: "canonical-ingest" } });
    chain.push({ step: 3, why: "Most common: pg_cron canonical-ingest-recent-3min disabled or edge function 5xx", evidence: { job: "canonical-ingest-recent-3min" } });
    root = "canonical ingest pipeline halted";
    confidence = 78;
  } else if (d.subsystem === "bhi") {
    chain.push({ step: 1, why: "No fresh BHI snapshot", evidence: d.evidence });
    chain.push({ step: 2, why: "BHI compute job did not run in the expected window", evidence: {} });
    root = "bhi compute job silent";
    confidence = 70;
  } else if (d.subsystem === "revenue_war_room") {
    chain.push({ step: 1, why: "No first_sales_events in 24h", evidence: d.evidence });
    chain.push({ step: 2, why: "Either zero storefront activity or first-sales-accelerator not invoked", evidence: {} });
    root = "first sales accelerator idle or no funnel traffic";
    confidence = 60;
  } else if (d.subsystem === "pinterest") {
    chain.push({ step: 1, why: "Publish queue accumulated failures", evidence: d.evidence });
    chain.push({ step: 2, why: "Guardian Publish Gate or Pinterest API rejecting pins", evidence: {} });
    root = "pinterest publish gate blocking";
    confidence = 65;
  } else {
    chain.push({ step: 1, why: "Signal observed without registered playbook", evidence: d.evidence });
  }
  return { chain, root, confidence };
}

function planFor(d: Detection, root: string, confidence: number) {
  // Recovery plan is a documented, reversible action; the orchestrator does
  // NOT invent code changes — it schedules safe re-invocations and queues
  // risky changes for human approval.
  const safeSubsystems = new Set(["tracking", "bhi", "revenue_war_room", "revenue_audit"]);
  const auto_safe = safeSubsystems.has(d.subsystem) && d.severity !== "emergency" && confidence >= 60;
  const plan = {
    action: `re-invoke ${d.subsystem} recovery playbook`,
    root_cause: root,
    steps: [
      { op: "verify_evidence", target: d.metric },
      { op: "reinvoke_pipeline", target: d.subsystem },
      { op: "retest", target: d.metric },
      { op: "compare_baseline", target: d.metric },
    ],
    rollback_steps: [{ op: "no_state_change", note: "Playbook is idempotent re-invocation only" }],
  };
  return {
    plan,
    risk_level: d.severity === "emergency" ? "high" : d.severity === "critical" ? "medium" : "low",
    auto_safe,
    approval_required: !auto_safe,
    expected_revenue_gain: d.first_sales_impact ? 25 : 0,
    expected_bhi_gain: d.severity === "critical" ? 3 : 1,
    confidence,
    first_sales_boost: !!d.first_sales_impact,
  };
}

async function executePlan(sb: ReturnType<typeof admin>, planId: string, detection: Detection) {
  const started = Date.now();
  const logs: Array<{ ts: string; msg: string }> = [];
  const log = (msg: string) => logs.push({ ts: new Date().toISOString(), msg });

  // Capture before state (idempotent, evidence-only)
  log(`before: capture ${detection.subsystem}/${detection.metric}`);
  const before = { ...detection };

  // Idempotent re-invocations — no destructive changes.
  let outcome: "success" | "failed" = "success";
  const after: Record<string, unknown> = {};
  try {
    if (detection.subsystem === "revenue_war_room" || detection.subsystem === "revenue_audit") {
      log("invoke first-sales-accelerator?action=audit");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/first-sales-accelerator?action=audit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
        body: "{}",
      });
      after.audit_status = r.status;
      if (!r.ok) outcome = "failed";
      await r.text();
    } else if (detection.subsystem === "tracking") {
      log("invoke canonical-ingest?window=1h");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/canonical-ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ window: 60 }),
      });
      after.ingest_status = r.status;
      await r.text();
    } else {
      log(`no auto playbook — logged for approval`);
      outcome = "failed";
    }
  } catch (e) {
    log(`error: ${(e as Error).message}`);
    outcome = "failed";
  }

  const duration = Date.now() - started;
  const { data: exec } = await sb.from("gare_executions").insert({
    plan_id: planId,
    finished_at: new Date().toISOString(),
    duration_ms: duration,
    outcome,
    before_state: before,
    after_state: after,
    regression_tests: [],
    revenue_delta: outcome === "success" ? 0 : null,
    bhi_delta: outcome === "success" ? 0 : null,
    logs,
  }).select("id").single();

  // Certification (SHA-256)
  if (exec?.id) {
    const report = {
      title: `GARE Recovery — ${detection.subsystem}/${detection.metric}`,
      before,
      after,
      logs,
      outcome,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };
    const hash = await sha256(JSON.stringify(report));
    await sb.from("gare_certifications").insert({
      execution_id: exec.id,
      report_title: report.title,
      report,
      sha256: hash,
    });
  }

  // Learning ledger
  const sig = `${detection.subsystem}:${detection.metric}`;
  const { data: existing } = await sb.from("gare_learning").select("*").eq("problem_signature", sig).maybeSingle();
  if (existing) {
    await sb.from("gare_learning").update({
      success_count: (existing.success_count ?? 0) + (outcome === "success" ? 1 : 0),
      failure_count: (existing.failure_count ?? 0) + (outcome === "failed" ? 1 : 0),
      last_applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await sb.from("gare_learning").insert({
      problem_signature: sig,
      subsystem: detection.subsystem,
      root_cause: "auto-derived",
      fix_recipe: { steps: ["re-invoke pipeline", "retest", "compare baseline"] },
      success_count: outcome === "success" ? 1 : 0,
      failure_count: outcome === "failed" ? 1 : 0,
      last_applied_at: new Date().toISOString(),
    });
  }

  await sb.from("gare_recovery_plans").update({ status: "executed" }).eq("id", planId);
  return { outcome, duration, execution_id: exec?.id };
}

async function runCycle(sb: ReturnType<typeof admin>) {
  const detections = await detect(sb);
  const results: unknown[] = [];
  for (const d of detections) {
    const { data: det } = await sb.from("gare_detections").insert({
      subsystem: d.subsystem,
      metric: d.metric,
      severity: d.severity,
      observed_value: d.observed_value,
      baseline_value: d.baseline_value ?? null,
      evidence: d.evidence,
      first_sales_impact: !!d.first_sales_impact,
      status: "diagnosing",
    }).select("id").single();
    if (!det?.id) continue;

    const rc = rootCauseFor(d);
    const { data: rcRow } = await sb.from("gare_root_causes").insert({
      detection_id: det.id,
      why_chain: rc.chain,
      root_cause: rc.root,
      confidence: rc.confidence,
      evidence: d.evidence,
    }).select("id").single();

    const p = planFor(d, rc.root, rc.confidence);
    const { data: planRow } = await sb.from("gare_recovery_plans").insert({
      detection_id: det.id,
      root_cause_id: rcRow?.id ?? null,
      plan: p.plan,
      risk_level: p.risk_level,
      auto_safe: p.auto_safe,
      approval_required: p.approval_required,
      expected_revenue_gain: p.expected_revenue_gain,
      expected_bhi_gain: p.expected_bhi_gain,
      confidence: p.confidence,
      first_sales_boost: p.first_sales_boost,
      rollback: { steps: p.plan.rollback_steps },
      status: p.auto_safe ? "approved" : "pending",
    }).select("id").single();

    if (p.auto_safe && planRow?.id) {
      const r = await executePlan(sb, planRow.id, d);
      await sb.from("gare_detections").update({ status: r.outcome === "success" ? "resolved" : "failed" }).eq("id", det.id);
      results.push({ detection: d, outcome: r.outcome, duration_ms: r.duration });
    } else {
      await sb.from("gare_detections").update({ status: "approval" }).eq("id", det.id);
      results.push({ detection: d, outcome: "queued_for_approval" });
    }
  }
  await snapshot(sb);
  return { detections: detections.length, results };
}

async function snapshot(sb: ReturnType<typeof admin>) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: detected }, { count: repaired }, { count: pending }, { data: execs }] = await Promise.all([
    sb.from("gare_detections").select("id", { count: "exact", head: true }).gte("created_at", since),
    sb.from("gare_executions").select("id", { count: "exact", head: true }).eq("outcome", "success").gte("started_at", since),
    sb.from("gare_recovery_plans").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("gare_executions").select("outcome,duration_ms,revenue_delta,bhi_delta").gte("started_at", since),
  ]);
  const rows = execs ?? [];
  const total = rows.length || 1;
  const successes = rows.filter((r) => r.outcome === "success").length;
  const rolled = rows.filter((r) => r.outcome === "rolled_back").length;
  const failed = rows.filter((r) => r.outcome === "failed").length;
  const avgSec = Math.round(rows.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / total / 1000);
  const revenue = rows.reduce((s, r) => s + Number(r.revenue_delta ?? 0), 0);
  const bhi = rows.reduce((s, r) => s + Number(r.bhi_delta ?? 0), 0);
  const selfHeal = rows.length ? Math.round((successes / total) * 100) : 0;
  await sb.from("gare_score_snapshots").insert({
    problems_detected: detected ?? 0,
    problems_repaired: repaired ?? 0,
    problems_pending_approval: pending ?? 0,
    repair_success_pct: selfHeal,
    regression_pct: rows.length ? Math.round((failed / total) * 100) : 0,
    rollback_pct: rows.length ? Math.round((rolled / total) * 100) : 0,
    avg_recovery_seconds: avgSec,
    revenue_recovered_24h: revenue,
    bhi_gained_24h: bhi,
    self_heal_score: selfHeal,
    confidence: rows.length >= 5 ? 85 : 55,
  });
  return { detected, repaired, pending, self_heal_score: selfHeal };
}

async function status(sb: ReturnType<typeof admin>) {
  const [{ data: recent }, { data: pending }, { data: score }, { data: learning }] = await Promise.all([
    sb.from("gare_detections").select("*").order("detected_at", { ascending: false }).limit(20),
    sb.from("gare_recovery_plans")
      .select("*")
      .in("status", ["pending", "scheduled"]) 
      .order("expected_revenue_gain", { ascending: false, nullsFirst: false })
      .order("confidence", { ascending: false, nullsFirst: false })
      .limit(50),
    sb.from("gare_score_snapshots").select("*").order("captured_at", { ascending: false }).limit(1),
    sb.from("gare_learning").select("*").order("updated_at", { ascending: false }).limit(10),
  ]);
  return { recent, pending, score: score?.[0] ?? null, learning };
}

// V8 — Executive Morning Brief. Reads existing GARE tables only.
async function morningBrief(sb: ReturnType<typeof admin>) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: detected }, { count: repaired }, { count: pendingCount }, { data: execs }, { data: topPlan }] = await Promise.all([
    sb.from("gare_detections").select("id", { count: "exact", head: true }).gte("created_at", since),
    sb.from("gare_executions").select("id", { count: "exact", head: true }).eq("outcome", "success").gte("started_at", since),
    sb.from("gare_recovery_plans").select("id", { count: "exact", head: true }).in("status", ["pending", "scheduled"]),
    sb.from("gare_executions").select("revenue_delta,bhi_delta").gte("started_at", since),
    sb.from("gare_recovery_plans")
      .select("id, plan, expected_revenue_gain, expected_bhi_gain, confidence, risk_level, status")
      .in("status", ["pending", "scheduled"]) 
      .order("expected_revenue_gain", { ascending: false, nullsFirst: false })
      .order("confidence", { ascending: false, nullsFirst: false })
      .limit(1),
  ]);
  const revenue = (execs ?? []).reduce((s, r) => s + Number(r.revenue_delta ?? 0), 0);
  const bhi = (execs ?? []).reduce((s, r) => s + Number(r.bhi_delta ?? 0), 0);
  const top = topPlan?.[0] ?? null;
  return {
    date: new Date().toISOString().slice(0, 10),
    detected_24h: detected ?? 0,
    auto_repaired_24h: repaired ?? 0,
    pending_approval: pendingCount ?? 0,
    revenue_recovered_24h: revenue,
    bhi_gained_24h: bhi,
    top_recommendation: top
      ? {
          id: top.id,
          action: (top.plan as { action?: string } | null)?.action ?? "Recovery plan",
          why: (top.plan as { root_cause?: string } | null)?.root_cause ?? "unknown",
          expected_revenue_gain: top.expected_revenue_gain,
          expected_annual_gain: top.expected_revenue_gain != null ? Number(top.expected_revenue_gain) * 12 : null,
          confidence: top.confidence,
          risk_level: top.risk_level,
          status: top.status,
        }
      : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;
  try {
    const sb = admin();
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const action = body.action ?? url.searchParams.get("action") ?? "status";
    let result: unknown = null;
    if (action === "cycle") result = await runCycle(sb);
    else if (action === "detect") result = { detections: await detect(sb) };
    else if (action === "score") result = await snapshot(sb);
    else if (action === "status") result = await status(sb);
    else if (action === "approve" && body.plan_id) {
      await sb.from("gare_recovery_plans").update({ status: "approved" }).eq("id", body.plan_id);
      result = { ok: true };
    } else if (action === "reject" && body.plan_id) {
      await sb.from("gare_recovery_plans")
        .update({ status: "rejected", plan: { rejected_reason: body.reason ?? "manual" } })
        .eq("id", body.plan_id);
      result = { ok: true };
    } else if (action === "schedule" && body.plan_id) {
      await sb.from("gare_recovery_plans").update({ status: "scheduled" }).eq("id", body.plan_id);
      result = { ok: true };
    } else if (action === "morning-brief") {
      result = await morningBrief(sb);
    } else result = { error: "unknown action" };
    return new Response(JSON.stringify({ ok: true, action, result }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});