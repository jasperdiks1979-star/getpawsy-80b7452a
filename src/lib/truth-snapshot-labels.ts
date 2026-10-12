// The analytics-truth-engine reads via the API, which returns at most 1000 rows
// per query (its .limit(20000) is silently capped). Counts at the cap are samples.
export const API_ROW_CAP = 1000;

export function isRowCapped(n: number | null | undefined): boolean {
  return typeof n === "number" && n >= API_ROW_CAP;
}

export function countLabel(base: "Events" | "Sessions", n: number | null | undefined): string {
  return isRowCapped(n) ? `${base} (sample, capped at ${API_ROW_CAP})` : base;
}

export const HUMAN_LABEL = "Likely human % (not confirmed shoppers)";
export const SAMPLE_NOTE =
  "Rows hit the 1000-row read cap: totals and percentages describe a sample, not all traffic. Sessions without a classification row are counted as unknown, not human.";
