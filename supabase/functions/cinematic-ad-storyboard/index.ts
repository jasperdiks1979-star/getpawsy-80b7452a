// cinematic-ad-storyboard
//
// V3 AI storyboard planner. Given a product/job, generates:
//   - 5 hook variants (picks strongest)
//   - per-scene captions (HOOK → PROBLEM → EMOTION → FEATURE → BENEFIT → PROOF → CTA)
//   - pacing map (frame budget per scene)
//   - emotional curve
// Stored on cinematic_ad_jobs.storyboard (jsonb) + hook_variants (jsonb).
//
// Auth: admin JWT OR service role.
// Idempotent: callable repeatedly; overwrites storyboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getPreset,
  enforceSceneDurations,
  HARD_MAX_DURATION_SEC,
} from "../_shared/cinematic-presets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const trace = () => `sb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STORY_ARC = [
  "HOOK", "PROBLEM", "EMOTION", "FEATURE", "BENEFIT", "PROOF", "CTA",
] as const;

const HOOK_TYPES = [
  "question", "shock", "payoff", "social_proof", "transformation",
  "urgency", "curiosity", "problem_call_out", "relief", "comparison",
  "emotion", "command",
];

interface Storyboard {
  scenes: Array<{
    role: typeof STORY_ARC[number];
    caption: string;
    intent: string;
    motionIntensity: "high" | "medium" | "low";
    durationFrames: number;
    vo?: string;
  }>;
  emotionalCurve: number[]; // 0–100 per scene
  totalFrames: number;
  hookType: string;
  hookVariants: Array<{ text: string; type: string; score: number }>;
  selectedHook: { text: string; type: string; score: number };
}

const SYSTEM_PROMPT = `You are an expert short-form vertical video creative director for US TikTok and Pinterest pet brands.
Produce conversion-optimized storyboards that follow the proven 7-beat arc: HOOK → PROBLEM → EMOTION → FEATURE → BENEFIT → PROOF → CTA.

Rules:
- Captions max 6 words each. Mobile-safe. Punchy.
- Hook must stop the scroll in <1.5s.
- No banned terms: "vet-approved", "eco-friendly", "dropship".
- US-native voice. Warm + emotional + benefit-led.
- CTA must be a clear command (e.g. "Get yours", "Shop now").
- Emotional curve: hook=70, problem=85 (pain peak), emotion=90, feature=55, benefit=80, proof=75, cta=95.`;

function fallbackStoryboard(productName: string): Storyboard {
  const safeName = productName || "this";
  const scenes = [
    { role: "HOOK" as const, caption: `Tired of the daily mess?`, intent: "pain-callout", motionIntensity: "high" as const, durationFrames: 36, vo: "Okay, if you have a cat, you genuinely need to see this." },
    { role: "PROBLEM" as const, caption: `Smells. Scooping. Stress.`, intent: "amplify-pain", motionIntensity: "medium" as const, durationFrames: 45, vo: "The smell, the scooping, the daily routine. It adds up." },
    { role: "EMOTION" as const, caption: `Your pet deserves better.`, intent: "emotional-pull", motionIntensity: "medium" as const, durationFrames: 45, vo: "And honestly, your cat deserves a better setup than this." },
    { role: "FEATURE" as const, caption: `${safeName} changes everything.`, intent: "product-reveal", motionIntensity: "high" as const, durationFrames: 60, vo: `So we tried ${safeName}, and it changed our whole routine.` },
    { role: "BENEFIT" as const, caption: `Cleaner. Calmer. Easier.`, intent: "benefit-stack", motionIntensity: "medium" as const, durationFrames: 54, vo: "Cleaner home, calmer cat, way less work every single day." },
    { role: "PROOF" as const, caption: `Pet owners are obsessed.`, intent: "social-proof", motionIntensity: "high" as const, durationFrames: 54, vo: "Thousands of pet parents have already made the switch." },
    { role: "CTA" as const, caption: `Shop the upgrade.`, intent: "cta-command", motionIntensity: "high" as const, durationFrames: 60, vo: "Tap the link and grab yours before it sells out." },
  ];
  return {
    scenes,
    emotionalCurve: [70, 85, 90, 55, 80, 75, 95],
    totalFrames: scenes.reduce((a, s) => a + s.durationFrames, 0),
    hookType: "problem_call_out",
    hookVariants: [
      { text: "Tired of the daily mess?", type: "problem_call_out", score: 78 },
      { text: "Your cat deserves better.", type: "emotion", score: 72 },
      { text: "This changed everything.", type: "curiosity", score: 70 },
      { text: "Pet owners are obsessed.", type: "social_proof", score: 68 },
      { text: "No smell. No mess.", type: "payoff", score: 75 },
    ],
    selectedHook: { text: "Tired of the daily mess?", type: "problem_call_out", score: 78 },
  };
}

async function generateWithAI(productName: string, productCategory: string): Promise<Storyboard> {
  if (!LOVABLE_API_KEY) return fallbackStoryboard(productName);

  const prompt = `Product: ${productName}
Category: ${productCategory || "pet supplies"}

Generate a 7-scene storyboard for a 9:16 vertical TikTok/Pinterest ad targeting US pet owners.
Return ONLY valid JSON matching this schema:
{
  "hookVariants": [{"text": "string ≤6 words", "type": "one of: ${HOOK_TYPES.join(", ")}", "score": 0-100}], // exactly 5
  "selectedHookIndex": number (0-4, highest scoring),
  "scenes": [
    {"role": "HOOK|PROBLEM|EMOTION|FEATURE|BENEFIT|PROOF|CTA", "caption": "≤6 words", "intent": "1 phrase", "motionIntensity": "high|medium|low", "durationFrames": 30-66, "vo": "1-2 spoken sentences (12-25 words) US-native conversational voice-over for this beat"}
  ], // exactly 7 in arc order
  "emotionalCurve": [number, ...] // 7 values 0-100
}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn("[storyboard] ai failed", res.status);
      return fallbackStoryboard(productName);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return fallbackStoryboard(productName);
    const parsed = JSON.parse(content);

    const hookVariants = Array.isArray(parsed.hookVariants) ? parsed.hookVariants.slice(0, 5) : [];
    const sel = Math.max(0, Math.min(hookVariants.length - 1, Number(parsed.selectedHookIndex ?? 0)));
    const selectedHook = hookVariants[sel] ?? { text: "Tired of the daily mess?", type: "problem_call_out", score: 70 };
    const scenes = Array.isArray(parsed.scenes) ? parsed.scenes.slice(0, 7) : [];
    const totalFrames = scenes.reduce((a: number, s: any) => a + Number(s?.durationFrames ?? 45), 0);

    return {
      scenes,
      emotionalCurve: Array.isArray(parsed.emotionalCurve) ? parsed.emotionalCurve.slice(0, 7) : [70, 85, 90, 55, 80, 75, 95],
      totalFrames: totalFrames || 354,
      hookType: String(selectedHook.type ?? "problem_call_out"),
      hookVariants,
      selectedHook,
    };
  } catch (e) {
    console.warn("[storyboard] error", e);
    return fallbackStoryboard(productName);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceCall = authHeader.includes(SERVICE_KEY);
    if (!isServiceCall) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: u, error } = await userClient.auth.getUser();
      if (error || !u?.user) return json(401, { ok: false, traceId, message: "unauthorized" });
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id ?? "");
    if (!jobId) return json(400, { ok: false, traceId, message: "job_id required" });

    const { data: job, error: jobErr } = await admin
      .from("cinematic_ad_jobs").select("id,product_slug,product_name,product_category").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return json(404, { ok: false, traceId, message: "job not found" });

    const storyboard = await generateWithAI(String(job.product_name ?? job.product_slug ?? "this product"), String(job.product_category ?? ""));

    // Hard duration governance: clamp scenes to preset cap (≤15s total, ≤4s/scene).
    const presetForJob = getPreset((job as any).preset ?? "pin-organic");
    const enforced = enforceSceneDurations(storyboard.scenes as any[], presetForJob);
    storyboard.scenes = enforced.scenes as any;
    storyboard.totalFrames = enforced.totalFrames;
    if (enforced.changed) {
      console.log(`[storyboard] ${traceId} duration-clamped`, {
        jobId, reasons: enforced.reasons, totalFrames: enforced.totalFrames,
        cap_sec: HARD_MAX_DURATION_SEC,
      });
    }

    const { error: updErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        storyboard: storyboard as any,
        hook_variants: storyboard.hookVariants as any,
        hook_text: storyboard.selectedHook.text,
        hook_type: storyboard.hookType,
        scene_roles: deriveSceneRoles(storyboard) as any,
      })
      .eq("id", jobId);
    if (updErr) return json(500, { ok: false, traceId, message: updErr.message });

    return json(200, { ok: true, traceId, storyboard });
  } catch (e) {
    return json(500, { ok: false, traceId, message: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * V4: derive the four required short-form scene roles (hook|problem|benefit|cta)
 * from the existing 7-beat storyboard so cinematic-ad-validate can enforce
 * scene-structure coverage. Maps HOOK→hook, PROBLEM/EMOTION→problem,
 * FEATURE/BENEFIT/PROOF→benefit, CTA→cta.
 */
function deriveSceneRoles(sb: Storyboard): string[] {
  const map: Record<string, string> = {
    HOOK: "hook",
    PROBLEM: "problem",
    EMOTION: "problem",
    FEATURE: "benefit",
    BENEFIT: "benefit",
    PROOF: "benefit",
    CTA: "cta",
  };
  const seen = new Set<string>();
  for (const s of sb.scenes ?? []) {
    const r = map[String(s.role ?? "").toUpperCase()];
    if (r) seen.add(r);
  }
  return Array.from(seen);
}