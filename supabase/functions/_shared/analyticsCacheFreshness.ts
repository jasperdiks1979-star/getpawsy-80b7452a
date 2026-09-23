// Analytics cache freshness contract (shared definition).
//
// MIRROR: `src/lib/analyticsCacheFreshness.ts` must stay byte-identical from
// the `export type CacheFreshnessState` marker onwards; the parity test
// `src/test/analytics-cache-freshness.test.ts` fails CI on drift. Edge
// functions cannot import from `src/`, hence the mirror.
//
// Rules this module encodes (single source of truth for server + admin UI):
//   fresh    — age <= the warmer cadence for that window. Safe to present as current.
//   stale    — older than cadence but within the bounded stale-serve window.
//              Served immediately, labelled, background refresh attempted.
//   fallback — older than the bounded window. STILL served (never a fabricated
//              zero, never a blank panel) but explicitly labelled NOT CURRENT.
//   missing  — no snapshot at all.
// A payload may never be presented as current outside the `fresh` state.

export type CacheFreshnessState = "fresh" | "stale" | "fallback" | "missing";

/** Bounded stale-serve floor (hot windows): 30 minutes. */
export const MAX_STALE_MS = 1_800_000;
/** Single-flight lock lease for a rebuild. */
export const LOCK_MS = 240_000;

/**
 * Warmer cadence per window. Long windows are warmed on slower cron tiers
 * because they cost far more and move far more slowly, so their freshness
 * threshold must track that cadence.
 */
export function freshMsFor(hours: number): number {
  if (hours >= 2160) return 1_800_000; // 90d — 30 min
  if (hours >= 720) return 900_000;    // 30d — 15 min
  if (hours >= 336) return 600_000;    // 14d — 10 min
  return 300_000;                      // hot tiers — 5 min
}

/** Beyond this age a snapshot is a labelled fallback, never "current". */
export function maxStaleMsFor(hours: number): number {
  return Math.max(MAX_STALE_MS, freshMsFor(hours) * 4);
}

export interface CacheFreshnessInput {
  hours: number;
  generatedAt: string | number | Date | null | undefined;
  now?: number;
  /** Last recorded refresh failure for this key, if any. */
  refreshError?: string | null;
  /** Single-flight lock lease end (ISO) — a rebuild is running when in future. */
  lockedUntil?: string | null;
  /** When a rebuild was last STARTED (may have died without recording an error). */
  lastRefreshAttemptAt?: string | null;
}

export interface CacheFreshnessVerdict {
  state: CacheFreshnessState;
  ageSeconds: number | null;
  freshMaxAgeSeconds: number;
  fallbackAfterSeconds: number;
  /** True ONLY when the snapshot may be presented as current data. */
  isCurrent: boolean;
  /** A bounded background refresh should be attempted. */
  shouldRefresh: boolean;
  /** A rebuild is already in flight — do not spawn another (stampede guard). */
  refreshInProgress: boolean;
  /** True when a refresh was started after the snapshot but never completed. */
  refreshFailing: boolean;
  label: string;
}

export function formatCacheAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function evaluateCacheFreshness(input: CacheFreshnessInput): CacheFreshnessVerdict {
  const now = input.now ?? Date.now();
  const freshMs = freshMsFor(input.hours);
  const fallbackMs = maxStaleMsFor(input.hours);
  const lockTs = input.lockedUntil ? new Date(input.lockedUntil).getTime() : NaN;
  const refreshInProgress = Number.isFinite(lockTs) && lockTs > now;

  const base = {
    freshMaxAgeSeconds: Math.round(freshMs / 1000),
    fallbackAfterSeconds: Math.round(fallbackMs / 1000),
    refreshInProgress,
  };

  const ts = input.generatedAt == null || input.generatedAt === ""
    ? NaN
    : input.generatedAt instanceof Date
      ? input.generatedAt.getTime()
      : new Date(input.generatedAt).getTime();

  if (!Number.isFinite(ts)) {
    return {
      ...base,
      state: "missing",
      ageSeconds: null,
      isCurrent: false,
      shouldRefresh: !refreshInProgress,
      refreshFailing: false,
      label: "No snapshot yet — analytics are still being computed.",
    };
  }

  const ageMs = Math.max(0, now - ts);
  const ageSeconds = Math.round(ageMs / 1000);
  const attemptTs = input.lastRefreshAttemptAt
    ? new Date(input.lastRefreshAttemptAt).getTime()
    : NaN;
  const refreshFailing =
    (!!input.refreshError && ageMs > freshMs) ||
    (Number.isFinite(attemptTs) && attemptTs > ts && !refreshInProgress && ageMs > freshMs);

  if (ageMs <= freshMs) {
    return {
      ...base,
      state: "fresh",
      ageSeconds,
      isCurrent: true,
      shouldRefresh: false,
      refreshFailing: false,
      label: `Live — data generated ${formatCacheAge(ageSeconds)}.`,
    };
  }

  if (ageMs <= fallbackMs) {
    return {
      ...base,
      state: "stale",
      ageSeconds,
      isCurrent: false,
      shouldRefresh: !refreshInProgress,
      refreshFailing,
      label: `Behind schedule — data generated ${formatCacheAge(ageSeconds)}; a refresh is running.`,
    };
  }

  return {
    ...base,
    state: "fallback",
    ageSeconds,
    isCurrent: false,
    shouldRefresh: !refreshInProgress,
    refreshFailing: refreshFailing || true,
    label: `NOT CURRENT — last successful refresh ${formatCacheAge(ageSeconds)}. Shown as a fallback only.`,
  };
}
