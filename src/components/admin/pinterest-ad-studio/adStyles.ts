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
