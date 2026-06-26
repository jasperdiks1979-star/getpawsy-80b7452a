// PQIF v4 — Learning loop: retire weak pins, enqueue regenerations. DB-only retirement.
import { corsHeaders, svc, startRun, finishRun, logDecision } from "../_shared/pqif-v4-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("learning-loop");
  try {
    const s = svc();
    const { data: settings } = await s.from("pqif_v4_settings").select("*").eq("id", 1).single();
    const minImpr = settings?.retire_min_impressions ?? 500;
    const maxCtr = settings?.retire_max_ctr ?? 0.0025;

    const { data: perf } = await s.from("pinterest_pin_performance")
      .select("pin_id, product_id, impressions, outbound_clicks, ctr, saves, updated_at")
      .gte("impressions", minImpr)
      .lte("ctr", maxCtr)
      .limit(500);

    const retired: any[] = [];
    const regen: any[] = [];
    for (const r of perf ?? []) {
      const { data: already } = await s.from("pqif_v4_retired_pins").select("id").eq("pin_id", r.pin_id).maybeSingle();
      if (already) continue;
      retired.push({
        pin_id: r.pin_id, product_id: r.product_id, reason: "weak_performance",
        evidence: { impressions: r.impressions, ctr: r.ctr, saves: r.saves, threshold: { minImpr, maxCtr } },
        retired_in_db: true, retired_on_pinterest: false,
      });
      if (r.product_id) {
        regen.push({ product_id: r.product_id, replaces_pin_id: r.pin_id, status: "queued",
          payload: { reason: "replace_weak_pin", source_metrics: { impressions: r.impressions, ctr: r.ctr } } });
      }
    }
    if (retired.length) await s.from("pqif_v4_retired_pins").insert(retired);
    if (regen.length) await s.from("pqif_v4_regeneration_queue").insert(regen);
    await logDecision(runId, "retire_weak", "ok", { retired: retired.length, regen_enqueued: regen.length });
    await finishRun(runId, "ok", { retired: retired.length, regen_enqueued: regen.length });
    return new Response(JSON.stringify({ ok: true, retired: retired.length, regen_enqueued: regen.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});