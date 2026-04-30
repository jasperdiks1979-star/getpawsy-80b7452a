/**
 * visitorCohort — classifies the current page load as either:
 *   - 'first_session'  → no persistent visitor id existed before this load
 *                        (i.e. genuine cold traffic, e.g. first TikTok click)
 *   - 'returning'      → a visitor id was already persisted in localStorage
 *
 * Decision is locked in once per browser tab via sessionStorage so the
 * cohort label stays stable for the entire session, even after we mint
 * the visitor id on first hit. This is the single source of truth used by
 *   - Clarity tag      → heatmap/recordings filter dimension
 *   - lp_funnel_events → server-side cohort segmentation in /admin
 *   - GA4 events       → cohort-aware funnels
 */

const VISITOR_ID_KEY = 'gp_visitor_id';
const COHORT_KEY = 'gp_cohort';

export type VisitorCohort = 'first_session' | 'returning';

let cached: VisitorCohort | null = null;

/**
 * Read (or compute & lock) the cohort for this tab. Safe to call repeatedly
 * and from any module — the first call wins and every subsequent call
 * returns the same value, even if the visitor id is created moments later.
 */
export function getVisitorCohort(): VisitorCohort {
  if (cached) return cached;
  if (typeof window === 'undefined') return 'first_session';

  try {
    // 1. Tab-locked decision wins — keeps the cohort stable across the
    //    whole session even after we persist a brand-new visitor id.
    const sticky = window.sessionStorage.getItem(COHORT_KEY);
    if (sticky === 'first_session' || sticky === 'returning') {
      cached = sticky;
      return cached;
    }
    // 2. First call this tab — if a visitor id already exists in
    //    localStorage, this is a returning visitor; otherwise it's cold.
    const hasPriorId = !!window.localStorage.getItem(VISITOR_ID_KEY);
    cached = hasPriorId ? 'returning' : 'first_session';
    window.sessionStorage.setItem(COHORT_KEY, cached);
    return cached;
  } catch {
    cached = 'first_session';
    return cached;
  }
}

/** Test helper — drop the cached value so a fresh classification can run. */
export function __resetVisitorCohortCache(): void {
  cached = null;
}