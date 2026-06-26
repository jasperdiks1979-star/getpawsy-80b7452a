import { corsHeaders, requireAdmin, svc, ok, err, getSettings, startStep, finishStep } from "../_shared/acos-common.ts";

const HOURLY_ENGINES = ["acos-revenue-brain","acos-score-engine","acos-winner-detect","acos-loser-detect","acos-diversity-engine","acos-ads-ai"];
const NIGHTLY_ENGINES = ["acos-creative-families","acos-creative-fatigue","acos-pin-seo-ai","acos-board-intelligence","acos-landing-ai","acos-trend-discovery","acos-predictive","acos-self-learning","acos-executive-report"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const s = await getSettings();
  if (s.emergency_stop) return err("emergency_stop", 423);
  const url = new URL(req.url);
  const cadence = url.searchParams.get("cadence") ?? "hourly";
  const engines = cadence === "nightly" ? NIGHTLY_ENGINES : HOURLY_ENGINES;

  const sb = svc();
  const { data: run } = await sb.from("acos_orchestrator_runs").insert({ cadence, status: "running" }).select("id").single();
  const runId = run?.id as string;
  const t0 = Date.now();
  const summary: Record<string, unknown> = {};

  const base = `${Deno.env.get("SUPABASE_URL")!}/functions/v1`;
  const authHeader = req.headers.get("Authorization") ?? "";

  for (const fn of engines) {
    const stepId = await startStep(runId, fn);
    try {
      const r = await fetch(`${base}/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: authHeader } });
      const j = await r.json().catch(() => ({}));
      summary[fn] = { status: r.status, body: j };
      await finishStep(stepId, { status: r.ok ? "ok" : "error", detail: j, error: r.ok ? undefined : `status ${r.status}` });
    } catch (e) {
      summary[fn] = { error: String(e) };
      await finishStep(stepId, { status: "error", error: String(e) });
    }
  }

  await sb.from("acos_orchestrator_runs").update({ status: "ok", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, summary }).eq("id", runId);
  return ok({ run_id: runId, summary });
});