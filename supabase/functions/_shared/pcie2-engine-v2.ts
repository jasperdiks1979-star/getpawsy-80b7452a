// PCIE2 Engine v2 shared helpers — autonomous concept graph, family rotation,
// visual DNA fingerprints, and mutation strategies. Server-side only.

export const BRANCH_TYPES = [
  "problem","solution","benefit","before_after","emotional","aspirational",
  "urgency","educational","comparison","myth_vs_fact","checklist","mistakes",
  "seasonal","gift","buyer_guide","faq","quick_tips","advanced_tips",
  "premium_angle","budget_angle","luxury_angle","beginner_angle","expert_angle",
  "veterinarian_angle","behavioral_angle","safety_angle","cleaning_angle",
  "maintenance_angle","routine","challenge","transformation","daily_habit",
  "product_pairing","lifestyle","indoor","outdoor","travel","aging_pets",
  "puppies","kittens","senior_pets",
] as const;

export const CREATIVE_FAMILIES = [
  { name: "educational",     intent: "teach",       cooldown: 0 },
  { name: "storytelling",    intent: "narrate",     cooldown: 0 },
  { name: "problem_solution",intent: "diagnose",    cooldown: 0 },
  { name: "curiosity",       intent: "intrigue",    cooldown: 0 },
  { name: "authority",       intent: "trust",       cooldown: 0 },
  { name: "comparison",      intent: "decide",      cooldown: 0 },
  { name: "transformation",  intent: "result",      cooldown: 0 },
  { name: "statistics",      intent: "proof",       cooldown: 0 },
  { name: "warning",         intent: "alert",       cooldown: 0 },
  { name: "emotional",       intent: "feel",        cooldown: 0 },
  { name: "lifestyle",       intent: "aspire",      cooldown: 0 },
  { name: "luxury",          intent: "elevate",     cooldown: 0 },
  { name: "minimalist",      intent: "clarity",     cooldown: 0 },
  { name: "scientific",      intent: "explain",     cooldown: 0 },
  { name: "veterinary",      intent: "credibility", cooldown: 0 },
  { name: "ugc_inspired",    intent: "relatable",   cooldown: 0 },
  { name: "pinterest_trend", intent: "trending",    cooldown: 0 },
  { name: "search_intent",   intent: "query",       cooldown: 0 },
  { name: "seasonal",        intent: "timely",      cooldown: 0 },
  { name: "holiday",         intent: "festive",     cooldown: 0 },
  { name: "shopping_guide",  intent: "compare",     cooldown: 0 },
] as const;

export const HEADLINE_FAMILY_INTENTS = [
  { name: "emotional_pull",  intent: "emotion" },
  { name: "problem_callout", intent: "problem" },
  { name: "benefit_lead",    intent: "benefit" },
  { name: "numbered_list",   intent: "numbers" },
  { name: "urgency",         intent: "urgency" },
  { name: "curiosity_gap",   intent: "curiosity" },
  { name: "social_proof",    intent: "proof" },
  { name: "search_intent",   intent: "search" },
  { name: "long_tail",       intent: "long_tail" },
  { name: "pinterest_trend", intent: "trend" },
];

export const CTA_FAMILY_INTENTS = [
  { name: "shop_direct",      intent: "shop" },
  { name: "save_for_later",   intent: "save" },
  { name: "learn_more",       intent: "learn" },
  { name: "compare_options",  intent: "compare" },
  { name: "see_results",      intent: "results" },
  { name: "limited_time",     intent: "urgency" },
  { name: "gift_idea",        intent: "gift" },
  { name: "exclusive_access", intent: "vip" },
];

// Visual DNA axes — combinatorial space approx 8^8 = 16,777,216 fingerprints
export const VISUAL_AXES = {
  camera_angle: ["eye-level","overhead","low-angle","macro","wide","over-shoulder","dutch-tilt","drone"],
  lighting:     ["golden-hour","soft-window","studio","candle-glow","high-key","moody","backlit","neon-accent"],
  background:   ["minimal-room","cozy-livingroom","nordic-bedroom","sun-deck","wood-floor","linen-textile","kitchen-counter","garden-patio"],
  composition:  ["rule-of-thirds","centered","negative-space","leading-lines","frame-within","symmetry","triangular","s-curve"],
  pet_breed:    ["golden-retriever","tabby-cat","frenchie","persian","border-collie","ragdoll","poodle","mixed-rescue"],
  pet_age:      ["puppy","kitten","adult","senior","young-adult","mature","middle-aged","old-soul"],
  room:         ["living-room","bedroom","kitchen","entryway","sunroom","patio","office-nook","reading-corner"],
  season:       ["spring-bloom","summer-warmth","autumn-leaves","winter-snug","early-morning","late-afternoon","blue-hour","midday"],
} as const;

export type VisualDNA = { [K in keyof typeof VISUAL_AXES]: string };

export function pickVisualDNA(seedNum: number): VisualDNA {
  const axes = Object.keys(VISUAL_AXES) as (keyof typeof VISUAL_AXES)[];
  const result = {} as Record<string, string>;
  let s = (seedNum * 2654435761) >>> 0;
  for (const a of axes) {
    const list = VISUAL_AXES[a] as readonly string[];
    s = (s * 1664525 + 1013904223) >>> 0;
    result[a] = list[s % list.length];
  }
  return result as VisualDNA;
}

export function fingerprintVisualDNA(d: VisualDNA): string {
  return [d.camera_angle,d.lighting,d.background,d.composition,d.pet_breed,d.pet_age,d.room,d.season].join("|");
}

export function bitDistance(a: string, b: string): number {
  const pa = a.split("|"), pb = b.split("|");
  const n = Math.min(pa.length, pb.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (pa[i] !== pb[i]) d++;
  return d;
}

export const MUTATION_STRATEGIES = [
  { strategy: "angle",    instruction: "Rewrite the underlying angle entirely. Pick a different problem, benefit, or scenario. Keep the same product." },
  { strategy: "headline", instruction: "Keep the angle but craft a completely different headline using a different emotional hook and sentence structure." },
  { strategy: "cta",      instruction: "Rewrite only the CTA using a different intent (e.g. learn -> save, shop -> compare) and different verbs." },
  { strategy: "visual",   instruction: "Replace the visual brief: change camera_angle, lighting, background, composition, breed, room, and season simultaneously." },
  { strategy: "emotion",  instruction: "Recast emotional framing (warmth -> urgency -> expert calm -> playful) and rewrite the prompt/headline/cta to match." },
] as const;

export const ENGINE_V2 = {
  SIM_THRESHOLD: 0.88,
  QUALITY_MIN: 70,
  TARGET_CREATIVES: 1500,
  MAX_BASE_ATTEMPTS: 2,
  MAX_MUTATIONS: MUTATION_STRATEGIES.length,
  MIN_VISUAL_HAMMING: 2,
  SATURATION_GROWTH_PER_5MIN: 5,
  SATURATION_AVG_SIM: 0.85,
};
