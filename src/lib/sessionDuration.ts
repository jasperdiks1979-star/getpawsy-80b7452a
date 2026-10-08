/**
 * Shared, pure session-duration resolver for admin exports (CSV + Summary).
 * Elapsed session duration only — NOT active engagement (engagement_ms stays separate).
 * Priority: effective_duration_seconds → reported_duration_seconds → timestamp delta (legacy).
 */
export interface DurationInput {
  effective_duration_seconds?: number | null;
  reported_duration_seconds?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

const valid = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

export function resolveSessionDurationSeconds(s: DurationInput): number {
  if (valid(s.effective_duration_seconds)) return Math.round(s.effective_duration_seconds);
  if (valid(s.reported_duration_seconds)) return Math.round(s.reported_duration_seconds);
  const a = s.first_seen_at ? new Date(s.first_seen_at).getTime() : NaN;
  const b = s.last_seen_at ? new Date(s.last_seen_at).getTime() : NaN;
  const d = (b - a) / 1000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
