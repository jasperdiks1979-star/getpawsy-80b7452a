import { corsHeaders, svc, requireAdmin, ok, err, assertObservationOnly } from "../_shared/ee-p2-common.ts";

// Nightly Phase 2 orchestrator. Observation-only. Never publishes, never mutates production tables.
const STEPS = [
  "ee-p2-learning-ingest",
  "ee-p2-trend-detect",
  "ee-p2-emotion-score",
  "ee-p2-image-dna",
  "ee-p2-experiment-track",
  "ee-p2-recommend",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;

  const observationOnly = await assertObservationOnly();
  if (!observationOnly) return err("observation_only lock not set; refusing to run", 412);

  const sb = svc();
  const { data: run } = await sb.from("ee_p2_nightly_runs").insert({ status: "running", steps: [] }).select("id").single();
  const runId = run?.id;
  const stepLog: any[] = [];
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";

  for (const fn of STEPS) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      stepLog.push({ fn, ok: res.ok, ms: Date.now() - t0, body });
    } catch (e) {
      stepLog.push({ fn, ok: false, ms: Date.now() - t0, error: String(e) });
    }
  }

  await sb.from("ee_p2_nightly_runs").update({
    status: stepLog.every((s) => s.ok) ? "complete" : "failed",
    steps: stepLog,
    stats: { steps: stepLog.length, ok: stepLog.filter((s) => s.ok).length },
    completed_at: new Date().toISOString(),
  }).eq("id", runId);

  return ok({ runId, steps: stepLog });
});