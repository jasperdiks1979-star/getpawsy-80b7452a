/**
 * Cinematic ad AI decision layer.
 *
 * Single Gemini call that, given a product, returns the full creative
 * decision sheet (audience, angle, intent, ad style, platform fit, positioning,
 * preset, voice style, pacing, duration, motion profile, music mood) plus a
 * confidence_scores block (hook, aesthetic, motion, viral, pinterest, overall).
 *
 * This is the brain behind "one-click autopilot mode" — the orchestrator uses
 * `overall` to decide whether to auto-publish or hold for admin approval.
 */

export type AdPreset = "pin-organic" | "pin-ads" | "tiktok-organic" | "tiktok-spark";
export type VoiceStyleId = "lifestyle" | "pet_parent" | "narrator" | "social";

export type AiDecisions = {
  audience: string;              // e.g. "US millennial cat parents, urban apartments"
  angle: string;                 // "emotional" | "luxury" | "problem_solution" | "curiosity" | "social_proof" | "ugc"
  intent: string;                // buyer intent description
  ad_style: string;              // e.g. "cinematic lifestyle reveal"
  platform_fit: AdPreset;
  positioning: "luxury" | "practical";
  pinterest_aesthetic: string;   // short descriptor
  voice_style: VoiceStyleId;
  pacing: "slow" | "medium" | "fast";
  duration_seconds: number;      // 12-25
  motion_profile: "subtle_kenburns" | "dynamic_pan" | "parallax_zoom" | "rapid_cut";
  music_mood: string;            // e.g. "warm acoustic", "cinematic uplift"
  rationale: string;             // 1 sentence summary
};

export type ConfidenceScores = {
  hook: number;          // 0-100
  aesthetic: number;
  motion: number;
  viral: number;
  pinterest: number;
  overall: number;
};

const FALLBACK: AiDecisions = {
  audience: "US pet parents, age 25-45",
  angle: "emotional",
  intent: "premium upgrade for daily pet routine",
  ad_style: "cinematic lifestyle reveal",
  platform_fit: "pin-organic",
  positioning: "luxury",
  pinterest_aesthetic: "warm, editorial, US-native home",
  voice_style: "lifestyle",
  pacing: "medium",
  duration_seconds: 22,
  motion_profile: "subtle_kenburns",
  music_mood: "warm acoustic uplift",
  rationale: "Default safe Pinterest-native angle when AI analysis is unavailable.",
};

function clamp(n: unknown, lo: number, hi: number, def: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return (allowed as readonly string[]).includes(String(v)) ? (v as T) : def;
}

export async function analyzeProduct(
  product: {
    name: string;
    slug: string;
    description?: string | null;
    category?: string | null;
    primary_species?: string | null;
    primary_intent?: string | null;
    price?: number | string | null;
    image_url?: string | null;
    images?: string[] | null;
  },
  apiKey: string,
): Promise<AiDecisions> {
  const sys = `You are a senior US-native Pinterest + TikTok creative director for GetPawsy (premium pet brand). Read the product and emit a single STRICT JSON object describing the optimal ad direction. Compliance: NO health claims, NO "vet-approved", NO "eco-friendly", NO fake reviews, NO price anchoring.`;
  const user = `Product:
- Name: ${product.name}
- Slug: ${product.slug}
- Category: ${product.category ?? "pet product"}
- Species: ${product.primary_species ?? "pet"}
- Buyer intent: ${product.primary_intent ?? "general"}
- Price: ${product.price ?? "—"}
- Image count: ${Array.isArray(product.images) ? product.images.length : (product.image_url ? 1 : 0)}
- Description: ${(product.description ?? "").slice(0, 700)}

Return STRICT JSON, no markdown, with this exact shape:
{
  "audience": "<one short sentence describing the target US buyer>",
  "angle": "emotional|luxury|problem_solution|curiosity|social_proof|ugc",
  "intent": "<one short sentence describing buyer intent>",
  "ad_style": "<3-6 word ad style descriptor>",
  "platform_fit": "pin-organic|pin-ads|tiktok-organic|tiktok-spark",
  "positioning": "luxury|practical",
  "pinterest_aesthetic": "<short descriptor>",
  "voice_style": "lifestyle|pet_parent|narrator|social",
  "pacing": "slow|medium|fast",
  "duration_seconds": 12-25,
  "motion_profile": "subtle_kenburns|dynamic_pan|parallax_zoom|rapid_cut",
  "music_mood": "<2-4 word music mood>",
  "rationale": "<one sentence justifying the chosen direction>"
}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("[ai-decisions] non-2xx", res.status, await res.text());
      return FALLBACK;
    }
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const p = JSON.parse(cleaned);

    return {
      audience: String(p?.audience ?? FALLBACK.audience).slice(0, 220),
      angle: String(p?.angle ?? FALLBACK.angle),
      intent: String(p?.intent ?? FALLBACK.intent).slice(0, 220),
      ad_style: String(p?.ad_style ?? FALLBACK.ad_style).slice(0, 80),
      platform_fit: pickEnum<AdPreset>(p?.platform_fit, ["pin-organic","pin-ads","tiktok-organic","tiktok-spark"], FALLBACK.platform_fit),
      positioning: pickEnum<"luxury"|"practical">(p?.positioning, ["luxury","practical"], FALLBACK.positioning),
      pinterest_aesthetic: String(p?.pinterest_aesthetic ?? FALLBACK.pinterest_aesthetic).slice(0, 120),
      voice_style: pickEnum<VoiceStyleId>(p?.voice_style, ["lifestyle","pet_parent","narrator","social"], FALLBACK.voice_style),
      pacing: pickEnum<"slow"|"medium"|"fast">(p?.pacing, ["slow","medium","fast"], FALLBACK.pacing),
      duration_seconds: clamp(p?.duration_seconds, 12, 25, FALLBACK.duration_seconds),
      motion_profile: pickEnum<AiDecisions["motion_profile"]>(
        p?.motion_profile,
        ["subtle_kenburns","dynamic_pan","parallax_zoom","rapid_cut"],
        FALLBACK.motion_profile,
      ),
      music_mood: String(p?.music_mood ?? FALLBACK.music_mood).slice(0, 60),
      rationale: String(p?.rationale ?? FALLBACK.rationale).slice(0, 300),
    };
  } catch (e) {
    console.error("[ai-decisions] failed", e);
    return FALLBACK;
  }
}

/**
 * Compute confidence scores from the prepared job + decisions. Pure
 * deterministic heuristic so the autopilot threshold is reproducible.
 */
export function computeConfidenceScores(job: any, decisions: AiDecisions): ConfidenceScores {
  // Hook: top hook score from creative-kit if present, otherwise 60.
  const hooks: any[] = Array.isArray(job?.hook_variants_meta) ? job.hook_variants_meta : [];
  const topHook = hooks.length ? Math.max(...hooks.map((h: any) => Number(h?.score) || 0)) : 60;

  // Aesthetic: count AI-generated unique scene stills.
  const sceneAssets: any[] = Array.isArray(job?.scene_assets) ? job.scene_assets : [];
  const aiGen = sceneAssets.filter((s) => s?.ai_generated).length;
  const aesthetic = sceneAssets.length === 0 ? 40 : Math.min(100, 40 + Math.round((aiGen / sceneAssets.length) * 60));

  // Motion: prefer dynamic profiles for thin-media products.
  const motionMap: Record<AiDecisions["motion_profile"], number> = {
    subtle_kenburns: 70,
    dynamic_pan: 80,
    parallax_zoom: 85,
    rapid_cut: 75,
  };
  const motion = motionMap[decisions.motion_profile] ?? 70;

  // Pinterest compatibility: pin copy present + hashtags + duration in range.
  let pinterest = 50;
  if (job?.pin_title) pinterest += 15;
  if (job?.pin_description) pinterest += 15;
  if (Array.isArray(job?.hashtags) && job.hashtags.length >= 3) pinterest += 10;
  if (decisions.duration_seconds >= 12 && decisions.duration_seconds <= 25) pinterest += 10;
  pinterest = Math.min(100, pinterest);

  // Viral potential: weighted hook + motion + angle bonus.
  const angleBonus = ["emotional", "curiosity", "social_proof", "ugc"].includes(decisions.angle) ? 8 : 0;
  const viral = Math.min(100, Math.round(topHook * 0.5 + motion * 0.3 + aesthetic * 0.2 + angleBonus));

  const overall = Math.round(
    topHook * 0.30 +
    aesthetic * 0.20 +
    motion * 0.15 +
    viral * 0.20 +
    pinterest * 0.15,
  );

  return {
    hook: Math.round(topHook),
    aesthetic,
    motion,
    viral,
    pinterest,
    overall: Math.max(0, Math.min(100, overall)),
  };
}