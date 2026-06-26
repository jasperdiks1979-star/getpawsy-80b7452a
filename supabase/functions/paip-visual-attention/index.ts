// PAIP Visual Attention scorer — Module 2
// POST { image_url } → cached score row. Idempotent by image_url.

import { corsHeaders, svc, aiVisionJson, clamp, sha1 } from "../_shared/paip-common.ts";

const SYS = `Score this Pinterest pin image. Return JSON ONLY with numeric keys 0-100:
attention_score, complexity, golden_ratio, rule_of_thirds, whitespace, product_prominence,
contrast, color_harmony, depth_score, face_visibility, pet_emotion_score, visual_uniqueness,
confidence. Also: artifact_probability (0-1, likelihood of AI artifacts), focal_points (array of {x,y,strength}).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { image_url, force = false } = await req.json();
    if (!image_url) return new Response(JSON.stringify({ error: "image_url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const s = svc();
    if (!force) {
      const { data: existing } = await s.from("paip_visual_attention").select("*").eq("image_url", image_url).maybeSingle();
      if (existing) return new Response(JSON.stringify({ ok: true, cached: true, score: existing }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const result = await aiVisionJson(SYS, image_url);
    const hash = await sha1(image_url);
    const row = {
      image_url, image_hash: hash,
      attention_score: clamp(Number(result.attention_score ?? 0)),
      attention_map: { focal_points: result.focal_points ?? [] },
      complexity: clamp(Number(result.complexity ?? 0)),
      focal_points: result.focal_points ?? [],
      golden_ratio: clamp(Number(result.golden_ratio ?? 0)),
      rule_of_thirds: clamp(Number(result.rule_of_thirds ?? 0)),
      whitespace: clamp(Number(result.whitespace ?? 0)),
      product_prominence: clamp(Number(result.product_prominence ?? 0)),
      contrast: clamp(Number(result.contrast ?? 0)),
      color_harmony: clamp(Number(result.color_harmony ?? 0)),
      depth_score: clamp(Number(result.depth_score ?? 0)),
      artifact_probability: Number(result.artifact_probability ?? 0),
      face_visibility: clamp(Number(result.face_visibility ?? 0)),
      pet_emotion_score: clamp(Number(result.pet_emotion_score ?? 0)),
      visual_uniqueness: clamp(Number(result.visual_uniqueness ?? 0)),
      confidence: clamp(Number(result.confidence ?? 50)),
      raw: result,
    };
    await s.from("paip_visual_attention").upsert(row, { onConflict: "image_url" });
    return new Response(JSON.stringify({ ok: true, cached: false, score: row }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});