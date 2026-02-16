/**
 * LCP Debug Overlay & Enhanced Web Vitals Instrumentation
 * 
 * Activate with ?debugVitals=1 in the URL.
 * 
 * ROOT-CAUSE ANALYSIS for /products (mobile):
 * - LCP element: The H1 heading (#plp-hero-heading) should be LCP on mobile.
 *   Previously the first ProductCard image or the cookie banner could win LCP.
 * - Cookie banner is now deferred 2.5s so it never competes.
 * - First 2 product card images use priority={true} (eager load + fetchpriority=high)
 * - Products query uses initial page cache (sessionStorage) for instant first paint
 * 
 * iOS Safari SPA navigations:
 * - PerformanceObserver('largest-contentful-paint') does NOT fire on soft navigations.
 * - We use a pseudo-LCP fallback (see src/lib/pseudo-lcp.ts) based on DOM paint signals.
 * - The overlay shows "not observed (iOS Safari SPA) — pseudoLCP: Xms [candidate]".
 */

import type { LCPMetricWithAttribution, CLSMetricWithAttribution, INPMetricWithAttribution } from 'web-vitals/attribution';
import {
  isIOSSafari,
  getRouteStartTs,
  getIsSPANavigation,
  initRouteTracking,
  onRouteChange,
  probeGridPaint,
  computePseudoLcp,
  type PseudoLcpResult,
  type GridProbeResult,
} from './pseudo-lcp';

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
  heroPaintedAt: number | null;
  pseudoLcpMs: number | null;
  pseudoLcpCandidate: string | null;
  pseudoLcpReason: string | null;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  timestamp: number;
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
    heroPaintedAt: null,
    pseudoLcpMs: null,
    pseudoLcpCandidate: null,
    pseudoLcpReason: null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    timestamp: Date.now(),
  };
}

let debugData: LCPDebugData = freshDebugData();
let overlayEl: HTMLDivElement | null = null;
let lcpSettled = false;
let isDebug = false;

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

// ─── Pseudo-LCP fallback orchestration ───────────────────────────────────

function runPseudoLcpFallback() {
  if (!isIOSSafari() || !getIsSPANavigation()) return;

  // Wait 3s after route start; if real LCP still null, compute pseudo
  setTimeout(async () => {
    if (debugData.lcpMs !== null) return; // real LCP arrived, no need

    // Probe grid
    const gridProbe: GridProbeResult = await probeGridPaint();

    const result: PseudoLcpResult = computePseudoLcp(
      debugData.heroPaintedAt,
      debugData.cookieBannerMountedAt,
      gridProbe,
    );

    debugData.pseudoLcpMs = result.pseudoLcpMs;
    debugData.pseudoLcpCandidate = result.pseudoLcpCandidate;
    debugData.pseudoLcpReason = result.pseudoLcpReason;
    debugData.cookieBannerCoversContent = result.cookieBannerCoversContent;
    debugData.gridFirstMeaningfulPaintAt = result.gridFirstMeaningfulPaintAt;
    if (result.gridRenderTime !== null) {
      debugData.gridRenderTime = result.gridRenderTime;
    }
    debugData.lcpStatus = 'not_observed';
    lcpSettled = true;

    if (isDebug) {
      console.log('[Pseudo-LCP]', result);
      updateOverlay();
    }
  }, 3000);
}

// ─── Overlay rendering ───────────────────────────────────────────────────

function updateOverlay() {
  if (!overlayEl) return;

  let lcpDisplay: string;
  let lcpColor: string;

  if (debugData.lcpMs !== null) {
    lcpDisplay = `${Math.round(debugData.lcpMs)}ms`;
    lcpColor = debugData.lcpMs <= 2500 ? '#0f0' : debugData.lcpMs <= 4000 ? '#ff0' : '#f44';
  } else if (debugData.lcpStatus === 'not_observed' && debugData.pseudoLcpMs !== null) {
    lcpDisplay = `not observed (iOS Safari SPA) — pseudoLCP: ${debugData.pseudoLcpMs}ms [${debugData.pseudoLcpCandidate}]`;
    lcpColor = debugData.pseudoLcpMs <= 2500 ? '#0f0' : debugData.pseudoLcpMs <= 4000 ? '#ff0' : '#f44';
  } else if (debugData.lcpStatus === 'not_observed') {
    lcpDisplay = 'not observed';
    lcpColor = '#888';
  } else {
    lcpDisplay = 'pending...';
    lcpColor = '#ff0';
  }

  const gridBeforeLcp = debugData.gridRenderedBeforeLCP !== null
    ? (debugData.gridRenderedBeforeLCP ? '✅ yes' : '❌ no')
    : (debugData.gridRenderTime !== null && debugData.pseudoLcpMs !== null
      ? (debugData.gridRenderTime < debugData.pseudoLcpMs ? '✅ yes (pseudo)' : '❌ no (pseudo)')
      : 'pending...');

  const lines = [
    `Route: ${debugData.route}`,
    `<span style="color:${lcpColor}">LCP: ${lcpDisplay}</span>`,
    `LCP Element: ${debugData.lcpElement || (lcpSettled ? 'none' : 'pending...')}`,
    `LCP ID: ${debugData.lcpElementId || 'n/a'}`,
    `LCP Resource: ${debugData.lcpUrl || 'n/a'}`,
    `LCP Text: ${debugData.lcpElementText || 'n/a'}`,
    `Grid 1st paint: ${formatMs(debugData.gridFirstMeaningfulPaintAt)}`,
    `Grid render: ${formatMs(debugData.gridRenderTime)}`,
    `Grid before LCP: ${gridBeforeLcp}`,
    `Cookie banner: ${debugData.cookieBannerMountedAt ? `${Math.round(debugData.cookieBannerMountedAt)}ms` : 'not yet'}`,
    `Banner covers content: ${debugData.cookieBannerCoversContent !== null ? (debugData.cookieBannerCoversContent ? '⚠️ yes' : '✅ no') : 'n/a'}`,
    `Hero painted: ${formatMs(debugData.heroPaintedAt)}`,
    `CLS: ${debugData.clsValue !== null ? debugData.clsValue.toFixed(4) : 'pending...'}`,
    `INP: ${formatMs(debugData.inpMs)}`,
    `Viewport: ${debugData.viewportWidth}×${debugData.viewportHeight}`,
    `iOS Safari: ${isIOSSafari() ? 'yes' : 'no'}`,
  ];

  overlayEl.innerHTML = `
    <div style="font-family:monospace;font-size:11px;line-height:1.6;padding:12px;background:rgba(0,0,0,0.92);color:#0f0;position:fixed;bottom:8px;right:8px;z-index:99999;border-radius:8px;max-width:380px;backdrop-filter:blur(4px);pointer-events:auto;max-height:80vh;overflow-y:auto">
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
        suspectedLCPBlockers: {
          cookieBannerMountedAt: debugData.cookieBannerMountedAt,
          cookieBannerCoversContent: debugData.cookieBannerCoversContent,
          heroPaintedAt: debugData.heroPaintedAt,
          gridRenderTime: debugData.gridRenderTime,
          gridFirstMeaningfulPaintAt: debugData.gridFirstMeaningfulPaintAt,
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

  // Reset on SPA navigation
  onRouteChange(() => {
    debugData = freshDebugData();
    debugData.route = window.location.pathname + window.location.search;
    lcpSettled = false;

    // Re-check debug flag for new route
    const p = new URLSearchParams(window.location.search);
    isDebug = p.get('debugVitals') === '1';

    setTimeout(detectHeroPaint, 100);
    runPseudoLcpFallback();

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
      debugData.gridRenderedBeforeLCP = debugData.gridRenderTime !== null && debugData.gridRenderTime < metric.value;
      lcpSettled = true;

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
      }
      if (isDebug) {
        console.warn('[LCP Debug] LCP not observed after 6s.');
        updateOverlay();
      }
    }
  }, 6000);

  // Start pseudo-LCP fallback for initial load too (in case of iOS Safari)
  if (isIOSSafari()) {
    // For initial page load, give real LCP a chance first
    setTimeout(() => {
      if (debugData.lcpMs === null) {
        probeGridPaint().then((gridProbe) => {
          const result = computePseudoLcp(debugData.heroPaintedAt, debugData.cookieBannerMountedAt, gridProbe);
          debugData.pseudoLcpMs = result.pseudoLcpMs;
          debugData.pseudoLcpCandidate = result.pseudoLcpCandidate;
          debugData.pseudoLcpReason = result.pseudoLcpReason;
          debugData.cookieBannerCoversContent = result.cookieBannerCoversContent;
          debugData.gridFirstMeaningfulPaintAt = result.gridFirstMeaningfulPaintAt;
          if (result.gridRenderTime !== null) debugData.gridRenderTime = result.gridRenderTime;
          debugData.lcpStatus = 'not_observed';
          lcpSettled = true;
          if (isDebug) updateOverlay();
        });
      }
    }, 4000);
  }

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
