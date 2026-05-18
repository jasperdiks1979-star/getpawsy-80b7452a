/**
 * Voice style registry for the cinematic Pinterest ad pipeline.
 *
 * Each style maps to:
 *   - voice_id      ElevenLabs voice id used at TTS time
 *   - persona       Short copywriter directive injected into VO script generation
 *   - settings      ElevenLabs voice_settings overrides for this persona
 */

export type VoiceStyleId =
  | "lifestyle_female"
  | "pet_parent"
  | "narrator"
  | "social_energetic";

export type VoiceStyle = {
  id: VoiceStyleId;
  label: string;
  description: string;
  voice_id: string;
  persona: string;
  settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    speed: number;
  };
};

export const VOICE_STYLES: Record<VoiceStyleId, VoiceStyle> = {
  lifestyle_female: {
    id: "lifestyle_female",
    label: "Premium Lifestyle (Female)",
    description: "Polished US female, warm and aspirational — Pinterest-native.",
    voice_id: "EXAVITQu4vr4xnSDxMaL", // Sarah
    persona:
      "polished US-female lifestyle host, warm and aspirational, premium-but-friendly, slight smile in the voice",
    settings: { stability: 0.55, similarity_boost: 0.78, style: 0.45, use_speaker_boost: true, speed: 1.0 },
  },
  pet_parent: {
    id: "pet_parent",
    label: "Friendly Pet Parent",
    description: "Genuine pet-parent tone, conversational and trustworthy.",
    voice_id: "XrExE9yKIg1WjnnlVkGX", // Matilda
    persona:
      "real US pet parent, conversational, genuine, slightly playful, like recommending to a friend",
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.98 },
  },
  narrator: {
    id: "narrator",
    label: "Calm Trustworthy Narrator",
    description: "Deep, calm US narrator — premium documentary feel.",
    voice_id: "nPczCjzI2devNBz1zQrb", // Brian
    persona:
      "calm trustworthy US male narrator, premium documentary cadence, deliberate pacing, authoritative",
    settings: { stability: 0.65, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true, speed: 0.95 },
  },
  social_energetic: {
    id: "social_energetic",
    label: "Energetic Social Ad",
    description: "Punchy, high-energy US ad voice for TikTok / Pinterest hooks.",
    voice_id: "TX3LPaxmHKxFdv7VOQHJ", // Liam
    persona:
      "energetic US social-ad voice, punchy, high-conviction, fast hook delivery, ends on a confident CTA",
    settings: { stability: 0.4, similarity_boost: 0.75, style: 0.6, use_speaker_boost: true, speed: 1.05 },
  },
};

export function resolveVoiceStyle(input?: string | null): VoiceStyle {
  if (input && input in VOICE_STYLES) return VOICE_STYLES[input as VoiceStyleId];
  return VOICE_STYLES.lifestyle_female;
}

export const VOICE_STYLE_LIST: VoiceStyle[] = Object.values(VOICE_STYLES);
