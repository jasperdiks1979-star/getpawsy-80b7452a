import { useState, useEffect, useCallback } from 'react';
import { fetchGSCMetricsForGuides, type GSCFetchResult } from '@/lib/gsc';
import {
  generateAlerts,
  calculatePriority,
  generateTop20Playbooks,
  generateWeeklyReport,
  type DecisionAlert,
  type PriorityPage,
  type Top20Playbook,
  type WeeklyReport,
} from '@/lib/seo-decision-engine';

export interface UseSeoDashboardResult {
  gscResult: GSCFetchResult | null;
  priorityPages: PriorityPage[];
  alerts: DecisionAlert[];
  playbooks: Top20Playbook[];
  weeklyReport: WeeklyReport | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSeoDashboard(): UseSeoDashboardResult {
  const [gscResult, setGscResult] = useState<GSCFetchResult | null>(null);
  const [priorityPages, setPriorityPages] = useState<PriorityPage[]>([]);
  const [alerts, setAlerts] = useState<DecisionAlert[]>([]);
  const [playbooks, setPlaybooks] = useState<Top20Playbook[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gsc = await fetchGSCMetricsForGuides();
      setGscResult(gsc);

      if ((gsc.status === 'active' || gsc.status === 'ready') && gsc.reports.length > 0) {
        // Placeholder link map (production: fetch from DB)
        const linkMap: Record<string, number> = {};
        gsc.reports.forEach(r => {
          linkMap[r.slug] = Math.floor(Math.random() * 8) + 1;
        });

        const pages = calculatePriority(gsc.reports, linkMap);
        const allAlerts = generateAlerts(gsc.reports, linkMap);
        const top20 = generateTop20Playbooks(gsc.reports);
        const report = generateWeeklyReport(pages);

        setPriorityPages(pages);
        setAlerts(allAlerts);
        setPlaybooks(top20);
        setWeeklyReport(report);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      console.error('[SEO Dashboard] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return { gscResult, priorityPages, alerts, playbooks, weeklyReport, loading, error, refetch: loadData };
}
