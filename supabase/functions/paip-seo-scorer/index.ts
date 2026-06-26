// PAIP SEO scorer — Module 4
import { corsHeaders, svc, aiJson, clamp } from "../_shared/paip-common.ts";

const SYS = `Score Pinterest pin SEO for the US pet niche. Return JSON ONLY:
title_score, desc_score, keyword_density, lsi_coverage, entity_match, semantic_relevance, board_relevance, final_score
— each 0-100. Also: intent (one of: informational, commercial, transactional, navigational), reasons (array of strings).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { creative_id, title = "", description = "", keywords = [] } = await req.json();
    const prompt = `Title: ${title}\nDescription: ${description}\nTarget keywords: ${(keywords || []).join(", ")}`;
    const result = await aiJson(prompt, "google/gemini-3-flash-preview", SYS);
    const row = {
      creative_id, title, description,
      title_score: clamp(Number(result.title_score ?? 0)),
      desc_score: clamp(Number(result.desc_score ?? 0)),
      keyword_density: clamp(Number(result.keyword_density ?? 0)),
      lsi_coverage: clamp(Number(result.lsi_coverage ?? 0)),
      entity_match: clamp(Number(result.entity_match ?? 0)),
      semantic_relevance: clamp(Number(result.semantic_relevance ?? 0)),
      board_relevance: clamp(Number(result.board_relevance ?? 0)),
      intent: result.intent ?? null,
      final_score: clamp(Number(result.final_score ?? 0)),
      reasons: { items: result.reasons ?? [] },
    };
    await svc().from("paip_seo_scores").insert(row);
    return new Response(JSON.stringify({ ok: true, score: row }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});