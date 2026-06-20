// Autonomous Revenue AI V1 — shared helpers
export type Tier = "top_1" | "top_5" | "top_10" | "mid" | "loser" | "untested";

export const REVENUE_WEIGHTS = { click: 1, atc: 3, checkout: 6, purchase: 12 };

export function bucketDuration(seconds?: number | null): string {
  const s = Number(seconds ?? 0);
  if (!s) return "unknown";
  if (s < 6) return "<6";
  if (s < 10) return "6-10";
  if (s < 15) return "10-15";
  if (s < 25) return "15-25";
  return "25+";
}

export function tierFromPercentile(p: number, thresholds = { top1: 0.99, top5: 0.95, top10: 0.90 }, hasImpressions = true): Tier {
  if (!hasImpressions) return "untested";
  if (p >= thresholds.top1) return "top_1";
  if (p >= thresholds.top5) return "top_5";
  if (p >= thresholds.top10) return "top_10";
  if (p <= 0.20) return "loser";
  return "mid";
}

const HOOK_PATTERNS: Array<[string, RegExp]> = [
  ["question", /\?$|^(why|what|how|did you|imagine)/i],
  ["problem_solve", /(stop|tired|fix|solve|never again|finally)/i],
  ["benefit_promise", /(save|faster|easier|sleep|comfort|love|happy)/i],
  ["social_proof", /(thousands|loved|trusted|#1|best|top)/i],
  ["urgency", /(today|now|limited|don.?t miss|hurry|last)/i],
  ["curiosity", /(secret|trick|hack|surprise|reason)/i],
];
const CTA_PATTERNS: Array<[string, RegExp]> = [
  ["shop_now", /(shop|buy|get|order)\s*now/i],
  ["see_more", /(see|view|discover|explore)\s*(more|now|today)?/i],
  ["try_today", /(try|start|claim|grab)/i],
  ["save_pin", /(save|tap|click|swipe)\s*(this|here|now)?/i],
  ["learn", /(learn|find out|read more|tell me)/i],
];

export function archetypeFromText(text: string | null | undefined, kind: "hook" | "cta"): string {
  if (!text) return "unknown";
  const patterns = kind === "hook" ? HOOK_PATTERNS : CTA_PATTERNS;
  for (const [name, re] of patterns) if (re.test(text)) return name;
  return "generic";
}

export function scoreVoice(rev: { revenuePerClick: number; conversionRate: number }): number {
  return rev.revenuePerClick * 0.6 + rev.conversionRate * 0.4 * 1000;
}

export function nextAllocationWeight(rank: number, total: number, base = 1.0): number {
  if (total <= 1) return base;
  const pos = rank / total; // 0 = best, 1 = worst
  if (pos <= 0.2) return Math.round(base * 2.0 * 1000) / 1000;
  if (pos <= 0.5) return Math.round(base * 1.25 * 1000) / 1000;
  if (pos >= 0.8) return Math.round(base * 0.25 * 1000) / 1000;
  return base;
}

export function percentileRank(values: number[], v: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let i = 0;
  while (i < sorted.length && sorted[i] < v) i++;
  return i / sorted.length;
}

export function tierToMultiplier(tier: string): number {
  switch (tier) {
    case "top_1": return 3.0;
    case "top_5": return 2.0;
    case "top_10": return 1.5;
    case "mid": return 1.0;
    case "loser": return 0.25;
    default: return 1.0;
  }
}

export function composeRevenueScore(parts: {
  stock: number; ctr: number; sales: number; media: number; pinterest: number;
}): number {
  const w = { stock: 15, ctr: 15, sales: 30, media: 15, pinterest: 25 };
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const c = clamp(parts.stock) * w.stock
    + clamp(parts.ctr) * w.ctr
    + clamp(parts.sales) * w.sales
    + clamp(parts.media) * w.media
    + clamp(parts.pinterest) * w.pinterest;
  return Math.round((c / 100) * 100) / 100;
}

export function tierFromComposite(composite: number): "hero" | "winner" | "contender" | "tail" {
  if (composite >= 80) return "hero";
  if (composite >= 60) return "winner";
  if (composite >= 35) return "contender";
  return "tail";
}