/**
 * Grid timing instrumentation for LCP diagnostics.
 * 
 * Captures precise timestamps for:
 * - Skeleton mount
 * - Data fetch start/end
 * - First product card rendered
 * - Long tasks during boot
 * 
 * All timestamps are relative to navigationStart for consistency.
 */

export interface GridTimingData {
  navStart: number;
  productsDataSource: 'cache' | 'remote' | 'category-fast' | 'unknown';
  productsLoadStartAt: number | null;
  productsLoadEndAt: number | null;
  categoryFilterStartAt: number | null;
  categoryFilterEndAt: number | null;
  gridSkeletonMountedAt: number | null;
  gridFirstItemRenderedAt: number | null;
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
    mainThreadLongTasks: [],
  };
}

function now(): number {
  return performance.now();
}

export function resetGridTiming() {
  timingData = createFreshTiming();
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
  }
}

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
