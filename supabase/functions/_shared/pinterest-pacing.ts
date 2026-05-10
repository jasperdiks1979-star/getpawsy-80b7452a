// ─────────────────────────────────────────────────────────────────────────────
// Pinterest pacing presets
//
// Three modes control daily_pin_cap + min_gap_minutes for the publish worker.
// Used by:
//   • admin UI (PinterestDominationCard)  — picks the mode
//   • this helper                          — translates mode → preset values
//   • pinterest-runtime-settings           — persists preset values
// ─────────────────────────────────────────────────────────────────────────────

export type PacingMode = "slow" | "balanced" | "domination";

export interface PacingPreset {
  daily_pin_cap: number;
  min_gap_minutes: number;
  /** UI hint — one-line description. */
  description: string;
}

export const PACING_PRESETS: Record<PacingMode, PacingPreset> = {
  slow: {
    daily_pin_cap: 2,
    min_gap_minutes: 240,
    description: "Warm-up — 2 pins/day, 4h gap. Safest for new accounts.",
  },
  balanced: {
    daily_pin_cap: 4,
    min_gap_minutes: 90,
    description: "Default — 4 pins/day, 90min gap. Pinterest-safe cadence.",
  },
  domination: {
    daily_pin_cap: 8,
    min_gap_minutes: 45,
    description: "Scale — 8 pins/day, 45min gap. Use only with proven winners.",
  },
};

export function isPacingMode(value: unknown): value is PacingMode {
  return value === "slow" || value === "balanced" || value === "domination";
}

export function getPacingPreset(mode: PacingMode): PacingPreset {
  return PACING_PRESETS[mode];
}