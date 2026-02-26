/**
 * Performance Budget Enforcer — compares runtime metrics against budget.
 *
 * Reads performance entries after load and compares to thresholds
 * defined in performance-budget.json.
 *
 * Dev/preview only — zero production cost.
 */

// Budget thresholds (inlined to avoid dynamic import of JSON at runtime)
const BUDGET = {
  LCP: 3000,
  CLS: 0.10,
  TBT: 300,
  FCP: 2000,
  JS_total_kb: 220,
  Largest_chunk_kb: 120,
};

export interface BudgetResult {
  metric: string;
  value: number;
  budget: number;
  exceeded: boolean;
  unit: string;
}

export function getBudgetResults(): BudgetResult[] {
  return budgetResults.slice();
}

let budgetResults: BudgetResult[] = [];

function checkMetric(metric: string, value: number, budget: number, unit: string): BudgetResult {
  const result = { metric, value: Math.round(value * 100) / 100, budget, exceeded: value > budget, unit };
  budgetResults.push(result);
  return result;
}

export function runBudgetCheck(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;

  const run = () => {
    budgetResults = [];
    const violations: BudgetResult[] = [];

    // FCP
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
    if (fcpEntry) {
      const r = checkMetric('FCP', fcpEntry.startTime, BUDGET.FCP, 'ms');
      if (r.exceeded) violations.push(r);
    }

    // LCP — read from __LCP_GUARD__ if available
    const lcpVal = (window as any).__LCP_GUARD__?.lcp;
    if (typeof lcpVal === 'number' && lcpVal > 0) {
      const r = checkMetric('LCP', lcpVal, BUDGET.LCP, 'ms');
      if (r.exceeded) violations.push(r);
    }

    // CLS — read from __CLS__
    const clsVal = (window as any).__CLS__;
    if (typeof clsVal === 'number') {
      const r = checkMetric('CLS', clsVal, BUDGET.CLS, '');
      if (r.exceeded) violations.push(r);
    }

    // TBT approximation via Long Tasks
    if ('PerformanceObserver' in window) {
      try {
        let tbt = 0;
        const longTasks = performance.getEntriesByType('longtask');
        for (const task of longTasks) {
          tbt += Math.max(0, task.duration - 50);
        }
        const r = checkMetric('TBT', tbt, BUDGET.TBT, 'ms');
        if (r.exceeded) violations.push(r);
      } catch {
        // longtask not available
      }
    }

    // JS bundle size — estimate from resource timing
    try {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      let totalJS = 0;
      let largestChunk = 0;

      for (const r of resources) {
        if (r.initiatorType === 'script' || r.name.endsWith('.js')) {
          const size = r.transferSize || r.encodedBodySize || 0;
          totalJS += size;
          largestChunk = Math.max(largestChunk, size);
        }
      }

      const totalKB = totalJS / 1024;
      const largestKB = largestChunk / 1024;

      const r1 = checkMetric('JS_total_kb', totalKB, BUDGET.JS_total_kb, 'KB');
      if (r1.exceeded) violations.push(r1);

      const r2 = checkMetric('Largest_chunk_kb', largestKB, BUDGET.Largest_chunk_kb, 'KB');
      if (r2.exceeded) violations.push(r2);
    } catch {
      // Resource timing not available
    }

    // Report violations
    if (violations.length) {
      console.warn(
        `⚠️ [PERF-BUDGET] ${violations.length} budget violation(s):\n` +
        violations
          .map(v => `  ${v.metric}: ${v.value}${v.unit} > ${v.budget}${v.unit}`)
          .join('\n')
      );
    }

    // Expose for panel
    if ((window as any).__CLS_GUARD__) {
      (window as any).__CLS_GUARD__.budgetResults = budgetResults;
    }
  };

  // Wait for load + stabilization
  if (document.readyState === 'complete') {
    setTimeout(run, 3000);
  } else {
    window.addEventListener('load', () => setTimeout(run, 3000), { once: true });
  }
}
