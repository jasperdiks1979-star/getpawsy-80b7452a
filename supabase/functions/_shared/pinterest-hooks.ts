// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Hook Strategy Engine
// ─────────────────────────────────────────────────────────────────────────────
// Maps a (niche, pattern, learning weights) tuple to the best emotional hook
// category + concrete US-tone phrase. Uses Lovable AI Gateway (Gemini) for the
// final pick so we can pass live performance data into the prompt without
// hardcoding rules.

import type { NicheKey, StyleDNA } from "./pinterest-style-dna.ts";
import type { PatternId, PinterestPattern } from "./pinterest-patterns.ts";

export type HookCategory =
  | "pain"
  | "transformation"
  | "curiosity"
  | "social_proof"
  | "time_saving"
  | "luxury"
  | "convenience"
  | "cleanliness"
  | "anxiety_reduction"
  | "pet_happiness";

export const HOOK_CATEGORIES: HookCategory[] = [
  "pain",
  "transformation",
  "curiosity",
  "social_proof",
  "time_saving",
  "luxury",
  "convenience",
  "cleanliness",
  "anxiety_reduction",
  "pet_happiness",
];

/** Curated US-native, GMC-safe hook phrases per category. ≤42 chars each. */
export const HOOK_BANK: Record<HookCategory, string[]> = {
  pain: [
    "Stop the daily mess",
    "End the smell, finally",
    "No more fur everywhere",
    "Tired of the daily struggle?",
  ],
  transformation: [
    "From chaos to calm",
    "Transform your home",
    "Make car rides calm again",
    "A new kind of pet life",
  ],
  curiosity: [
    "The cat owner secret",
    "Why US pet parents switched",
    "What we wish we knew sooner",
    "The tiny upgrade we love",
  ],
  social_proof: [
    "US pet parents love this",
    "What real cat owners chose",
    "Loved by busy dog families",
    "The one we kept buying",
  ],
  time_saving: [
    "Skip the daily cleanup",
    "Save 30 minutes a day",
    "Your morning, made easier",
    "Less work, happier pet",
  ],
  luxury: [
    "A quietly luxurious upgrade",
    "Premium pet living",
    "The calm, elevated home",
    "Designed for cozy homes",
  ],
  convenience: [
    "The easiest swap we made",
    "Set it and forget it",
    "One simple home upgrade",
    "Effortless every single day",
  ],
  cleanliness: [
    "A cleaner home, daily",
    "Fresh, every single day",
    "No more mess, no smell",
    "Bring back the fresh feeling",
  ],
  anxiety_reduction: [
    "Make car rides calm again",
    "Calm, cozy, finally still",
    "Help anxious pets settle",
    "Soothe the daily restlessness",
  ],
  pet_happiness: [
    "What makes them happiest",
    "A spot they actually love",
    "Their favorite cozy corner",
    "A small win for happy pets",
  ],
};

/** CTA bank, ≤18 chars each. */
export const CTA_BANK = [
  "See the calm",
  "Discover it",
  "See why",
  "Shop now",
  "Make it cozy",
  "Bring it home",
  "See it in use",
  "Get the look",
];

/** Default niche → preferred hook categories (fallback when no learning data). */
const NICHE_HOOK_AFFINITY: Partial<Record<NicheKey, HookCategory[]>> = {
  cat_litter: ["cleanliness", "time_saving", "pain", "luxury"],
  dog_car: ["anxiety_reduction", "transformation", "convenience"],
  cat_tree: ["luxury", "pet_happiness", "social_proof"],
  cat_bed: ["pet_happiness", "luxury", "anxiety_reduction"],
  calming_bed: ["anxiety_reduction", "transformation", "pet_happiness"],
  dog_bed: ["luxury", "pet_happiness", "transformation"],
  cat_fountain: ["cleanliness", "convenience", "pet_happiness"],
  grooming: ["cleanliness", "transformation", "social_proof"],
  feeder: ["time_saving", "convenience", "social_proof"],
  bowl_station: ["luxury", "convenience"],
  dog_carrier: ["luxury", "convenience", "transformation"],
  cat_carrier: ["anxiety_reduction", "luxury", "convenience"],
  dog_collar: ["luxury", "social_proof"],
  dog_training: ["transformation", "social_proof"],
  outdoor_house: ["luxury", "transformation"],
  dog_clothing: ["luxury", "social_proof"],
  treats: ["pet_happiness", "social_proof"],
  cat_scratcher: ["pet_happiness", "luxury"],
  potty_training: ["cleanliness", "transformation"],
  pet_camera: ["curiosity", "convenience", "anxiety_reduction"],
  dental_care: ["cleanliness", "social_proof"],
  interactive_toy: ["pet_happiness", "transformation"],
  generic_pet: ["pet_happiness", "luxury", "social_proof"],
};

export interface LearningWeight {
  pattern_id: string;
  hook_category: string;
  niche_key: string;
  composite_score: number;
  sample_size: number;
}

export interface CreativeStrategy {
  hook_category: HookCategory;
  hook_phrase: string;
  cta_phrase: string;
  scene_directive: string;
  exploration: boolean;
  rationale: string;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * Pick a hook strategy for this brief.
 * Epsilon-greedy: 80% exploit (highest composite), 20% explore (random affinity).
 * Falls back to NICHE_HOOK_AFFINITY when no weights are present.
 */
export function pickStrategy(args: {
  niche: NicheKey;
  dna: StyleDNA;
  pattern: PinterestPattern;
  weights: LearningWeight[];
  rng?: () => number;
}): CreativeStrategy {
  const rng = args.rng ?? Math.random;
  const explore = rng() < 0.2;

  const candidates = args.weights.filter(
    (w) => w.pattern_id === args.pattern.id && w.niche_key === args.niche && w.sample_size >= 2,
  );

  let chosen: HookCategory;
  let rationale: string;

  if (!explore && candidates.length > 0) {
    candidates.sort((a, b) => b.composite_score - a.composite_score);
    chosen = candidates[0].hook_category as HookCategory;
    rationale = `exploit:winner(score=${candidates[0].composite_score.toFixed(1)},n=${candidates[0].sample_size})`;
  } else {
    const affinity =
      NICHE_HOOK_AFFINITY[args.niche] ?? NICHE_HOOK_AFFINITY.generic_pet ?? HOOK_CATEGORIES;
    chosen = pick(affinity, rng);
    rationale = explore ? "explore:random_affinity" : "cold_start:niche_affinity";
  }

  const hook_phrase = pick(HOOK_BANK[chosen], rng);
  const cta_phrase = pick(args.dna.cta_bank.length ? args.dna.cta_bank : CTA_BANK, rng);

  // Scene directive blends DNA environment with pattern composition rule.
  const scene_directive =
    `${args.pattern.composition_rule} ` +
    `Pet/product naturally placed in: ${args.dna.environment}. ` +
    `Light: ${args.dna.light}. Mood: ${args.dna.mood}.`;

  return {
    hook_category: chosen,
    hook_phrase,
    cta_phrase,
    scene_directive,
    exploration: explore || candidates.length === 0,
    rationale,
  };
}

export function isValidHookCategory(s: string): s is HookCategory {
  return (HOOK_CATEGORIES as readonly string[]).includes(s);
}