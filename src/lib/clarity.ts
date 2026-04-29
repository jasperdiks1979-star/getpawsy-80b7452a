/**
 * Microsoft Clarity loader + thin event/tag wrapper.
 *
 * Design constraints:
 *  - Site-wide load, but ALWAYS gated by:
 *      1. Marketing consent (`isMarketingAllowed(getConsent())`)
 *      2. Founder Mode OFF (`getFounderModeStatus() === false`)
 *    These checks run at init AND on every event/tag call so we never leak
 *    internal sessions into heatmaps.
 *  - No-op if `VITE_CLARITY_PROJECT_ID` is not set (graceful fallback while
 *    we wait for the production ID).
 *  - Lazy script injection — only happens once, after both gates pass.
 *  - Custom events: `window.clarity('event', name)`
 *  - Custom tags:   `window.clarity('set', key, value)` (filterable in dashboard)
 *
 * See: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api
 */

import { getConsent, isMarketingAllowed } from './cookieConsent';
import { getFounderModeStatus } from './founder-mode';

const PROJECT_ID = (import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined)?.trim();

let injected = false;
let initFailed = false;

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

function gatesPass(): boolean {
  if (!PROJECT_ID) return false;
  if (initFailed) return false;
  if (typeof window === 'undefined') return false;
  if (getFounderModeStatus()) return false;
  if (!isMarketingAllowed(getConsent())) return false;
  return true;
}

/**
 * Inject the Clarity script tag (idempotent). Safe to call multiple times.
 * Returns true if Clarity is now (or was already) loaded, false otherwise.
 */
export function initClarity(): boolean {
  if (injected) return true;
  if (!gatesPass()) return false;

  try {
    // Standard Clarity bootstrap — sets up the queue so events fired before
    // the async script lands are replayed once it's loaded.
    (function (c: Window, l: Document, a: string, r: string, i: string) {
      (c as any)[a] =
        (c as any)[a] ||
        function (...args: unknown[]) {
          ((c as any)[a].q = (c as any)[a].q || []).push(args);
        };
      const t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = 'https://www.clarity.ms/tag/' + i;
      const y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
    })(window, document, 'clarity', 'script', PROJECT_ID!);

    injected = true;
    return true;
  } catch (err) {
    initFailed = true;
    console.warn('[clarity] init failed', err);
    return false;
  }
}

/**
 * Fire a Clarity custom event (shows up in the "Custom events" filter).
 * Use for funnel-step beacons: cta_visible, arrow_visible, proof_visible, etc.
 */
export function clarityEvent(name: string): void {
  if (!gatesPass()) return;
  if (!injected && !initClarity()) return;
  try {
    window.clarity?.('event', name);
  } catch (err) {
    // Swallow — analytics must never break the page.
    console.warn('[clarity] event failed', name, err);
  }
}

/**
 * Set a Clarity custom tag (filter dimension on the dashboard).
 * Values must be strings. Arrays are joined.
 */
export function clarityTag(key: string, value: string | number | boolean | string[]): void {
  if (!gatesPass()) return;
  if (!injected && !initClarity()) return;
  try {
    const v = Array.isArray(value) ? value.map(String) : String(value);
    window.clarity?.('set', key, v);
  } catch (err) {
    console.warn('[clarity] tag failed', key, err);
  }
}

/**
 * Convenience: fire an event AND set a matching tag in one call.
 * Used by /go to mark visibility milestones AND make them filterable.
 */
export function clarityMilestone(name: string, extra?: Record<string, string | number | boolean>): void {
  clarityEvent(name);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) clarityTag(k, v);
  }
}

export function isClarityConfigured(): boolean {
  return Boolean(PROJECT_ID);
}
