/**
 * Cinematic ad "creative kit" generator.
 *
 * Given a product + voice style, calls Lovable AI to return a complete
 * Pinterest creative kit in one structured JSON call:
 *   - 5 hook variants across 6 angles (emotional, luxury, problem/solution,
 *     curiosity, social proof, ugc)
 *   - 3 CTA variants
 *   - 1 full voiceover script
 *   - Pinterest pin title + description + hashtags
 *   - 6-scene storyboard (scene_index, role, visual, on_screen_text, vo_line, duration_s)
 *
 * Hooks are then scored locally with a pure-string CTR heuristic so the
 * highest-CTR hook can be pre-selected in the admin UI. Manual override is
 * still respected — scoring never blocks regeneration.
 */

import type { VoiceStyle } from "./voice-styles.ts";

export type HookAngle =
  | "emotional"
  | "luxury"
  | "problem_solution"
  | "curiosity"
  | "social_proof"
  | "ugc";

export type HookVariant = {
  angle: HookAngle;
  text: string;
  score: number;        // 0-100 predicted-CTR heuristic
  reasoning: string;    // human-readable why
};

export type CtaVariant = {
  text: string;
  score: number;
};

export type StoryboardScene = {
  scene_index: number;
  role: "hook" | "reveal" | "feature" | "craft" | "lifestyle" | "cta";
  visual: string;
  on_screen_text: string;
  vo_line: string;
  duration_s: number;
};

export type CreativeKit = {
  hook_variants: HookVariant[];
  cta_variants: CtaVariant[];
  vo_script: string;
  pin_title: string;
  pin_description: string;
  hashtags: string[];
  storyboard: StoryboardScene[];
  selected_hook_index: number;
  selected_cta_index: number;
};

const POWER_WORDS = [
  "stop", "finally", "never", "why", "how", "secret", "truth", "real",
  "proven", "new", "free", "instantly", "tired", "love", "hate", "obsessed",
  "viral", "trending", "no more", "best", "worst", "honest",
];

/**
 * Score a hook 0-100 using pure string heuristics. Not a real CTR model —
 * deliberately deterministic so the UI can show a "predicted CTR" badge
 * without any extra AI call.
 */
export function scoreHook(text: string): { score: number; reasoning: string } {
  const t = (text ?? "").trim();
  if (!t) return { score: 0, reasoning: "empty" };
  const lower = t.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  const wc = words.length;

  const reasons: string[] = [];
  let s = 50;

  // Length: 4-9 words is the sweet spot for vertical video hooks.
  if (wc >= 4 && wc <= 9) { s += 18; reasons.push(`${wc}w ideal`); }
  else if (wc >= 3 && wc <= 12) { s += 8; reasons.push(`${wc}w ok`); }
  else { s -= 12; reasons.push(`${wc}w off-range`); }

  // Strong opener (verb / question / number).
  if (/^(stop|why|how|finally|never|i|you|this|the|when|what|imagine|meet|tired|forget)\b/i.test(t)) {
    s += 8; reasons.push("strong opener");
  }

  // Question or exclamation drives curiosity / energy.
  if (/[?]/.test(t)) { s += 6; reasons.push("question"); }
  if (/[!]/.test(t)) { s += 3; reasons.push("exclamation"); }

  // Numbers / specificity.
  if (/\b\d+\b/.test(t)) { s += 5; reasons.push("number"); }

  // Power words.
  const hits = POWER_WORDS.filter((w) => lower.includes(w));
  if (hits.length) { s += Math.min(10, hits.length * 4); reasons.push(`power:${hits.slice(0, 2).join("/")}`); }

  // Penalize generic / bland openers.
  if (/^(check out|introducing|hello|hi)\b/i.test(t)) { s -= 10; reasons.push("bland opener"); }

  // Penalize ALL-CAPS shouting (more than 60% caps).
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length > 6) {
    const capsRatio = letters.replace(/[^A-Z]/g, "").length / letters.length;
    if (capsRatio > 0.6) { s -= 8; reasons.push("shouty"); }
  }

  // Penalize overlong char count for on-screen text.
  if (t.length > 70) { s -= 6; reasons.push("too long onscreen"); }

  s = Math.max(1, Math.min(100, Math.round(s)));
  return { score: s, reasoning: reasons.join(" · ") };
}

function scoreCta(text: string): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  let s = 60;
  const wc = t.split(/\s+/).length;
  if (wc <= 4) s += 15;
  if (/[→>]/.test(t)) s += 5;
  if (/(shop|get|tap|see|try|grab)/i.test(t)) s += 10;
  if (t.length > 25) s -= 10;
  return Math.max(1, Math.min(100, s));
}

const ANGLES: HookAngle[] = [
  "emotional", "luxury", "problem_solution", "curiosity", "social_proof", "ugc",
];

function fallbackKit(productName: string): CreativeKit {
  const hooks: HookVariant[] = [
    { angle: "emotional",        text: `You'll wonder how you lived without ${productName}.`, score: 0, reasoning: "" },
    { angle: "problem_solution", text: `Tired of the mess? ${productName} fixes it.`,         score: 0, reasoning: "" },
    { angle: "curiosity",        text: `Why pet parents are switching to ${productName}.`,    score: 0, reasoning: "" },
    { angle: "social_proof",     text: `Trending with US pet parents this week.`,             score: 0, reasoning: "" },
    { angle: "luxury",           text: `The premium upgrade your home deserves.`,             score: 0, reasoning: "" },
  ].map((h) => ({ ...h, ...scoreHook(h.text) }));

  const ctas: CtaVariant[] = [
    { text: "Shop now →",     score: 0 },
    { text: "Tap to get yours", score: 0 },
    { text: "See it at GetPawsy.pet", score: 0 },
  ].map((c) => ({ ...c, score: scoreCta(c.text) }));

  hooks.sort((a, b) => b.score - a.score);
  ctas.sort((a, b) => b.score - a.score);

  return {
    hook_variants: hooks,
    cta_variants: ctas,
    vo_script: `Meet ${productName}. Designed for real homes, real pets, and real life. Premium materials. Effortless every day. Get yours at GetPawsy dot pet.`,
    pin_title: `${productName} — premium for pet parents`,
    pin_description: `Designed for real US pet parents. See why ${productName} is trending at GetPawsy.pet.`,
    hashtags: ["#petparents", "#getpawsy", "#petfinds", "#pinterestfinds", "#dogmom"],
    storyboard: [],
    selected_hook_index: 0,
    selected_cta_index: 0,
  };
}

export async function generateCreativeKit(
  product: {
    name: string;
    description?: string | null;
    category?: string | null;
    primary_species?: string | null;
    primary_intent?: string | null;
    price?: number | string | null;
    slug: string;
  },
  voiceStyle: VoiceStyle,
  apiKey: string,
): Promise<CreativeKit> {
  const sys = `You are a senior US-native Pinterest + TikTok video ad creative director for GetPawsy (premium pet brand).
Voice persona: ${voiceStyle.persona}.
Compliance: NO health claims, NO "vet-approved", NO "eco-friendly", NO fake reviews, NO price anchoring, NO placeholder text. Premium, warm, US-native tone.
Always end the VO with a clear call-to-action to GetPawsy.pet.`;

  const user = `Product:
- Name: ${product.name}
- Slug: ${product.slug}
- Category: ${product.category ?? "pet product"}
- Species: ${product.primary_species ?? "pet"}
- Intent: ${product.primary_intent ?? "general"}
- Price: ${product.price ?? "—"}
- Description: ${(product.description ?? "").slice(0, 600)}

Return STRICT JSON (no markdown, no prose) with this exact shape:
{
  "hook_variants": [
    { "angle": "emotional",        "text": "<3-9 word hook>" },
    { "angle": "luxury",           "text": "<3-9 word hook>" },
    { "angle": "problem_solution", "text": "<3-9 word hook>" },
    { "angle": "curiosity",        "text": "<3-9 word hook>" },
    { "angle": "social_proof",     "text": "<3-9 word hook>" }
  ],
  "cta_variants": [
    { "text": "<<=20 char CTA>" },
    { "text": "<<=20 char CTA>" },
    { "text": "<<=20 char CTA>" }
  ],
  "vo_script": "<one continuous voiceover, 45-65 words, ends with: Get yours at GetPawsy dot pet>",
  "pin_title": "<<=100 chars, Pinterest pin title>",
  "pin_description": "<<=480 chars, ends with: Shop now at GetPawsy.pet>",
  "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"],
  "storyboard": [
    { "scene_index": 1, "role": "hook",      "visual": "<wide lifestyle establishing>", "on_screen_text": "<hook caption>", "vo_line": "<spoken line>", "duration_s": 3 },
    { "scene_index": 2, "role": "reveal",    "visual": "<low-angle product hero>",      "on_screen_text": "<reveal caption>", "vo_line": "<spoken line>", "duration_s": 4 },
    { "scene_index": 3, "role": "feature",   "visual": "<side profile in home>",        "on_screen_text": "<benefit caption>", "vo_line": "<spoken line>", "duration_s": 4 },
    { "scene_index": 4, "role": "craft",     "visual": "<macro detail of feature>",     "on_screen_text": "<craft caption>",   "vo_line": "<spoken line>", "duration_s": 4 },
    { "scene_index": 5, "role": "lifestyle", "visual": "<top-down in-use moment>",      "on_screen_text": "<ease caption>",    "vo_line": "<spoken line>", "duration_s": 4 },
    { "scene_index": 6, "role": "cta",       "visual": "<centered hero beauty shot>",   "on_screen_text": "Get yours at GetPawsy.pet", "vo_line": "<closing CTA line>", "duration_s": 4 }
  ]
}

Rules:
- Each of the 5 hook_variants uses a DIFFERENT creative angle (no near-duplicates).
- Add a 6th hook angle "ugc" as the FIRST entry if it fits, otherwise keep the 5 above.
- CTA texts are short tap-button text (max 20 chars).
- vo_script mentions the product name once, naturally.
- on_screen_text in scene 6 must be exactly: Get yours at GetPawsy.pet`;

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
      console.error("[creative-kit] non-2xx", res.status, await res.text());
      return fallbackKit(product.name);
    }
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const rawHooks = Array.isArray(parsed?.hook_variants) ? parsed.hook_variants : [];
    const hooks: HookVariant[] = rawHooks
      .map((h: any): HookVariant | null => {
        const text = String(h?.text ?? "").trim();
        if (!text) return null;
        const angle = ANGLES.includes(h?.angle) ? (h.angle as HookAngle) : "curiosity";
        const { score, reasoning } = scoreHook(text);
        return { angle, text, score, reasoning };
      })
      .filter(Boolean) as HookVariant[];

    const rawCtas = Array.isArray(parsed?.cta_variants) ? parsed.cta_variants : [];
    const ctas: CtaVariant[] = rawCtas
      .map((c: any): CtaVariant | null => {
        const text = String(c?.text ?? "").trim().slice(0, 30);
        if (!text) return null;
        return { text, score: scoreCta(text) };
      })
      .filter(Boolean) as CtaVariant[];

    const storyboard: StoryboardScene[] = Array.isArray(parsed?.storyboard)
      ? parsed.storyboard.map((s: any, i: number): StoryboardScene => ({
          scene_index: Number(s?.scene_index ?? i + 1),
          role: (["hook","reveal","feature","craft","lifestyle","cta"] as const).includes(s?.role) ? s.role : "feature",
          visual: String(s?.visual ?? ""),
          on_screen_text: String(s?.on_screen_text ?? ""),
          vo_line: String(s?.vo_line ?? ""),
          duration_s: Number(s?.duration_s ?? 4),
        }))
      : [];

    if (hooks.length === 0 || ctas.length === 0) {
      console.warn("[creative-kit] missing hooks/ctas, using fallback");
      return fallbackKit(product.name);
    }

    hooks.sort((a, b) => b.score - a.score);
    ctas.sort((a, b) => b.score - a.score);

    return {
      hook_variants: hooks.slice(0, 6),
      cta_variants: ctas.slice(0, 3),
      vo_script: String(parsed?.vo_script ?? "").trim() || fallbackKit(product.name).vo_script,
      pin_title: String(parsed?.pin_title ?? "").slice(0, 100),
      pin_description: String(parsed?.pin_description ?? "").slice(0, 480),
      hashtags: Array.isArray(parsed?.hashtags)
        ? parsed.hashtags.map((h: unknown) => String(h ?? "").trim()).filter(Boolean).slice(0, 8)
        : [],
      storyboard,
      selected_hook_index: 0,
      selected_cta_index: 0,
    };
  } catch (e) {
    console.error("[creative-kit] failed", e);
    return fallbackKit(product.name);
  }
}