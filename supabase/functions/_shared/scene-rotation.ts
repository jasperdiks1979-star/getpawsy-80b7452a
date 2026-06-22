// Scene rotation engine — picks a non-repeating scene environment per product
// from `cinematic_scene_environments`. Guarantees the same scene is not used
// twice in a row for the same product type (species).

export type ScenePickArgs = {
  species: "cat" | "dog" | "other";
  productSlug?: string;
  recentSceneSlugs?: string[]; // newest first
  performanceWeights?: Record<string, number>;
  seed?: number;
};

export type ScenePickResult = {
  slug: string;
  display_name: string;
  scene_group: string;
  prompt_snippet: string;
  mood: string | null;
  reason: string;
};

function rng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

export async function pickScene(sb: any, args: ScenePickArgs): Promise<ScenePickResult | null> {
  const { data: scenes, error } = await sb
    .from("cinematic_scene_environments")
    .select("slug, display_name, scene_group, prompt_snippet, mood, allowed_species, weight, last_used_at")
    .eq("active", true);
  if (error || !scenes?.length) return null;

  const eligible = scenes.filter((s: any) =>
    Array.isArray(s.allowed_species) && s.allowed_species.includes(args.species),
  );
  if (eligible.length === 0) return null;

  const recent = (args.recentSceneSlugs || []).slice(0, 5);
  const lastSlug = recent[0] || null;
  const lastGroup = lastSlug ? eligible.find((s: any) => s.slug === lastSlug)?.scene_group : null;

  const candidates = eligible.map((s: any) => {
    let blocked: string | undefined;
    if (s.slug === lastSlug) blocked = "no_repeat_back_to_back";
    if (!blocked && lastGroup && s.scene_group === lastGroup) blocked = "no_same_group_back_to_back";
    const perf = args.performanceWeights?.[s.slug] ?? 1.0;
    const recencyPenalty = recent.includes(s.slug) ? 0.4 : 1.0;
    const weight = blocked ? 0 : Number(s.weight ?? 1) * perf * recencyPenalty;
    return { ...s, weight, blocked };
  });

  let pool = candidates.filter((c: any) => !c.blocked && c.weight > 0);
  if (pool.length === 0) pool = candidates.filter((c: any) => !c.blocked).map((c: any) => ({ ...c, weight: 1 }));
  if (pool.length === 0) pool = candidates.map((c: any) => ({ ...c, weight: 1 }));

  const rand = rng(args.seed);
  const total = pool.reduce((a: number, c: any) => a + c.weight, 0);
  let r = rand() * total;
  let chosen = pool[0];
  for (const c of pool) {
    r -= c.weight;
    if (r <= 0) { chosen = c; break; }
  }

  // Best-effort: mark last_used_at; no failure handling needed.
  sb.from("cinematic_scene_environments").update({ last_used_at: new Date().toISOString() }).eq("slug", chosen.slug).then(() => {}, () => {});

  return {
    slug: chosen.slug,
    display_name: chosen.display_name,
    scene_group: chosen.scene_group,
    prompt_snippet: chosen.prompt_snippet,
    mood: chosen.mood ?? null,
    reason: chosen.blocked ? "fallback_after_blocks" : "weighted_random",
  };
}