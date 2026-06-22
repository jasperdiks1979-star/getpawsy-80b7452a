// Voice Diversity Engine pool + selector.
// V5 roster: 8 named voices split across 4 tiers (35/35/20/10) — no voice may
// repeat back-to-back (2-consecutive ban) and the engine multiplies in learned
// CTR weights so higher-performing voices auto-uplift over time.

export type VoiceTier = "female_a" | "female_b" | "male" | "premium_experimental";

export type VoiceEntry = {
  voice_name: string;        // canonical id, snake_case
  display_name: string;      // human label
  voice_type: "female" | "male";
  voice_tier: VoiceTier;
  voice_style: "friendly" | "premium" | "energetic" | "storytelling" | "trustworthy" | "editorial" | "warm" | "playful";
  elevenlabs_voice_id: string;
};

// V5 roster (8 voices in 4 tiers). ElevenLabs IDs are seeded — overwrite via
// `cinematic_voice_profiles.voice_id` to swap in real IDs without code changes.
export const VOICE_POOL: VoiceEntry[] = [
  // Tier 1 — primary female (35% target, 2 voices → 17.5% each)
  { voice_name: "jessica",   display_name: "Jessica",   voice_type: "female", voice_tier: "female_a", voice_style: "energetic",    elevenlabs_voice_id: "cgSgspJ2msm6clMCkdW9" },
  { voice_name: "emma",      display_name: "Emma",      voice_type: "female", voice_tier: "female_a", voice_style: "friendly",     elevenlabs_voice_id: "EXAVITQu4vr4xnSDxMaL" },
  // Tier 2 — secondary female (35% target, 2 voices → 17.5% each)
  { voice_name: "sophie",    display_name: "Sophie",    voice_type: "female", voice_tier: "female_b", voice_style: "premium",      elevenlabs_voice_id: "XrExE9yKIg1WjnnlVkGX" },
  { voice_name: "olivia",    display_name: "Olivia",    voice_type: "female", voice_tier: "female_b", voice_style: "storytelling", elevenlabs_voice_id: "FGY2WhTYpPnrIDTdsKH5" },
  // Tier 3 — male (20% target, 2 voices → 10% each)
  { voice_name: "james",     display_name: "James",     voice_type: "male",   voice_tier: "male",     voice_style: "friendly",     elevenlabs_voice_id: "TX3LPaxmHKxFdv7VOQHJ" },
  { voice_name: "ryan",      display_name: "Ryan",      voice_type: "male",   voice_tier: "male",     voice_style: "trustworthy",  elevenlabs_voice_id: "JBFqnCBsd6RMkjVDRZzb" },
  // Tier 4 — premium experimental (10% target, 2 voices → 5% each)
  { voice_name: "charlotte", display_name: "Charlotte", voice_type: "female", voice_tier: "premium_experimental", voice_style: "editorial", elevenlabs_voice_id: "XB0fDUnXU5powFXDhCwa" },
  { voice_name: "brian",     display_name: "Brian",     voice_type: "male",   voice_tier: "premium_experimental", voice_style: "warm",      elevenlabs_voice_id: "nPczCjzI2devNBz1zQrb" },
];

// V5 rotation rules.
export const ROTATION_RULES = {
  /** Block when this voice was used for the last N picks in a row in the category (2 = never twice in a row). */
  CONSECUTIVE_BAN_AT: 2,
  /** Global cap: no single voice may exceed this share of the last 100 picks. */
  GLOBAL_CAP_PCT: 0.25,
  /** Target tier shares applied as a weight bias. */
  TIER_TARGET_SHARE: {
    female_a: 0.35,
    female_b: 0.35,
    male: 0.20,
    premium_experimental: 0.10,
  } as Record<VoiceTier, number>,
  /** Performance uplift: CTR multiplier clamped to this range. */
  PERF_WEIGHT_MIN: 0.5,
  PERF_WEIGHT_MAX: 2.5,
} as const;

export function getVoiceByName(name: string): VoiceEntry | undefined {
  return VOICE_POOL.find((v) => v.voice_name === name);
}

export type PickVoiceArgs = {
  category: string;
  // Most recent voice_names used in this category (newest first), up to last 5.
  recentCategoryVoices: string[];
  // Last 100 voice_names globally (any order).
  recentGlobalVoices: string[];
  // Optional learned weights per voice_name in this category (1.0 = neutral).
  performanceWeights?: Record<string, number>;
  // Optional seed for deterministic testing.
  seed?: number;
};

export type PickVoiceResult = {
  voice: VoiceEntry;
  reason: string;
  candidates: { voice_name: string; weight: number; blocked?: string }[];
};

const { GLOBAL_CAP_PCT, CONSECUTIVE_BAN_AT, TIER_TARGET_SHARE } = ROTATION_RULES;
const TIER_COUNTS: Record<VoiceTier, number> = {
  female_a: VOICE_POOL.filter((v) => v.voice_tier === "female_a").length,
  female_b: VOICE_POOL.filter((v) => v.voice_tier === "female_b").length,
  male: VOICE_POOL.filter((v) => v.voice_tier === "male").length,
  premium_experimental: VOICE_POOL.filter((v) => v.voice_tier === "premium_experimental").length,
};
function tierBias(tier: VoiceTier): number {
  const n = TIER_COUNTS[tier] || 1;
  return TIER_TARGET_SHARE[tier] / n;
}

function rng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function pickVoice(args: PickVoiceArgs): PickVoiceResult {
  const { category, recentCategoryVoices, recentGlobalVoices, performanceWeights = {}, seed } = args;
  // 3-consecutive ban: block the voice if the last 3 picks in this category were all the same.
  const lastN = recentCategoryVoices.slice(0, CONSECUTIVE_BAN_AT);
  const consecutiveBan =
    lastN.length === CONSECUTIVE_BAN_AT && lastN.every((v) => v === lastN[0]) ? lastN[0] : null;
  const totalGlobal = Math.max(recentGlobalVoices.length, 1);
  const globalCount: Record<string, number> = {};
  for (const v of recentGlobalVoices) globalCount[v] = (globalCount[v] || 0) + 1;

  const candidates = VOICE_POOL.map((v) => {
    let blocked: string | undefined;
    if (consecutiveBan && v.voice_name === consecutiveBan) blocked = `consecutive_repeat_${CONSECUTIVE_BAN_AT}`;
    const share = (globalCount[v.voice_name] || 0) / totalGlobal;
    if (!blocked && totalGlobal >= 20 && share >= GLOBAL_CAP_PCT) blocked = "global_cap_20pct";
    // Tier-share bias drives the 35/35/20/10 mix over time.
    const bias = tierBias(v.voice_tier);
    const rawPerf = performanceWeights[v.voice_name] ?? 1.0;
    const perfWeight = Math.min(ROTATION_RULES.PERF_WEIGHT_MAX, Math.max(ROTATION_RULES.PERF_WEIGHT_MIN, rawPerf));
    const recencyPenalty = recentCategoryVoices[0] === v.voice_name ? 0.3 : 1.0;
    const weight = blocked ? 0 : perfWeight * recencyPenalty * Math.max(0.05, bias);
    return { voice_name: v.voice_name, weight, blocked };
  });

  const eligible = candidates.filter((c) => !c.blocked && c.weight > 0);
  const pool = eligible.length > 0 ? eligible : candidates.map((c) => ({ ...c, weight: 1 }));
  const total = pool.reduce((s, c) => s + c.weight, 0);
  const rand = rng(seed)() * total;
  let acc = 0;
  let chosenName = pool[0].voice_name;
  for (const c of pool) {
    acc += c.weight;
    if (rand <= acc) { chosenName = c.voice_name; break; }
  }
  const voice = getVoiceByName(chosenName)!;
  const reason = eligible.length === 0
    ? `fallback_no_eligible(category=${category})`
    : `weighted_pick(category=${category}, banned=${consecutiveBan ?? "none"})`;
  return { voice, reason, candidates };
}

export async function loadRecentVoices(
  supabase: { from: (t: string) => any },
  category: string,
) {
  const [{ data: catRows }, { data: globalRows }] = await Promise.all([
    supabase
      .from("pinterest_voice_assignments")
      .select("voice_name, assigned_at")
      .eq("category", category)
      .order("assigned_at", { ascending: false })
      .limit(5),
    supabase
      .from("pinterest_voice_assignments")
      .select("voice_name, assigned_at")
      .order("assigned_at", { ascending: false })
      .limit(100),
  ]);
  return {
    recentCategoryVoices: (catRows ?? []).map((r: any) => r.voice_name as string),
    recentGlobalVoices: (globalRows ?? []).map((r: any) => r.voice_name as string),
  };
}

export async function loadPerformanceWeights(
  supabase: { from: (t: string) => any },
  category: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("pinterest_voice_performance")
    .select("voice_name, conversion_score, pins_count")
    .eq("category", category);
  const rows = (data ?? []) as { voice_name: string; conversion_score: number; pins_count: number }[];
  const totalPins = rows.reduce((s, r) => s + (r.pins_count || 0), 0);
  // Only optimize after 50 pins in category
  if (totalPins < 50 || rows.length === 0) return {};
  const max = Math.max(...rows.map((r) => Number(r.conversion_score) || 0), 0.0001);
  const weights: Record<string, number> = {};
  for (const r of rows) {
    const norm = (Number(r.conversion_score) || 0) / max;
    // Map normalized score [0..1] to weight [0.4..2.0]
    weights[r.voice_name] = Math.max(0.4, Math.min(2.0, 0.4 + norm * 1.6));
  }
  return weights;
}

export async function recordVoiceAssignment(
  supabase: { from: (t: string) => any },
  args: {
    voice: VoiceEntry;
    category: string;
    pin_id?: string | null;
    queue_id?: string | null;
    cinematic_job_id?: string | null;
    product_id?: string | null;
    product_slug?: string | null;
  },
) {
  await supabase.from("pinterest_voice_assignments").insert({
    pin_id: args.pin_id ?? null,
    queue_id: args.queue_id ?? null,
    cinematic_job_id: args.cinematic_job_id ?? null,
    product_id: args.product_id ?? null,
    product_slug: args.product_slug ?? null,
    category: args.category,
    voice_name: args.voice.voice_name,
    voice_type: args.voice.voice_type,
    voice_style: args.voice.voice_style,
    elevenlabs_voice_id: args.voice.elevenlabs_voice_id,
  });
}