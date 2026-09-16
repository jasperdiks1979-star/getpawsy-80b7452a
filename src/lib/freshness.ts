/**
 * Cadence-aware freshness semantics for admin surfaces (Batch F).
 *
 * A dashboard may only claim "live" when the underlying data is newer than the
 * cadence at which it is actually produced. A nightly job that ran 20 hours ago
 * is FRESH; a 5-minute monitor that last answered 20 hours ago is EXPIRED.
 * Never render a green "healthy" state from data older than its cadence.
 */

export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'expired' | 'unknown';

export interface CadenceSpec {
  /** Expected production interval in minutes. */
  cadenceMinutes: number;
  /** Optional human label, e.g. "nightly". */
  label?: string;
}

export const CADENCES = {
  realtime: { cadenceMinutes: 5, label: 'every 5 minutes' },
  frequent: { cadenceMinutes: 15, label: 'every 15 minutes' },
  hourly: { cadenceMinutes: 60, label: 'hourly' },
  sixHourly: { cadenceMinutes: 360, label: 'every 6 hours' },
  nightly: { cadenceMinutes: 1440, label: 'nightly' },
  weekly: { cadenceMinutes: 10080, label: 'weekly' },
} as const satisfies Record<string, CadenceSpec>;

export interface FreshnessResult {
  state: FreshnessState;
  ageMinutes: number | null;
  /** Human sentence safe to show next to a headline number. */
  message: string;
  /** False whenever the surface must not claim live/healthy. */
  canClaimLive: boolean;
  tone: 'positive' | 'neutral' | 'caution' | 'danger';
}

export function formatAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * @param lastUpdated ISO string, Date, epoch ms, or null/undefined (unknown).
 */
export function evaluateFreshness(
  lastUpdated: string | number | Date | null | undefined,
  cadence: CadenceSpec,
  now: number = Date.now(),
): FreshnessResult {
  if (lastUpdated == null || lastUpdated === '') {
    return {
      state: 'unknown',
      ageMinutes: null,
      message: 'No update timestamp — freshness unknown, do not read as live.',
      canClaimLive: false,
      tone: 'danger',
    };
  }

  const ts = lastUpdated instanceof Date ? lastUpdated.getTime() : new Date(lastUpdated).getTime();
  if (!Number.isFinite(ts)) {
    return {
      state: 'unknown',
      ageMinutes: null,
      message: 'Unreadable update timestamp — freshness unknown.',
      canClaimLive: false,
      tone: 'danger',
    };
  }

  const ageMinutes = Math.max(0, (now - ts) / 60000);
  const cadenceMinutes = Math.max(1, cadence.cadenceMinutes);
  const every = cadence.label ? ` (expected ${cadence.label})` : '';
  const age = formatAge(ageMinutes);

  if (ageMinutes <= cadenceMinutes) {
    return {
      state: 'fresh',
      ageMinutes,
      message: `Updated ${age}${every}.`,
      canClaimLive: true,
      tone: 'positive',
    };
  }
  if (ageMinutes <= cadenceMinutes * 2) {
    return {
      state: 'aging',
      ageMinutes,
      message: `Updated ${age} — one cycle behind${every}.`,
      canClaimLive: false,
      tone: 'neutral',
    };
  }
  if (ageMinutes <= cadenceMinutes * 6) {
    return {
      state: 'stale',
      ageMinutes,
      message: `Stale — last updated ${age}${every}. This is not live data.`,
      canClaimLive: false,
      tone: 'caution',
    };
  }
  return {
    state: 'expired',
    ageMinutes,
    message: `Expired — last updated ${age}${every}. Treat every value here as unverified.`,
    canClaimLive: false,
    tone: 'danger',
  };
}

/**
 * Health wording guard: a surface may only say "healthy" / "live" when the
 * check passed AND the data is fresh for its cadence.
 */
export function healthWording(opts: {
  passed: boolean | null | undefined;
  freshness: FreshnessResult;
  subject: string;
}): { label: string; tone: FreshnessResult['tone'] } {
  const { passed, freshness, subject } = opts;
  if (freshness.state === 'unknown') return { label: `${subject}: state unknown`, tone: 'danger' };
  if (!freshness.canClaimLive) {
    return { label: `${subject}: last known result, ${freshness.state}`, tone: freshness.tone };
  }
  if (passed == null) return { label: `${subject}: no verdict`, tone: 'neutral' };
  return passed
    ? { label: `${subject}: healthy`, tone: 'positive' }
    : { label: `${subject}: failing`, tone: 'danger' };
}
