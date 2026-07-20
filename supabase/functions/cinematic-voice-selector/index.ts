// Premium Voice Selector — picks best US-native voice per product
// based on niche, demographic, emotion, and purchase intent.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  pickVoice,
  loadRecentVoices,
  loadPerformanceWeights,
  recordVoiceAssignment,
  VOICE_POOL,
} from "../_shared/voice-pool.ts";

type VoiceId =
  | "premium_female_warm"
  | "premium_female_aspirational"
  | "premium_male_trust"
  | "friendly_pet_parent_female"
  | "energetic_social_male"
  | "documentary_calm_male";

const VOICE_CATALOG: Record<VoiceId, {
  label: string;
  elevenlabs_id: string;
  tone: string[];
  best_for_categories: string[];
  best_for_intent: ("low"|"mid"|"high")[];
}> = {
  premium_female_warm:          { label: "Premium Female • Warm",          elevenlabs_id: "EXAVITQu4vr4xnSDxMaL", tone: ["warm","aspirational","calm"],   best_for_categories: ["beds","grooming","lifestyle","carriers"], best_for_intent: ["mid","high"] },
  premium_female_aspirational:  { label: "Premium Female • Aspirational",  elevenlabs_id: "MF3mGyEYCl7XYWbV9V6O", tone: ["aspirational","confident"],     best_for_categories: ["cat_trees","furniture","luxury"],        best_for_intent: ["high"] },
  premium_male_trust:           { label: "Premium Male • Trust",           elevenlabs_id: "TX3LPaxmHKxFdv7VOQHJ", tone: ["trust","authoritative"],        best_for_categories: ["health","safety","training"],            best_for_intent: ["high"] },
  friendly_pet_parent_female:   { label: "Friendly Pet Parent • Female",   elevenlabs_id: "21m00Tcm4TlvDq8ikWAM", tone: ["friendly","conversational"],    best_for_categories: ["toys","treats","accessories"],           best_for_intent: ["low","mid"] },
  energetic_social_male:        { label: "Energetic Social • Male",        elevenlabs_id: "yoZ06aMxZJJ28mfd3POQ", tone: ["energetic","punchy","curious"], best_for_categories: ["toys","viral","gadgets"],                best_for_intent: ["low","mid"] },
  documentary_calm_male:        { label: "Documentary Calm • Male",        elevenlabs_id: "JBFqnCBsd6RMkjVDRZzb", tone: ["calm","documentary","premium"], best_for_categories: ["orthopedic","senior","beds"],            best_for_intent: ["high"] },
};

function inferCategoryBucket(s: string): string {
  const x = s.toLowerCase();
  if (/cat\s*tree|tower|condo|furniture/.test(x)) return "cat_trees";
  if (/orthopedic|senior|memory.foam/.test(x))    return "orthopedic";
  if (/bed|cushion|mattress/.test(x))             return "beds";
  if (/litter|odor|waste/.test(x))                return "health";
  if (/leash|harness|train/.test(x))              return "training";
  if (/toy|chew|fetch/.test(x))                   return "toys";
  if (/treat|food|bowl/.test(x))                  return "treats";
  if (/groom|brush|shamp/.test(x))                return "grooming";
  if (/carrier|stroller/.test(x))                 return "carriers";
  return "lifestyle";
}

function inferIntent(price?: string | number | null): "low"|"mid"|"high" {
  const n = typeof price === "number" ? price : parseFloat(String(price || "0").replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return "mid";
  if (n < 30) return "low";
  if (n < 90) return "mid";
  return "high";
}

function inferToneFromHook(hook: string): string[] {
  const t: string[] = [];
  const x = (hook || "").toLowerCase();
  if (/\?|secret|new|wait|stop/.test(x))   t.push("curious");
  if (/love|cozy|happy|relax|calm/.test(x)) t.push("warm");
  if (/finally|never|forever/.test(x))      t.push("aspirational");
  if (/fast|now|today/.test(x))             t.push("energetic");
  if (!t.length) t.push("warm");
  return t;
}

function scoreVoice(voiceId: VoiceId, ctx: { bucket: string; intent: "low"|"mid"|"high"; tones: string[] }): number {
  const v = VOICE_CATALOG[voiceId];
  let s = 40;
  if (v.best_for_categories.includes(ctx.bucket)) s += 30;
  if (v.best_for_intent.includes(ctx.intent))     s += 18;
  const toneOverlap = ctx.tones.filter(t => v.tone.includes(t)).length;
  s += toneOverlap * 6;
  return Math.min(100, s);
}

function selectVoice(job: any) {
  const bucket = inferCategoryBucket(`${job.category || ""} ${job.product_name || job.product_slug || ""}`);
  const intent = inferIntent(job.product_price);
  const tones  = inferToneFromHook(job.hook_text || "");
  const ranked = (Object.keys(VOICE_CATALOG) as VoiceId[])
    .map(id => ({ id, score: scoreVoice(id, { bucket, intent, tones }) }))
    .sort((a, b) => b.score - a.score);
  return {
    selected: ranked[0],
    alt:      ranked[1],
    reasoning: { bucket, intent, tones },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const { job_id } = await req.json();
    if (!job_id) return new Response(JSON.stringify({ ok: false, traceId, message: "job_id required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: job, error } = await supabase.from("cinematic_ad_jobs").select("*").eq("id", job_id).maybeSingle();
    if (error || !job) return new Response(JSON.stringify({ ok: false, traceId, message: "job not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Voice Diversity Engine: rotate across 8-voice pool with recency + 20% cap rules.
    const category = inferCategoryBucket(`${job.category || ""} ${job.product_name || job.product_slug || ""}`);
    const [{ recentCategoryVoices, recentGlobalVoices }, performanceWeights] = await Promise.all([
      loadRecentVoices(supabase, category),
      loadPerformanceWeights(supabase, category),
    ]);
    const pick = pickVoice({ category, recentCategoryVoices, recentGlobalVoices, performanceWeights });

    await recordVoiceAssignment(supabase, {
      voice: pick.voice,
      category,
      cinematic_job_id: job.id,
      product_id: job.product_id ?? null,
      product_slug: job.product_slug ?? null,
    });

    const upd = await supabase.from("cinematic_ad_jobs").update({
      selected_voice_id: pick.voice.voice_name,
      voice_fit_score: 100,
      voice_alt_id: null,
      voice_id: pick.voice.elevenlabs_voice_id,
      meta: { ...(job.meta || {}), voice: {
        voice_name: pick.voice.voice_name,
        voice_type: pick.voice.voice_type,
        voice_style: pick.voice.voice_style,
        elevenlabs_voice_id: pick.voice.elevenlabs_voice_id,
        reason: pick.reason,
        weights_active: Object.keys(performanceWeights).length > 0,
      }},
    }).eq("id", job_id);
    if (upd.error) throw upd.error;

    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Voice selected: ${pick.voice.display_name} (${pick.reason})`,
      selected: {
        voice_name: pick.voice.voice_name,
        voice_type: pick.voice.voice_type,
        voice_style: pick.voice.voice_style,
        elevenlabs_id: pick.voice.elevenlabs_voice_id,
        label: pick.voice.display_name,
      },
      candidates: pick.candidates,
      category,
      pool: VOICE_POOL,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});