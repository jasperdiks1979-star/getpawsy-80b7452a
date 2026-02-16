/**
 * Grid timing instrumentation for LCP diagnostics.
 * 
 * Captures precise timestamps for:
 * - Skeleton mount
 * - Data fetch start/end
 * - First product card rendered
 * - First card text painted (rAF+rAF after React commit)
 * - First grid image request/load/decode
 * - Font readiness
 * - Long tasks during boot
 * 
 * All timestamps are relative to navigationStart for consistency.
 */

export interface GridTimingData {
  navStart: number;
  productsDataSource: 'cache' | 'remote' | 'category-fast' | 'idb-cache' | 'unknown';
  productsLoadStartAt: number | null;
  productsLoadEndAt: number | null;
  productsFetchInitiatedAt: number | null;
  productsFetchGateReason: 'none' | 'idle_callback' | 'suspense_lazy_mount' | 'consent_wait' | 'debounce' | 'other';
  componentMountedAt: number | null;
  categoryFilterStartAt: number | null;
  categoryFilterEndAt: number | null;
  gridSkeletonMountedAt: number | null;
  gridFirstItemRenderedAt: number | null;
  gridFirstItemVisibleAt: number | null;
  firstCardTextPaintAt: number | null;
  firstGridImageRequestStartAt: number | null;
  firstGridImageLoadAt: number | null;
  firstGridImageDecodedAt: number | null;
  fontsReadyAt: number | null;
  mainThreadLongTasks: Array<{ startTime: number; duration: number }>;
  navigationType: 'hard' | 'spa-soft' | 'unknown';
}

let timingData: GridTimingData = createFreshTiming();

function detectNavigationType(): GridTimingData['navigationType'] {
  if (typeof performance === 'undefined') return 'unknown';
  try {
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries.length > 0) return 'hard';
  } catch {}
  return 'unknown';
}

function createFreshTiming(): GridTimingData {
  return {
    navStart: typeof performance !== 'undefined' ? performance.timeOrigin : 0,
    productsDataSource: 'unknown',
    productsLoadStartAt: null,
    productsLoadEndAt: null,
    productsFetchInitiatedAt: null,
    productsFetchGateReason: 'none',
    componentMountedAt: null,
    categoryFilterStartAt: null,
    categoryFilterEndAt: null,
    gridSkeletonMountedAt: null,
    gridFirstItemRenderedAt: null,
    gridFirstItemVisibleAt: null,
    firstCardTextPaintAt: null,
    firstGridImageRequestStartAt: null,
    firstGridImageLoadAt: null,
    firstGridImageDecodedAt: null,
    fontsReadyAt: null,
    mainThreadLongTasks: [],
    navigationType: detectNavigationType(),
  };
}

function now(): number {
  return performance.now();
}

export function resetGridTiming() {
  timingData = createFreshTiming();
  startFontTracking();
}

export function markProductsFetchInitiated() {
  if (timingData.productsFetchInitiatedAt === null) {
    timingData.productsFetchInitiatedAt = now();
  }
}

export function markComponentMounted() {
  if (timingData.componentMountedAt === null) {
    timingData.componentMountedAt = now();
  }
}

export function markProductsLoadStart() {
  timingData.productsLoadStartAt = now();
}

export function markProductsLoadEnd(source: GridTimingData['productsDataSource']) {
  timingData.productsLoadEndAt = now();
  timingData.productsDataSource = source;
}

export function markCategoryFilterStart() {
  timingData.categoryFilterStartAt = now();
}

export function markCategoryFilterEnd() {
  timingData.categoryFilterEndAt = now();
}

export function markGridSkeletonMounted() {
  if (timingData.gridSkeletonMountedAt === null) {
    timingData.gridSkeletonMountedAt = now();
  }
}

export function markGridFirstItemRendered() {
  if (timingData.gridFirstItemRenderedAt === null) {
    timingData.gridFirstItemRenderedAt = now();
    // Schedule double-rAF to mark text paint (after browser actually paints)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (timingData.firstCardTextPaintAt === null) {
          timingData.firstCardTextPaintAt = now();
        }
      });
    });
    // Track actual visibility: check computedStyle + bounding box
    trackFirstItemVisibility();
  }
}

/** Polls until first product card is actually visible (opacity>0, in viewport, non-zero box) */
function trackFirstItemVisibility() {
  if (timingData.gridFirstItemVisibleAt !== null) return;
  const check = () => {
    const card = document.querySelector('[data-testid="product-card"]');
    if (!card) { requestAnimationFrame(check); return; }
    const style = getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    const isVisible = style.opacity !== '0' &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      rect.width > 0 && rect.height > 0 &&
      rect.top < window.innerHeight;
    if (isVisible && timingData.gridFirstItemVisibleAt === null) {
      timingData.gridFirstItemVisibleAt = now();
    } else if (!isVisible) {
      requestAnimationFrame(check);
    }
  };
  requestAnimationFrame(check);
}

/** Mark as SPA navigation (call on client-side route changes) */
export function markSPANavigation() {
  timingData.navigationType = 'spa-soft';
}

/**
 * Track the first visible product card image lifecycle.
 * Call this with the <img> element of the first above-the-fold card.
 */
export function trackFirstGridImage(img: HTMLImageElement) {
  if (timingData.firstGridImageRequestStartAt !== null) return; // already tracking
  timingData.firstGridImageRequestStartAt = now();

  const onLoad = () => {
    if (timingData.firstGridImageLoadAt === null) {
      timingData.firstGridImageLoadAt = now();
    }
    // Try decode() API for precise decode timing
    if (typeof img.decode === 'function') {
      img.decode().then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (timingData.firstGridImageDecodedAt === null) {
              timingData.firstGridImageDecodedAt = now();
            }
          });
        });
      }).catch(() => {
        // decode failed, use load time as fallback
        if (timingData.firstGridImageDecodedAt === null) {
          timingData.firstGridImageDecodedAt = timingData.firstGridImageLoadAt;
        }
      });
    } else {
      timingData.firstGridImageDecodedAt = timingData.firstGridImageLoadAt;
    }
    img.removeEventListener('load', onLoad);
  };

  if (img.complete && img.naturalWidth > 0) {
    onLoad();
  } else {
    img.addEventListener('load', onLoad, { once: true });
  }
}

/** Track document.fonts.ready */
function startFontTracking() {
  if (typeof document === 'undefined' || !document.fonts?.ready) return;
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (timingData.fontsReadyAt === null) {
          timingData.fontsReadyAt = now();
        }
      });
    });
  });
}

// Start font tracking on module load
startFontTracking();

export function getGridTiming(): GridTimingData {
  return { ...timingData };
}

// ─── Long Task observer ──────────────────────────────────────────────────

let longTaskObserver: PerformanceObserver | null = null;

export function startLongTaskTracking() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (timingData.mainThreadLongTasks.length < 5) {
          timingData.mainThreadLongTasks.push({
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          });
        }
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
    // Stop after 5s
    setTimeout(() => {
      longTaskObserver?.disconnect();
      longTaskObserver = null;
    }, 5000);
  } catch {
    // longtask not supported (e.g. Firefox, Safari)
  }
}
