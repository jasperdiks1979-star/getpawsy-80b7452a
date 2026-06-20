// Voice Diversity Engine pool + selector.
// 8 named voices, ElevenLabs IDs from approved roster.
// pickVoice() enforces: no >2 consecutive in same category, no >20% share of last 100.

export type VoiceEntry = {
  voice_name: string;        // canonical id, snake_case
  display_name: string;      // human label
  voice_type: "female" | "male";
  voice_style: "friendly" | "premium" | "energetic" | "storytelling" | "trustworthy";
  elevenlabs_voice_id: string;
};

export const VOICE_POOL: VoiceEntry[] = [
  { voice_name: "female_friendly",     display_name: "Female Friendly",     voice_type: "female", voice_style: "friendly",     elevenlabs_voice_id: "EXAVITQu4vr4xnSDxMaL" }, // Sarah
  { voice_name: "female_premium",      display_name: "Female Premium",      voice_type: "female", voice_style: "premium",      elevenlabs_voice_id: "XrExE9yKIg1WjnnlVkGX" }, // Matilda
  { voice_name: "female_energetic",    display_name: "Female Energetic",    voice_type: "female", voice_style: "energetic",    elevenlabs_voice_id: "Xb7hH8MSUJpSbSDYk0k2" }, // Alice
  { voice_name: "female_storytelling", display_name: "Female Storytelling", voice_type: "female", voice_style: "storytelling", elevenlabs_voice_id: "FGY2WhTYpPnrIDTdsKH5" }, // Laura
  { voice_name: "male_friendly",       display_name: "Male Friendly",       voice_type: "male",   voice_style: "friendly",     elevenlabs_voice_id: "TX3LPaxmHKxFdv7VOQHJ" }, // Liam
  { voice_name: "male_premium",        display_name: "Male Premium",        voice_type: "male",   voice_style: "premium",      elevenlabs_voice_id: "JBFqnCBsd6RMkjVDRZzb" }, // George
  { voice_name: "male_energetic",      display_name: "Male Energetic",      voice_type: "male",   voice_style: "energetic",    elevenlabs_voice_id: "bIHbv24MWmeRgasZH58o" }, // Will
  { voice_name: "male_trustworthy",    display_name: "Male Trustworthy",    voice_type: "male",   voice_style: "trustworthy",  elevenlabs_voice_id: "onwK4e9ZLuTAKqWW03F9" }, // Daniel
];

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

const GLOBAL_CAP_PCT = 0.20;

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
  const last2 = recentCategoryVoices.slice(0, 2);
  const consecutiveBan = last2.length === 2 && last2[0] === last2[1] ? last2[0] : null;
  const totalGlobal = Math.max(recentGlobalVoices.length, 1);
  const globalCount: Record<string, number> = {};
  for (const v of recentGlobalVoices) globalCount[v] = (globalCount[v] || 0) + 1;

  const candidates = VOICE_POOL.map((v) => {
    let blocked: string | undefined;
    if (consecutiveBan && v.voice_name === consecutiveBan) blocked = "consecutive_repeat";
    const share = (globalCount[v.voice_name] || 0) / totalGlobal;
    if (!blocked && totalGlobal >= 20 && share >= GLOBAL_CAP_PCT) blocked = "global_cap_20pct";
    if (!blocked && last2[0] === v.voice_name) {
      // Soft penalty for last used (still allowed unless consecutive ban above)
    }
    const baseWeight = performanceWeights[v.voice_name] ?? 1.0;
    const recencyPenalty = last2[0] === v.voice_name ? 0.5 : 1.0;
    const weight = blocked ? 0 : Math.max(0.05, baseWeight) * recencyPenalty;
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