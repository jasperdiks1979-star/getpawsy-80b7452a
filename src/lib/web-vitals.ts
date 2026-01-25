// Web Vitals monitoring utility for real-time performance tracking
// Uses the web-vitals library pattern for Core Web Vitals

interface Metric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

type MetricHandler = (metric: Metric) => void;

// Thresholds based on Google's Core Web Vitals
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
  if (!threshold) return 'good';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

// Store metrics for dashboard access
const metricsStore: Map<string, Metric> = new Map();

export function getStoredMetrics(): Metric[] {
  return Array.from(metricsStore.values());
}

// Observe Largest Contentful Paint
export function observeLCP(handler: MetricHandler): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const po = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
      
      const metric: Metric = {
        name: 'LCP',
        value: lastEntry.startTime,
        rating: getRating('LCP', lastEntry.startTime),
        delta: lastEntry.startTime,
        id: `lcp-${Date.now()}`,
      };
      
      metricsStore.set('LCP', metric);
      handler(metric);
    });
    
    po.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {
    console.debug('LCP observation not supported');
  }
}

// Observe First Input Delay
export function observeFID(handler: MetricHandler): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const po = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const firstEntry = entries[0] as PerformanceEventTiming;
      
      const metric: Metric = {
        name: 'FID',
        value: firstEntry.processingStart - firstEntry.startTime,
        rating: getRating('FID', firstEntry.processingStart - firstEntry.startTime),
        delta: firstEntry.processingStart - firstEntry.startTime,
        id: `fid-${Date.now()}`,
      };
      
      metricsStore.set('FID', metric);
      handler(metric);
    });
    
    po.observe({ type: 'first-input', buffered: true });
  } catch (e) {
    console.debug('FID observation not supported');
  }
}

// Observe Cumulative Layout Shift
export function observeCLS(handler: MetricHandler): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  let clsValue = 0;
  let clsEntries: PerformanceEntry[] = [];

  try {
    const po = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        // Only count layout shifts without recent input
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
          clsEntries.push(entry);
        }
      }
      
      const metric: Metric = {
        name: 'CLS',
        value: clsValue,
        rating: getRating('CLS', clsValue),
        delta: clsValue,
        id: `cls-${Date.now()}`,
      };
      
      metricsStore.set('CLS', metric);
      handler(metric);
    });
    
    po.observe({ type: 'layout-shift', buffered: true });
  } catch (e) {
    console.debug('CLS observation not supported');
  }
}

// Observe First Contentful Paint
export function observeFCP(handler: MetricHandler): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const po = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const fcpEntry = entries.find(e => e.name === 'first-contentful-paint');
      
      if (fcpEntry) {
        const metric: Metric = {
          name: 'FCP',
          value: fcpEntry.startTime,
          rating: getRating('FCP', fcpEntry.startTime),
          delta: fcpEntry.startTime,
          id: `fcp-${Date.now()}`,
        };
        
        metricsStore.set('FCP', metric);
        handler(metric);
      }
    });
    
    po.observe({ type: 'paint', buffered: true });
  } catch (e) {
    console.debug('FCP observation not supported');
  }
}

// Observe Time to First Byte
export function observeTTFB(handler: MetricHandler): void {
  if (typeof window === 'undefined') return;

  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (navEntry) {
      const ttfb = navEntry.responseStart - navEntry.requestStart;
      
      const metric: Metric = {
        name: 'TTFB',
        value: ttfb,
        rating: getRating('TTFB', ttfb),
        delta: ttfb,
        id: `ttfb-${Date.now()}`,
      };
      
      metricsStore.set('TTFB', metric);
      handler(metric);
    }
  } catch (e) {
    console.debug('TTFB observation not supported');
  }
}

// Initialize all Web Vitals observers
export function initWebVitals(handler: MetricHandler = console.debug): void {
  observeLCP(handler);
  observeFID(handler);
  observeCLS(handler);
  observeFCP(handler);
  observeTTFB(handler);
}

// Format metric value for display
export function formatMetricValue(name: string, value: number): string {
  if (name === 'CLS') {
    return value.toFixed(3);
  }
  return `${Math.round(value)}ms`;
}

// Get color for rating
export function getRatingColor(rating: 'good' | 'needs-improvement' | 'poor'): string {
  switch (rating) {
    case 'good': return 'text-green-600';
    case 'needs-improvement': return 'text-yellow-600';
    case 'poor': return 'text-red-600';
  }
}

export type { Metric, MetricHandler };
