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
 * VALIDATION CHECKLIST:
 * 1. Run Lighthouse mobile: chrome://inspect → open /products?category=Small%20Pets
 * 2. Reproduce debug overlay: /products?debugVitals=1
 * 3. Wait 6s, then press "Copy JSON" to export diagnostics
 * 4. Target: LCP < 2.5s (lab), downward trend in field data (web_vitals table)
 */

import type { LCPMetricWithAttribution, CLSMetricWithAttribution, INPMetricWithAttribution } from 'web-vitals/attribution';

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
  clsValue: number | null;
  inpMs: number | null;
  gridRenderedBeforeLCP: boolean | null;
  cookieBannerMountedAt: number | null;
  heroPaintedAt: number | null;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  timestamp: number;
}

let debugData: LCPDebugData = {
  route: '',
  lcpMs: null,
  lcpElement: null,
  lcpElementId: null,
  lcpElementClass: null,
  lcpElementText: null,
  lcpUrl: null,
  lcpRenderTime: null,
  lcpLoadTime: null,
  clsValue: null,
  inpMs: null,
  gridRenderedBeforeLCP: null,
  cookieBannerMountedAt: null,
  heroPaintedAt: null,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  timestamp: Date.now(),
};

let overlayEl: HTMLDivElement | null = null;
let gridRenderTime: number | null = null;
let lcpSettled = false;

/** Call this from the product grid when it first renders real items (not skeletons) */
export function markGridRendered() {
  gridRenderTime = performance.now();
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
      debugData.heroPaintedAt = performance.now();
    }
  });
}

function formatMs(v: number | null): string {
  if (v === null) return 'pending...';
  return `${Math.round(v)}ms`;
}

function updateOverlay() {
  if (!overlayEl) return;
  
  const lcpStatus = lcpSettled
    ? (debugData.lcpMs !== null ? `${Math.round(debugData.lcpMs)}ms` : 'not observed')
    : (debugData.lcpMs !== null ? `${Math.round(debugData.lcpMs)}ms` : 'pending...');

  const lcpColor = debugData.lcpMs === null ? '#ff0' : debugData.lcpMs <= 2500 ? '#0f0' : debugData.lcpMs <= 4000 ? '#ff0' : '#f44';

  const lines = [
    `Route: ${debugData.route}`,
    `<span style="color:${lcpColor}">LCP: ${lcpStatus}</span>`,
    `LCP Element: ${debugData.lcpElement || (lcpSettled ? 'none' : 'pending...')}`,
    `LCP ID: ${debugData.lcpElementId || 'n/a'}`,
    `LCP Resource: ${debugData.lcpUrl || 'n/a'}`,
    `LCP Text: ${debugData.lcpElementText || 'n/a'}`,
    `Grid before LCP: ${debugData.gridRenderedBeforeLCP !== null ? (debugData.gridRenderedBeforeLCP ? '✅ yes' : '❌ no') : 'pending...'}`,
    `Cookie banner: ${debugData.cookieBannerMountedAt ? `${Math.round(debugData.cookieBannerMountedAt)}ms` : 'not yet'}`,
    `Hero painted: ${debugData.heroPaintedAt ? `${Math.round(debugData.heroPaintedAt)}ms` : 'n/a'}`,
    `CLS: ${debugData.clsValue !== null ? debugData.clsValue.toFixed(4) : 'pending...'}`,
    `INP: ${formatMs(debugData.inpMs)}`,
    `Viewport: ${debugData.viewportWidth}×${debugData.viewportHeight}`,
  ];
  
  overlayEl.innerHTML = `
    <div style="font-family:monospace;font-size:11px;line-height:1.6;padding:12px;background:rgba(0,0,0,0.92);color:#0f0;position:fixed;bottom:8px;right:8px;z-index:99999;border-radius:8px;max-width:360px;backdrop-filter:blur(4px);pointer-events:auto">
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
          heroPaintedAt: debugData.heroPaintedAt,
          gridRenderTime,
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

export function initLCPDebug() {
  if (typeof window === 'undefined') return;
  
  const params = new URLSearchParams(window.location.search);
  const isDebug = params.get('debugVitals') === '1';
  
  debugData.route = window.location.pathname + window.location.search;
  debugData.viewportWidth = window.innerWidth;
  debugData.viewportHeight = window.innerHeight;
  debugData.userAgent = navigator.userAgent;

  // Try to detect hero paint
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    detectHeroPaint();
  } else {
    document.addEventListener('DOMContentLoaded', detectHeroPaint, { once: true });
  }
  // Also retry after a short delay (SPA may render later)
  setTimeout(detectHeroPaint, 500);
  
  // Always capture enhanced attribution for the vitals collector
  import('web-vitals/attribution').then(({ onLCP, onCLS, onINP }) => {
    onLCP((metric: LCPMetricWithAttribution) => {
      const attr = metric.attribution;
      const element = attr?.target;
      const url = attr?.url;
      
      // Try to get richer element info from the DOM
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
      debugData.gridRenderedBeforeLCP = gridRenderTime !== null && gridRenderTime < metric.value;
      lcpSettled = true;
      
      // Store for diagnostics panel
      storeLCPEvent({
        route: debugData.route,
        lcpMs: metric.value,
        element: element || null,
        resourceUrl: url || null,
        timestamp: Date.now(),
        deviceHint: window.innerWidth < 768 ? 'mobile' : 'desktop',
      });
      
      if (isDebug) {
        console.log('[LCP Debug]', {
          value: metric.value,
          element,
          elementId: elId,
          elementText: elText,
          url,
          attribution: attr,
          gridRenderTime,
        });
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
  
  // Timeout fallback: after 6s, mark LCP as settled so overlay doesn't show "pending" forever
  setTimeout(() => {
    if (!lcpSettled) {
      lcpSettled = true;
      if (isDebug) {
        console.warn('[LCP Debug] LCP not observed after 6s — page may have been backgrounded or no qualifying element found.');
        updateOverlay();
      }
    }
  }, 6000);
  
  if (isDebug) {
    createOverlay();
  }
}

// --- LCP event storage for diagnostics panel ---

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
  } catch {
    // silent
  }
}

export function getStoredLCPEvents(): StoredLCPEvent[] {
  try {
    const raw = sessionStorage.getItem(LCP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
