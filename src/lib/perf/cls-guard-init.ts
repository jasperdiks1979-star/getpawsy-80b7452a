/**
 * CLS Guard bootstrap — called once from main.tsx.
 *
 * Reads env flags and starts the monitor accordingly.
 * Wires up geometry freeze, preload validator, and image policy scanner.
 * Exposes window.__CLS_GUARD__ in dev/preview only.
 */
import { startCLSMonitor, getCLSSnapshot, getCLS } from './cls-monitor';
import { captureFirstPaintGeometry, verifyHydrationGeometry } from './first-render-geometry';
import { validateHeroPreload } from './preload-validator';
import { scanImagePolicy } from './image-policy-scanner';

export function initCLSGuard(): void {
  if (typeof window === 'undefined') return;

  const isProd = import.meta.env.PROD;
  const guardEnabled =
    import.meta.env.VITE_CLS_GUARD_ENABLED !== undefined
      ? import.meta.env.VITE_CLS_GUARD_ENABLED === 'true'
      : !isProd; // default: enabled in dev/preview, disabled in prod

  if (!guardEnabled) return;

  // Capture first-paint geometry BEFORE React mount
  captureFirstPaintGeometry();

  const hardFail = import.meta.env.VITE_CLS_HARD_FAIL === 'true' && !isProd;

  startCLSMonitor({
    logWarnings: true,
    hardFail,
  });

  // Expose on window for dev/preview debugging + CI assertions
  if (!isProd) {
    (window as any).__CLS_GUARD__ = {
      getSnapshot: getCLSSnapshot,
      get cls() { return getCLS(); },
      hardFail: false,
      geometryMismatch: false,
      geometryDeltas: [] as string[],
    };
    // Also expose __CLS__ shorthand for Playwright assertions
    Object.defineProperty(window, '__CLS__', {
      get: () => getCLS(),
      configurable: true,
    });
  }
}

/**
 * Post-mount verification — call after React has rendered.
 * Runs geometry check, preload validation, and image policy scan.
 */
export function postMountCLSChecks(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;

  verifyHydrationGeometry();
  validateHeroPreload();
  scanImagePolicy();
}
