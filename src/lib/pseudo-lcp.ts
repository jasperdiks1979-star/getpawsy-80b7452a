/**
 * Pseudo-LCP fallback for iOS Safari SPA navigations.
 *
 * iOS Safari does not fire PerformanceObserver('largest-contentful-paint')
 * on soft (SPA) navigations. This module provides:
 * - iOS Safari detection
 * - SPA route-start tracking (routeStartTs)
 * - DOM probe for grid "first meaningful paint"
 * - Cookie banner visual-coverage heuristic
 * - Pseudo-LCP computation from DOM paint signals
 *
 * DIAGNOSTICS ONLY — no visible UI changes, no SEO/routing side-effects.
 */

// ─── iOS Safari detection ────────────────────────────────────────────────

let _isIOSSafari: boolean | null = null;

export function isIOSSafari(): boolean {
  if (_isIOSSafari !== null) return _isIOSSafari;
  if (typeof navigator === 'undefined') { _isIOSSafari = false; return false; }
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  // Exclude Chrome/Firefox/Edge on iOS (they use WebKit but report CriOS etc.)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  _isIOSSafari = isIOS && isSafari;
  return _isIOSSafari;
}

// ─── Route-start tracking ────────────────────────────────────────────────

let routeStartTs: number = performance.now();
let isSPANavigation = false;
const routeChangeCallbacks: Array<() => void> = [];

export function getRouteStartTs(): number { return routeStartTs; }
export function getIsSPANavigation(): boolean { return isSPANavigation; }

export function onRouteChange(cb: () => void) {
  routeChangeCallbacks.push(cb);
}

function handleRouteChange() {
  routeStartTs = performance.now();
  isSPANavigation = true;
  routeChangeCallbacks.forEach(cb => { try { cb(); } catch {} });
}

export function initRouteTracking() {
  if (typeof window === 'undefined') return;

  // Patch pushState / replaceState
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof origPush>) {
    origPush(...args);
    handleRouteChange();
  };
  history.replaceState = function (...args: Parameters<typeof origReplace>) {
    origReplace(...args);
    handleRouteChange();
  };

  window.addEventListener('popstate', handleRouteChange);
}

// ─── Grid "first meaningful paint" DOM probe ─────────────────────────────

export interface GridProbeResult {
  gridFirstMeaningfulPaintAt: number | null;   // ms since routeStartTs
  gridRenderTime: number | null;               // same, authoritative
}

/**
 * Starts a rAF loop that checks for product-card presence.
 * Resolves when >= 1 card with an image src, or >= 6 cards total, or 6s timeout.
 */
export function probeGridPaint(): Promise<GridProbeResult> {
  return new Promise((resolve) => {
    const start = routeStartTs;
    const deadline = start + 6000;
    let resolved = false;

    function check() {
      if (resolved) return;
      const now = performance.now();
      if (now > deadline) {
        resolved = true;
        resolve({ gridFirstMeaningfulPaintAt: null, gridRenderTime: null });
        return;
      }

      const cards = document.querySelectorAll('[data-testid="product-card"]');
      if (cards.length >= 6) {
        resolved = true;
        const t = now - start;
        resolve({ gridFirstMeaningfulPaintAt: t, gridRenderTime: t });
        return;
      }
      if (cards.length >= 1) {
        // Check if at least one card has an image with src
        for (const card of cards) {
          const img = card.querySelector('img');
          if (img && (img.currentSrc || img.src)) {
            resolved = true;
            const t = now - start;
            resolve({ gridFirstMeaningfulPaintAt: t, gridRenderTime: t });
            return;
          }
        }
      }
      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  });
}

// ─── Cookie banner coverage heuristic ────────────────────────────────────

export interface CookieBannerMetrics {
  coversContent: boolean;
  bannerVhPercent: number;
  heightPx: number;
}

export function cookieBannerCoversContent(): boolean {
  return getCookieBannerMetrics().coversContent;
}

export function getCookieBannerMetrics(): CookieBannerMetrics {
  try {
    const banner = document.querySelector('[data-testid="cookie-banner"]');
    if (!banner) return { coversContent: false, bannerVhPercent: 0, heightPx: 0 };
    
    // Elements marked data-cwvnolcp are explicitly excluded from LCP candidacy
    if ((banner as HTMLElement).dataset.cwvnolcp === 'true') {
      const rect = (banner as HTMLElement).getBoundingClientRect();
      const vh = window.innerHeight;
      return {
        coversContent: false, // Forced: not eligible
        bannerVhPercent: Math.round((rect.height / vh) * 100),
        heightPx: Math.round(rect.height),
      };
    }
    
    const rect = (banner as HTMLElement).getBoundingClientRect();
    const vh = window.innerHeight;
    const vhPercent = Math.round((rect.height / vh) * 100);
    const covers = rect.height >= 0.25 * vh || rect.top < vh * 0.5;
    return { coversContent: covers, bannerVhPercent: vhPercent, heightPx: Math.round(rect.height) };
  } catch {
    return { coversContent: false, bannerVhPercent: 0, heightPx: 0 };
  }
}

// ─── Pseudo-LCP computation ──────────────────────────────────────────────

export type PseudoLcpCandidate = 'hero' | 'grid' | 'grid-first-item' | 'cookieBanner' | 'unknown';

export interface PseudoLcpResult {
  pseudoLcpMs: number | null;
  pseudoLcpCandidate: PseudoLcpCandidate;
  pseudoLcpReason: string | null;
  cookieBannerCoversContent: boolean;
  bannerVhPercent: number;
  gridFirstMeaningfulPaintAt: number | null;
  gridRenderTime: number | null;
}

/**
 * Compute pseudo-LCP from DOM paint signals.
 * Only called on iOS Safari when real LCP is not observed.
 */
export function computePseudoLcp(
  heroPaintedAt: number | null,
  cookieBannerMountedAt: number | null,
  gridProbe: GridProbeResult,
  gridFirstItemRenderedAt?: number | null,
): PseudoLcpResult {
  const bannerMetrics = getCookieBannerMetrics();
  const candidates: Array<{ time: number; label: PseudoLcpCandidate }> = [];

  if (heroPaintedAt !== null) {
    candidates.push({ time: heroPaintedAt, label: 'hero' });
  }
  // Prefer gridFirstItemRenderedAt (from React commit) over probe-based gridRenderTime
  if (gridFirstItemRenderedAt != null && gridFirstItemRenderedAt > 0) {
    candidates.push({ time: gridFirstItemRenderedAt, label: 'grid-first-item' });
  } else if (gridProbe.gridFirstMeaningfulPaintAt !== null) {
    candidates.push({ time: gridProbe.gridFirstMeaningfulPaintAt, label: 'grid' });
  }
  // Only consider cookie banner if it visually covers content AND is not excluded via data-cwvnolcp
  if (cookieBannerMountedAt !== null && bannerMetrics.coversContent) {
    const bannerRelative = cookieBannerMountedAt - getRouteStartTs();
    if (bannerRelative > 0) {
      candidates.push({ time: bannerRelative, label: 'cookieBanner' });
    }
  }

  if (candidates.length === 0) {
    return {
      pseudoLcpMs: null,
      pseudoLcpCandidate: 'unknown',
      pseudoLcpReason: 'IOS_SAFARI_SPA_LCP_NOT_OBSERVED',
      cookieBannerCoversContent: bannerMetrics.coversContent,
      bannerVhPercent: bannerMetrics.bannerVhPercent,
      gridFirstMeaningfulPaintAt: gridProbe.gridFirstMeaningfulPaintAt,
      gridRenderTime: gridProbe.gridRenderTime,
    };
  }

  // Pseudo-LCP = the latest (largest-time) candidate
  candidates.sort((a, b) => b.time - a.time);
  const winner = candidates[0];

  return {
    pseudoLcpMs: Math.round(winner.time),
    pseudoLcpCandidate: winner.label,
    pseudoLcpReason: 'IOS_SAFARI_SPA_LCP_NOT_OBSERVED',
    cookieBannerCoversContent: bannerMetrics.coversContent,
    bannerVhPercent: bannerMetrics.bannerVhPercent,
    gridFirstMeaningfulPaintAt: gridProbe.gridFirstMeaningfulPaintAt,
    gridRenderTime: gridProbe.gridRenderTime,
  };
}
