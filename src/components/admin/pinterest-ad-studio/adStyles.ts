export type AdStyleId = "viral" | "lifestyle" | "cinematic" | "premium" | "conversion";

export type AdStyle = {
  id: AdStyleId;
  label: string;
  description: string;
  hookVariant: string;
  voiceStyle: "social_energetic" | "lifestyle_female" | "narrator" | "pet_parent";
  preset: "pin-organic" | "pin-ads";
};

export const AD_STYLES: AdStyle[] = [
  { id: "viral",      label: "Viral",            description: "Stop-scroll hook, fast cuts, social-native energy.", hookVariant: "viral",      voiceStyle: "social_energetic",  preset: "pin-organic" },
  { id: "lifestyle",  label: "Lifestyle",        description: "Warm, premium pet-parent moments. Aspirational.",    hookVariant: "lifestyle",  voiceStyle: "lifestyle_female",  preset: "pin-organic" },
  { id: "cinematic",  label: "Cinematic",        description: "Filmic camera moves, depth, premium grading.",       hookVariant: "cinematic",  voiceStyle: "narrator",          preset: "pin-ads" },
  { id: "premium",    label: "Premium Brand",    description: "Editorial brand spot. Calm, trustworthy, polished.", hookVariant: "premium",    voiceStyle: "narrator",          preset: "pin-ads" },
  { id: "conversion", label: "Conversion Focus", description: "Problem → solution → CTA. Direct-response built.",   hookVariant: "conversion", voiceStyle: "pet_parent",        preset: "pin-ads" },
];

export function getAdStyle(id: AdStyleId): AdStyle {
  return AD_STYLES.find(s => s.id === id) ?? AD_STYLES[0];
}

// ============================================================
// Phase 3 — Self-Learning Director archetypes
// Four fundamentally different concept families. Each maps to
// the underlying render pipeline (hook_variant + voice + preset)
// but represents a distinct creative strategy that the Director
// learns to weight per category.
// ============================================================
export type ArchetypeId = "problem_solution" | "emotional" | "premium_lifestyle" | "viral_interrupt";

export type Archetype = {
  id: ArchetypeId;
  label: string;
  shortLabel: string;
  description: string;
  hookVariant: string;
  voiceStyle: "social_energetic" | "lifestyle_female" | "narrator" | "pet_parent";
  preset: "pin-organic" | "pin-ads";
  pacing: "snappy" | "warm" | "cinematic" | "punchy";
  motionPlan: string;
  ctaIntent: string;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: "problem_solution",
    label: "Problem / Solution",
    shortLabel: "Problem→Solution",
    description: "Direct-response: surface a real pet-parent pain, reveal the product as the fix, end on a sharp CTA.",
    hookVariant: "conversion",
    voiceStyle: "pet_parent",
    preset: "pin-ads",
    pacing: "punchy",
    motionPlan: "push_in on problem → cut to demo → rack_focus to product → static CTA",
    ctaIntent: "Shop now",
  },
  {
    id: "emotional",
    label: "Emotional Connection",
    shortLabel: "Emotional",
    description: "Heart-led story. Bond between pet & owner, soft pacing, voiceover-driven payoff.",
    hookVariant: "lifestyle",
    voiceStyle: "lifestyle_female",
    preset: "pin-organic",
    pacing: "warm",
    motionPlan: "slow dolly → orbit around bond moment → warm grade → gentle reveal",
    ctaIntent: "Treat them today",
  },
  {
    id: "premium_lifestyle",
    label: "Premium Lifestyle",
    shortLabel: "Premium",
    description: "Editorial brand spot. Confident narrator, filmic moves, depth, luxury grading.",
    hookVariant: "cinematic",
    voiceStyle: "narrator",
    preset: "pin-ads",
    pacing: "cinematic",
    motionPlan: "wide reveal → tracking → rack_focus product detail → hero static",
    ctaIntent: "Discover the collection",
  },
  {
    id: "viral_interrupt",
    label: "Viral Pattern Interrupt",
    shortLabel: "Viral",
    description: "Stop-scroll opener, unexpected visual, social-native cuts, energetic VO.",
    hookVariant: "viral",
    voiceStyle: "social_energetic",
    preset: "pin-organic",
    pacing: "snappy",
    motionPlan: "hard cut hook → handheld tracking → parallax pop → snap zoom CTA",
    ctaIntent: "Tap to see why",
  },
];

export function getArchetype(id: ArchetypeId): Archetype {
  return ARCHETYPES.find(a => a.id === id) ?? ARCHETYPES[0];
}
