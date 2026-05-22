// Humanized publishing window calculator.
// Returns { inWindow, nextWindowStart, jitterSeconds }.
// EST = UTC-5 (we do not bother with DST — Pinterest reach is largely
// invariant to the 1h shift and accuracy is not material).

export interface Window { start: number; end: number }

export function isInWindowEst(now: Date, windows: Window[]): boolean {
  const estHour = (now.getUTCHours() + 24 - 5) % 24;
  return windows.some((w) => estHour >= w.start && estHour < w.end);
}

export function nextWindowStartUtc(now: Date, windows: Window[]): Date {
  const estHour = (now.getUTCHours() + 24 - 5) % 24;
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  for (const w of sorted) {
    if (estHour < w.start) {
      const next = new Date(now);
      next.setUTCHours(next.getUTCHours() + (w.start - estHour));
      next.setUTCMinutes(0, 0, 0);
      return next;
    }
  }
  // next day, first window
  const first = sorted[0];
  const next = new Date(now);
  next.setUTCHours(next.getUTCHours() + (24 - estHour + first.start));
  next.setUTCMinutes(0, 0, 0);
  return next;
}

export function jitterSeconds(min: number, max: number, seed?: string): number {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  if (seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = ((h >>> 0) % 10000) / 10000;
    return Math.floor(lo + r * (hi - lo));
  }
  return Math.floor(lo + Math.random() * (hi - lo));
}

export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>>= 1; }
  }
  return d;
}