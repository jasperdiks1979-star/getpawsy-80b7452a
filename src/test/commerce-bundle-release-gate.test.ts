import { describe, expect, it } from 'vitest';
import { isBundleUpsellReady } from '@/lib/commerceBundleReleaseGate';

describe('legacy bundle upsell safety gate', () => {
  it('fails closed until variant and checkout price parity are proven', () => {
    expect(isBundleUpsellReady()).toBe(false);
  });
});
