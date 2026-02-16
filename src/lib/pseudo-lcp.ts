/**
 * Pseudo-LCP fallback for iOS Safari SPA navigations.
 *
 * iOS Safari does not fire PerformanceObserver('largest-contentful-paint')
 * on soft (SPA) navigations. This module provides:
 * - iOS Safari detection
 * - SPA route-start tracking (routeStartTs)
 * - Proxy LCP computation from grid-timing paint signals
 * - Cookie banner visual-coverage heuristic
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

// ─── Proxy LCP computation ───────────────────────────────────────────────

export type ProxyLcpCandidate = 'hero' | 'grid-first-item' | 'grid-text-paint' | 'grid-image-decoded' | 'cookieBanner' | 'unknown';

export interface ProxyLcpResult {
  proxyLcpMs: number | null;
  proxyLcpCandidate: ProxyLcpCandidate;
  proxyLcpReason: string;
  cookieBannerCoversContent: boolean;
  bannerVhPercent: number;
}

/**
 * Compute proxy LCP from grid-timing paint signals.
 * 
 * proxyLCP = earliest of:
 *   a) firstCardTextPaintAt (text painted after React commit — most meaningful)
 *   b) firstGridImageDecodedAt (image fully decoded for first visible card)
 *   c) heroPaintedAt (H1 heading)
 * 
 * We pick the EARLIEST usable signal as proxy LCP, since that represents
 * when the user first sees meaningful above-the-fold content.
 * 
 * Cookie banner is excluded (data-cwvnolcp).
 */
export function computeProxyLcp(
  heroPaintedAt: number | null,
  firstCardTextPaintAt: number | null,
  gridFirstItemRenderedAt: number | null,
  firstGridImageDecodedAt: number | null,
  firstGridImageLoadAt: number | null,
  cookieBannerMountedAt: number | null,
): ProxyLcpResult {
  const bannerMetrics = getCookieBannerMetrics();
  const candidates: Array<{ time: number; label: ProxyLcpCandidate }> = [];

  // Prefer text paint (most meaningful — title/price visible)
  if (firstCardTextPaintAt != null && firstCardTextPaintAt > 0) {
    candidates.push({ time: firstCardTextPaintAt, label: 'grid-text-paint' });
  } else if (gridFirstItemRenderedAt != null && gridFirstItemRenderedAt > 0) {
    // Fallback: React commit time (DOM updated but not necessarily painted)
    candidates.push({ time: gridFirstItemRenderedAt, label: 'grid-first-item' });
  }

  if (firstGridImageDecodedAt != null && firstGridImageDecodedAt > 0) {
    candidates.push({ time: firstGridImageDecodedAt, label: 'grid-image-decoded' });
  } else if (firstGridImageLoadAt != null && firstGridImageLoadAt > 0) {
    candidates.push({ time: firstGridImageLoadAt, label: 'grid-image-decoded' }); // Use load as fallback label
  }

  if (heroPaintedAt !== null && heroPaintedAt > 0) {
    candidates.push({ time: heroPaintedAt, label: 'hero' });
  }

  // Cookie banner excluded via data-cwvnolcp — only include if it covers content AND is not excluded
  if (cookieBannerMountedAt !== null && bannerMetrics.coversContent) {
    const bannerRelative = cookieBannerMountedAt - getRouteStartTs();
    if (bannerRelative > 0) {
      candidates.push({ time: bannerRelative, label: 'cookieBanner' });
    }
  }

  if (candidates.length === 0) {
    return {
      proxyLcpMs: null,
      proxyLcpCandidate: 'unknown',
      proxyLcpReason: 'IOS_SAFARI_SPA_LCP_NOT_OBSERVED',
      cookieBannerCoversContent: bannerMetrics.coversContent,
      bannerVhPercent: bannerMetrics.bannerVhPercent,
    };
  }

  // Proxy LCP = earliest meaningful paint (not latest!)
  candidates.sort((a, b) => a.time - b.time);
  const winner = candidates[0];

  return {
    proxyLcpMs: Math.round(winner.time),
    proxyLcpCandidate: winner.label,
    proxyLcpReason: 'IOS_SAFARI_SPA_LCP_NOT_OBSERVED',
    cookieBannerCoversContent: bannerMetrics.coversContent,
    bannerVhPercent: bannerMetrics.bannerVhPercent,
  };
}
