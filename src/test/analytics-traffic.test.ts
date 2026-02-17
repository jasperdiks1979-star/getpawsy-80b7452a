import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock founder-mode before importing traffic
vi.mock('@/lib/founder-mode', () => ({
  getFounderModeStatus: vi.fn(() => false),
}));

import { setInternalTraffic, isInternalTraffic, getTrafficContext } from '@/lib/traffic';

describe('Internal Traffic Toggle', () => {
  beforeEach(() => {
    // Clear cookies
    document.cookie = 'gp_internal=;path=/;max-age=0';
    localStorage.removeItem('gp_internal');
  });

  it('sets cookie and localStorage when enabled', () => {
    setInternalTraffic(true);
    expect(isInternalTraffic()).toBe(true);
    expect(localStorage.getItem('gp_internal')).toBe('1');
    expect(document.cookie).toContain('gp_internal=1');
  });

  it('clears cookie and localStorage when disabled', () => {
    setInternalTraffic(true);
    setInternalTraffic(false);
    expect(isInternalTraffic()).toBe(false);
    expect(localStorage.getItem('gp_internal')).toBeNull();
  });

  it('returns correct traffic context when internal', () => {
    setInternalTraffic(true);
    const ctx = getTrafficContext();
    expect(ctx.trafficType).toBe('internal');
    expect(ctx.testMode).toBe(true);
    expect(ctx.visitorIntent).toBe('test');
    expect(ctx.countryHint).toBe('US');
  });

  it('returns correct traffic context when external', () => {
    setInternalTraffic(false);
    const ctx = getTrafficContext();
    expect(ctx.trafficType).toBe('external');
    expect(ctx.testMode).toBe(false);
    expect(ctx.visitorIntent).toBe('real');
  });
});
