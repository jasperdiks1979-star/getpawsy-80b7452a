// AI Governance & Audit Layer (AGAL) — independent auditor.
// Read-only over operational AI tables; append-only writes to AGAL tables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function loadSettings() {
  const { data } = await supabase.from("agal_settings").select("key,value");
  const m: Record<string, any> = {};
  (data ?? []).forEach((r: any) => (m[r.key] = r.value));
  return m;
}

async function auditTruthForEngine(engineKey: string, runId: string) {
  // Compare expected vs actual on ledger entries older than 24h without a validation.
  const { data: rows } = await supabase
    .from("agal_decision_ledger")
    .select("id, engine_key, expected_result, actual_result, confidence")
    .eq("engine_key", engineKey)
    .not("actual_result", "is", null)
    .lt("recorded_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .limit(200);

  let validations = 0;
  const errors: number[] = [];
  for (const r of rows ?? []) {
    const exp = r.expected_result ?? {};
    const act = r.actual_result ?? {};
    for (const metric of Object.keys(exp)) {
      const p = Number(exp[metric]);
      const a = Number(act[metric]);
      if (!Number.isFinite(p) || !Number.isFinite(a)) continue;
      const errAbs = Math.abs(p - a);
      const errPct = p === 0 ? null : (errAbs / Math.abs(p));
      const calibration = errPct == null ? null : Math.max(0, 1 - errPct);
      errors.push(errPct ?? 0);
      await supabase.from("agal_truth_validations").insert({
        engine_key: engineKey,
        decision_ledger_id: r.id,
        metric,
        predicted: p,
        actual: a,
        error_abs: errAbs,
        error_pct: errPct,
        calibration_score: calibration,
        verdict: calibration == null ? "unknown" : calibration >= 0.85 ? "accurate" : calibration >= 0.6 ? "drifting" : "inaccurate",
      });
      validations++;
    }
  }
  return { validations, meanError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null };
}

async function updateTrustScore(engineKey: string, meanError: number | null, sample: number) {
  const today = new Date();
  const periodStart = today.toISOString().slice(0, 10);
  const periodEnd = periodStart;
  const prediction = meanError == null ? null : Math.max(0, 1 - meanError);
  const overall = prediction ?? 0.5;
  await supabase.from("agal_trust_scores").upsert({
    engine_key: engineKey,
    period_start: periodStart,
    period_end: periodEnd,
    prediction_score: prediction,
    calibration_score: prediction,
    reasoning_score: null,
    bias_score: null,
    stability_score: null,
    learning_score: null,
    business_impact_score: null,
    transparency_score: null,
    reliability_score: prediction,
    overall_trust: overall,
    sample_size: sample,
    details: { source: "agal-auditor" },
  }, { onConflict: "engine_key,period_start" });
}

async function detectAnomalies(runId: string) {
  let found = 0;
  // Impossible CTR (>50%) in last 24h on creative performance, if present
  try {
    const { data } = await supabase
      .from("pcie2_pin_performance")
      .select("id, ctr, impressions, created_at")
      .gt("ctr", 0.5)
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .limit(50);
    for (const r of data ?? []) {
      await supabase.from("agal_anomalies").insert({
        source: "pcie2_pin_performance",
        anomaly_type: "impossible_ctr",
        severity: "high",
        description: `CTR ${r.ctr} on ${r.impressions} impressions`,
        evidence: r,
      });
      found++;
    }
  } catch (_) { /* table missing -> skip */ }
  return found;
}

async function runAudit(trigger: string) {
  const { data: runRow } = await supabase
    .from("agal_audit_runs")
    .insert({ trigger })
    .select("id")
    .single();
  const runId = runRow!.id as string;
  const settings = await loadSettings();
  const engines: string[] = settings["audited_engines"] ?? [];
  let totalValidations = 0, totalAnoms = 0, trustUpdates = 0;
  for (const e of engines) {
    const t0 = Date.now();
    const { validations, meanError } = await auditTruthForEngine(e, runId);
    totalValidations += validations;
    if (validations > 0) {
      await updateTrustScore(e, meanError, validations);
      trustUpdates++;
    }
    await supabase.from("agal_audit_steps").insert({
      run_id: runId, step: `truth:${e}`, status: "ok",
      duration_ms: Date.now() - t0, details: { validations, meanError },
    });
  }
  totalAnoms = await detectAnomalies(runId);
  await supabase.from("agal_audit_runs").update({
    ended_at: new Date().toISOString(),
    status: "ok",
    engines_audited: engines.length,
    validations: totalValidations,
    anomalies_found: totalAnoms,
    trust_updates: trustUpdates,
    summary: { engines, totalValidations, totalAnoms, trustUpdates },
  }).eq("id", runId);
  return { runId, engines: engines.length, totalValidations, totalAnoms, trustUpdates };
}

async function recordDecision(payload: any) {
  // Append-only with simple hash chain.
  const { data: prev } = await supabase
    .from("agal_decision_ledger")
    .select("row_hash")
    .order("sequence_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevHash = prev?.row_hash ?? "GENESIS";
  const body = JSON.stringify({ ...payload, prevHash, ts: new Date().toISOString() });
  const rowHash = await sha256(body);
  const { data, error } = await supabase.from("agal_decision_ledger").insert({
    engine_key: payload.engine_key,
    engine_version: payload.engine_version ?? null,
    decision_type: payload.decision_type,
    subject: payload.subject ?? null,
    prompt: payload.prompt ?? null,
    inputs: payload.inputs ?? {},
    outputs: payload.outputs ?? {},
    reasoning: payload.reasoning ?? null,
    confidence: payload.confidence ?? null,
    expected_result: payload.expected_result ?? {},
    actual_result: payload.actual_result ?? null,
    financial_impact_cents: payload.financial_impact_cents ?? null,
    business_impact_score: payload.business_impact_score ?? null,
    prev_hash: prevHash,
    row_hash: rowHash,
    meta: payload.meta ?? {},
  }).select("id, sequence_no, row_hash").single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? (req.method === "POST" ? "audit" : "audit");
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch (_) { body = {}; }
    }
    if (action === "record_decision") {
      const rec = await recordDecision(body);
      return new Response(JSON.stringify({ ok: true, ledger: rec }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const res = await runAudit(body.trigger ?? "manual");
    return new Response(JSON.stringify({ ok: true, ...res }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});