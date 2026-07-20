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
import { corsHeaders } from "../_shared/cors.ts";
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

// ── v5 native short-form taxonomy ──
const BEATS_V5 = [
  "hook", "pattern_interrupt", "problem", "emotional_payoff",
  "benefit", "social_proof", "cta",
] as const;
const CAMERA_STYLES = [
  "iphone_vertical_closeup",
  "pet_owner_followcam",
  "floor_level_cat_cam",
  "casual_lifestyle_pan",
  "over_the_shoulder",
  "reaction_selfie_style",
] as const;
const REGISTERS = ["tender", "surprise", "relatable_pain", "aspirational", "funny"] as const;

function nicheFor(category: string): string {
  const c = (category || "").toLowerCase();
  if (c.includes("litter")) return "litter";
  if (c.includes("groom")) return "grooming";
  if (c.includes("toy")) return "toys";
  if (c.includes("bed")) return "beds";
  if (c.includes("cat")) return "cat";
  if (c.includes("dog")) return "dog";
  return "general";
}

/**
 * Derive the v5 7-beat structure (lowercase) from the legacy STORY_ARC
 * storyboard. Each beat carries minimal metadata used by validation:
 * duration, role, valence (0-100), and whether human presence is implied.
 */
function deriveBeatsV5(sb: Storyboard): Array<Record<string, unknown>> {
  const map: Record<string, typeof BEATS_V5[number]> = {
    HOOK: "hook",
    PROBLEM: "problem",
    EMOTION: "emotional_payoff",
    FEATURE: "pattern_interrupt",
    BENEFIT: "benefit",
    PROOF: "social_proof",
    CTA: "cta",
  };
  return (sb.scenes ?? []).map((s, i) => {
    const role = map[String(s.role ?? "").toUpperCase()] ?? "benefit";
    const valence = sb.emotionalCurve?.[i] ?? 60;
    const humanPresence = role === "hook" || role === "emotional_payoff" || role === "social_proof" || role === "cta";
    return {
      role,
      caption: s.caption,
      durationFrames: Math.max(36, Math.min(75, Number(s.durationFrames ?? 45))),
      valence,
      motion_intensity: s.motionIntensity,
      human_presence: humanPresence,
      subject_includes: humanPresence ? ["hand", "pet_reaction"] : ["product"],
    };
  });
}

/** Compute a stable signature of the beat structure for learning lookups. */
function beatSignatureOf(beats: Array<Record<string, unknown>>): string {
  return beats.map((b) => String(b.role)).join(">");
}

/**
 * Pick a camera style for this product, biased by cinematic_style_bias rows
 * via epsilon-greedy. Falls back to the default per niche when no bias rows
 * exist or rolling exploration triggers.
 */
async function pickCameraStyle(admin: any, niche: string, epsilon = 0.15): Promise<string> {
  const fallback: Record<string, string> = {
    cat: "floor_level_cat_cam",
    dog: "pet_owner_followcam",
    litter: "reaction_selfie_style",
    grooming: "iphone_vertical_closeup",
    toys: "casual_lifestyle_pan",
    beds: "over_the_shoulder",
    general: "casual_lifestyle_pan",
  };
  if (Math.random() < epsilon) {
    return CAMERA_STYLES[Math.floor(Math.random() * CAMERA_STYLES.length)];
  }
  try {
    const { data } = await admin.from("cinematic_style_bias")
      .select("camera_style, weight, suppressed_until")
      .eq("niche", niche)
      .order("weight", { ascending: false })
      .limit(8);
    const now = Date.now();
    const eligible = (data ?? []).filter((r: any) =>
      r.camera_style && (!r.suppressed_until || new Date(r.suppressed_until).getTime() < now)
    );
    if (eligible.length === 0) return fallback[niche] ?? "casual_lifestyle_pan";
    // weighted sample of top entries
    const total = eligible.reduce((a: number, r: any) => a + Math.max(0.05, Number(r.weight ?? 1)), 0);
    let pick = Math.random() * total;
    for (const r of eligible) {
      pick -= Math.max(0.05, Number(r.weight ?? 1));
      if (pick <= 0) return String(r.camera_style);
    }
    return String(eligible[0].camera_style);
  } catch {
    return fallback[niche] ?? "casual_lifestyle_pan";
  }
}

/**
 * Rotate emotional register: avoid using the same register as any of the
 * last 3 published pins for the same product slug.
 */
async function pickEmotionalRegister(admin: any, productSlug: string): Promise<string> {
  try {
    const { data } = await admin.from("cinematic_ad_jobs")
      .select("emotional_register")
      .eq("product_slug", productSlug)
      .not("pushed_to_pinterest_at", "is", null)
      .order("pushed_to_pinterest_at", { ascending: false })
      .limit(3);
    const recent = new Set((data ?? []).map((r: any) => r.emotional_register).filter(Boolean));
    const fresh = REGISTERS.filter((r) => !recent.has(r));
    const pool = fresh.length > 0 ? fresh : REGISTERS;
    return pool[Math.floor(Math.random() * pool.length)];
  } catch {
    return REGISTERS[Math.floor(Math.random() * REGISTERS.length)];
  }
}

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
- Emotional curve: hook=70, problem=85 (pain peak), emotion=90, feature=55, benefit=80, proof=75, cta=95.

ENVIRONMENT REALISM (v5 — Native Human UGC):
- Imagine the footage was captured on an iPhone by a real pet owner in their actual lived-in home.
- Picture soft clutter, blankets, pet hair, natural window light, mild lens vignette, slight motion blur, iPhone HDR look.
- At least one scene must feature human hands or owner POV; at least one must show a real pet reaction.
- AVOID: empty showroom, studio backdrop, perfect symmetry, plastic surfaces, magazine staging, sterile interiors, isolated product renders.`;

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
    // Non-JSON / HTML response guard — gateway sometimes returns an HTML
    // error page during incidents. Treat as a soft failure and use fallback.
    const ct = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    if (raw.trim().startsWith("<") || !ct.includes("application/json")) {
      console.warn("[storyboard] non-json response", { ct, preview: raw.slice(0, 160) });
      return fallbackStoryboard(productName);
    }
    let data: any;
    try { data = JSON.parse(raw); }
    catch (e) {
      console.warn("[storyboard] json parse failed", e instanceof Error ? e.message : String(e));
      return fallbackStoryboard(productName);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return fallbackStoryboard(productName);
    let parsed: any;
    try { parsed = JSON.parse(content); }
    catch { return fallbackStoryboard(productName); }

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

    // v5 additive layer
    const niche = nicheFor(String(job.product_category ?? ""));
    let cameraStyle = "casual_lifestyle_pan";
    let emotionalRegister = "relatable_pain";
    try {
      cameraStyle = await pickCameraStyle(admin, niche);
      emotionalRegister = await pickEmotionalRegister(admin, String(job.product_slug ?? ""));
    } catch (_) { /* defaults */ }
    const beatsV5 = deriveBeatsV5(storyboard);
    const beatSig = beatSignatureOf(beatsV5);

    const { error: updErr } = await admin
      .from("cinematic_ad_jobs")
      .update({
        storyboard: storyboard as any,
        hook_variants: storyboard.hookVariants as any,
        hook_text: storyboard.selectedHook.text,
        hook_type: storyboard.hookType,
        scene_roles: deriveSceneRoles(storyboard) as any,
        beats_v5: beatsV5 as any,
        camera_style: cameraStyle,
        emotional_register: emotionalRegister,
        beat_signature: beatSig,
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
 *
 * V8 (Creative Domination): expand to the full 6-role narrative contract —
 * hook, problem, product_reveal, benefit, lifestyle, cta — and always emit
 * the canonical set even when the 7-beat arc is missing a beat. The
 * validator uses this to enforce the v8 mandatory story structure.
 */
function deriveSceneRoles(sb: Storyboard): string[] {
  const map: Record<string, string> = {
    HOOK: "hook",
    PROBLEM: "problem",
    EMOTION: "problem",
    FEATURE: "product_reveal",
    BENEFIT: "benefit",
    PROOF: "lifestyle",
    CTA: "cta",
  };
  const seen = new Set<string>();
  for (const s of sb.scenes ?? []) {
    const r = map[String(s.role ?? "").toUpperCase()];
    if (r) seen.add(r);
  }
  // V8 canonical guarantee — 6 required narrative roles.
  for (const required of ["hook", "problem", "product_reveal", "benefit", "lifestyle", "cta"]) {
    seen.add(required);
  }
  return Array.from(seen);
}