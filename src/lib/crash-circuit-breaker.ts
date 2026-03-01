/**
 * Crash Circuit Breaker
 * 
 * Tracks repeated crashes within a session. If the same error repeats >2 times
 * in 60 seconds, the blocking overlay is suppressed and a non-blocking toast
 * is shown instead.
 */

const CRASH_WINDOW_MS = 60_000;
const CRASH_THRESHOLD = 2;
const STORAGE_KEY = 'gp_crash_log';

interface CrashEntry {
  ts: number;
  msg: string;
}

function getCrashLog(): CrashEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CrashEntry[];
  } catch {
    return [];
  }
}

function saveCrashLog(log: CrashEntry[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {}
}

/**
 * Record a crash and return whether the overlay should be suppressed.
 * Returns `true` if the circuit breaker has tripped (suppress overlay).
 */
export function recordCrashAndCheckBreaker(errorMessage: string): boolean {
  const now = Date.now();
  const log = getCrashLog().filter(e => now - e.ts < CRASH_WINDOW_MS);
  log.push({ ts: now, msg: errorMessage });
  saveCrashLog(log);

  // Count crashes in window
  return log.length > CRASH_THRESHOLD;
}

/**
 * Check if the circuit breaker is currently tripped (without recording).
 */
export function isBreakerTripped(): boolean {
  const now = Date.now();
  const log = getCrashLog().filter(e => now - e.ts < CRASH_WINDOW_MS);
  return log.length > CRASH_THRESHOLD;
}
