// PQIF v4 — Self-healing queue: reset stuck regeneration jobs.
import { corsHeaders, svc, startRun, finishRun, logDecision } from "../_shared/pqif-v4-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("self-heal");
  try {
    const s = svc();
    const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuck } = await s.from("pqif_v4_regeneration_queue")
      .select("id, attempts").eq("status", "processing").lt("updated_at", stuckCutoff).limit(200);
    let reset = 0, failed = 0;
    for (const j of stuck ?? []) {
      if ((j.attempts ?? 0) >= 3) {
        await s.from("pqif_v4_regeneration_queue").update({ status: "failed", last_error: "max_attempts" }).eq("id", j.id);
        failed++;
      } else {
        await s.from("pqif_v4_regeneration_queue").update({ status: "queued", attempts: (j.attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", j.id);
        reset++;
      }
    }
    await logDecision(runId, "self_heal", "ok", { reset, failed });
    await finishRun(runId, "ok", { reset, failed });
    return new Response(JSON.stringify({ ok: true, reset, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});