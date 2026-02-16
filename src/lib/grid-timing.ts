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
  categoryFilterStartAt: number | null;
  categoryFilterEndAt: number | null;
  gridSkeletonMountedAt: number | null;
  gridFirstItemRenderedAt: number | null;
  firstCardTextPaintAt: number | null;
  firstGridImageRequestStartAt: number | null;
  firstGridImageLoadAt: number | null;
  firstGridImageDecodedAt: number | null;
  fontsReadyAt: number | null;
  mainThreadLongTasks: Array<{ startTime: number; duration: number }>;
}

let timingData: GridTimingData = createFreshTiming();

function createFreshTiming(): GridTimingData {
  return {
    navStart: typeof performance !== 'undefined' ? performance.timeOrigin : 0,
    productsDataSource: 'unknown',
    productsLoadStartAt: null,
    productsLoadEndAt: null,
    categoryFilterStartAt: null,
    categoryFilterEndAt: null,
    gridSkeletonMountedAt: null,
    gridFirstItemRenderedAt: null,
    firstCardTextPaintAt: null,
    firstGridImageRequestStartAt: null,
    firstGridImageLoadAt: null,
    firstGridImageDecodedAt: null,
    fontsReadyAt: null,
    mainThreadLongTasks: [],
  };
}

function now(): number {
  return performance.now();
}

export function resetGridTiming() {
  timingData = createFreshTiming();
  startFontTracking();
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
  }
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
