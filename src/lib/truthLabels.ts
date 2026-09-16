/**
 * Canonical data-provenance vocabulary for admin surfaces.
 *
 * Every prominent admin panel must declare WHAT KIND of number it shows so a
 * reader can never mistake a boot probe, a heuristic or a static sample for
 * live business truth. Do not invent new labels in components — add them here.
 */

export type TruthClass =
  | 'live_truth'
  | 'diagnostic'
  | 'legacy_truth'
  | 'heuristic'
  | 'mock'
  | 'broken_monitor'
  | 'simulation';

export interface TruthClassMeta {
  id: TruthClass;
  /** Short badge text. */
  label: string;
  /** One-line explanation shown as tooltip / description. */
  description: string;
  /** Visual severity tier — maps to semantic token classes in the component. */
  tone: 'positive' | 'neutral' | 'caution' | 'danger';
}

export const TRUTH_CLASSES: Record<TruthClass, TruthClassMeta> = {
  live_truth: {
    id: 'live_truth',
    label: 'LIVE TRUTH',
    description:
      'Measured from the canonical production data source for the stated window. Safe to act on.',
    tone: 'positive',
  },
  diagnostic: {
    id: 'diagnostic',
    label: 'DIAGNOSTIC',
    description:
      'Technical probe of system reachability or configuration. Does NOT prove end-to-end business behaviour.',
    tone: 'neutral',
  },
  legacy_truth: {
    id: 'legacy_truth',
    label: 'LEGACY TRUTH',
    description:
      'Real historical data from a superseded pipeline. May disagree with the canonical source.',
    tone: 'caution',
  },
  heuristic: {
    id: 'heuristic',
    label: 'HEURISTIC',
    description:
      'Derived by estimation or scoring rules, not directly measured. Treat as indicative only.',
    tone: 'caution',
  },
  mock: {
    id: 'mock',
    label: 'MOCK / STATIC',
    description: 'Hardcoded or sample content. Not connected to production data.',
    tone: 'danger',
  },
  broken_monitor: {
    id: 'broken_monitor',
    label: 'BROKEN MONITOR',
    description:
      'This monitor could not produce a verdict. The absence of a result is not a failure of the thing being monitored.',
    tone: 'danger',
  },
  simulation: {
    id: 'simulation',
    label: 'SIMULATION',
    description: 'Modelled / what-if output. No real action was taken and no real data is implied.',
    tone: 'caution',
  },
};

/**
 * Monitoring verdicts must distinguish "checked and failing" from
 * "nothing happened to check". A monitor that reports red purely because the
 * window had no traffic is a false alarm.
 */
export type MonitorVerdict = 'pass' | 'fail' | 'no_activity' | 'unknown';

export function verdictFromCounts(opts: {
  /** Did anything happen in the window that this check depends on? */
  activityInWindow: number;
  /** Observed occurrences of the thing we expect. */
  observed: number;
  /** Is this check applicable at all in this window? */
  required?: boolean;
}): MonitorVerdict {
  const required = opts.required ?? true;
  if (!required) return 'unknown';
  if (opts.activityInWindow <= 0) return 'no_activity';
  return opts.observed > 0 ? 'pass' : 'fail';
}
