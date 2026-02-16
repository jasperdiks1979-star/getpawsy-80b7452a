/**
 * LCP Debug Overlay & Enhanced Web Vitals Instrumentation
 * 
 * Activate with ?debugVitals=1 in the URL.
 * 
 * ROOT-CAUSE ANALYSIS for /products (mobile):
 * - LCP element: First ProductCard image in the grid (OptimizedImage component)
 * - All product images had priority=false → lazy loaded → delayed LCP
 * - Full product array (600+) fetched then client-filtered → slow initial render
 * - Skeleton placeholders swap to real images → late LCP measurement
 * 
 * FIXES APPLIED:
 * - First 2 product card images use priority={true} (eager load + fetchpriority=high)
 * - Products query uses initial page cache (sessionStorage) for instant first paint
 * - Non-critical widgets (filters, sort, recommendations) deferred via requestIdleCallback
 * - ProductCard already memoized with React.memo + forwardRef
 * 
 * VALIDATION CHECKLIST:
 * 1. Run Lighthouse mobile: chrome://inspect → open /products?category=Small%20Pets
 * 2. Reproduce debug overlay: /products?debugVitals=1
 * 3. Target: LCP < 2.5s (lab), downward trend in field data (web_vitals table)
 */

import type { LCPMetricWithAttribution, CLSMetricWithAttribution, INPMetricWithAttribution } from 'web-vitals/attribution';

interface LCPDebugData {
  route: string;
  lcpMs: number | null;
  lcpElement: string | null;
  lcpUrl: string | null;
  clsValue: number | null;
  inpMs: number | null;
  gridRenderedBeforeLCP: boolean | null;
  timestamp: number;
}

let debugData: LCPDebugData = {
  route: '',
  lcpMs: null,
  lcpElement: null,
  lcpUrl: null,
  clsValue: null,
  inpMs: null,
  gridRenderedBeforeLCP: null,
  timestamp: Date.now(),
};

let overlayEl: HTMLDivElement | null = null;
let gridRenderTime: number | null = null;

/** Call this from the product grid when it first renders real items (not skeletons) */
export function markGridRendered() {
  gridRenderTime = performance.now();
}

function updateOverlay() {
  if (!overlayEl) return;
  
  const lines = [
    `Route: ${debugData.route}`,
    `LCP: ${debugData.lcpMs !== null ? `${Math.round(debugData.lcpMs)}ms` : 'pending...'}`,
    `LCP Element: ${debugData.lcpElement || 'pending...'}`,
    `LCP Resource: ${debugData.lcpUrl || 'n/a'}`,
    `Grid before LCP: ${debugData.gridRenderedBeforeLCP !== null ? (debugData.gridRenderedBeforeLCP ? '✅ yes' : '❌ no') : 'pending...'}`,
    `CLS: ${debugData.clsValue !== null ? debugData.clsValue.toFixed(4) : 'pending...'}`,
    `INP: ${debugData.inpMs !== null ? `${Math.round(debugData.inpMs)}ms` : 'pending...'}`,
  ];
  
  overlayEl.innerHTML = `
    <div style="font-family:monospace;font-size:11px;line-height:1.6;padding:12px;background:rgba(0,0,0,0.88);color:#0f0;position:fixed;bottom:8px;right:8px;z-index:99999;border-radius:8px;max-width:340px;backdrop-filter:blur(4px)">
      <div style="font-weight:bold;margin-bottom:4px;color:#fff;display:flex;justify-content:space-between;align-items:center">
        <span>🔬 CWV Debug</span>
        <button id="cwv-copy-btn" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #0f0;background:transparent;color:#0f0;cursor:pointer;pointer-events:auto">Copy JSON</button>
      </div>
      ${lines.map(l => `<div>${l}</div>`).join('')}
    </div>
  `;
  // Attach copy handler
  const copyBtn = document.getElementById('cwv-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const json = JSON.stringify(debugData, null, 2);
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
  
  // Always capture enhanced attribution for the vitals collector
  import('web-vitals/attribution').then(({ onLCP, onCLS, onINP }) => {
    onLCP((metric: LCPMetricWithAttribution) => {
      const element = metric.attribution?.target;
      const url = metric.attribution?.url;
      
      debugData.lcpMs = metric.value;
      debugData.lcpElement = element || null;
      debugData.lcpUrl = url || null;
      debugData.gridRenderedBeforeLCP = gridRenderTime !== null && gridRenderTime < metric.value;
      
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
          url,
          attribution: metric.attribution,
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
