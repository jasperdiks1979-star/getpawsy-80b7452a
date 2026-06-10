// Pinterest Creative Diversity Guard
// ─────────────────────────────────────────────────────────────────────────────
// Centralised "no boring repeats" rulebook applied BEFORE any pin draft is
// inserted into pinterest_pin_queue, and also used by the variety audit
// endpoints to score and repair the existing approval queue.
//
// Caps (sliding 90-published-pin window unless otherwise noted):
//   • headline → max 5 uses
//   • cta      → max 10 uses
//   • hook     → max 8 uses
//   • angle    → max 12 uses
//   • benefit  → max 12 uses
//   • last 25  → exact-overlay duplicates always rejected
//
// All pool replacements are STRICTLY category-scoped — a litter draft can
// never pull from cat_trees, etc. The category key is normalised through
// `normaliseCategoryKey()` so `cat-trees`, `cat_trees`, `CatTrees` all
// resolve to the same pool bucket.
//
// The guard reads the 1,000 most-recent published pins (status='posted'),
// then exposes:
//   • `evaluate(candidate, category)` → { ok, reasons, replacedFromPool }
//     mutates the candidate in place when a pool replacement is needed.
//   • `register(candidate, category)` so back-to-back candidates in the same
//     run don't collide.
//   • `snapshot()` for dashboards & simulation reports.

export type PoolType = "headline" | "hook" | "cta" | "angle" | "benefit";

export interface DiversityCandidate {
  headline: string;
  cta: string;
  hook?: string | null;
  angle?: string | null;
  benefit?: string | null;
  product_id?: string | null;
  pin_queue_id?: string | null;
}

export interface EvalResult {
  ok: boolean;
  reasons: string[];
  replacedFromPool: Partial<Record<PoolType, { from: string; to: string }>>;
  final: DiversityCandidate;
}

const STOP = new Set([
  "the","a","an","to","of","and","or","is","this","that","for","in","on",
  "with","your","you","my","i","it","its","by","at","be","as","are","was",
  "from","so","can","will","just","more","most","less"
]);

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectCTA(text: string): string | null {
  const t = (text || "").toLowerCase();
  const patterns = [
    "shop now","shop the","see the","see it","see how","try it","try this",
    "check it","check this","compare","build the","pick a","pick your",
    "tap to","learn more","get yours","find out","discover","grab yours",
    "save now","upgrade now","fix it"
  ];
  for (const p of patterns) if (t.includes(p)) return p;
  return null;
}

export function detectAngle(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (/odor|smell/.test(t)) return "odor_control";
  if (/scoop|self.?clean/.test(t)) return "low_maintenance";
  if (/multi[\s-]?cat|two cats|three cats/.test(t)) return "multi_cat";
  if (/anxious|stress|calm|quiet|soothe/.test(t)) return "calming";
  if (/airline|travel|carrier|flight|tsa/.test(t)) return "travel";
  if (/senior|joint|hip|orthop/.test(t)) return "senior_comfort";
  if (/sturdy|wobble|tip|solid|hardwood/.test(t)) return "durability";
  if (/apartment|small space|fits under|tiny/.test(t)) return "small_space";
  if (/obsessed|love|finally|changed/.test(t)) return "emotional_proof";
  if (/cheap|worth it|premium|status/.test(t)) return "status_premium";
  return null;
}

export function detectBenefit(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (/washable|machine.?wash/.test(t)) return "washable";
  if (/memory foam|orthop/.test(t)) return "orthopedic_foam";
  if (/sealed|chamber/.test(t)) return "sealed_odor";
  if (/sisal|hardwood|solid wood/.test(t)) return "premium_material";
  if (/non.?slip|non.?skid/.test(t)) return "non_slip";
  if (/ventilation|mesh/.test(t)) return "ventilation";
  if (/tsa|airline.?approved/.test(t)) return "airline_certified";
  if (/lifetime|warranty/.test(t)) return "warranty";
  return null;
}

function blob(c: DiversityCandidate): string {
  return `${c.headline || ""} ${c.cta || ""} ${c.hook || ""}`;
}

function enrich(c: DiversityCandidate): DiversityCandidate {
  const text = blob(c);
  return {
    ...c,
    cta: c.cta,
    angle: c.angle ?? detectAngle(text),
    benefit: c.benefit ?? detectBenefit(text),
    hook: c.hook ?? null,
  };
}

export interface DiversityCaps {
  headlinePer90: number;
  ctaPer90: number;
  anglePer90: number;
  benefitPer90: number;
  windowLast25Exact: boolean;
}

export const DEFAULT_CAPS: DiversityCaps = {
  headlinePer90: 5,
  ctaPer90: 10,
  anglePer90: 12,
  benefitPer90: 12,
  windowLast25Exact: true,
};

export const HOOK_CAP_PER_90 = 8;

// Map free-form niche/category labels to the canonical pool category key.
// Pool buckets live in `pinterest_category_creative_pools.category` and
// are limited to the 6 merchant-safe categories.
const CATEGORY_ALIASES: Record<string, string> = {
  litter: "litter", cat_litter: "litter", "cat-litter": "litter",
  cat_trees: "cat_trees", "cat-trees": "cat_trees", cat_tree: "cat_trees", cattree: "cat_trees", cattrees: "cat_trees",
  carriers: "carriers", carrier: "carriers", cat_carrier: "carriers", dog_carrier: "carriers",
  dog_beds: "dog_beds", "dog-beds": "dog_beds", dog_bed: "dog_beds", calming_bed: "dog_beds",
  toys: "toys", toy: "toys", interactive_toy: "toys", cat_toy: "toys", dog_toy: "toys",
  cat_essentials: "cat_essentials", "cat-essentials": "cat_essentials",
  cat_fountain: "cat_essentials", feeder: "cat_essentials", bowl_station: "cat_essentials",
  grooming: "cat_essentials",
};

export function normaliseCategoryKey(input: string | null | undefined): string {
  const raw = (input || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "(uncategorised)";
  return CATEGORY_ALIASES[raw] ?? raw;
}

type Counts = {
  headline: Map<string, number>;
  cta: Map<string, number>;
  angle: Map<string, number>;
  benefit: Map<string, number>;
  hook: Map<string, number>;
};

function emptyCounts(): Counts {
  return {
    headline: new Map(),
    cta: new Map(),
    angle: new Map(),
    benefit: new Map(),
    hook: new Map(),
  };
}

function bump(map: Map<string, number>, k: string | null | undefined) {
  if (!k) return;
  const key = norm(k);
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

export interface DiversitySnapshot {
  caps: DiversityCaps;
  totals: {
    posted_total: number;
    last_90: number;
    last_25: number;
    categories: number;
    boards: number;
    pools: Record<string, Record<string, number>>;
  };
  scores: {
    global: number;
    by_board: Array<{ board: string; total: number; uniques: number; diversity: number }>;
    by_category: Array<{ category: string; total: number; uniques: number; diversity: number }>;
  };
  top_repeated_90: {
    headlines: Array<{ value: string; count: number }>;
    ctas: Array<{ value: string; count: number }>;
    angles: Array<{ value: string; count: number }>;
    benefits: Array<{ value: string; count: number }>;
    hooks: Array<{ value: string; count: number }>;
  };
}

// deno-lint-ignore no-explicit-any
type Sb = any;

export class DiversityGuard {
  caps: DiversityCaps;
  private c90: Counts = emptyCounts();
  private c25Exact = new Set<string>();
  private byCategory = new Map<string, Counts>();
  private boardStats = new Map<string, { total: number; uniques: Set<string> }>();
  private categoryStats = new Map<string, { total: number; uniques: Set<string> }>();
  private pools: Record<string, Record<string, string[]>> = {};
  private postedTotal = 0;
  private last90Total = 0;
  private last25Total = 0;
  hookCapPer90 = HOOK_CAP_PER_90;

  constructor(caps: Partial<DiversityCaps> = {}) {
    this.caps = { ...DEFAULT_CAPS, ...caps };
  }

  async load(sb: Sb): Promise<void> {
    // Pull recent published pins (most recent first).
    const { data: posted, error } = await sb
      .from("pinterest_pin_queue")
      .select("id, overlay_text, pin_title, pin_description, board_name, category_key, hook_group, posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    const rows = posted ?? [];
    this.postedTotal = rows.length;

    const last90 = rows.slice(0, 90);
    const last25 = rows.slice(0, 25);
    this.last90Total = last90.length;
    this.last25Total = last25.length;

    const splitOverlay = (s: string): [string, string] => {
      const t = s || "";
      const sep = t.includes(" • ") ? " • " : t.includes(" | ") ? " | " : null;
      if (!sep) return [t, ""];
      const [h, c] = t.split(sep);
      return [h || "", c || ""];
    };

    for (const p of last25) {
      const ov = norm(p.overlay_text);
      if (ov) this.c25Exact.add(ov);
    }

    for (const p of last90) {
      const [hRaw, cRaw] = splitOverlay(p.overlay_text || "");
      const headline = hRaw || p.pin_title || "";
      const cta = cRaw || "";
      const text = `${p.overlay_text || ""} ${p.pin_title || ""} ${p.pin_description || ""}`;
      const angle = detectAngle(text);
      const benefit = detectBenefit(text);
      const hook = p.hook_group || null;

      bump(this.c90.headline, headline);
      if (cta) bump(this.c90.cta, cta);
      if (angle) bump(this.c90.angle, angle);
      if (benefit) bump(this.c90.benefit, benefit);
      if (hook) bump(this.c90.hook, hook);

      const cat = p.category_key || "(uncategorised)";
      if (!this.byCategory.has(cat)) this.byCategory.set(cat, emptyCounts());
      const cc = this.byCategory.get(cat)!;
      bump(cc.headline, headline);
      if (cta) bump(cc.cta, cta);
      if (angle) bump(cc.angle, angle);
      if (benefit) bump(cc.benefit, benefit);
    }

    for (const p of rows) {
      const ov = norm(p.overlay_text);
      const board = p.board_name || "(none)";
      const cat = p.category_key || "(uncategorised)";
      if (!this.boardStats.has(board)) this.boardStats.set(board, { total: 0, uniques: new Set() });
      if (!this.categoryStats.has(cat)) this.categoryStats.set(cat, { total: 0, uniques: new Set() });
      const bs = this.boardStats.get(board)!;
      const cs = this.categoryStats.get(cat)!;
      bs.total += 1;
      cs.total += 1;
      if (ov) {
        bs.uniques.add(ov);
        cs.uniques.add(ov);
      }
    }

    // Load replacement pools.
    const { data: poolRows } = await sb
      .from("pinterest_category_creative_pools")
      .select("category, pool_type, value, is_active")
      .eq("is_active", true);
    for (const r of poolRows ?? []) {
      this.pools[r.category] ||= {};
      this.pools[r.category][r.pool_type] ||= [];
      this.pools[r.category][r.pool_type].push(r.value);
    }
  }

  hasPool(category: string, type: PoolType): boolean {
    return !!this.pools[category]?.[type]?.length;
  }

  pool(category: string, type: PoolType): string[] {
    return this.pools[category]?.[type] ?? [];
  }

  /** Pick a value from the pool that doesn't violate the cap for `type`. */
  pickFromPool(category: string, type: PoolType): string | null {
    const key = normaliseCategoryKey(category);
    const options = this.pool(key, type);
    if (!options.length) return null;
    const cap =
      type === "headline" ? this.caps.headlinePer90 :
      type === "cta"      ? this.caps.ctaPer90 :
      type === "angle"    ? this.caps.anglePer90 :
      type === "benefit"  ? this.caps.benefitPer90 :
      type === "hook"     ? this.hookCapPer90 :
      999;
    // sort ascending by current usage (least-used first), then stable.
    const counts = this.c90[type as keyof Counts] as Map<string, number>;
    const ranked = [...options].sort((a, b) => (counts.get(norm(a)) || 0) - (counts.get(norm(b)) || 0));
    for (const v of ranked) {
      if ((counts.get(norm(v)) || 0) < cap) return v;
    }
    return null; // pool exhausted under caps
  }

  /**
   * Run the candidate through the cap rules. If a violation is fixable from
   * the pool, swap the offending field. If not, return ok=false with reasons.
   * Mutates a returned `final` copy — the caller is responsible for forwarding
   * the corrected fields to the draft insert path.
   */
  evaluate(candidate: DiversityCandidate, category: string): EvalResult {
    const reasons: string[] = [];
    const replacedFromPool: EvalResult["replacedFromPool"] = {};
    const final: DiversityCandidate = enrich({ ...candidate });
    const catKey = normaliseCategoryKey(category);

    // 1. Exact-overlay duplicate inside last 25.
    const overlay = norm(`${final.headline} • ${final.cta}`);
    if (this.caps.windowLast25Exact && this.c25Exact.has(overlay)) {
      reasons.push(`exact_overlay_in_last_25:${overlay.slice(0, 60)}`);
    }

    const tryReplace = (
      type: PoolType,
      currentValue: string,
      cap: number,
      apply: (next: string) => void,
    ) => {
      const counts = this.c90[type as keyof Counts] as Map<string, number>;
      const key = norm(currentValue);
      const used = key ? counts.get(key) || 0 : 0;
      if (used < cap) return; // ok
      const next = this.pickFromPool(catKey, type);
      if (next) {
        replacedFromPool[type] = { from: currentValue, to: next };
        apply(next);
      } else {
        reasons.push(`${type}_cap_exceeded:${used}>=${cap}:${currentValue.slice(0, 48)}`);
      }
    };

    tryReplace("headline", final.headline, this.caps.headlinePer90, (v) => { final.headline = v; });
    tryReplace("cta", final.cta, this.caps.ctaPer90, (v) => { final.cta = v; });
    if (final.hook) {
      tryReplace("hook", final.hook, this.hookCapPer90, (v) => { final.hook = v; });
    }
    if (final.angle) {
      tryReplace("angle", final.angle, this.caps.anglePer90, (v) => { final.angle = v; });
    }
    if (final.benefit) {
      tryReplace("benefit", final.benefit, this.caps.benefitPer90, (v) => { final.benefit = v; });
    }

    return { ok: reasons.length === 0, reasons, replacedFromPool, final };
  }

  /** Register an accepted candidate so the next call in the same run is aware. */
  register(candidate: DiversityCandidate, _category: string) {
    bump(this.c90.headline, candidate.headline);
    if (candidate.cta) bump(this.c90.cta, candidate.cta);
    if (candidate.angle) bump(this.c90.angle, candidate.angle);
    if (candidate.benefit) bump(this.c90.benefit, candidate.benefit);
    if (candidate.hook) bump(this.c90.hook, candidate.hook);
    this.c25Exact.add(norm(`${candidate.headline} • ${candidate.cta}`));
    this.last90Total += 1;
    this.last25Total += 1;
  }

  snapshot(): DiversitySnapshot {
    const topN = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([value, count]) => ({ value, count }));

    const boardScores = [...this.boardStats.entries()].map(([board, s]) => ({
      board,
      total: s.total,
      uniques: s.uniques.size,
      diversity: s.total ? Math.round((s.uniques.size / s.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const catScores = [...this.categoryStats.entries()].map(([category, s]) => ({
      category,
      total: s.total,
      uniques: s.uniques.size,
      diversity: s.total ? Math.round((s.uniques.size / s.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const allUniques = new Set<string>();
    let allTotal = 0;
    for (const s of this.boardStats.values()) {
      allTotal += s.total;
      for (const u of s.uniques) allUniques.add(u);
    }
    const global = allTotal ? Math.round((allUniques.size / allTotal) * 100) : 0;

    const poolsSummary: Record<string, Record<string, number>> = {};
    for (const [cat, byType] of Object.entries(this.pools)) {
      poolsSummary[cat] = {};
      for (const [t, arr] of Object.entries(byType)) poolsSummary[cat][t] = arr.length;
    }

    return {
      caps: this.caps,
      totals: {
        posted_total: this.postedTotal,
        last_90: this.last90Total,
        last_25: this.last25Total,
        categories: this.categoryStats.size,
        boards: this.boardStats.size,
        pools: poolsSummary,
      },
      scores: { global, by_board: boardScores, by_category: catScores },
      top_repeated_90: {
        headlines: topN(this.c90.headline, 15),
        ctas: topN(this.c90.cta, 15),
        angles: topN(this.c90.angle, 15),
        benefits: topN(this.c90.benefit, 15),
        hooks: topN(this.c90.hook, 15),
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variety score (0-100)
//
// Composite uniqueness across the 5 enforced fields, weighted by cap headroom.
// A candidate that uses values currently at half their cap scores ~75; a
// candidate using values not yet seen in the last 90 scores 100.
// ─────────────────────────────────────────────────────────────────────────────
export interface VarietyBreakdown {
  total: number; // 0-100
  parts: Record<PoolType, number>;
}

export function scoreVariety(guard: DiversityGuard, candidate: DiversityCandidate): VarietyBreakdown {
  const snap = guard.snapshot();
  const cap = {
    headline: snap.caps.headlinePer90,
    cta: snap.caps.ctaPer90,
    angle: snap.caps.anglePer90,
    benefit: snap.caps.benefitPer90,
    hook: guard.hookCapPer90,
  };
  const countOf = (type: PoolType, value: string | null | undefined): number => {
    if (!value) return 0;
    const key = (value || "").trim().toLowerCase();
    const bucket =
      type === "headline" ? snap.top_repeated_90.headlines :
      type === "cta"      ? snap.top_repeated_90.ctas :
      type === "angle"    ? snap.top_repeated_90.angles :
      type === "benefit"  ? snap.top_repeated_90.benefits :
                            snap.top_repeated_90.hooks;
    return bucket.find((b) => b.value.toLowerCase() === key)?.count ?? 0;
  };
  const partFor = (type: PoolType, val: string | null | undefined): number => {
    const c = cap[type];
    if (!c) return 100;
    const used = countOf(type, val);
    const pct = Math.max(0, Math.min(1, used / c));
    return Math.round((1 - pct) * 100);
  };
  const enriched: DiversityCandidate = {
    ...candidate,
    angle: candidate.angle ?? detectAngle(`${candidate.headline} ${candidate.cta} ${candidate.hook ?? ""}`),
    benefit: candidate.benefit ?? detectBenefit(`${candidate.headline} ${candidate.cta} ${candidate.hook ?? ""}`),
  };
  const parts: Record<PoolType, number> = {
    headline: partFor("headline", enriched.headline),
    cta: partFor("cta", enriched.cta),
    hook: partFor("hook", enriched.hook ?? null),
    angle: partFor("angle", enriched.angle ?? null),
    benefit: partFor("benefit", enriched.benefit ?? null),
  };
  // Weighted average — headline & cta carry most weight.
  const total = Math.round(
    parts.headline * 0.35 +
    parts.cta      * 0.25 +
    parts.hook     * 0.15 +
    parts.angle    * 0.15 +
    parts.benefit  * 0.10
  );
  return { total, parts };
}