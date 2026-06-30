// Pure scoring helpers extracted from index.ts so they are unit-testable
// without booting Deno.serve. The edge function imports them; tests import
// them directly. Keep deterministic — no I/O, no env, no time.

export type Row = {
  id: string;
  status: string;
  priority: number | null;
  category_key: string | null;
  content_type: string | null;
  pin_title: string | null;
  pin_description: string | null;
  hashtags: string[] | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type TypeKey =
  | "lifestyle"
  | "educational"
  | "problem_solution"
  | "seasonal"
  | "entertainment"
  | "product_showcase";

export const HELPFUL_TERMS = [
  "how", "why", "tips", "guide", "checklist", "avoid", "fix", "stop",
  "ways", "things", "before you", "what to", "best", "vs", "signs",
];
export const LIFESTYLE_TERMS = [
  "cozy", "morning", "sunny", "evening", "weekend", "kitchen", "living room",
  "bedroom", "patio", "balcony", "couch", "rv", "cafe", "outdoor", "garden",
];
export const EDU_TERMS = [
  "guide", "tutorial", "step", "explained", "science", "learn",
  "training", "behavior", "vet", "expert",
];
export const SHOWCASE_TERMS = [
  "buy", "sale", "discount", "% off", "shop now", "new arrival",
  "shop", "deal",
];

export function classify(row: Row): TypeKey {
  const ct = (row.content_type || "").toLowerCase();
  if (ct && ct !== "product") {
    const map: Record<string, TypeKey> = {
      lifestyle: "lifestyle",
      educational: "educational",
      problem_solution: "problem_solution",
      seasonal: "seasonal",
      entertainment: "entertainment",
    };
    if (map[ct]) return map[ct];
  }
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const mc = String((meta.content_type as string) || (meta.pin_type as string) || "").toLowerCase();
  if (mc && mc in { lifestyle: 1, educational: 1, problem_solution: 1, seasonal: 1, entertainment: 1 }) {
    return mc as TypeKey;
  }
  return "product_showcase";
}

export function nativeScore(row: Row): { score: number; axes: Record<string, number> } {
  const text = `${row.pin_title ?? ""} ${row.pin_description ?? ""} ${(row.hashtags ?? []).join(" ")}`.toLowerCase();
  const hits = (terms: string[]) => terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
  const helpful = Math.min(100, hits(HELPFUL_TERMS) * 22);
  const lifestyle = Math.min(100, hits(LIFESTYLE_TERMS) * 25);
  const educational = Math.min(100, hits(EDU_TERMS) * 28);
  const showcasePenalty = Math.min(40, hits(SHOWCASE_TERMS) * 15);
  const lengthBonus = (row.pin_description?.length ?? 0) > 120 ? 10 : 0;
  const base = (helpful * 0.4 + lifestyle * 0.35 + educational * 0.25) + lengthBonus;
  const score = Math.max(0, Math.min(100, Math.round(base - showcasePenalty)));
  return { score, axes: { helpful, lifestyle, educational, showcasePenalty } };
}

// Pure rebalance decision used by both the edge function and tests.
export function decideAction(args: {
  score: number;
  minScore: number;
  type: TypeKey;
  overType: boolean;
  overCat: boolean;
}): { action: "reject" | "downrank" | "keep"; reason: string } {
  const { score, minScore, type, overType, overCat } = args;
  const isShowcase = type === "product_showcase";
  const lowScore = score < minScore;
  if (lowScore && (isShowcase || overType || overCat)) {
    return {
      action: "reject",
      reason:
        `native_score=${score}<${minScore}` +
        (isShowcase ? "+showcase" : "") +
        (overType ? `+over_type(${type})` : "") +
        (overCat ? `+over_category` : ""),
    };
  }
  if (lowScore) return { action: "downrank", reason: `native_score=${score}<${minScore}` };
  if (overType || overCat) {
    return {
      action: "downrank",
      reason: `rebalance` + (overType ? `+over_type(${type})` : "") + (overCat ? `+over_category` : ""),
    };
  }
  return { action: "keep", reason: "ok" };
}