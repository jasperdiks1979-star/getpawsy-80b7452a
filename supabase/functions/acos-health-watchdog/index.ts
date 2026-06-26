import { corsHeaders, svc, ok, err } from "../_shared/acos-common.ts";

const ENGINES = [
  "acos-revenue-brain","acos-score-engine","acos-winner-detect","acos-loser-detect",
  "acos-creative-families","acos-creative-fatigue","acos-pin-seo-ai","acos-board-intelligence",
  "acos-diversity-engine","acos-ads-ai","acos-landing-ai","acos-trend-discovery",
  "acos-predictive","acos-commander-ai","acos-self-learning","acos-executive-report",
  "acos-orchestrator","acos-decision-dispatcher",
];

async function lastRunAge(sb: ReturnType<typeof svc>, engine: string): Promise<number | null> {
  const { data } = await sb.from("acos_orchestrator_steps").select("finished_at").eq("engine", engine).order("finished_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.finished_at) return null;
  return Math.floor((Date.now() - new Date(data.finished_at).getTime()) / 1000);
}

async function raiseAlert(sb: ReturnType<typeof svc>, severity: string, source: string, title: string, detail: unknown) {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: dup } = await sb.from("acos_alerts").select("id").eq("status", "open").eq("source", source).eq("title", title).gte("created_at", since).limit(1);
  if (dup && dup.length > 0) return;
  await sb.from("acos_alerts").insert({ severity, source, title, detail });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = svc();
    const engineStatus: Record<string, { ageSec: number | null; stale: boolean }> = {};
    for (const e of ENGINES) {
      const age = await lastRunAge(sb, e);
      const stale = age === null ? true : age > 60 * 60 * 6;
      engineStatus[e] = { ageSec: age, stale };
      if (stale) await raiseAlert(sb, "warning", "watchdog", `engine_stale:${e}`, { ageSec: age });
    }
    const { count: pendingDecisions } = await sb.from("acos_decisions").select("*", { count: "exact", head: true }).eq("status", "pending_approval");
    const { count: failedDispatches } = await sb.from("acos_dispatch_log").select("*", { count: "exact", head: true }).eq("outcome", "failed").gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
    if ((failedDispatches ?? 0) > 5) await raiseAlert(sb, "critical", "watchdog", "dispatcher_failure_burst", { failedDispatches });
    const { data: gs } = await sb.from("app_config").select("value").eq("key", "global_stop").maybeSingle();
    const globalStop = Boolean(gs?.value);
    const overall_status = Object.values(engineStatus).every(e => !e.stale) && (failedDispatches ?? 0) === 0 ? "green" : "yellow";
    await sb.from("acos_health_snapshots").insert({
      engines: engineStatus,
      queue: { pendingDecisions: pendingDecisions ?? 0, failedDispatchesLastHour: failedDispatches ?? 0 },
      guardian: {},
      ci_layer: {},
      dispatcher: { globalStop },
      overall_status,
    });
    return ok({ traceId, overall_status, engineStatus, pendingDecisions, failedDispatches, globalStop });
  } catch (e) {
    return err(String((e as Error).message ?? e), 500, traceId);
  }
});