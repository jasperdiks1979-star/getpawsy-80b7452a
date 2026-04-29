import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPersistedUtm,
  persistUtmToSession,
  resolveUtm,
} from '../utmNormalizer';

const LOCAL_TS = 'gp_utm_ts';
const LOCAL_PREFIX = 'gp_utm_';
const DAY = 24 * 60 * 60 * 1000;

const TIKTOK_UTM = {
  utm_source: 'tiktok',
  utm_medium: 'social',
  utm_campaign: 'conv_timepain',
  utm_content: 'hook_3',
};

/**
 * Simulate a browser tab close: sessionStorage is wiped while
 * localStorage survives. Mirrors what browsers do between visits.
 */
function simulateTabClose() {
  window.sessionStorage.clear();
}

/** Force the persisted UTM timestamp to N days ago. */
function ageLocalStorageBy(days: number) {
  const past = Date.now() - days * DAY;
  window.localStorage.setItem(LOCAL_TS, String(past));
}

describe('UTM persistence — 30-day localStorage window', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists UTMs to both session + local storage on first visit', () => {
    persistUtmToSession(TIKTOK_UTM);

    // session layer
    expect(window.sessionStorage.getItem('utm_campaign')).toBe('conv_timepain');
    expect(window.sessionStorage.getItem('utm_content')).toBe('hook_3');

    // local layer (30-day mirror) + freshness timestamp
    expect(window.localStorage.getItem(LOCAL_PREFIX + 'utm_campaign')).toBe(
      'conv_timepain',
    );
    expect(Number(window.localStorage.getItem(LOCAL_TS))).toBeGreaterThan(0);
  });

  it('returns persisted UTMs after tab close (session gone, local fresh)', () => {
    persistUtmToSession(TIKTOK_UTM);
    simulateTabClose();

    const got = getPersistedUtm();
    expect(got.utm_source).toBe('tiktok');
    expect(got.utm_campaign).toBe('conv_timepain');
    expect(got.utm_content).toBe('hook_3');
  });

  it('still returns UTMs at day 29 (within 30-day TTL)', () => {
    persistUtmToSession(TIKTOK_UTM);
    simulateTabClose();
    ageLocalStorageBy(29);

    const got = getPersistedUtm();
    expect(got.utm_campaign).toBe('conv_timepain');
    expect(got.utm_source).toBe('tiktok');
  });

  it('ignores UTMs after the 30-day TTL has elapsed', () => {
    persistUtmToSession(TIKTOK_UTM);
    simulateTabClose();
    ageLocalStorageBy(31);

    const got = getPersistedUtm();
    expect(got).toEqual({});
  });

  it('treats exactly 30 days + 1 ms as expired', () => {
    persistUtmToSession(TIKTOK_UTM);
    simulateTabClose();
    // Manually set ts to 30 days + 1ms ago
    window.localStorage.setItem(LOCAL_TS, String(Date.now() - 30 * DAY - 1));

    expect(getPersistedUtm()).toEqual({});
  });

  it('renews the TTL on every persist call (sliding window)', () => {
    persistUtmToSession(TIKTOK_UTM);
    ageLocalStorageBy(29); // about to expire

    // User re-engages — write again (e.g. another /go visit)
    persistUtmToSession(TIKTOK_UTM);
    const ts = Number(window.localStorage.getItem(LOCAL_TS));
    expect(Date.now() - ts).toBeLessThan(1000);

    simulateTabClose();
    expect(getPersistedUtm().utm_campaign).toBe('conv_timepain');
  });

  it('return-to-checkout: tab close → fresh tab → checkout still attributes', () => {
    // Day 0: TikTok ad click writes attribution
    persistUtmToSession(TIKTOK_UTM);

    // User closes tab, returns 5 days later on /checkout
    simulateTabClose();
    ageLocalStorageBy(5);

    // Checkout page resolves UTMs with no URL params and empty session
    const resolved = resolveUtm({ search: '' });
    expect(resolved.utm_source).toBe('tiktok');
    expect(resolved.utm_campaign).toBe('conv_timepain');
    expect(resolved.utm_content).toBe('hook_3');

    // And the resolution rehydrates session for downstream events
    expect(window.sessionStorage.getItem('utm_campaign')).toBe('conv_timepain');
  });

  it('return-to-checkout after TTL: no attribution leaks through', () => {
    persistUtmToSession(TIKTOK_UTM);
    simulateTabClose();
    ageLocalStorageBy(45);

    const resolved = resolveUtm({ search: '' });
    // Nothing should resurrect the stale campaign
    expect(resolved.utm_campaign).toBeNull();
    expect(resolved.utm_content).toBeNull();
  });

  it('never overwrites a fresh value with null on subsequent persist', () => {
    persistUtmToSession(TIKTOK_UTM);
    // Later page only knows utm_source; must NOT clobber utm_campaign
    persistUtmToSession({ utm_source: 'tiktok' });

    const got = getPersistedUtm();
    expect(got.utm_campaign).toBe('conv_timepain');
    expect(got.utm_content).toBe('hook_3');
  });

  it('URL params win over stale-but-fresh persisted attribution', () => {
    persistUtmToSession(TIKTOK_UTM);
    simulateTabClose();
    ageLocalStorageBy(2);

    const resolved = resolveUtm({
      search: '?utm_source=pinterest&utm_campaign=conv_other',
    });
    expect(resolved.utm_source).toBe('pinterest');
    expect(resolved.utm_campaign).toBe('conv_other');
    // Non-overridden keys still come from the persisted layer
    expect(resolved.utm_content).toBe('hook_3');
  });
});