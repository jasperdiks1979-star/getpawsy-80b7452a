import { useState, useEffect, useCallback } from 'react';
import { 
  initWebVitals, 
  getStoredMetrics, 
  type Metric 
} from '@/lib/web-vitals';

export function useWebVitals() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleMetric = useCallback((metric: Metric) => {
    setMetrics(prev => {
      const existingIndex = prev.findIndex(m => m.name === metric.name);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = metric;
        return updated;
      }
      return [...prev, metric];
    });
  }, []);

  useEffect(() => {
    // Initialize Web Vitals tracking
    initWebVitals(handleMetric);
    
    // Load any already collected metrics
    const stored = getStoredMetrics();
    if (stored.length > 0) {
      setMetrics(stored);
    }
    
    setIsLoading(false);
  }, [handleMetric]);

  const getMetric = useCallback((name: string): Metric | undefined => {
    return metrics.find(m => m.name === name);
  }, [metrics]);

  const getOverallScore = useCallback((): number => {
    if (metrics.length === 0) return 0;
    
    const weights = {
      LCP: 0.25,
      FID: 0.25,
      CLS: 0.25,
      FCP: 0.15,
      TTFB: 0.10,
    };

    let totalWeight = 0;
    let weightedScore = 0;

    metrics.forEach(metric => {
      const weight = weights[metric.name as keyof typeof weights] || 0;
      const score = metric.rating === 'good' ? 100 : metric.rating === 'needs-improvement' ? 50 : 0;
      weightedScore += score * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  }, [metrics]);

  return {
    metrics,
    isLoading,
    getMetric,
    getOverallScore,
  };
}
