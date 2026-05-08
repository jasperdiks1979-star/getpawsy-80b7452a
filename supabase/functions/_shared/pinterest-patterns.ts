// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Competitive Intelligence — Pattern Library
// ─────────────────────────────────────────────────────────────────────────────
// Codifies the documented winning visual patterns of high-performing US pet
// Pinterest pins. NEVER references or copies any specific competitor asset.
// Each pattern is a fingerprint that the AI Creative Director uses to
// constrain scene briefs + render directives + quality scoring.

import type { NicheKey } from "./pinterest-style-dna.ts";

export type PatternId =
  | "cozy_warm_interior"
  | "before_after_transformation"
  | "editorial_minimal"
  | "soft_luxury"
  | "scandi_decor"
  | "cinematic_pet_portrait"
  | "lifestyle_first_subtle_product"
  | "emotional_bonding"
  | "adventure_golden_hour"
  | "cozy_emotional_comfort"
  | "clean_aspirational_routine"
  | "multi_pet_decor";

export type WhitespaceBudget = "high" | "medium" | "low";
export type CtaPlacement = "bottom_subtle" | "top_minimal" | "none";

export interface PinterestPattern {
  id: PatternId;
  label: string;
  /** One-sentence visual psychology that explains why it works. */
  psychology: string;
  /** Composition rule injected verbatim into the image prompt. */
  composition_rule: string;
  typography_preference:
    | "serif elegant"
    | "serif bold"
    | "serif refined"
    | "condensed sans"
    | "serif soft";
  whitespace: WhitespaceBudget;
  cta_placement: CtaPlacement;
  /** Emotional angle the headline must lean into. */
  hook_angle: string;
  /** Substrings the brief MUST mention (case-insensitive, lemma-ish). */
  must_have: string[];
  /** Substrings that auto-reject the brief or render. */
  must_avoid: string[];
  /** 0..1 affinity per niche — used by the weighted selector. */
  niche_affinity: Partial<Record<NicheKey, number>>;
}

const COMMON_AVOID = [
  "floating product card",
  "product cutout",
  "white background",
  "collage",
  "template",
  "giant cta",
  "cta bar",
  "watermark",
  "infographic",
  "stock photo",
  "studio backdrop",
];

export const PATTERN_LIBRARY: Record<PatternId, PinterestPattern> = {
  cozy_warm_interior: {
    id: "cozy_warm_interior",
    label: "Cozy warm interior",
    psychology:
      "Warm domestic light + soft textures trigger a 'I want this calm life' save reflex.",
    composition_rule:
      "Wide editorial interior, warm late-afternoon light raking across natural wood and linen, product placed naturally inside a styled corner of a real home.",
    typography_preference: "serif elegant",
    whitespace: "medium",
    cta_placement: "bottom_subtle",
    hook_angle: "calm, relief, 'home you want'",
    must_have: ["warm light", "interior", "natural"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      cat_litter: 0.85,
      calming_bed: 0.7,
      dog_bed: 0.8,
      cat_fountain: 0.6,
      feeder: 0.6,
      generic_pet: 0.7,
    },
  },

  before_after_transformation: {
    id: "before_after_transformation",
    label: "Before / after transformation",
    psychology:
      "Sequential contrast forces the eye to compare and creates an instant outcome promise.",
    composition_rule:
      "Two clearly separated halves of one cohesive scene — the same room or pet, captured before and after the product is in use. Both halves photographed in the same realistic style; never collage, never split-screen template.",
    typography_preference: "serif bold",
    whitespace: "low",
    cta_placement: "bottom_subtle",
    hook_angle: "outcome promise, transformation",
    must_have: ["before", "after", "same scene"],
    must_avoid: [...COMMON_AVOID, "split screen graphic", "comparison chart"],
    niche_affinity: {
      cat_litter: 0.6,
      grooming: 0.85,
      calming_bed: 0.5,
      interactive_toy: 0.5,
    },
  },

  editorial_minimal: {
    id: "editorial_minimal",
    label: "Editorial minimal",
    psychology:
      "70%+ negative space reads as premium and earns the save as 'aesthetic inspo'.",
    composition_rule:
      "Magazine-style composition with at least 60% clean negative space, single hero subject, restrained palette, gallery-quality framing.",
    typography_preference: "serif refined",
    whitespace: "high",
    cta_placement: "top_minimal",
    hook_angle: "aspirational, design-forward",
    must_have: ["negative space", "minimal", "single hero"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      cat_tree: 0.85,
      cat_fountain: 0.75,
      feeder: 0.6,
      grooming: 0.5,
      generic_pet: 0.6,
    },
  },

  soft_luxury: {
    id: "soft_luxury",
    label: "Soft luxury",
    psychology:
      "Cream/oat palette + refined serif signals premium, raises perceived price + trust.",
    composition_rule:
      "Cream, oat, and warm-white palette with a single hero subject, layered fabrics, refined natural textures, soft daylight.",
    typography_preference: "serif elegant",
    whitespace: "medium",
    cta_placement: "bottom_subtle",
    hook_angle: "premium, refined comfort",
    must_have: ["cream", "soft", "premium"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      cat_litter: 0.85,
      calming_bed: 0.85,
      dog_bed: 0.85,
      cat_tree: 0.6,
      generic_pet: 0.7,
    },
  },

  scandi_decor: {
    id: "scandi_decor",
    label: "Scandinavian decor",
    psychology:
      "White oak + plants + neutral textiles is the dominant 'home decor' Pinterest aesthetic.",
    composition_rule:
      "Scandinavian living room: white oak floors, linen sofa, large monstera or olive tree, neutral rug, abundant daylight from a tall window.",
    typography_preference: "serif refined",
    whitespace: "high",
    cta_placement: "top_minimal",
    hook_angle: "decor harmony, home aesthetic",
    must_have: ["scandinavian", "neutral", "daylight"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      cat_tree: 0.95,
      cat_fountain: 0.7,
      feeder: 0.6,
      generic_pet: 0.55,
    },
  },

  cinematic_pet_portrait: {
    id: "cinematic_pet_portrait",
    label: "Cinematic pet portrait",
    psychology:
      "Shallow depth of field + dramatic light + eye contact creates emotional stop-scroll.",
    composition_rule:
      "Tight portrait of the pet with shallow depth of field, dramatic directional light, soulful eye contact, painterly bokeh.",
    typography_preference: "serif soft",
    whitespace: "medium",
    cta_placement: "bottom_subtle",
    hook_angle: "emotional connection, soulful",
    must_have: ["portrait", "shallow depth", "eye contact"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      calming_bed: 0.8,
      dog_car: 0.75,
      dog_harness: 0.8,
      dog_bed: 0.6,
      generic_pet: 0.65,
    },
  },

  lifestyle_first_subtle_product: {
    id: "lifestyle_first_subtle_product",
    label: "Lifestyle first, subtle product",
    psychology:
      "Product is secondary to the scene — viewer projects the lifestyle onto themselves first.",
    composition_rule:
      "Lifestyle scene where the pet and owner moment is the focus; product appears naturally integrated and recognizable but never the visual center.",
    typography_preference: "serif elegant",
    whitespace: "medium",
    cta_placement: "bottom_subtle",
    hook_angle: "aspirational lifestyle",
    must_have: ["lifestyle", "naturally integrated", "moment"],
    must_avoid: [...COMMON_AVOID, "product hero shot", "studio packshot"],
    niche_affinity: {
      dog_bed: 0.85,
      cat_litter: 0.6,
      dog_car: 0.7,
      feeder: 0.7,
      generic_pet: 0.8,
    },
  },

  emotional_bonding: {
    id: "emotional_bonding",
    label: "Emotional bonding",
    psychology:
      "Owner+pet hands or embrace activates oxytocin association, drives saves to 'pet inspiration'.",
    composition_rule:
      "Intimate framing of owner and pet together — hands resting on the pet, foreheads touching, or pet curled into the owner's lap; warm soft light, shallow depth.",
    typography_preference: "serif soft",
    whitespace: "low",
    cta_placement: "bottom_subtle",
    hook_angle: "love, bond, devotion",
    must_have: ["owner", "pet together", "intimate"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      calming_bed: 0.8,
      dog_car: 0.7,
      grooming: 0.7,
      generic_pet: 0.7,
    },
  },

  adventure_golden_hour: {
    id: "adventure_golden_hour",
    label: "Adventure / golden hour",
    psychology:
      "Outdoor warm-light motion = freedom + family travel fantasy, very save-able on Pinterest 'travel' boards.",
    composition_rule:
      "Outdoor adventure setting (trail, coast, open road) at golden hour, warm raking light, sense of motion or open horizon, dog in active or relaxed pose.",
    typography_preference: "serif bold",
    whitespace: "medium",
    cta_placement: "bottom_subtle",
    hook_angle: "adventure, freedom, family travel",
    must_have: ["golden hour", "outdoor", "horizon"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      dog_car: 0.95,
      dog_harness: 0.95,
      generic_pet: 0.4,
    },
  },

  cozy_emotional_comfort: {
    id: "cozy_emotional_comfort",
    label: "Cozy emotional comfort",
    psychology:
      "Sleeping pet in low warm light triggers 'safety + cuteness' save behavior at scale.",
    composition_rule:
      "Dim cozy bedroom corner with layered blankets, knit throw, candle, side lamp; pet sinking into deep relaxation, eyes drifting closed.",
    typography_preference: "serif soft",
    whitespace: "low",
    cta_placement: "bottom_subtle",
    hook_angle: "safety, deep rest, calm",
    must_have: ["blanket", "low warm light", "sleeping"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      calming_bed: 0.95,
      dog_bed: 0.7,
      generic_pet: 0.5,
    },
  },

  clean_aspirational_routine: {
    id: "clean_aspirational_routine",
    label: "Clean aspirational routine",
    psychology:
      "Morning ritual + clean kitchen + hands-shown is the dominant DTC home aesthetic for 'effortless ownership'.",
    composition_rule:
      "Bright clean kitchen or feeding nook, marble or oak surface, neutral ceramics, hands shown performing the routine, calm morning daylight.",
    typography_preference: "serif refined",
    whitespace: "high",
    cta_placement: "top_minimal",
    hook_angle: "effortless routine, clean home",
    must_have: ["routine", "morning", "clean"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      cat_litter: 0.9,
      cat_fountain: 0.85,
      feeder: 0.9,
      grooming: 0.7,
    },
  },

  multi_pet_decor: {
    id: "multi_pet_decor",
    label: "Multi-pet decor harmony",
    psychology:
      "Two cats interacting in a styled space doubles the cuteness and the home-decor signal.",
    composition_rule:
      "Two cats on different levels of the product or in calm interaction in a styled Scandinavian or warm interior — balanced asymmetric framing.",
    typography_preference: "serif refined",
    whitespace: "medium",
    cta_placement: "bottom_subtle",
    hook_angle: "harmony, family of pets",
    must_have: ["two cats", "styled interior"],
    must_avoid: COMMON_AVOID,
    niche_affinity: {
      cat_tree: 0.85,
      cat_fountain: 0.6,
      cat_litter: 0.5,
    },
  },
};

export const PATTERN_IDS = Object.keys(PATTERN_LIBRARY) as PatternId[];

/** Weighted random selection without replacement, scoped to a niche. */
export function selectPatternsForNiche(
  niche: NicheKey,
  count: number,
  rng: () => number = Math.random,
): PatternId[] {
  const pool: { id: PatternId; weight: number }[] = PATTERN_IDS.map((id) => ({
    id,
    weight: PATTERN_LIBRARY[id].niche_affinity[niche] ?? 0.15,
  }));

  const out: PatternId[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = rng() * total;
    let pickIdx = 0;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) {
        pickIdx = j;
        break;
      }
    }
    out.push(pool[pickIdx].id);
    pool.splice(pickIdx, 1); // no repeats within batch
  }
  return out;
}

export function getPattern(id: PatternId | string): PinterestPattern {
  return (PATTERN_LIBRARY as any)[id] ?? PATTERN_LIBRARY.editorial_minimal;
}

/** Apply a stored overlay patch to a base pattern. Used by the research refresher. */
export function applyPatternPatch(
  base: PinterestPattern,
  patch: Partial<PinterestPattern>,
): PinterestPattern {
  return { ...base, ...patch, niche_affinity: { ...base.niche_affinity, ...(patch.niche_affinity ?? {}) } };
}

/** Returns reasons the brief/headline fail this pattern's checklist (empty = pass). */
export function patternQualityReasons(
  pattern: PinterestPattern,
  brief: { full_prompt: string; environment_summary: string; headline: string; cta: string },
): string[] {
  const blob = `${brief.full_prompt}\n${brief.environment_summary}`.toLowerCase();
  const headline = `${brief.headline} ${brief.cta}`.toLowerCase();
  const reasons: string[] = [];

  for (const term of pattern.must_have) {
    if (!blob.includes(term.toLowerCase())) {
      reasons.push(`pattern[${pattern.id}] missing must_have: "${term}"`);
    }
  }
  for (const term of pattern.must_avoid) {
    const t = term.toLowerCase();
    if (blob.includes(t) || headline.includes(t)) {
      reasons.push(`pattern[${pattern.id}] contains must_avoid: "${term}"`);
    }
  }
  return reasons;
}