/** Pure helpers for the kitten clip scheduler (testable, no DOM). */
export type MascotAction = 'wave' | 'groom';
export const ACTIONS: MascotAction[] = ['wave', 'groom'];

/** Idle loops (10 s each) before the next action: 1 or 2. */
export function idleCyclesBeforeAction(rnd: number): number {
  return rnd < 0.5 ? 1 : 2;
}

/** Next action, never the same one twice in a row. */
export function nextAction(prev: MascotAction | null, rnd: number): MascotAction {
  const pool = prev ? ACTIONS.filter((a) => a !== prev) : ACTIONS;
  return pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))];
}

/** Slight per-cycle idle speed variation so loops don't look identical. */
export function idleRate(rnd: number): number {
  return Math.round((0.9 + rnd * 0.18) * 100) / 100;
}

/** Playback is stalled if it should play but time hasn't advanced. */
export function isStalled(shouldPlay: boolean, paused: boolean, prevT: number, t: number): boolean {
  return shouldPlay && (paused || Math.abs(t - prevT) < 0.01);
}
