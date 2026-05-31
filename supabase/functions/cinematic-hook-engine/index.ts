// cinematic-hook-engine
//
// Generates 4 hook variants for a cinematic_ad_jobs row using Lovable AI and
// scores them with deterministic heuristics. Picks the winner and writes
// hook_text + hook_score + hook_candidates back to the job.
//
// POST { job_id: string, force?: boolean }
// Resp { ok, traceId, message, job_id, winner, candidates }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `hke_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const ARCHETYPES = [
  "curiosity", "transformation", "relief", "before_after",
  "problem_solution", "hidden_benefit", "emotional_payoff",
] as const;
type Archetype = typeof ARCHETYPES[number];

interface Candidate {
  archetype: Archetype;
  hook_text: string;
  score: number;
  breakdown: Record<string, number>;
  rationale?: string;
}

const POWER_WORDS = ["stop","never","secret","finally","instantly","transform","love","deserve","real","premium","calm","relief","magic","obsessed","switched","watch","tired","wish","discover","before","after"];
const BANNED = ["vet-approved","vet approved","eco-friendly","eco friendly","dropship","cheap"];
const EMOTION_WORDS = ["love","deserve","happy","joy","calm","relief","comfort","trust","safe","worry","tired","stressed","obsessed","wish"];

function scoreHook(text: string, archetype: Archetype): { score: number; breakdown: Record<string, number> } {
  const t = (text || "").trim();
  const lower = t.toLowerCase();
  const wc = t.split(/\s+/).filter(Boolean).length;
  const lengthScore = wc === 0 ? 0 : Math.max(0, 100 - Math.abs(5.5 - wc) * 14);
  const powerHits = POWER_WORDS.filter((w) => lower.includes(w)).length;
  const powerScore = Math.min(100, powerHits * 28);
  const emoHits = EMOTION_WORDS.filter((w) => lower.includes(w)).length;
  const emoScore = Math.min(100, emoHits * 30);
  const hasNumber = /\d/.test(t);
  const hasQuestion = /\?/.test(t);
  const properNouns = (t.match(/\b[A-Z][a-z]{2,}\b/g) || []).length;
  const specificity = Math.min(100, (hasNumber ? 40 : 0) + (hasQuestion ? 20 : 0) + properNouns * 15);
  let archAlign = 60;
  if (archetype === "curiosity")        archAlign = /what if|don't know|secret|nobody tells|why|nobody|hidden/i.test(t) ? 100 : 60;
  if (archetype === "transformation")   archAlign = /transform|finally|from|to|now|new/i.test(t) ? 100 : 60;
  if (archetype === "relief")           archAlign = /no more|finally|stop|relief|calm|gone/i.test(t) ? 100 : 60;
  if (archetype === "before_after")     archAlign = /before|after|vs|then|now/i.test(t) ? 100 : 60;
  if (archetype === "problem_solution") archAlign = /tired|stop|fix|no more|end the/i.test(t) ? 100 : 60;
  if (archetype === "hidden_benefit")   archAlign = /nobody|secret|hidden|what.*don'?t|truth/i.test(t) ? 100 : 60;
  if (archetype === "emotional_payoff") archAlign = /deserve|love|melt|happy|safe|cuddle|joy|peace/i.test(t) ? 100 : 60;
  if (BANNED.some((b) => lower.includes(b))) {
    return { score: 0, breakdown: { banned: 1, length: Math.round(lengthScore), power: powerScore, emotion: emoScore, specificity, archetype: archAlign } };
  }
  // Pinterest performance heuristic axes
  const stop_scroll  = Math.min(100, powerScore * 0.6 + specificity * 0.4);
  const curiosity_gap = /\?|secret|nobody|hidden|what if|why/i.test(t) ? 90 : 50;
  const purchase_intent = Math.min(100, archAlign * 0.5 + powerScore * 0.5);
  const save_prob = Math.min(100, emoScore * 0.6 + specificity * 0.4);
  const ctr_pred = Math.min(100, stop_scroll * 0.5 + purchase_intent * 0.5);
  const score = Math.round(
    lengthScore * 0.10 + powerScore * 0.15 + emoScore * 0.15 +
    specificity * 0.10 + archAlign * 0.15 +
    stop_scroll * 0.10 + curiosity_gap * 0.05 + purchase_intent * 0.10 +
    save_prob * 0.05 + ctr_pred * 0.05
  );
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      length: Math.round(lengthScore), power: Math.round(powerScore), emotion: Math.round(emoScore),
      specificity, archetype: archAlign,
      stop_scroll: Math.round(stop_scroll), curiosity_gap, purchase_intent: Math.round(purchase_intent),
      save_prob: Math.round(save_prob), ctr_pred: Math.round(ctr_pred),
    },
  };
}

async function generateVariants(productName: string, productCategory: string, currentHook: string): Promise<Array<{ archetype: Archetype; hook_text: string; rationale: string }>> {
  const fallback: Array<{ archetype: Archetype; hook_text: string; rationale: string }> = [
    { archetype: "curiosity",        hook_text: `What ${productName} owners discover first`,   rationale: "fallback curiosity" },
    { archetype: "transformation",   hook_text: `Finally, a ${productName} that works`,        rationale: "fallback transformation" },
    { archetype: "relief",           hook_text: `No more mess. No more stress.`,                rationale: "fallback relief" },
    { archetype: "before_after",     hook_text: `Before vs after ${productName}`,               rationale: "fallback before/after" },
    { archetype: "problem_solution", hook_text: `Tired of mess? Try ${productName}`,            rationale: "fallback problem/solution" },
    { archetype: "hidden_benefit",   hook_text: `Nobody tells you about this`,                  rationale: "fallback hidden benefit" },
    { archetype: "emotional_payoff", hook_text: `Your pet deserves this ${productName}`,        rationale: "fallback emotional payoff" },
    { archetype: "curiosity",        hook_text: `Why owners switched to this`,                  rationale: "fallback curiosity 2" },
    { archetype: "transformation",   hook_text: `Watch the change in 10 seconds`,               rationale: "fallback transformation 2" },
    { archetype: "emotional_payoff", hook_text: `The calm your pet has been missing`,           rationale: "fallback payoff 2" },
  ];
  if (!LOVABLE_API_KEY) return fallback;
  const sys = `You are a senior US short-form ad copywriter for premium pet brands. Generate 10 cinematic hook lines for ONE product, distributed across these archetypes: curiosity, transformation, relief, before_after, problem_solution, hidden_benefit, emotional_payoff. At least one per archetype.
Rules: max 7 words each, US-native voice, mobile-safe, warm + benefit-led, designed to stop the scroll on Pinterest. No "vet-approved", "eco-friendly", "dropship". Return STRICT JSON: {"variants":[{"archetype":"...","hook_text":"...","rationale":"one sentence"}]}.`;
  const user = `Product: ${productName}\nCategory: ${productCategory || "pet supplies"}\nCurrent hook (avoid repeating): ${currentHook || "(none)"}`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.9 }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const txt = String(data?.choices?.[0]?.message?.content ?? "");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const parsed = JSON.parse(m[0]);
    const variants = Array.isArray(parsed?.variants) ? parsed.variants : [];
    const mapped = variants
      .filter((v: any) => v && (ARCHETYPES as readonly string[]).includes(v.archetype) && typeof v.hook_text === "string")
      .map((v: any) => ({ archetype: v.archetype as Archetype, hook_text: String(v.hook_text).trim(), rationale: String(v.rationale ?? "") }));
    // Ensure every archetype is represented at least once
    const got = new Set(mapped.map((v: any) => v.archetype));
    for (const f of fallback) if (!got.has(f.archetype)) { mapped.push(f); got.add(f.archetype); }
    return mapped.slice(0, 10);
  } catch (_e) {
    return fallback;
  }
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
    .select("id, product_name, product_slug, hook_text, hook_score, hook_candidates")
    .eq("id", body.job_id)
    .maybeSingle();
  if (error || !job) return json(404, { ok: false, traceId, message: "job not found" });

  if (!body.force && Array.isArray((job as any).hook_candidates) && (job as any).hook_candidates.length >= 10) {
    return json(200, { ok: true, traceId, message: "already scored", job_id: job.id, winner: { hook_text: job.hook_text, score: job.hook_score }, candidates: (job as any).hook_candidates });
  }

  let category = "";
  if (job.product_slug) {
    const { data: p } = await (supabase as any).from("products_public").select("category").eq("slug", job.product_slug).maybeSingle();
    category = String((p as any)?.category ?? "");
  }

  const variants = await generateVariants(String(job.product_name ?? job.product_slug ?? "this product"), category, String(job.hook_text ?? ""));
  const candidates: Candidate[] = variants.map((v) => {
    const s = scoreHook(v.hook_text, v.archetype);
    return { archetype: v.archetype, hook_text: v.hook_text, score: s.score, breakdown: s.breakdown, rationale: v.rationale };
  });
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  const reasonParts = [
    `archetype=${winner.archetype}`,
    `score=${winner.score}`,
    `stop_scroll=${winner.breakdown.stop_scroll}`,
    `ctr=${winner.breakdown.ctr_pred}`,
  ];
  const hook_winner_reason = `Won on ${reasonParts.join(", ")} out of ${candidates.length} candidates`;

  await supabase.from("cinematic_ad_jobs").update({
    hook_text: winner.hook_text, hook_score: winner.score, hook_candidates: candidates,
    hook_winner_reason,
    updated_at: new Date().toISOString(),
  } as any).eq("id", job.id);

  return json(200, { ok: true, traceId, job_id: job.id, winner, hook_winner_reason, candidates });
});
