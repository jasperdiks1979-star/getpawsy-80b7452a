// Canonical analytics window definitions (frontend copy).
//
// MIRROR OF `supabase/functions/_shared/analyticsWindows.ts` — the two files MUST stay in sync;
// `src/test/analytics-windows-parity.test.ts` fails CI on drift. Edge
// functions cannot import from `src/`, hence the mirror instead of a third
// competing map.

export type AnalyticsWindowId = "1h" | "24h" | "7d" | "14d" | "30d" | "90d";

export interface AnalyticsWindow {
  id: AnalyticsWindowId;
  hours: number;
  /** Warmer tier — drives refresh cadence and cron schedule grouping. */
  tier: "hot" | "d14" | "d30" | "d90";
}

export const ANALYTICS_WINDOWS: AnalyticsWindow[] = [
  { id: "1h",  hours: 1,    tier: "hot" },
  { id: "24h", hours: 24,   tier: "hot" },
  { id: "7d",  hours: 168,  tier: "hot" },
  { id: "14d", hours: 336,  tier: "d14" },
  { id: "30d", hours: 720,  tier: "d30" },
  { id: "90d", hours: 2160, tier: "d90" },
];

export const WARMER_TIERS = ["hot", "d14", "d30", "d90"] as const;
export type WarmerTier = (typeof WARMER_TIERS)[number];

/** (hours, geo) combos a given tier is responsible for warming. */
export function combosForTier(tier: WarmerTier): Array<{ hours: number; geo: "US" | "all" }> {
  return ANALYTICS_WINDOWS.filter((w) => w.tier === tier).flatMap((w) => [
    { hours: w.hours, geo: "all" as const },
    { hours: w.hours, geo: "US" as const },
  ]);
}
