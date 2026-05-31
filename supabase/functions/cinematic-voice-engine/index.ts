// cinematic-voice-engine
//
// Scores 5 voice metadata candidates for a cinematic_ad_jobs row using
// deterministic heuristics (no extra TTS calls). The actual voiceover
// audio is already produced by cinematic-ad-prepare; this engine grades
// the *choice* of voice/style/pace against product category + hook tone
// and writes voice_score + voice_candidates back.
//
// POST { job_id: string, force?: boolean }
// Resp { ok, traceId, job_id, winner, candidates }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `vce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type VoiceStyleId = "lifestyle_female" | "pet_parent" | "narrator" | "social_energetic" | "warm_male";
interface VoiceCandidate {
  voice_id: string;
  style: VoiceStyleId;
  pace: "slow" | "natural" | "punchy";
  register: "warm" | "aspirational" | "energetic" | "calm" | "playful";
  score: number;
  breakdown: Record<string, number>;
  rationale: string;
}

const CANDIDATES: Array<Omit<VoiceCandidate, "score" | "breakdown" | "rationale">> = [
  { voice_id: "EXAVITQu4vr4xnSDxMaL", style: "lifestyle_female",  pace: "natural", register: "aspirational" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", style: "pet_parent",        pace: "natural", register: "warm" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", style: "narrator",          pace: "slow",    register: "calm" },
  { voice_id: "EXAVITQu4vr4xnSDxMaL", style: "social_energetic",  pace: "punchy",  register: "energetic" },
  { voice_id: "TX3LPaxmHKxFdv7VOQHJ", style: "warm_male",         pace: "natural", register: "warm" },
];

function scoreCandidate(c: typeof CANDIDATES[number], opts: { hookText: string; vo: string; productName: string; category: string; selectedStyle?: string | null }) {
  const { hookText, vo, category, selectedStyle } = opts;
  const hookLower = (hookText || "").toLowerCase();
  const cat = (category || "").toLowerCase();

  // 1. Hook register fit: energetic hook needs punchy delivery, emotional hook needs warm.
  const energeticHook = /stop|never|tired|finally|magic|instant|wow/.test(hookLower);
  const emotionalHook = /deserve|love|cuddle|safe|happy|melt/.test(hookLower);
  let hookFit = 60;
  if (energeticHook && c.register === "energetic") hookFit = 100;
  else if (emotionalHook && (c.register === "warm" || c.register === "aspirational")) hookFit = 100;
  else if (!energeticHook && !emotionalHook && c.register === "warm") hookFit = 85;

  // 2. Category fit. Cat trees / lifestyle = aspirational. Litter / odor = calm relief.
  let catFit = 70;
  if (/litter|odor|smell|cleanup/.test(cat) && c.register === "calm") catFit = 100;
  else if (/cat tree|bed|sofa|lifestyle|home/.test(cat) && c.register === "aspirational") catFit = 100;
  else if (/toy|play|treat/.test(cat) && (c.register === "playful" || c.register === "energetic")) catFit = 95;

  // 3. Pace vs VO length sweet spot (target ~14-22 words for a 7-9s ad).
  const voWc = (vo || "").split(/\s+/).filter(Boolean).length;
  let paceFit = 70;
  if (c.pace === "natural" && voWc >= 12 && voWc <= 22) paceFit = 100;
  else if (c.pace === "punchy" && voWc <= 14) paceFit = 95;
  else if (c.pace === "slow" && voWc >= 18 && voWc <= 28) paceFit = 90;

  // 4. Premium-brand bias: lifestyle_female + narrator score a baseline premium boost.
  const premium = c.style === "lifestyle_female" ? 100 : c.style === "narrator" ? 90 : c.style === "warm_male" ? 80 : 70;

  // 5. Author-selection nudge: if the job was prepared with a chosen style, give it +5.
  const stickiness = selectedStyle && selectedStyle === c.style ? 100 : 80;

  const score = Math.round(hookFit * 0.30 + catFit * 0.20 + paceFit * 0.20 + premium * 0.20 + stickiness * 0.10);

  const rationale =
    `${c.style}/${c.register}/${c.pace}: hook=${hookFit} cat=${catFit} pace=${paceFit} premium=${premium}` +
    (selectedStyle === c.style ? " (selected)" : "");

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { hookFit, catFit, paceFit, premium, stickiness },
    rationale,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST required" });
  let body: { job_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!body.job_id) return json(400, { ok: false, traceId, message: "job_id required" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: job, error } = await supabase
    .from("cinematic_ad_jobs")
    .select("id, product_name, product_slug, hook_text, vo_script, voice_style, voice_score, voice_candidates")
    .eq("id", body.job_id)
    .maybeSingle();
  if (error || !job) return json(404, { ok: false, traceId, message: "job not found" });

  if (!body.force && Array.isArray((job as any).voice_candidates) && (job as any).voice_candidates.length >= 5) {
    return json(200, { ok: true, traceId, message: "already scored", job_id: job.id, winner: { score: (job as any).voice_score }, candidates: (job as any).voice_candidates });
  }

  let category = "";
  if (job.product_slug) {
    const { data: p } = await (supabase as any).from("products_public").select("category").eq("slug", job.product_slug).maybeSingle();
    category = String((p as any)?.category ?? "");
  }

  const opts = {
    hookText: String((job as any).hook_text ?? ""),
    vo: String((job as any).vo_script ?? ""),
    productName: String((job as any).product_name ?? job.product_slug ?? ""),
    category,
    selectedStyle: (job as any).voice_style ?? null,
  };

  const candidates: VoiceCandidate[] = CANDIDATES.map((c) => {
    const s = scoreCandidate(c, opts);
    return { ...c, score: s.score, breakdown: s.breakdown, rationale: s.rationale };
  });
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  await supabase.from("cinematic_ad_jobs").update({
    voice_score: winner.score, voice_candidates: candidates,
    updated_at: new Date().toISOString(),
  } as any).eq("id", job.id);

  return json(200, { ok: true, traceId, job_id: job.id, winner, candidates });
});
