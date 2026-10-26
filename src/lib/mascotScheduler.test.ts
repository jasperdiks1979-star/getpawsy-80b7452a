import { describe, it, expect } from 'vitest';
import { idleCyclesBeforeAction, nextAction, idleRate, isStalled } from './mascotScheduler';

describe('mascot scheduler', () => {
  it('never repeats the same action twice in a row', () => {
    for (const prev of ['wave', 'groom', 'look'] as const) {
      for (const r of [0, 0.3, 0.6, 0.99]) expect(nextAction(prev, r)).not.toBe(prev);
    }
  });
  it('can pick each of the three actions (wave, groom, look)', () => {
    expect([0, 0.5, 0.99].map((r) => nextAction(null, r))).toEqual(['wave', 'groom', 'look']);
  });
  it('waits 1 or 2 idle loops before an action', () => {
    expect(idleCyclesBeforeAction(0.1)).toBe(1);
    expect(idleCyclesBeforeAction(0.9)).toBe(2);
  });
  it('idle speed stays within 0.9–1.08', () => {
    expect(idleRate(0)).toBe(0.9);
    expect(idleRate(1)).toBe(1.08);
  });
  it('detects a frozen video that should be playing (resume watchdog)', () => {
    expect(isStalled(true, false, 3.2, 3.2)).toBe(true);
    expect(isStalled(true, true, 3.2, 3.2)).toBe(true);
    expect(isStalled(true, false, 3.2, 5.1)).toBe(false);
    expect(isStalled(false, true, 3.2, 3.2)).toBe(false);
  });
});
