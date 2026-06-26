// PAIP Competitor Scout — Module 8
// Aggregates patterns from existing pinterest_competitor_patterns into paip_competitor_signals.
// Pattern-only, never copies competitor assets.

import { corsHeaders, svc, startRun, finishRun, clamp } from "../_shared/paip-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("paip-competitor-scout");
  try {
    const s = svc();
    const { data: patterns } = await s.from("pinterest_competitor_patterns")
      .select("pattern_type, pattern_value, niche_key, avg_success")
      .order("avg_success", { ascending: false })
      .limit(500);
    let inserted = 0;
    for (const p of patterns ?? []) {
      await s.from("paip_competitor_signals").insert({
        competitor: "aggregated",
        niche: p.niche_key,
        headline_pattern: p.pattern_type === "headline" ? p.pattern_value : null,
        composition: p.pattern_type === "composition" ? p.pattern_value : null,
        cta_pattern: p.pattern_type === "cta" ? p.pattern_value : null,
        psychology_tag: p.pattern_type === "hook" ? p.pattern_value : null,
        color_palette: [],
        advantage_score: clamp(Number(p.avg_success ?? 0)),
      });
      inserted++;
    }
    await finishRun(runId, "ok", { patterns_imported: inserted });
    return new Response(JSON.stringify({ ok: true, patterns_imported: inserted }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});