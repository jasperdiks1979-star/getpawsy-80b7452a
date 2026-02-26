/**
 * Web Vitals Guard bootstrap — called once from main.tsx.
 *
 * Initializes all performance monitors before React mount:
 * - CLS monitor (PerformanceObserver layout-shift)
 * - LCP monitor (PerformanceObserver largest-contentful-paint)
 * - First-paint geometry capture
 *
 * Post-mount checks run after React renders:
 * - Hydration geometry verification
 * - Hero preload validation
 * - Hero image rules validation
 * - Image policy scan
 * - Performance budget enforcement
 *
 * Exposes window.__CLS_GUARD__ and window.__LCP_GUARD__ in dev/preview.
 * Zero production impact — all guards are tree-shaken in prod.
 */
import { startCLSMonitor, getCLSSnapshot, getCLS } from './cls-monitor';
import { startLCPMonitor, getLCPSnapshot, getLCP, getLCPEntry, validateHeroImageRules } from './lcp-monitor';
import { captureFirstPaintGeometry, verifyHydrationGeometry } from './first-render-geometry';
import { validateHeroPreload } from './preload-validator';
import { scanImagePolicy } from './image-policy-scanner';
import { runBudgetCheck } from './budget-enforcer';

export function initCLSGuard(): void {
  if (typeof window === 'undefined') return;

  const isProd = import.meta.env.PROD;
  const guardEnabled =
    import.meta.env.VITE_CLS_GUARD_ENABLED !== undefined
      ? import.meta.env.VITE_CLS_GUARD_ENABLED === 'true'
      : !isProd;

  if (!guardEnabled) return;

  // Capture first-paint geometry BEFORE React mount
  captureFirstPaintGeometry();

  const hardFail = import.meta.env.VITE_CLS_HARD_FAIL === 'true' && !isProd;

  // Start CLS monitor
  startCLSMonitor({
    logWarnings: true,
    hardFail,
  });

  // Start LCP monitor
  startLCPMonitor({
    logWarnings: true,
  });

  // Expose on window for dev/preview debugging + CI assertions
  if (!isProd) {
    (window as any).__CLS_GUARD__ = {
      getSnapshot: getCLSSnapshot,
      get cls() { return getCLS(); },
      hardFail: false,
      geometryMismatch: false,
      geometryDeltas: [] as string[],
      budgetResults: [] as any[],
    };

    Object.defineProperty(window, '__CLS__', {
      get: () => getCLS(),
      configurable: true,
    });

    (window as any).__LCP_GUARD__ = {
      getSnapshot: getLCPSnapshot,
      get lcp() { return getLCP(); },
      get entry() { return getLCPEntry(); },
      hardFail: false,
    };
  }
}

/**
 * Post-mount verification — call after React has rendered.
 */
export function postMountVitalsChecks(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;

  verifyHydrationGeometry();
  validateHeroPreload();
  validateHeroImageRules();
  scanImagePolicy();
  runBudgetCheck();
}

// Keep backward-compat alias
export const postMountCLSChecks = postMountVitalsChecks;
