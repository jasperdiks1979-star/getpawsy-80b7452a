// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Visual Intelligence
// ─────────────────────────────────────────────────────────────────────────────
// Pure-function classifier that maps a product → a full creative direction:
//   { niche, commerce_archetype, emotional_intent, pin_mode, aesthetic, layout,
//     cta_style, backdrop_direction }
//
// Used by `pinterest-creative-director` BEFORE strategy/brief generation so
// every downstream step (hook strategy, scene brief, image prompt, scoring,
// landing match) shares one coherent creative plan.

import { detectNiche, getStyleDNA, type NicheKey, type StyleDNA } from "./pinterest-style-dna.ts";
import { type PinModeKey, getPinMode } from "./pinterest-pin-modes.ts";

export type CommerceArchetype =
  | "impulse"
  | "problem_solver"
  | "luxury"
  | "cozy"
  | "gadget"
  | "health"
  | "essential";

export type EmotionalIntent =
  | "calm_relief"
  | "aspiration"
  | "joy"
  | "trust"
  | "curiosity"
  | "comfort"
  | "transformation";

export interface VisualPlan {
  niche: NicheKey;
  dna: StyleDNA;
  commerce_archetype: CommerceArchetype;
  emotional_intent: EmotionalIntent;
  pin_mode: PinModeKey;
  aesthetic: string;
  layout: "single_scene" | "split" | "collage";
  cta_style: string;
  backdrop_direction: string;
  rationale: string;
}

const NICHE_TO_ARCHETYPE: Partial<Record<NicheKey, CommerceArchetype>> = {
  cat_litter: "problem_solver",
  dog_car: "problem_solver",
  cat_tree: "luxury",
  dog_harness: "essential",
  calming_bed: "cozy",
  dog_bed: "cozy",
  cat_bed: "cozy",
  cat_fountain: "health",
  interactive_toy: "joy" as unknown as CommerceArchetype, // map to impulse below
  grooming: "essential",
  feeder: "gadget",
  cat_carrier: "essential",
  dog_carrier: "luxury",
  dog_collar: "essential",
  dog_training: "problem_solver",
  outdoor_house: "luxury",
  bowl_station: "cozy",
  dog_clothing: "luxury",
  treats: "impulse",
  cat_scratcher: "cozy",
  potty_training: "problem_solver",
  pet_camera: "gadget",
  dental_care: "health",
  generic_pet: "essential",
};

const NICHE_TO_INTENT: Partial<Record<NicheKey, EmotionalIntent>> = {
  cat_litter: "calm_relief",
  dog_car: "trust",
  cat_tree: "aspiration",
  dog_harness: "trust",
  calming_bed: "comfort",
  dog_bed: "comfort",
  cat_bed: "comfort",
  cat_fountain: "trust",
  interactive_toy: "joy",
  grooming: "transformation",
  feeder: "calm_relief",
  cat_carrier: "trust",
  dog_carrier: "joy",
  dog_collar: "trust",
  dog_training: "transformation",
  outdoor_house: "aspiration",
  bowl_station: "aspiration",
  dog_clothing: "aspiration",
  treats: "joy",
  cat_scratcher: "calm_relief",
  potty_training: "calm_relief",
  pet_camera: "trust",
  dental_care: "trust",
  generic_pet: "comfort",
};

/** Niche → preferred pin modes (ordered: best-fit first). */
const NICHE_TO_PIN_MODES: Partial<Record<NicheKey, PinModeKey[]>> = {
  cat_litter: ["transformation", "before_after", "cozy_lifestyle", "luxury_minimal"],
  dog_car: ["transformation", "social_proof", "product_lifestyle_blend"],
  cat_tree: ["luxury_minimal", "moodboard_collage", "cozy_lifestyle"],
  dog_harness: ["product_lifestyle_blend", "social_proof", "ugc_style"],
  calming_bed: ["cozy_lifestyle", "transformation", "emotional_pain"],
  dog_bed: ["cozy_lifestyle", "luxury_minimal", "transformation"],
  cat_bed: ["cozy_lifestyle", "luxury_minimal", "moodboard_collage"],
  cat_fountain: ["luxury_minimal", "product_lifestyle_blend", "ugc_style"],
  interactive_toy: ["viral_curiosity", "ugc_style", "social_proof"],
  grooming: ["before_after", "transformation", "ugc_style"],
  feeder: ["luxury_minimal", "product_lifestyle_blend", "social_proof"],
  cat_carrier: ["cozy_lifestyle", "transformation", "luxury_minimal"],
  dog_carrier: ["luxury_minimal", "cozy_lifestyle", "social_proof"],
  dog_collar: ["luxury_minimal", "ugc_style", "social_proof"],
  dog_training: ["transformation", "social_proof", "before_after"],
  outdoor_house: ["luxury_minimal", "moodboard_collage", "cozy_lifestyle"],
  bowl_station: ["luxury_minimal", "moodboard_collage", "cozy_lifestyle"],
  dog_clothing: ["luxury_minimal", "ugc_style", "moodboard_collage"],
  treats: ["ugc_style", "social_proof", "viral_curiosity"],
  cat_scratcher: ["luxury_minimal", "cozy_lifestyle", "moodboard_collage"],
  potty_training: ["transformation", "before_after", "ugc_style"],
  pet_camera: ["viral_curiosity", "luxury_minimal", "social_proof"],
  dental_care: ["before_after", "transformation", "ugc_style"],
  generic_pet: ["cozy_lifestyle", "product_lifestyle_blend", "luxury_minimal"],
};

function rotateMode(modes: PinModeKey[], rotateSeed?: number): PinModeKey {
  if (!modes.length) return "product_lifestyle_blend";
  if (typeof rotateSeed !== "number") return modes[0];
  return modes[Math.abs(rotateSeed) % modes.length];
}

/** Build the full visual plan for a product. Pure / deterministic given inputs. */
export function buildVisualPlan(input: {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
  /** When set, rotates pin mode through the niche's preference list so a
   *  product gets variety across pins. */
  rotateSeed?: number;
  /** Optional explicit override (e.g. learned winner). */
  pin_mode?: PinModeKey;
}): VisualPlan {
  const niche = detectNiche(input);
  const dna = getStyleDNA(niche);

  // Some entries use a non-archetype value as a placeholder; coerce to "impulse".
  const rawArchetype = NICHE_TO_ARCHETYPE[niche] ?? "essential";
  const archetype: CommerceArchetype = (
    [
      "impulse",
      "problem_solver",
      "luxury",
      "cozy",
      "gadget",
      "health",
      "essential",
    ] as CommerceArchetype[]
  ).includes(rawArchetype as CommerceArchetype)
    ? (rawArchetype as CommerceArchetype)
    : "impulse";

  const intent: EmotionalIntent = NICHE_TO_INTENT[niche] ?? "comfort";
  const modeList = NICHE_TO_PIN_MODES[niche] ?? ["product_lifestyle_blend"];
  const pinModeKey: PinModeKey = input.pin_mode
    ? input.pin_mode
    : rotateMode(modeList, input.rotateSeed);
  const mode = getPinMode(pinModeKey);

  const aesthetic = `${mode.label.toLowerCase()} • ${mode.palette}`;
  const layout: VisualPlan["layout"] = mode.is_collage
    ? mode.key === "before_after"
      ? "split"
      : "collage"
    : "single_scene";

  const cta_style = `${mode.cta_tone} tone, ≤18 chars, plain English, US-native`;
  const backdrop_direction = `${dna.environment}; ${mode.composition_rule}`;

  return {
    niche,
    dna,
    commerce_archetype: archetype,
    emotional_intent: intent,
    pin_mode: pinModeKey,
    aesthetic,
    layout,
    cta_style,
    backdrop_direction,
    rationale: `niche=${niche}, archetype=${archetype}, intent=${intent}, mode=${pinModeKey} (rotateSeed=${input.rotateSeed ?? "none"})`,
  };
}