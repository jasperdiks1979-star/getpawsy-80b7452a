/**
 * LCP Render Trace
 * ─────────────────────────────────────────────────────────────────────────────
 * Instruments every state mutation that can cause a React re-render during the
 * LCP window (first 2 000 ms after navigation start).
 *
 * HOW TO READ THE OUTPUT
 * ───────────────────────
 * All timestamps are relative to `performance.timeOrigin` (i.e., the moment
 * the page navigation began — equivalent to what the browser uses for LCP).
 *
 * Look for entries tagged [LCP-WINDOW] — those are the dangerous ones.
 *
 * Activate: always active in dev; in prod add ?lcpTrace=1 to the URL.
 */

const ENABLED =
  typeof window !== 'undefined' &&
  (import.meta.env.DEV ||
    new URLSearchParams(window.location.search).has('lcpTrace'));

/** ms since navigation start */
function t(): number {
  return Math.round(performance.now());
}

/** Is this timestamp inside the 2s LCP danger window? */
function lcpWindow(ts: number): boolean {
  return ts <= 2000;
}

function tag(ts: number): string {
  return lcpWindow(ts) ? '🔴 [LCP-WINDOW]' : '🟢 [POST-LCP]';
}

// ── Exported trace functions ─────────────────────────────────────────────────

export function traceMount(component: string): void {
  if (!ENABLED) return;
  const ts = t();
  console.log(`${tag(ts)} MOUNT   | T+${ts}ms | ${component}`);
}

export function traceEffect(component: string, effectName: string): void {
  if (!ENABLED) return;
  const ts = t();
  console.log(`${tag(ts)} EFFECT  | T+${ts}ms | ${component} → ${effectName}`);
}

export function traceStateSet(component: string, stateName: string, value?: unknown): void {
  if (!ENABLED) return;
  const ts = t();
  const preview =
    value === undefined
      ? ''
      : ` = ${typeof value === 'object' ? JSON.stringify(value).slice(0, 60) : String(value)}`;
  console.log(`${tag(ts)} SET_STATE| T+${ts}ms | ${component}.${stateName}${preview}`);
  if (lcpWindow(ts)) {
    console.trace(`  ↳ stack for ${component}.${stateName}`);
  }
}

export function traceQuery(component: string, queryKey: string, event: 'started' | 'resolved' | 'skipped'): void {
  if (!ENABLED) return;
  const ts = t();
  console.log(`${tag(ts)} QUERY   | T+${ts}ms | ${component} [${queryKey}] ${event}`);
}

export function traceAuthEvent(event: string): void {
  if (!ENABLED) return;
  const ts = t();
  console.log(`${tag(ts)} AUTH    | T+${ts}ms | ${event}`);
}

/** Call once from main.tsx to log the React mount moment */
export function traceReactMount(): void {
  if (!ENABLED) return;
  const ts = t();
  console.log(`${tag(ts)} REACT   | T+${ts}ms | createRoot().render() called`);
}

/** Mark when the hero image fires its load event */
export function traceHeroImageLoad(): void {
  if (!ENABLED) return;
  const ts = t();
  console.log(`${tag(ts)} HERO_IMG| T+${ts}ms | hero-dog.webp load event`);
}

/** Summarise the trace data at 3s */
export function scheduleTraceSummary(): void {
  if (!ENABLED) return;
  setTimeout(() => {
    const ts = t();
    console.groupCollapsed(
      `%c[LCP Trace] Summary at T+${ts}ms`,
      'background:#1e1b4b;color:#a5b4fc;padding:2px 6px;border-radius:3px;font-weight:bold',
    );
    console.log('Review 🔴 [LCP-WINDOW] lines above for render-blocking state mutations.');
    console.log('React.StrictMode double-render check: any MOUNT showing twice in <50ms gap = StrictMode double-invoke.');
    console.log('Use ?lcpTrace=1 in production URL to enable on live site.');
    console.groupEnd();
  }, 3000);
}
