// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Pin Modes — 10 Pinterest-native creative archetypes
// ─────────────────────────────────────────────────────────────────────────────
// Each mode is an abstract creative recipe (composition + palette + typography
// + CTA tone + safe-area config) inspired by patterns that consistently win
// on Pinterest commerce. We deliberately do NOT clone any specific brand —
// only the abstract feature set (e.g. "warm beige minimal luxury") is reused.
//
// Modes are combined with a niche StyleDNA → final scene brief.

export type PinModeKey =
  | "cozy_lifestyle"
  | "before_after"
  | "emotional_pain"
  | "transformation"
  | "social_proof"
  | "luxury_minimal"
  | "viral_curiosity"
  | "ugc_style"
  | "moodboard_collage"
  | "product_lifestyle_blend";

export interface SafeAreaConfig {
  /** Top safe % reserved for headline (no busy detail). */
  headline_top_pct: number;
  /** Bottom safe % reserved for CTA. */
  cta_bottom_pct: number;
  /** Where the dominant subject should sit (vertical %). */
  subject_focus_pct: number;
}

export interface PinMode {
  key: PinModeKey;
  label: string;
  /** What this pin is psychologically optimized for. */
  psychology: string;
  /** Composition rule passed to the image model. */
  composition_rule: string;
  /** Abstract palette guidance. */
  palette: string;
  /** Typography style hint (mapped to dna.typography when both present). */
  typography_hint: "serif elegant" | "serif soft" | "serif refined" | "serif bold" | "condensed sans";
  /** Tone of CTA copy. */
  cta_tone: "soft" | "confident" | "urgent" | "curious" | "luxury" | "warm";
  /** Safe-area config for headline/CTA placement. */
  safe_area: SafeAreaConfig;
  /** Negative directives for the image model. */
  must_avoid: string[];
  /** Required scene/visual ingredients. */
  must_have: string[];
  /** Whether this mode prefers a multi-image collage layout. */
  is_collage: boolean;
}

const COMMON_AVOID = [
  "floating product cutouts",
  "Canva template look",
  "neon colors",
  "harsh CTA bars",
  "watermarks",
  "stock-photo composite",
  "low-quality dropshipping ad",
  "cluttered layout",
];

export const PIN_MODES: Record<PinModeKey, PinMode> = {
  cozy_lifestyle: {
    key: "cozy_lifestyle",
    label: "Cozy Lifestyle",
    psychology: "warmth, belonging, daily comfort — high save rate from pinners curating cozy homes",
    composition_rule:
      "wide editorial interior with the product naturally integrated into a cozy daily-life scene; soft layering, generous negative space at top",
    palette: "warm beige, oat, cream, soft terracotta, warm white",
    typography_hint: "serif elegant",
    cta_tone: "warm",
    safe_area: { headline_top_pct: 18, cta_bottom_pct: 16, subject_focus_pct: 60 },
    must_avoid: COMMON_AVOID,
    must_have: ["warm natural light", "soft fabrics", "lived-in detail"],
    is_collage: false,
  },
  before_after: {
    key: "before_after",
    label: "Before / After",
    psychology: "transformation curiosity — pinners save proof of change",
    composition_rule:
      "vertical split (or stacked) layout: 'before' on top with a believable, modest pain state; 'after' on bottom showing calm/clean/cozy outcome with the product",
    palette: "muted before / brighter warmer after",
    typography_hint: "serif refined",
    cta_tone: "confident",
    safe_area: { headline_top_pct: 10, cta_bottom_pct: 12, subject_focus_pct: 50 },
    must_avoid: [...COMMON_AVOID, "exaggerated dirt or distress", "shock imagery"],
    must_have: ["clear visual contrast", "same camera angle on both halves"],
    is_collage: true,
  },
  emotional_pain: {
    key: "emotional_pain",
    label: "Emotional Pain",
    psychology: "validates a quiet daily frustration without being negative",
    composition_rule:
      "single intimate scene that hints at the problem (mess, tangle, restless pet) but stays beautiful and merchant-safe; product visible as the resolution",
    palette: "soft moody neutrals, slightly cooler light",
    typography_hint: "serif elegant",
    cta_tone: "soft",
    safe_area: { headline_top_pct: 16, cta_bottom_pct: 18, subject_focus_pct: 55 },
    must_avoid: [...COMMON_AVOID, "actual filth", "scary or distressed pet expressions"],
    must_have: ["empathetic framing", "clear pain signal", "product as the answer"],
    is_collage: false,
  },
  transformation: {
    key: "transformation",
    label: "Transformation",
    psychology: "aspirational change — a single beautiful 'after' state",
    composition_rule:
      "single editorial scene of the post-product life: calm pet, tidy home, owner relaxed; subject focus on the new normal, not the product",
    palette: "warm bright clean neutrals",
    typography_hint: "serif refined",
    cta_tone: "confident",
    safe_area: { headline_top_pct: 14, cta_bottom_pct: 14, subject_focus_pct: 60 },
    must_avoid: COMMON_AVOID,
    must_have: ["clear emotional payoff", "product naturally in scene"],
    is_collage: false,
  },
  social_proof: {
    key: "social_proof",
    label: "Social Proof",
    psychology: "real-people authority — relatable owner moment",
    composition_rule:
      "warm candid moment (hands, partial owner in frame) with the product naturally in use; feels like a real customer's photo, not a studio shot",
    palette: "warm candid neutrals, slight grain feel",
    typography_hint: "serif elegant",
    cta_tone: "warm",
    safe_area: { headline_top_pct: 14, cta_bottom_pct: 14, subject_focus_pct: 60 },
    must_avoid: [...COMMON_AVOID, "studio backdrop", "obvious modeling"],
    must_have: ["partial human (hands/profile)", "candid framing"],
    is_collage: false,
  },
  luxury_minimal: {
    key: "luxury_minimal",
    label: "Luxury Minimal",
    psychology: "premium positioning, quiet confidence",
    composition_rule:
      "minimal editorial composition with strong negative space, refined materials, single hero subject, gentle directional light",
    palette: "ivory, bone, soft taupe, oak, warm white",
    typography_hint: "serif refined",
    cta_tone: "luxury",
    safe_area: { headline_top_pct: 18, cta_bottom_pct: 14, subject_focus_pct: 58 },
    must_avoid: [...COMMON_AVOID, "busy props", "loud color"],
    must_have: ["high negative space", "refined materials"],
    is_collage: false,
  },
  viral_curiosity: {
    key: "viral_curiosity",
    label: "Viral Curiosity",
    psychology: "an unexpected angle that earns the click",
    composition_rule:
      "unusual but tasteful framing (low-angle, top-down, behind-the-scenes) that begs the question 'what is this?'; product central but partially revealed",
    palette: "warm cinematic neutrals",
    typography_hint: "serif bold",
    cta_tone: "curious",
    safe_area: { headline_top_pct: 15, cta_bottom_pct: 16, subject_focus_pct: 55 },
    must_avoid: [...COMMON_AVOID, "clickbait fonts", "shocking imagery"],
    must_have: ["unexpected angle", "intentional negative space"],
    is_collage: false,
  },
  ugc_style: {
    key: "ugc_style",
    label: "UGC Style",
    psychology: "looks like a real pet parent took it on their phone",
    composition_rule:
      "warm slightly imperfect framing, mid-day natural light, hand-held feel, product in everyday setting; absolutely no studio polish",
    palette: "natural daylight neutrals",
    typography_hint: "serif elegant",
    cta_tone: "warm",
    safe_area: { headline_top_pct: 14, cta_bottom_pct: 14, subject_focus_pct: 58 },
    must_avoid: [...COMMON_AVOID, "studio polish", "perfect symmetry"],
    must_have: ["candid daylight", "everyday context"],
    is_collage: false,
  },
  moodboard_collage: {
    key: "moodboard_collage",
    label: "Moodboard Collage",
    psychology: "save-worthy curated aesthetic — pinners save the vibe",
    composition_rule:
      "tasteful 3–5 image collage: room scene, detail shot, pet shot, swatch/material; soft edges or thin off-white gutters; absolutely NO product cards",
    palette: "warm cohesive palette across all tiles",
    typography_hint: "serif refined",
    cta_tone: "soft",
    safe_area: { headline_top_pct: 10, cta_bottom_pct: 10, subject_focus_pct: 50 },
    must_avoid: [...COMMON_AVOID, "harsh borders", "white background tiles"],
    must_have: ["unified palette", "varied shot scales"],
    is_collage: true,
  },
  product_lifestyle_blend: {
    key: "product_lifestyle_blend",
    label: "Product + Lifestyle Blend",
    psychology: "balanced commerce intent — clear product, immersive context",
    composition_rule:
      "single scene where the product is clearly identifiable AND the lifestyle context is fully present; mid-distance framing, soft depth-of-field",
    palette: "warm neutral palette",
    typography_hint: "serif elegant",
    cta_tone: "confident",
    safe_area: { headline_top_pct: 14, cta_bottom_pct: 14, subject_focus_pct: 58 },
    must_avoid: COMMON_AVOID,
    must_have: ["clear product visibility", "fully realized environment"],
    is_collage: false,
  },
};

export const PIN_MODE_KEYS: PinModeKey[] = Object.keys(PIN_MODES) as PinModeKey[];

export function getPinMode(key: PinModeKey): PinMode {
  return PIN_MODES[key] ?? PIN_MODES.product_lifestyle_blend;
}

/** Normalize unknown strings into a valid PinModeKey, defaulting to blend. */
export function asPinModeKey(s: string | null | undefined): PinModeKey {
  if (!s) return "product_lifestyle_blend";
  return PIN_MODE_KEYS.includes(s as PinModeKey)
    ? (s as PinModeKey)
    : "product_lifestyle_blend";
}