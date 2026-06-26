// PAIP Emotion scorer — Module 3
import { corsHeaders, svc, aiJson, aiVisionJson, clamp } from "../_shared/paip-common.ts";

const SYS = `Predict emotional response of a US Pinterest pet shopper. Return JSON ONLY:
curiosity, joy, fear, relief, urgency, excitement, trust, luxury, comfort, love, pet_happiness, owner_happiness, viral_emotion
— each 0-100. Also dominant_emotion (one of the keys).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { creative_id, image_url, headline = "" } = await req.json();
    const prompt = `Headline: ${headline}\nReturn emotion scores.`;
    const result = image_url
      ? await aiVisionJson(`${SYS}\n${prompt}`, image_url)
      : await aiJson(prompt, "google/gemini-3-flash-preview", SYS);
    const row: any = { creative_id, image_url, headline };
    for (const k of ["curiosity","joy","fear","relief","urgency","excitement","trust","luxury","comfort","love","pet_happiness","owner_happiness","viral_emotion"]) {
      row[k] = clamp(Number(result[k] ?? 0));
    }
    row.dominant_emotion = result.dominant_emotion ?? null;
    await svc().from("paip_emotion_scores").insert(row);
    return new Response(JSON.stringify({ ok: true, score: row }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});