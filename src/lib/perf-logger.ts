/**
 * Lightweight production-safe performance logger.
 * Zero-cost when ?perf=1 is absent — no observers created, no overhead.
 * Activate: add ?perf=1 to any URL.
 *
 * Captures:
 *   - Navigation timing (TTFB, DCL, load)
 *   - Paint timing (FP, FCP)
 *   - LCP via PerformanceObserver
 *   - INP/First-input via PerformanceObserver
 *   - Top 10 largest JS resources (gzip size from Resource Timing)
 */

const TAG = '[⚡ PERF]';
const green  = 'color:#22c55e;font-weight:bold';
const yellow = 'color:#eab308;font-weight:bold';
const red    = 'color:#ef4444;font-weight:bold';
const cyan   = 'color:#06b6d4;font-weight:bold';
const reset  = 'color:inherit;font-weight:normal';

function colorFor(ms: number, good: number, ok: number) {
  return ms <= good ? green : ms <= ok ? yellow : red;
}

function fmt(label: string, ms: number, good: number, ok: number) {
  const c = colorFor(ms, good, ok);
  console.log(`%c${TAG} %c${label}%c — %c${Math.round(ms)}ms`, cyan, c, reset, c);
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
}

let initialized = false;

export function initPerfLogger(): void {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  if (!new URLSearchParams(window.location.search).has('perf')) return;

  initialized = true;
  console.log(`%c${TAG} Performance logger active (remove ?perf to disable)`, cyan);

  // ── Navigation Timing (runs after load) ────────────────────────────────
  const logNavTiming = () => {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (!nav) return;

    console.groupCollapsed(`%c${TAG} Navigation Timing`, cyan);
    fmt('TTFB',              nav.responseStart,              200,  600);
    fmt('HTML received',     nav.responseEnd,                400, 1000);
    fmt('DOM interactive',   nav.domInteractive,             800, 1800);
    fmt('DOMContentLoaded',  nav.domContentLoadedEventEnd,   900, 2000);
    fmt('Load event',        nav.loadEventEnd,              2000, 4000);
    console.groupEnd();
  };

  // ── Paint Timing ───────────────────────────────────────────────────────
  const logPaintTiming = () => {
    const paints = performance.getEntriesByType('paint');
    if (!paints.length) return;
    console.groupCollapsed(`%c${TAG} Paint Timing`, cyan);
    paints.forEach(entry => {
      const label = entry.name === 'first-paint' ? 'FP' : 'FCP';
      fmt(label, entry.startTime, 1000, 2500);
    });
    console.groupEnd();
  };

  // ── Resource Timing — top 10 JS bundles ───────────────────────────────
  const logResourceTiming = () => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const jsEntries = entries
      .filter(e => e.initiatorType === 'script' && e.name.includes('.js'))
      .sort((a, b) => (b.encodedBodySize || 0) - (a.encodedBodySize || 0))
      .slice(0, 10);

    if (!jsEntries.length) return;

    const totalGzip = jsEntries.reduce((s, e) => s + (e.encodedBodySize || 0), 0);
    const totalRaw  = jsEntries.reduce((s, e) => s + (e.decodedBodySize || 0), 0);

    console.groupCollapsed(
      `%c${TAG} JS Bundle Sizes — top 10 (total gzip: ${formatBytes(totalGzip)}, raw: ${formatBytes(totalRaw)})`,
      cyan
    );
    jsEntries.forEach((e, i) => {
      const name = e.name.split('/').pop() || e.name;
      const gzip = formatBytes(e.encodedBodySize || 0);
      const raw  = formatBytes(e.decodedBodySize || 0);
      const loadMs = Math.round(e.responseEnd - e.fetchStart);
      console.log(`  ${i + 1}. ${name} — gzip: ${gzip}, raw: ${raw}, load: ${loadMs}ms`);
    });
    console.groupEnd();
  };

  // ── LCP Observer ───────────────────────────────────────────────────────
  if ('PerformanceObserver' in window) {
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as any;
        const ms = last.startTime;
        const el = last.element;
        const elDesc = el ? `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}>` : 'unknown';
        const url = last.url || '(text or inline)';
        fmt('LCP', ms, 1200, 2500);
        console.log(`%c${TAG}%c  LCP element: ${elDesc}`, cyan, reset);
        if (url !== '(text or inline)') {
          console.log(`%c${TAG}%c  LCP resource: ${url.split('/').pop()}`, cyan, reset);
        }
      });
      lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    // ── INP / First-input Observer ─────────────────────────────────────
    try {
      const inpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        if (!entries.length) return;
        const worst = entries.reduce((w, e) => (e.processingEnd - e.startTime > (w?.processingEnd - w?.startTime || 0) ? e : w), null);
        if (!worst) return;
        const delay = worst.processingStart - worst.startTime;
        const duration = worst.processingEnd - worst.processingStart;
        console.log(
          `%c${TAG} %cFirst-input delay: ${Math.round(delay)}ms  |  processing: ${Math.round(duration)}ms`,
          cyan,
          colorFor(delay, 100, 300)
        );
      });
      inpObs.observe({ type: 'first-input', buffered: true });
    } catch {}

    // ── Event Timing for INP ──────────────────────────────────────────
    try {
      const evtObs = new PerformanceObserver((list) => {
        const entries = list.getEntries() as any[];
        // Only log events > 40ms (potential INP candidates)
        entries
          .filter(e => (e.duration || 0) > 40)
          .forEach(e => {
            const inp = Math.round(e.duration);
            console.log(
              `%c${TAG} %cINP candidate: ${e.name} — ${inp}ms`,
              cyan,
              colorFor(inp, 200, 500)
            );
          });
      });
      evtObs.observe({ type: 'event', buffered: true, durationThreshold: 40 } as any);
    } catch {}
  }

  // ── Run nav/paint/resource logging after load ──────────────────────────
  if (document.readyState === 'complete') {
    logNavTiming();
    logPaintTiming();
    logResourceTiming();
  } else {
    window.addEventListener('load', () => {
      // Small defer so resource timing is fully populated
      setTimeout(() => {
        logNavTiming();
        logPaintTiming();
        logResourceTiming();
      }, 500);
    });
  }
}
