/**
 * CLS Guard bootstrap — called once from main.tsx.
 *
 * Reads env flags and starts the monitor accordingly.
 * Exposes window.__CLS_GUARD__ in dev/preview only.
 */
import { startCLSMonitor, getCLSSnapshot, getCLS } from './cls-monitor';

export function initCLSGuard(): void {
  if (typeof window === 'undefined') return;

  const isProd = import.meta.env.PROD;
  const guardEnabled =
    import.meta.env.VITE_CLS_GUARD_ENABLED !== undefined
      ? import.meta.env.VITE_CLS_GUARD_ENABLED === 'true'
      : !isProd; // default: enabled in dev/preview, disabled in prod

  if (!guardEnabled) return;

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
    };
    // Also expose __CLS__ shorthand for Playwright assertions
    Object.defineProperty(window, '__CLS__', {
      get: () => getCLS(),
      configurable: true,
    });
  }
}
