import { describe, expect, it } from 'vitest';
import { isSyntheticTraffic, SYNTHETIC_TRAFFIC_KEY } from './syntheticTraffic';

describe('synthetic traffic marker', () => {
  it('does not exclude real unmarked visitors, including US shoppers', () => {
    expect(isSyntheticTraffic({ getItem: () => null })).toBe(false);
  });
  it('identifies only the explicit E2E marker', () => {
    expect(isSyntheticTraffic({ getItem: key => key === SYNTHETIC_TRAFFIC_KEY ? 'playwright-e2e' : null })).toBe(true);
    expect(isSyntheticTraffic({ getItem: () => 'other' })).toBe(false);
  });
  it('fails open for real users if browser storage is unavailable', () => {
    expect(isSyntheticTraffic({ getItem: () => { throw Error('blocked'); } })).toBe(false);
  });
});
