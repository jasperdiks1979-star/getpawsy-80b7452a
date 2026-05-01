/**
 * Map Performance Tracker
 * ─────────────────────────
 * Lightweight phase tracker for the VisitorWorldMap. Records duration of each
 * loading phase (chunk load, token fetch, map ctor, style.load, first data fetch)
 * and exposes them via a simple subscribe API for the on-screen dashboard.
 *
 * Timestamps are in ms relative to the first `mark('start')` call.
 */

export type MapPerfPhase =
  | "start"
  | "chunk-loaded"
  | "container-ready"
  | "token-fetch-start"
  | "token-fetch-end"
  | "map-ctor"
  | "style-load"
  | "first-data-start"
  | "first-data-end"
  | "first-paint";

export interface MapPerfMark {
  phase: MapPerfPhase;
  t: number; // ms since `start`
  abs: number; // performance.now()
}

const marks: MapPerfMark[] = [];
let startAbs: number | null = null;
const listeners = new Set<(m: MapPerfMark[]) => void>();

export function mapPerfMark(phase: MapPerfPhase) {
  const abs = performance.now();
  if (phase === "start" || startAbs === null) {
    startAbs = abs;
    marks.length = 0;
  }
  marks.push({ phase, t: Math.round(abs - (startAbs ?? abs)), abs });
  // Native marks for DevTools Performance tab
  try {
    performance.mark(`map-perf:${phase}`);
  } catch {
    /* no-op */
  }
  listeners.forEach((fn) => fn([...marks]));
}

export function getMapPerfMarks(): MapPerfMark[] {
  return [...marks];
}

export function resetMapPerf() {
  marks.length = 0;
  startAbs = null;
  listeners.forEach((fn) => fn([]));
}

export function subscribeMapPerf(fn: (m: MapPerfMark[]) => void): () => void {
  listeners.add(fn);
  fn([...marks]);
  return () => listeners.delete(fn);
}

export const PHASE_LABELS: Record<MapPerfPhase, string> = {
  start: "Component mounted",
  "chunk-loaded": "Mapbox chunk loaded",
  "container-ready": "DOM container ready",
  "token-fetch-start": "Token fetch started",
  "token-fetch-end": "Token received",
  "map-ctor": "Map constructor done",
  "style-load": "Style loaded (tiles ready)",
  "first-data-start": "Data query started",
  "first-data-end": "Data received",
  "first-paint": "First markers painted",
};