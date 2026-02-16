/**
 * LCP Debug Overlay & Enhanced Web Vitals Instrumentation
 * 
 * Activate with ?debugVitals=1 in the URL.
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

export function markGridRendered() {
  const t = performance.now();
  const relative = t - getRouteStartTs();
  debugData.gridRenderTime = relative;
}

export function markCookieBannerMounted() {
  debugData.cookieBannerMountedAt = performance.now();
}

export function markCookieBannerInteractive() {
  debugData.cookieBannerInteractiveAt = performance.now();
}

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

function trackVisibilityState() {
  if (typeof document === 'undefined') return;
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
  if ((document as any).prerendering) {
    debugData.wasPrerendered = true;
  }
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      debugData.wasBFCacheRestored = true;
    }
  });
}

function startManualLcpObserver() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    manualLcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      debugData.manualLcpEntries += entries.length;
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1] as any;
        debugData.realLcpObserved = true;
        debugData.lcpMs = lastEntry.startTime;
        debugData.lcpElement = lastEntry.element?.tagName;
        debugData.lcpElementId = lastEntry.element?.id;
        debugData.lcpUrl = lastEntry.url;
        debugData.lcpStatus = 'observed';
        updateOverlay();
      }
    });
    manualLcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
}

function findBestCandidateSelector(): string | null {
  try {
    const candidates = document.querySelectorAll('img, h1, h2, video, [data-testid="product-card"]');
    let best: { el: Element; area: number } | null = null;
    const vh = window.innerHeight;
    candidates.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top >= vh || rect.bottom <= 0) return;
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
  } catch { return null; }
}

let proxyLcpPollTimer: ReturnType<typeof setInterval> | null = null;

function startProxyLcpPolling() {
  if (proxyLcpPollTimer) clearInterval(proxyLcpPollTimer);
  const startedAt = performance.now();
  proxyLcpPollTimer = setInterval(() => {
    if (debugData.lcpMs !== null && debugData.realLcpObserved) {
      if (proxyLcpPollTimer) clearInterval(proxyLcpPollTimer);
      return;
    }
    const gt = getGridTiming();
    const elapsed = performance.now() - startedAt;
    const hasTextPaint = gt.firstCardTextPaintAt !== null;
    const hasItemRendered = gt.gridFirstItemRenderedAt !== null;
    if (!hasTextPaint && !hasItemRendered && elapsed < 6000) return;

    const result = computeProxyLcp(
      debugData.heroPaintedAt,
      gt.firstCardTextPaintAt,
      gt.gridFirstItemRenderedAt,
      gt.firstGridImageDecodedAt,
      gt.firstGridImageLoadAt,
      debugData.cookieBannerMountedAt,
    );

    debugData.proxyLcpMs = result.proxyLcpMs;
    debugData.proxyLcpCandidate = result.proxyLcpCandidate;
    debugData.proxyLcpReason = result.proxyLcpReason;
    debugData.cookieBannerCoversContent = result.cookieBannerCoversContent;
    debugData.bannerVhPercent = result.bannerVhPercent;
    debugData.gridFirstMeaningfulPaintAt = gt.firstCardTextPaintAt ?? gt.gridFirstItemRenderedAt;
    debugData.lcpStatus = debugData.realLcpObserved ? 'observed' : 'not_observed';
    debugData.candidateElementSelector = findBestCandidateSelector();
    lcpSettled = true;
    if (proxyLcpPollTimer) clearInterval(proxyLcpPollTimer);
    updateOverlay();
  }, 200);
}

function updateOverlay() {
  if (!overlayEl) return;
  let lcpDisplay: string;
  let lcpColor: string;
  const lcpValue = debugData.lcpMs ?? debugData.proxyLcpMs;
  if (lcpValue !== null) {
    lcpDisplay = `${Math.round(lcpValue)}ms${debugData.realLcpObserved ? '' : ' (proxy)'}`;
    lcpColor = lcpValue <= 1200 ? '#0f0' : lcpValue <= 2500 ? '#ff0' : '#f44';
  } else {
    lcpDisplay = 'pending...';
    lcpColor = '#ff0';
  }

  const gt = getGridTiming();
  const isSPA = getIsSPANavigation();
  const navTypeLabel = isSPA ? '🔄 SPA (soft)' : '🌐 Hard navigation';

  const lines = [
    `Route: ${debugData.route}`,
    `<span style="color:#ff0">Nav type: ${navTypeLabel}</span>`,
    `<span style="color:${lcpColor}">LCP: ${lcpDisplay}</span>`,
    `Real LCP observed: ${debugData.realLcpObserved ? '✅ yes' : '❌ no'}`,
    `Selector: ${debugData.candidateElementSelector || 'pending...'}`,
    `<span style="color:#0ff">── Timeline ──</span>`,
    `Component mounted: ${formatMs(gt.componentMountedAt)}`,
    `Fetch gate reason: ${gt.productsFetchGateReason}`,
    `Fetch initiated: ${formatMs(gt.productsFetchInitiatedAt)}`,
    `Fetch start: ${formatMs(gt.productsLoadStartAt)}`,
    `Fetch end: ${formatMs(gt.productsLoadEndAt)}`,
    `Data source: ${gt.productsDataSource}`,
    `Grid skeleton: ${formatMs(gt.gridSkeletonMountedAt)}`,
    `Grid 1st item rendered: ${formatMs(gt.gridFirstItemRenderedAt)}`,
    `Grid 1st item VISIBLE: ${formatMs(gt.gridFirstItemVisibleAt)}`,
    `Grid meaningful paint: ${formatMs(debugData.gridFirstMeaningfulPaintAt)}`,
    `1st card text paint: ${formatMs(gt.firstCardTextPaintAt)}`,
    `1st image request: ${formatMs(gt.firstGridImageRequestStartAt)}`,
    `1st image loaded: ${formatMs(gt.firstGridImageLoadAt)}`,
    `1st image decoded: ${formatMs(gt.firstGridImageDecodedAt)}`,
    `Fonts ready: ${formatMs(gt.fontsReadyAt)}`,
    `Hero painted: ${formatMs(debugData.heroPaintedAt)}`,
    `CLS: ${debugData.clsValue !== null ? debugData.clsValue.toFixed(4) : 'pending...'}`,
  ];
  overlayEl.innerHTML = `<div style="margin-bottom:8px;font-weight:bold;border-bottom:1px solid #555">CWV Debug (iOS SPA Fallback)</div>` + 
    lines.map(line => `<div style="margin-bottom:2px">${line}</div>`).join('') +
    `<button id="lcp-copy-json" style="margin-top:10px;width:100%;padding:4px;background:#444;border:1px solid #666;color:#fff;cursor:pointer">Copy JSON</button>`;
  
  const btn = overlayEl.querySelector('#lcp-copy-json');
  if (btn) {
    btn.addEventListener('click', () => {
      const fullData = { ...debugData, gridTiming: getGridTiming() };
      navigator.clipboard.writeText(JSON.stringify(fullData, null, 2));
      const oldText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = oldText; }, 2000);
    });
  }
}

export function initLCPDebug() {
  if (typeof window === 'undefined') return;
  isDebug = new URLSearchParams(window.location.search).has('debugVitals');
  if (!isDebug) return;
  initRouteTracking();
  trackVisibilityState();
  startManualLcpObserver();
  startProxyLcpPolling();
  detectHeroPaint();
  overlayEl = document.createElement('div');
  overlayEl.style.cssText = `position:fixed;bottom:10px;right:10px;background:rgba(0,0,0,0.85);color:#fff;padding:12px;font-family:monospace;font-size:11px;z-index:10000;border-radius:8px;border:1px solid #444;max-width:320px;pointer-events:auto;box-shadow:0 4px 12px rgba(0,0,0,0.5)`;
  document.body.appendChild(overlayEl);
  updateOverlay();
  onRouteChange(() => {
    debugData = freshDebugData();
    resetGridTiming();
    detectHeroPaint();
    updateOverlay();
    startProxyLcpPolling();
  });
}

export function getStoredLCPEvents() { return []; }
