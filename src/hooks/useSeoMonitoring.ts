import { useState, useEffect, useCallback } from 'react';
import { fetchGSCMetricsForGuides, type GSCFetchResult } from '@/lib/gsc';
import { generateMonitoringAlerts, calculatePriorityScores, detectUnsupportedPages, generateWeeklySummary, type MonitoringAlert, type GuidePriorityScore, type WeeklySummary } from '@/lib/seo-monitoring';

export interface UseSeoMonitoringResult {
  gscResult: GSCFetchResult | null;
  priorityScores: GuidePriorityScore[];
  alerts: MonitoringAlert[];
  unsupportedPages: string[];
  weeklySummary: WeeklySummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSeoMonitoring(): UseSeoMonitoringResult {
  const [gscResult, setGscResult] = useState<GSCFetchResult | null>(null);
  const [priorityScores, setPriorityScores] = useState<GuidePriorityScore[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [unsupportedPages, setUnsupportedPages] = useState<string[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gsc = await fetchGSCMetricsForGuides();
      setGscResult(gsc);

      if (gsc.status === 'active' && gsc.reports) {
        // For now, use a simple inbound link map (in production, this would come from DB)
        const internalLinkMap: Record<string, number> = {};
        gsc.reports.forEach(r => {
          internalLinkMap[r.slug] = Math.floor(Math.random() * 8) + 1; // Placeholder
        });

        const scores = calculatePriorityScores(gsc.reports, internalLinkMap);
        const generatedAlerts = generateMonitoringAlerts(gsc.reports);
        const unsupported = detectUnsupportedPages(gsc.reports, internalLinkMap);
        const summary = generateWeeklySummary(scores);

        setPriorityScores(scores);
        setAlerts(generatedAlerts);
        setUnsupportedPages(unsupported);
        setWeeklySummary(summary);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
      console.error('[SEO Monitoring] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    gscResult,
    priorityScores,
    alerts,
    unsupportedPages,
    weeklySummary,
    loading,
    error,
    refetch: loadData,
  };
}
