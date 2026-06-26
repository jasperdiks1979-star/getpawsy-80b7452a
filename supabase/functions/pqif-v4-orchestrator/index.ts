// PQIF v4 — Autonomous Growth AI orchestrator. Resumable, evidence-logged.
import { corsHeaders, svc, startRun, finishRun, logDecision, isPublishingBlocked } from "../_shared/pqif-v4-common.ts";

const PHASES = ["rank", "retire", "strategy", "selfheal", "validate"] as const;

async function invoke(fn: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: "{}",
  });
  return await resp.json().catch(() => ({ ok: false }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const resumeFrom: string = body?.resume_from ?? PHASES[0];
  const runId = await startRun("orchestrator", { resume_from: resumeFrom });
  const summary: Record<string, unknown> = {};
  try {
    const s = svc();
    const block = await isPublishingBlocked();
    summary.publishing = block;
    await logDecision(runId, "publishing_check", block.blocked ? "blocked" : "open", block);

    const start = PHASES.indexOf(resumeFrom as any);
    for (let i = Math.max(0, start); i < PHASES.length; i++) {
      const phase = PHASES[i];
      await s.from("pqif_v4_runs").update({ checkpoint: { phase } }).eq("id", runId);
      let res: any = { ok: true };
      if (phase === "rank") res = await invoke("pqif-v4-product-ranker");
      else if (phase === "retire") res = await invoke("pqif-v4-learning-loop");
      else if (phase === "strategy") res = await invoke("pqif-v4-strategy-generator");
      else if (phase === "selfheal") res = await invoke("pqif-v4-self-heal");
      else if (phase === "validate") {
        const { count: regenQueued } = await s.from("pqif_v4_regeneration_queue").select("*", { count: "exact", head: true }).eq("status", "queued");
        const { count: stratProposed } = await s.from("pqif_v4_strategies").select("*", { count: "exact", head: true }).eq("status", "proposed");
        res = { ok: true, regen_queued: regenQueued, strategies_proposed: stratProposed, publishing_blocked: block.blocked };
      }
      summary[phase] = res;
      await logDecision(runId, `phase:${phase}`, res?.ok === false ? "error" : "ok", res ?? {});
    }
    await finishRun(runId, "ok", summary);
    return new Response(JSON.stringify({ ok: true, run_id: runId, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", summary, e?.message);
    return new Response(JSON.stringify({ ok: false, run_id: runId, error: e?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});