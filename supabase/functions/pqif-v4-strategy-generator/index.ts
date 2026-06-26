// PQIF v4 — Strategy generator: AI proposes creative strategies + queues experiments.
import { corsHeaders, svc, startRun, finishRun, logDecision, aiJson } from "../_shared/pqif-v4-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("strategy-generator");
  try {
    const s = svc();
    const { data: topRanks } = await s.from("pqif_v4_product_ranks")
      .select("product_id, revenue_potential, components").order("rank").limit(10);
    const { data: topProducts } = topRanks?.length
      ? await s.from("products").select("id, name, category").in("id", topRanks.map((r: any) => r.product_id))
      : { data: [] as any[] };
    const { data: families } = await s.from("pqif_family_performance")
      .select("family_id, family_type, performance_score, frequency_multiplier").order("performance_score", { ascending: false }).limit(20);

    const prompt = `You are a Pinterest growth strategist. Given the following high-potential products and historical creative family performance, propose 5 NEW creative strategies optimized for CTR + saves + outbound clicks + revenue. Each strategy must include: name, hypothesis, family (hook|visual|headline|cta), parameters (concrete creative cues), and expected_score (0-100). Respond as JSON: {"strategies":[...]}.

TOP_PRODUCTS=${JSON.stringify(topProducts ?? [])}
FAMILY_PERFORMANCE=${JSON.stringify(families ?? [])}`;

    let proposals: any[] = [];
    try {
      const out = await aiJson(prompt, "You design Pinterest creative growth strategies. Return strict JSON.");
      proposals = Array.isArray(out?.strategies) ? out.strategies.slice(0, 5) : [];
    } catch (e) {
      await logDecision(runId, "ai_fallback", "warn", { error: String(e) });
    }
    if (!proposals.length) {
      proposals = [
        { name: "Outcome-led headline", hypothesis: "Outcome-first overlay lifts saves", family: "headline", parameters: { format: "outcome_first" }, expected_score: 70 },
        { name: "Lifestyle hero swap", hypothesis: "Lifestyle scenes outperform pack shots", family: "visual", parameters: { scene: "lifestyle" }, expected_score: 68 },
      ];
    }
    const inserted: string[] = [];
    for (const p of proposals) {
      const { data } = await s.from("pqif_v4_strategies").insert({
        name: String(p.name ?? "untitled").slice(0, 120),
        hypothesis: String(p.hypothesis ?? "").slice(0, 500),
        family: String(p.family ?? "general"),
        parameters: p.parameters ?? {},
        score: Number(p.expected_score ?? 0),
        status: "proposed",
        evidence: { source: "ai", model: "google/gemini-3-flash-preview" },
      }).select("id").single();
      if (data?.id) {
        inserted.push(data.id);
        await s.from("pqif_v4_experiments").insert({
          strategy_id: data.id, name: `exp:${p.name}`, status: "queued",
          variants: [{ id: "A", kind: "control" }, { id: "B", kind: "strategy", parameters: p.parameters ?? {} }],
        });
      }
    }
    await logDecision(runId, "generate_strategies", "ok", { count: inserted.length });
    await finishRun(runId, "ok", { strategies: inserted.length });
    return new Response(JSON.stringify({ ok: true, strategies: inserted.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});