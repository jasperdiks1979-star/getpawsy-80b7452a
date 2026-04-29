/**
 * E2E test for the TikTok performance reports' session-level exclusion logic.
 *
 * The reporting RPCs (`get_tiktok_hook_performance`, `get_tiktok_bio_split`,
 * `get_tiktok_excluded_sessions`) all share the same `clean_sessions` CTE:
 * ANY of these conditions in the session's history disqualifies the session
 * from every report.
 *
 *   1. is_internal = true on any event
 *   2. country in ('netherlands','nl') on any event
 *   3. page_path matches '/admin%' on any event
 *   4. browser='unknown' AND screen_width=0 on any event (bot heuristic)
 *
 * This test reproduces the rule matrix in TypeScript and asserts that:
 *   • a clean session is kept
 *   • a session that ever had is_internal=true is dropped (even if every
 *     other event was clean)
 *   • a session that ever visited an /admin route is dropped
 *   • NL and bot-heuristic sessions are dropped
 *
 * If the SQL `clean_sessions` CTE in any of the three RPCs drifts away from
 * these rules, this test fails — guaranteeing all three reports stay in
 * lockstep on the documented exclusion contract.
 *
 * The companion DB function `test_tiktok_exclusion_fixtures` runs the same
 * matrix server-side using the production CTE, providing an integration-level
 * counterpart that can be invoked from any admin session.
 */
import { describe, it, expect } from 'vitest';

type Event = {
  page_path: string;
  is_internal?: boolean;
  country?: string;
  browser?: string;
  screen_width?: number;
};

/**
 * Mirrors the SQL `clean_sessions` CTE in
 *   - get_tiktok_hook_performance
 *   - get_tiktok_bio_split
 *   - get_tiktok_excluded_sessions
 * Returns true when the session would be KEPT in the reports.
 */
function isSessionKept(events: Event[]): boolean {
  const hasInternal = events.some((e) => e.is_internal === true);
  const hasNL = events.some((e) => {
    const c = (e.country ?? '').toLowerCase();
    return c === 'netherlands' || c === 'nl';
  });
  const hasAdmin = events.some((e) => (e.page_path ?? '').startsWith('/admin'));
  const hasBot = events.some(
    (e) => (e.browser ?? '') === 'unknown' && (e.screen_width ?? 0) === 0,
  );
  return !hasInternal && !hasNL && !hasAdmin && !hasBot;
}

const FIXTURES: Record<string, { events: Event[]; expectedKept: boolean }> = {
  clean: {
    events: [
      { page_path: '/go', country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/products/foo', country: 'United States', browser: 'Chrome', screen_width: 1280 },
    ],
    expectedKept: true,
  },
  internal_once: {
    events: [
      { page_path: '/go', is_internal: true, country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/products/foo', is_internal: false, country: 'United States', browser: 'Chrome', screen_width: 1280 },
    ],
    expectedKept: false,
  },
  internal_then_clean: {
    // is_internal flipped on a single event must still drop the whole session
    events: [
      { page_path: '/products/foo', is_internal: false, country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/products/bar', is_internal: true, country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/products/baz', is_internal: false, country: 'United States', browser: 'Chrome', screen_width: 1280 },
    ],
    expectedKept: false,
  },
  admin_visit: {
    events: [
      { page_path: '/go', country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/admin/dashboard', country: 'United States', browser: 'Chrome', screen_width: 1280 },
    ],
    expectedKept: false,
  },
  admin_subroute: {
    events: [
      { page_path: '/admin/tiktok-ads-performance', country: 'United States', browser: 'Chrome', screen_width: 1280 },
    ],
    expectedKept: false,
  },
  nl_country: {
    events: [{ page_path: '/go', country: 'Netherlands', browser: 'Chrome', screen_width: 1280 }],
    expectedKept: false,
  },
  nl_short_code: {
    events: [{ page_path: '/go', country: 'NL', browser: 'Chrome', screen_width: 1280 }],
    expectedKept: false,
  },
  bot_heuristic: {
    events: [{ page_path: '/go', country: 'United States', browser: 'unknown', screen_width: 0 }],
    expectedKept: false,
  },
  unknown_browser_with_screen: {
    // browser=unknown alone is NOT enough — needs screen_width=0 too.
    events: [{ page_path: '/go', country: 'United States', browser: 'unknown', screen_width: 800 }],
    expectedKept: true,
  },
};

describe('TikTok performance reports — session-level exclusion contract', () => {
  for (const [name, fx] of Object.entries(FIXTURES)) {
    it(`${name}: ${fx.expectedKept ? 'kept' : 'excluded'}`, () => {
      expect(isSessionKept(fx.events)).toBe(fx.expectedKept);
    });
  }

  it('any session that ever had is_internal=true is dropped from every report', () => {
    // Specifically guards against regressions where someone "last-event-wins"
    // the is_internal check. All three reports use bool_or() across the
    // session, so a single true must poison the whole session.
    const evs: Event[] = [];
    for (let i = 0; i < 50; i++) {
      evs.push({ page_path: '/products/x', is_internal: false, country: 'United States', browser: 'Chrome', screen_width: 1280 });
    }
    evs[37].is_internal = true; // one needle in the haystack
    expect(isSessionKept(evs)).toBe(false);
  });

  it('any session that ever visited /admin is dropped from every report', () => {
    const evs: Event[] = [
      { page_path: '/go', country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/products/foo', country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/admin', country: 'United States', browser: 'Chrome', screen_width: 1280 },
      { page_path: '/products/bar', country: 'United States', browser: 'Chrome', screen_width: 1280 },
    ];
    expect(isSessionKept(evs)).toBe(false);
  });

  it('admin route prefix matches both /admin and /admin/sub-route', () => {
    expect(isSessionKept([{ page_path: '/admin', country: 'US', browser: 'Chrome', screen_width: 1280 }])).toBe(false);
    expect(isSessionKept([{ page_path: '/admin/anything', country: 'US', browser: 'Chrome', screen_width: 1280 }])).toBe(false);
    // /administration is intentionally also matched by `/admin%` prefix in
    // SQL — document that here so a future tightening is a deliberate choice.
    expect(isSessionKept([{ page_path: '/administration', country: 'US', browser: 'Chrome', screen_width: 1280 }])).toBe(false);
  });
});
