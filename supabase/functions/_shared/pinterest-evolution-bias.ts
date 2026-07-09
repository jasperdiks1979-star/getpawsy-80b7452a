// Additive bias layer read from pinterest_evolution_recommendations.
// Returns a prompt-appendable block that reflects real Pinterest
// performance learnings. NEVER lowers any certified guard.

type SbLike = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): Promise<{ data: any[] | null }>;
        };
      };
    };
  };
};

export async function loadEvolutionBias(sb: SbLike, maxDirectives = 8): Promise<{
  block: string | null;
  count: number;
  version_id: string | null;
}> {
  try {
    const { data } = await sb
      .from("pinterest_evolution_recommendations")
      .select("directive, reason, metric, effect, confidence, priority, version_id")
      .eq("active", true)
      .order("priority", { ascending: true })
      .limit(maxDirectives);
    const rows = data ?? [];
    if (rows.length === 0) return { block: null, count: 0, version_id: null };
    const lines = rows.map((r: any) =>
      `- ${r.directive}  (${r.reason}; conf ${Number(r.confidence).toFixed(2)})`
    );
    const block = [
      "[PINTEREST_EVOLUTION_ENGINE_BIAS]",
      "The following creative preferences are learned from real Pinterest",
      "performance (organic-primary). Apply as soft preferences only —",
      "never override PRE / Visual Identity / Guardian constraints.",
      "",
      ...lines,
    ].join("\n");
    return {
      block,
      count: rows.length,
      version_id: (rows[0] as any)?.version_id ?? null,
    };
  } catch {
    return { block: null, count: 0, version_id: null };
  }
}