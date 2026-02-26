/**
 * CLS Monitor — "Never Regress CLS Again" guardrail.
 *
 * Captures cumulative layout shift via PerformanceObserver,
 * records top shift entries with source selectors, and exposes
 * a snapshot for dev badge / CI assertions.
 *
 * Zero production impact when guard is disabled (default in prod).
 */

// ── Thresholds (overridable via env) ────────────────────────────────────────
const SOFT_THRESHOLD = parseFloat(import.meta.env.VITE_CLS_SOFT_THRESHOLD || '0.08');
const HARD_THRESHOLD = parseFloat(import.meta.env.VITE_CLS_HARD_THRESHOLD || '0.12');

// ── State ────────────────────────────────────────────────────────────────────
let cls = 0;
let entries: Array<{ value: number; time: number; sources?: ShiftSource[] }> = [];
let observer: PerformanceObserver | null = null;
let started = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Best-effort CSS-like selector from a DOM node */
function nodeSelector(node: Node | null): string {
  if (!node || !(node instanceof Element)) return '(unknown)';
  let sel = node.tagName.toLowerCase();
  if (node.id) sel += `#${node.id}`;
  if (node.classList.length) {
    sel += '.' + Array.from(node.classList).slice(0, 3).join('.');
  }
  return sel.slice(0, 120); // truncate
}

/** Source info with rect data for forensic debugging */
export interface ShiftSource {
  selector: string;
  previousRect?: { x: number; y: number; width: number; height: number };
  currentRect?: { x: number; y: number; width: number; height: number };
}

/** Derive source selectors + rects from a LayoutShift entry */
function extractSources(entry: PerformanceEntry): ShiftSource[] {
  try {
    const sources = (entry as any).sources as Array<{
      node?: Node;
      previousRect?: DOMRectReadOnly;
      currentRect?: DOMRectReadOnly;
    }> | undefined;
    if (!sources?.length) return [];
    return sources.map(s => {
      const sel = nodeSelector(s.node ?? null);
      const toRect = (r?: DOMRectReadOnly) =>
        r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : undefined;
      return { selector: sel, previousRect: toRect(s.previousRect), currentRect: toRect(s.currentRect) };
    });
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface CLSSnapshot {
  cls: number;
  entries: typeof entries;
  url: string;
  ts: number;
  softThreshold: number;
  hardThreshold: number;
}

export function getCLSSnapshot(): CLSSnapshot {
  return {
    cls,
    entries: entries.slice(-10), // top 10 most recent
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    ts: Date.now(),
    softThreshold: SOFT_THRESHOLD,
    hardThreshold: HARD_THRESHOLD,
  };
}

export function getCLS(): number {
  return cls;
}

export interface CLSMonitorOptions {
  /** Show console warnings/errors when thresholds are exceeded */
  logWarnings?: boolean;
  /** Throw an error when hard threshold is exceeded (CI/preview only) */
  hardFail?: boolean;
  /** Callback fired on every shift */
  onChange?: (cls: number) => void;
}

export function startCLSMonitor(options: CLSMonitorOptions = {}): void {
  if (started) return;
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;
  started = true;

  const { logWarnings = false, hardFail = false, onChange } = options;

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Ignore shifts caused by user input (scroll, tap, etc.)
        if ((entry as any).hadRecentInput) continue;

        const value = (entry as any).value as number;
        cls += value;

        entries.push({
          value,
          time: entry.startTime,
          sources: extractSources(entry),
        });

        // Keep only last 50 entries in memory
        if (entries.length > 50) entries = entries.slice(-50);

        onChange?.(cls);

        // ── Threshold checks ───────────────────────────────────────────
        if (logWarnings && cls >= HARD_THRESHOLD) {
          const snap = getCLSSnapshot();
          console.error(
            `🔴 [CLS-GUARD] HARD THRESHOLD EXCEEDED: ${cls.toFixed(4)} ≥ ${HARD_THRESHOLD}\n` +
            `Route: ${snap.url}\n` +
            `Top offenders:\n` +
            snap.entries
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((e, i) => {
                const srcs = e.sources?.map(s => {
                  let info = s.selector;
                  if (s.previousRect && s.currentRect) {
                    info += ` [y:${s.previousRect.y}→${s.currentRect.y}]`;
                  }
                  return info;
                }).join(', ') || 'n/a';
                return `  ${i + 1}. shift=${e.value.toFixed(4)} sources=[${srcs}]`;
              })
              .join('\n')
          );

          // Expose hard fail flag for CI
          if ((window as any).__CLS_GUARD__) {
            (window as any).__CLS_GUARD__.hardFail = true;
          }

          if (hardFail) {
            throw new Error(`[CLS-GUARD] CLS regression detected: ${cls.toFixed(4)} ≥ ${HARD_THRESHOLD}`);
          }
        } else if (logWarnings && cls >= SOFT_THRESHOLD) {
          console.warn(
            `🟡 [CLS-GUARD] Soft threshold warning: CLS ${cls.toFixed(4)} ≥ ${SOFT_THRESHOLD}`
          );
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    console.debug('[CLS-GUARD] PerformanceObserver not supported:', e);
  }
}

export function stopCLSMonitor(): void {
  observer?.disconnect();
  observer = null;
  started = false;
}
