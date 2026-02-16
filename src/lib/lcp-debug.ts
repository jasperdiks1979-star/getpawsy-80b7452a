/**
 * LCP Debug Overlay & Enhanced Web Vitals Instrumentation
 * 
 * Activate with ?debugVitals=1 in the URL.
 * 
 * ROOT-CAUSE ANALYSIS for /products (mobile):
 * - LCP element: The H1 heading (#plp-hero-heading) should be LCP on mobile.
 * - Cookie banner is deferred and excluded via data-cwvnolcp.
 * - First 2 product card images use priority={true} (eager + fetchpriority=high)
 * - Products query uses cache for instant first paint
 * - Category routes use fast category-specific query as placeholderData
 * 
 * iOS Safari SPA navigations:
 * - PerformanceObserver('largest-contentful-paint') does NOT fire on soft navigations.
 * - We compute a "proxy LCP" from grid-timing paint signals (firstCardTextPaintAt).
 * - The overlay shows proxyLCP when real LCP is not observed.
 * 
 * WWW → APEX REDIRECT (302):
 * - The 302 status from www.getpawsy.pet → getpawsy.pet is a PLATFORM-LEVEL behavior
 *   from the Lovable hosting edge. It cannot be changed per-project.
 * - Mitigation: canonical tags always point to apex, sitemaps use apex URLs only,
 *   internal links always use apex. Google treats 302→301 equivalently for consolidation
 *   when canonical signals are consistent.
 */

import type { LCPMetricWithAttribution, CLSMetricWithAttribution, INPMetricWithAttribution } from 'web-vitals/attribution';
import {
  isIOSSafari,
  getRouteStartTs,
  getIsSPANavigation,
  initRouteTracking,
  onRouteChange,
  computeProxyLcp,
  getCookieBannerMetrics,
  type ProxyLcpResult,
} from './pseudo-lcp';
import { getGridTiming, resetGridTiming, type GridTimingData } from './grid-timing';

interface LCPDebugData {
  route: string;
  lcpMs: number | null;
  lcpElement: string | null;
  lcpElementId: string | null;
  lcpElementClass: string | null;
  lcpElementText: string | null;
  lcpUrl: string | null;
  lcpRenderTime: number | null;
  lcpLoadTime: number | null;
  lcpStatus: 'observed' | 'not_observed' | 'pending';
  clsValue: number | null;
  inpMs: number | null;
  gridRenderedBeforeLCP: boolean | null;
  gridFirstMeaningfulPaintAt: number | null;
  gridRenderTime: number | null;
  cookieBannerMountedAt: number | null;
  cookieBannerCoversContent: boolean | null;
  cookiePlaceholderMountedAt: number | null;
  cookieBannerInteractiveAt: number | null;
  heroPaintedAt: number | null;
  // Proxy LCP fields
  realLcpObserved: boolean;
  proxyLcpMs: number | null;
  proxyLcpCandidate: string | null;
  proxyLcpReason: string | null;
  bannerVhPercent: number | null;
  timeBetweenHeroAndBannerMount: number | null;
  candidateElementSelector: string | null;
  // Visibility & environment
  visibilityTimeline: Array<{ state: string; at: number }>;
  wasPrerendered: boolean;
  wasBFCacheRestored: boolean;
  manualLcpEntries: number;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  timestamp: number;
  connectionType: string | null;
  // WWW redirect documentation
  wwwRedirectNote: string;
}

function getConnectionType(): string | null {
  try {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    return conn?.effectiveType ?? null;
  } catch { return null; }
}

function freshDebugData(): LCPDebugData {
  return {
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
    lcpMs: null,
    lcpElement: null,
    lcpElementId: null,
    lcpElementClass: null,
    lcpElementText: null,
    lcpUrl: null,
    lcpRenderTime: null,
    lcpLoadTime: null,
    lcpStatus: 'pending',
    clsValue: null,
    inpMs: null,
    gridRenderedBeforeLCP: null,
    gridFirstMeaningfulPaintAt: null,
    gridRenderTime: null,
    cookieBannerMountedAt: null,
    cookieBannerCoversContent: null,
    cookiePlaceholderMountedAt: null,
    cookieBannerInteractiveAt: null,
    heroPaintedAt: null,
    realLcpObserved: false,
    proxyLcpMs: null,
    proxyLcpCandidate: null,
    proxyLcpReason: null,
    bannerVhPercent: null,
    timeBetweenHeroAndBannerMount: null,
    candidateElementSelector: null,
    visibilityTimeline: [],
    wasPrerendered: false,
    wasBFCacheRestored: false,
    manualLcpEntries: 0,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    timestamp: Date.now(),
    connectionType: typeof navigator !== 'undefined' ? getConnectionType() : null,
    wwwRedirectNote: 'www→apex 302 is platform-level (Lovable edge). Cannot change to 301. Mitigated via consistent canonical/sitemap/internal-links pointing to apex.',
  };
}

let debugData: LCPDebugData = freshDebugData();
let overlayEl: HTMLDivElement | null = null;
let lcpSettled = false;
let isDebug = false;
let manualLcpObserver: PerformanceObserver | null = null;

/** Call this from the product grid when it first renders real items (not skeletons) */
export function markGridRendered() {
  const t = performance.now();
  const relative = t - getRouteStartTs();
  debugData.gridRenderTime = relative;
}

/** Call from cookie banner when it mounts */
export function markCookieBannerMounted() {
  debugData.cookieBannerMountedAt = performance.now();
}

/** Call from cookie banner when buttons become interactive */
export function markCookieBannerInteractive() {
  debugData.cookieBannerInteractiveAt = performance.now();
}

/** Mark when the hero H1 first paints */
function detectHeroPaint() {
  requestAnimationFrame(() => {
    const h1 = document.getElementById('plp-hero-heading');
    if (h1) {
      debugData.heroPaintedAt = performance.now() - getRouteStartTs();
    }
  });
}

function formatMs(v: number | null): string {
  if (v === null) return 'n/a';
  return `${Math.round(v)}ms`;
}

// ─── Visibility state tracking ───────────────────────────────────────────

function trackVisibilityState() {
  if (typeof document === 'undefined') return;
  // Record initial state
  debugData.visibilityTimeline.push({
    state: document.visibilityState,
    at: Math.round(performance.now()),
  });
  document.addEventListener('visibilitychange', () => {
    debugData.visibilityTimeline.push({
      state: document.visibilityState,
      at: Math.round(performance.now()),
    });
  });
  // Detect prerendering
  if ((document as any).prerendering) {
    debugData.wasPrerendered = true;
  }
  // Detect BFCache restore
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      debugData.wasBFCacheRestored = true;
    }
  });
}

// ─── Manual PerformanceObserver for LCP (backup for web-vitals) ──────────

function startManualLcpObserver() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    manualLcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      debugData.manualLcpEntries += entries.length;
      if (isDebug && entries.length > 0) {
        console.log('[Manual LCP Observer]', entries.length, 'entries:', entries.map(e => ({
          startTime: Math.round(e.startTime),
          size: (e as any).size,
          element: (e as any).element?.tagName,
          id: (e as any).element?.id,
          url: (e as any).url,
        })));
      }
    });
    manualLcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // LCP observer not supported
  }
}

function stopManualLcpObserver() {
  if (manualLcpObserver) {
    manualLcpObserver.disconnect();
    manualLcpObserver = null;
  }
}

// ─── Best-effort candidate selector ─────────────────────────────────────

function findBestCandidateSelector(): string | null {
  try {
    // Find largest visible element above the fold
    const candidates = document.querySelectorAll('img, h1, h2, video, [data-testid="product-card"]');
    let best: { el: Element; area: number } | null = null;
    const vh = window.innerHeight;
    
    candidates.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top >= vh || rect.bottom <= 0) return; // Not in viewport
      const visibleH = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
      const visibleW = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      const area = visibleH * visibleW;
      if (!best || area > best.area) {
        best = { el, area };
      }
    });
    
    if (!best) return null;
    const el = best.el;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className?.toString().split(' ').filter(Boolean).slice(0, 2).map(c => `.${c}`).join('') || '';
    return `${tag}${id}${cls}`;
  } catch {
    return null;
  }
}

// ─── Proxy LCP fallback orchestration ────────────────────────────────────

let proxyLcpPollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Poll grid-timing data every 200ms until we have firstCardTextPaintAt
 * or 6s deadline. This replaces the old approach of waiting 3-4s then
 * running a rAF probe (which reported "when the probe ran" not "when
 * content appeared").
 */
function startProxyLcpPolling() {
  if (proxyLcpPollTimer) clearInterval(proxyLcpPollTimer);
  
  const startedAt = performance.now();
  const deadline = 6000; // 6s max wait

  proxyLcpPollTimer = setInterval(() => {
    // If real LCP arrived, stop polling
    if (debugData.lcpMs !== null) {
      if (proxyLcpPollTimer) clearInterval(proxyLcpPollTimer);
      proxyLcpPollTimer = null;
      return;
    }

    const gt = getGridTiming();
    const elapsed = performance.now() - startedAt;
    
    // Wait until we have meaningful data OR deadline
    const hasTextPaint = gt.firstCardTextPaintAt !== null;
    const hasItemRendered = gt.gridFirstItemRenderedAt !== null;
    const pastDeadline = elapsed > deadline;

    if (!hasTextPaint && !hasItemRendered && !pastDeadline) return;

    // Compute proxy LCP from paint signals
    const result = computeProxyLcp(
      debugData.heroPaintedAt,
      gt.firstCardTextPaintAt,
      gt.gridFirstItemRenderedAt,
      gt.firstGridImageDecodedAt,
      debugData.cookieBannerMountedAt,
    );

    debugData.proxyLcpMs = result.proxyLcpMs;
    debugData.proxyLcpCandidate = result.proxyLcpCandidate;
    debugData.proxyLcpReason = result.proxyLcpReason;
    debugData.cookieBannerCoversContent = result.cookieBannerCoversContent;
    debugData.bannerVhPercent = result.bannerVhPercent;
    // Set gridFirstMeaningfulPaintAt from firstCardTextPaintAt (text = meaningful)
    debugData.gridFirstMeaningfulPaintAt = gt.firstCardTextPaintAt ?? gt.gridFirstItemRenderedAt;
    debugData.lcpStatus = 'not_observed';
    debugData.timeBetweenHeroAndBannerMount = (debugData.heroPaintedAt !== null && debugData.cookieBannerMountedAt !== null)
      ? Math.round(debugData.cookieBannerMountedAt - debugData.heroPaintedAt) : null;
    debugData.candidateElementSelector = findBestCandidateSelector();
    lcpSettled = true;

    if (proxyLcpPollTimer) clearInterval(proxyLcpPollTimer);
    proxyLcpPollTimer = null;

    if (isDebug) {
      console.log('[Proxy-LCP]', result, 'gridTiming:', gt);
      updateOverlay();
    }
  }, 200);
}

// ─── Overlay rendering ───────────────────────────────────────────────────

function updateOverlay() {
  if (!overlayEl) return;

  let lcpDisplay: string;
  let lcpColor: string;

  if (debugData.lcpMs !== null) {
    lcpDisplay = `${Math.round(debugData.lcpMs)}ms`;
    lcpColor = debugData.lcpMs <= 2500 ? '#0f0' : debugData.lcpMs <= 4000 ? '#ff0' : '#f44';
  } else if (debugData.lcpStatus === 'not_observed' && debugData.proxyLcpMs !== null) {
    lcpDisplay = `not observed — proxyLCP: ${debugData.proxyLcpMs}ms [${debugData.proxyLcpCandidate}]`;
    lcpColor = debugData.proxyLcpMs <= 2500 ? '#0f0' : debugData.proxyLcpMs <= 4000 ? '#ff0' : '#f44';
  } else if (debugData.lcpStatus === 'not_observed') {
    lcpDisplay = 'not observed';
    lcpColor = '#888';
  } else {
    lcpDisplay = 'pending...';
    lcpColor = '#ff0';
  }

  const gridBeforeLcp = debugData.gridRenderedBeforeLCP !== null
    ? (debugData.gridRenderedBeforeLCP ? '✅ yes' : '❌ no')
    : (debugData.gridRenderTime !== null && debugData.proxyLcpMs !== null
      ? (debugData.gridRenderTime < debugData.proxyLcpMs ? '✅ yes (proxy)' : '❌ no (proxy)')
      : 'pending...');

  const bannerVhWarning = debugData.bannerVhPercent !== null && debugData.bannerVhPercent > 25 ? ' ⚠️ >25%!' : '';

  const gt = getGridTiming();

  const lines = [
    `Route: ${debugData.route}`,
    `<span style="color:${lcpColor}">LCP: ${lcpDisplay}</span>`,
    `Real LCP observed: ${debugData.realLcpObserved ? '✅ yes' : '❌ no'}`,
    `Manual observer entries: ${debugData.manualLcpEntries}`,
    `LCP Element: ${debugData.lcpElement || (lcpSettled ? 'none' : 'pending...')}`,
    `LCP ID: ${debugData.lcpElementId || 'n/a'}`,
    `LCP Resource: ${debugData.lcpUrl || 'n/a'}`,
    `LCP Text: ${debugData.lcpElementText || 'n/a'}`,
    `Best candidate selector: ${debugData.candidateElementSelector || 'n/a'}`,
    `<span style="color:#0ff">── Grid Timing ──</span>`,
    `Data source: ${gt.productsDataSource}`,
    `Products load: ${formatMs(gt.productsLoadStartAt)} → ${formatMs(gt.productsLoadEndAt)}${gt.productsLoadStartAt && gt.productsLoadEndAt ? ` (${Math.round(gt.productsLoadEndAt - gt.productsLoadStartAt)}ms)` : ''}`,
    `Category filter: ${gt.categoryFilterStartAt && gt.categoryFilterEndAt ? `${Math.round(gt.categoryFilterEndAt - gt.categoryFilterStartAt)}ms` : 'n/a'}`,
    `Skeleton mounted: ${formatMs(gt.gridSkeletonMountedAt)}`,
    `Grid 1st item rendered: ${formatMs(gt.gridFirstItemRenderedAt)}`,
    `1st card text paint: ${formatMs(gt.firstCardTextPaintAt)}`,
    `Grid meaningful paint: ${formatMs(debugData.gridFirstMeaningfulPaintAt)}`,
    `Grid render: ${formatMs(debugData.gridRenderTime)}`,
    `Grid before LCP: ${gridBeforeLcp}`,
    `<span style="color:#0ff">── Image/Font ──</span>`,
    `1st img request: ${formatMs(gt.firstGridImageRequestStartAt)}`,
    `1st img loaded: ${formatMs(gt.firstGridImageLoadAt)}`,
    `1st img decoded: ${formatMs(gt.firstGridImageDecodedAt)}`,
    `Fonts ready: ${formatMs(gt.fontsReadyAt)}`,
    `Long tasks: ${gt.mainThreadLongTasks.length > 0 ? gt.mainThreadLongTasks.map(t => `${t.duration}ms@${t.startTime}`).join(', ') : 'none'}`,
    `<span style="color:#0ff">── Cookie ──</span>`,
    `Cookie mounted: ${debugData.cookieBannerMountedAt ? `${Math.round(debugData.cookieBannerMountedAt)}ms` : 'not yet'}`,
    `Cookie interactive: ${debugData.cookieBannerInteractiveAt ? `${Math.round(debugData.cookieBannerInteractiveAt)}ms` : 'n/a'}`,
    `Banner covers content: ${debugData.cookieBannerCoversContent !== null ? (debugData.cookieBannerCoversContent ? '⚠️ yes' : '✅ no') : 'n/a'}`,
    `Banner vh%: ${debugData.bannerVhPercent !== null ? `${debugData.bannerVhPercent}%${bannerVhWarning}` : 'n/a'}`,
    `Hero→Banner gap: ${debugData.timeBetweenHeroAndBannerMount !== null ? `${debugData.timeBetweenHeroAndBannerMount}ms` : 'n/a'}`,
    `Hero painted: ${formatMs(debugData.heroPaintedAt)}`,
    `<span style="color:#0ff">── Environment ──</span>`,
    `Connection: ${debugData.connectionType || 'unknown'}`,
    `Visibility: ${debugData.visibilityTimeline.map(v => `${v.state}@${v.at}`).join(' → ') || 'n/a'}`,
    `Prerendered: ${debugData.wasPrerendered ? 'yes' : 'no'}`,
    `BFCache restored: ${debugData.wasBFCacheRestored ? 'yes' : 'no'}`,
    `CLS: ${debugData.clsValue !== null ? debugData.clsValue.toFixed(4) : 'pending...'}`,
    `INP: ${formatMs(debugData.inpMs)}`,
    `Viewport: ${debugData.viewportWidth}×${debugData.viewportHeight}`,
    `iOS Safari: ${isIOSSafari() ? 'yes' : 'no'}`,
    `<span style="color:#0ff">── Timeline ──</span>`,
    `navStart → hero: ${formatMs(debugData.heroPaintedAt)}`,
    `navStart → data fetch: ${formatMs(gt.productsLoadStartAt)} → ${formatMs(gt.productsLoadEndAt)}`,
    `navStart → skeleton: ${formatMs(gt.gridSkeletonMountedAt)}`,
    `navStart → 1st item: ${formatMs(gt.gridFirstItemRenderedAt)}`,
    `navStart → text paint: ${formatMs(gt.firstCardTextPaintAt)}`,
    `navStart → img decoded: ${formatMs(gt.firstGridImageDecodedAt)}`,
    `navStart → meaningful: ${formatMs(debugData.gridFirstMeaningfulPaintAt)}`,
    `navStart → fonts: ${formatMs(gt.fontsReadyAt)}`,
    `<span style="color:#0ff">── WWW Redirect ──</span>`,
    `Status: platform 302 (cannot change)`,
    `Mitigation: canonical+sitemap+links=apex ✅`,
  ];

  overlayEl.innerHTML = `
    <div style="font-family:monospace;font-size:11px;line-height:1.6;padding:12px;background:rgba(0,0,0,0.92);color:#0f0;position:fixed;bottom:8px;right:8px;z-index:99999;border-radius:8px;max-width:400px;backdrop-filter:blur(4px);pointer-events:auto;max-height:80vh;overflow-y:auto">
      <div style="font-weight:bold;margin-bottom:4px;color:#fff;display:flex;justify-content:space-between;align-items:center">
        <span>🔬 CWV Debug</span>
        <button id="cwv-copy-btn" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #0f0;background:transparent;color:#0f0;cursor:pointer">Copy JSON</button>
      </div>
      ${lines.map(l => `<div>${l}</div>`).join('')}
      <div style="margin-top:6px;font-size:9px;color:#888">Wait 6s, then press Copy JSON for full report</div>
    </div>
  `;

  const copyBtn = document.getElementById('cwv-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const json = JSON.stringify({
        ...debugData,
        gridTiming: getGridTiming(),
        suspectedLCPBlockers: {
          cookieBannerMountedAt: debugData.cookieBannerMountedAt,
          cookieBannerInteractiveAt: debugData.cookieBannerInteractiveAt,
          cookieBannerCoversContent: debugData.cookieBannerCoversContent,
          heroPaintedAt: debugData.heroPaintedAt,
          gridRenderTime: debugData.gridRenderTime,
          gridFirstMeaningfulPaintAt: debugData.gridFirstMeaningfulPaintAt,
        },
        wwwRedirect: {
          status: 302,
          source: 'platform-level (Lovable hosting edge)',
          canChange: false,
          mitigation: 'Canonical tags, sitemaps, and internal links all use apex domain (getpawsy.pet). Google consolidates with consistent signals.',
        },
        collectedAt: new Date().toISOString(),
      }, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
      }).catch(() => {});
    };
  }
}

function createOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  document.body.appendChild(overlayEl);
  updateOverlay();
}

// ─── Initialization ──────────────────────────────────────────────────────

export function initLCPDebug() {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  isDebug = params.get('debugVitals') === '1';

  debugData = freshDebugData();
  lcpSettled = false;

  // Initialize SPA route tracking
  initRouteTracking();

  // Track visibility state changes for diagnostic context
  trackVisibilityState();

  // Start manual LCP observer as backup diagnostic
  startManualLcpObserver();

  // Reset on SPA navigation
  onRouteChange(() => {
    stopManualLcpObserver();
    debugData = freshDebugData();
    debugData.route = window.location.pathname + window.location.search;
    lcpSettled = false;
    resetGridTiming();
    trackVisibilityState();
    startManualLcpObserver();

    const p = new URLSearchParams(window.location.search);
    isDebug = p.get('debugVitals') === '1';

    setTimeout(detectHeroPaint, 100);
    
    // Start polling for proxy LCP data
    startProxyLcpPolling();

    if (isDebug) {
      createOverlay();
      updateOverlay();
    }
  });

  // Initial hero detection
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    detectHeroPaint();
  } else {
    document.addEventListener('DOMContentLoaded', detectHeroPaint, { once: true });
  }
  setTimeout(detectHeroPaint, 500);

  // Web-vitals attribution (always capture)
  import('web-vitals/attribution').then(({ onLCP, onCLS, onINP }) => {
    onLCP((metric: LCPMetricWithAttribution) => {
      const attr = metric.attribution;
      const element = attr?.target;
      const url = attr?.url;

      let elId: string | null = null;
      let elClass: string | null = null;
      let elText: string | null = null;
      if (element) {
        try {
          const el = document.querySelector(element);
          if (el) {
            elId = el.id || null;
            elClass = el.className?.toString().slice(0, 80) || null;
            elText = el.textContent?.trim().slice(0, 60) || null;
          }
        } catch { /* ignore */ }
      }

      debugData.lcpMs = metric.value;
      debugData.lcpElement = element || null;
      debugData.lcpElementId = elId;
      debugData.lcpElementClass = elClass;
      debugData.lcpElementText = elText;
      debugData.lcpUrl = url || null;
      debugData.lcpRenderTime = (metric.entries?.[0] as any)?.renderTime ?? null;
      debugData.lcpLoadTime = (metric.entries?.[0] as any)?.loadTime ?? null;
      debugData.lcpStatus = 'observed';
      debugData.realLcpObserved = true;
      debugData.candidateElementSelector = element || findBestCandidateSelector();
      debugData.gridRenderedBeforeLCP = debugData.gridRenderTime !== null && debugData.gridRenderTime < metric.value;
      lcpSettled = true;

      // Stop proxy LCP polling since real LCP arrived
      if (proxyLcpPollTimer) {
        clearInterval(proxyLcpPollTimer);
        proxyLcpPollTimer = null;
      }
      stopManualLcpObserver();

      storeLCPEvent({
        route: debugData.route,
        lcpMs: metric.value,
        element: element || null,
        resourceUrl: url || null,
        timestamp: Date.now(),
        deviceHint: window.innerWidth < 768 ? 'mobile' : 'desktop',
      });

      if (isDebug) {
        console.log('[LCP Debug]', { value: metric.value, element, elementId: elId, url, attribution: attr });
        updateOverlay();
      }
    });

    onCLS((metric: CLSMetricWithAttribution) => {
      debugData.clsValue = metric.value;
      if (isDebug) updateOverlay();
    });

    onINP((metric: INPMetricWithAttribution) => {
      debugData.inpMs = metric.value;
      if (isDebug) updateOverlay();
    });
  });

  // Timeout fallback: after 6s mark LCP settled
  setTimeout(() => {
    if (!lcpSettled) {
      lcpSettled = true;
      if (debugData.lcpMs === null) {
        debugData.lcpStatus = 'not_observed';
        // Final proxy LCP computation with whatever data we have
        const gt = getGridTiming();
        const result = computeProxyLcp(
          debugData.heroPaintedAt,
          gt.firstCardTextPaintAt,
          gt.gridFirstItemRenderedAt,
          gt.firstGridImageDecodedAt,
          debugData.cookieBannerMountedAt,
        );
        debugData.proxyLcpMs = result.proxyLcpMs;
        debugData.proxyLcpCandidate = result.proxyLcpCandidate;
        debugData.proxyLcpReason = result.proxyLcpReason;
        debugData.cookieBannerCoversContent = result.cookieBannerCoversContent;
        debugData.bannerVhPercent = result.bannerVhPercent;
        debugData.gridFirstMeaningfulPaintAt = gt.firstCardTextPaintAt ?? gt.gridFirstItemRenderedAt;
        debugData.candidateElementSelector = findBestCandidateSelector();
      }
      stopManualLcpObserver();
      if (isDebug) {
        console.warn('[LCP Debug] LCP not observed after 6s. Manual observer saw', debugData.manualLcpEntries, 'entries.');
        updateOverlay();
      }
    }
  }, 6000);

  // Start proxy LCP polling for initial load too (iOS Safari)
  // Always poll — on non-iOS browsers, real LCP will cancel the poll
  startProxyLcpPolling();

  if (isDebug) {
    createOverlay();
  }
}

// ─── LCP event storage for diagnostics panel ─────────────────────────────

interface StoredLCPEvent {
  route: string;
  lcpMs: number;
  element: string | null;
  resourceUrl: string | null;
  timestamp: number;
  deviceHint: 'mobile' | 'desktop';
}

const LCP_STORAGE_KEY = 'getpawsy_lcp_events';
const MAX_STORED = 50;

function storeLCPEvent(event: StoredLCPEvent) {
  try {
    const raw = sessionStorage.getItem(LCP_STORAGE_KEY);
    const events: StoredLCPEvent[] = raw ? JSON.parse(raw) : [];
    events.unshift(event);
    if (events.length > MAX_STORED) events.length = MAX_STORED;
    sessionStorage.setItem(LCP_STORAGE_KEY, JSON.stringify(events));
  } catch { /* silent */ }
}

export function getStoredLCPEvents(): StoredLCPEvent[] {
  try {
    const raw = sessionStorage.getItem(LCP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
