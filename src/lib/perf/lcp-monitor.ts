/**
 * LCP Monitor — tracks Largest Contentful Paint and validates hero image rules.
 *
 * Uses PerformanceObserver for "largest-contentful-paint".
 * Enforces hero image best practices in dev/preview.
 * Zero production impact — gated by env flags.
 */

// ── Thresholds ──────────────────────────────────────────────────────────────
const LCP_SOFT = parseFloat(import.meta.env.VITE_LCP_SOFT_THRESHOLD || '2500');
const LCP_HARD = parseFloat(import.meta.env.VITE_LCP_HARD_THRESHOLD || '4000');

// ── State ───────────────────────────────────────────────────────────────────
export interface LCPEntry {
  element: string;
  size: number;
  renderTime: number;
  loadTime: number;
  url: string;
}

let lcpValue = 0;
let lcpEntry: LCPEntry | null = null;
let observer: PerformanceObserver | null = null;
let started = false;

// ── Helpers ─────────────────────────────────────────────────────────────────

function elementSelector(el: Element | null): string {
  if (!el) return '(unknown)';
  let sel = el.tagName.toLowerCase();
  if (el.id) sel += `#${el.id}`;
  if (el.classList.length) {
    sel += '.' + Array.from(el.classList).slice(0, 3).join('.');
  }
  return sel.slice(0, 120);
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface LCPSnapshot {
  lcp: number;
  entry: LCPEntry | null;
  url: string;
  ts: number;
  softThreshold: number;
  hardThreshold: number;
}

export function getLCPSnapshot(): LCPSnapshot {
  return {
    lcp: lcpValue,
    entry: lcpEntry,
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    ts: Date.now(),
    softThreshold: LCP_SOFT,
    hardThreshold: LCP_HARD,
  };
}

export function getLCP(): number {
  return lcpValue;
}

export function getLCPEntry(): LCPEntry | null {
  return lcpEntry;
}

export interface LCPMonitorOptions {
  logWarnings?: boolean;
  onChange?: (lcp: number) => void;
}

export function startLCPMonitor(options: LCPMonitorOptions = {}): void {
  if (started) return;
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;
  started = true;

  const { logWarnings = false, onChange } = options;

  try {
    observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      // LCP is the LAST entry reported before user interaction
      const last = entries[entries.length - 1];
      if (!last) return;

      const renderTime = (last as any).renderTime || 0;
      const loadTime = (last as any).loadTime || 0;
      lcpValue = renderTime || loadTime;

      const el = (last as any).element as Element | null;
      lcpEntry = {
        element: elementSelector(el),
        size: (last as any).size || 0,
        renderTime,
        loadTime,
        url: (last as any).url || '',
      };

      onChange?.(lcpValue);

      if (logWarnings && lcpValue >= LCP_HARD) {
        console.error(
          `🔴 [LCP-GUARD] HARD THRESHOLD EXCEEDED: ${Math.round(lcpValue)}ms ≥ ${LCP_HARD}ms\n` +
          `Element: ${lcpEntry.element}\n` +
          `Size: ${lcpEntry.size}px²\n` +
          `Render: ${Math.round(renderTime)}ms | Load: ${Math.round(loadTime)}ms\n` +
          `URL: ${lcpEntry.url || 'n/a'}`
        );

        if ((window as any).__LCP_GUARD__) {
          (window as any).__LCP_GUARD__.hardFail = true;
        }
      } else if (logWarnings && lcpValue >= LCP_SOFT) {
        console.warn(
          `🟡 [LCP-GUARD] Soft threshold: ${Math.round(lcpValue)}ms ≥ ${LCP_SOFT}ms`
        );
      }
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {
    console.debug('[LCP-GUARD] PerformanceObserver not supported:', e);
  }
}

export function stopLCPMonitor(): void {
  observer?.disconnect();
  observer = null;
  started = false;
}

/**
 * Validate hero image best practices (dev/preview only).
 * Call after mount.
 */
export function validateHeroImageRules(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Find the LCP candidate hero image
      const heroImg = document.querySelector<HTMLImageElement>(
        '#static-hero-shell img, [data-hero-image] img, .hero-image, img[fetchpriority="high"]'
      );

      if (!heroImg) {
        console.warn('[LCP-GUARD] No hero image found for validation');
        return;
      }

      const violations: string[] = [];

      // Must be <img>, not CSS background
      if (heroImg.tagName !== 'IMG') {
        violations.push('Hero LCP element is not <img> — use <img> instead of CSS background');
      }

      // Must have fetchpriority="high"
      if (heroImg.getAttribute('fetchpriority') !== 'high') {
        violations.push('Hero img missing fetchpriority="high"');
      }

      // Must NOT use content-visibility
      const cv = getComputedStyle(heroImg).getPropertyValue('content-visibility');
      if (cv === 'auto') {
        violations.push('Hero img has content-visibility:auto — this defers LCP rendering');
      }

      // Must have intrinsic width/height
      if (!heroImg.hasAttribute('width') && !heroImg.style.width) {
        violations.push('Hero img missing width attribute');
      }
      if (!heroImg.hasAttribute('height') && !heroImg.style.height) {
        violations.push('Hero img missing height attribute');
      }

      if (violations.length) {
        console.error(
          `🔴 [LCP-GUARD] Hero image violations:\n` +
          violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n'),
          { el: heroImg, src: heroImg.src?.slice(0, 150) }
        );
      }
    });
  });
}
