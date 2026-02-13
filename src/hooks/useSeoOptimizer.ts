import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { fetchGSCMetricsForGuides, type GSCFetchResult } from '@/lib/gsc';
import { runAutoOptimizer, type AutoOptimizerReport, type OptimizationSuggestion } from '@/lib/seo-auto-optimizer';

export interface SeoOptLogRow {
  id: string;
  slug: string;
  trigger_type: string;
  action_type: string;
  action_details: Record<string, unknown>;
  metrics_snapshot: Record<string, unknown>;
  status: string;
  applied_at: string | null;
  created_at: string;
}

export function useSeoOptimizer() {
  const [gscResult, setGscResult] = useState<GSCFetchResult | null>(null);
  const [report, setReport] = useState<AutoOptimizerReport | null>(null);
  const [logs, setLogs] = useState<SeoOptLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch GSC data and recent change counts in parallel
      const [gsc, logsRes] = await Promise.all([
        fetchGSCMetricsForGuides(),
        supabase
          .from('seo_optimization_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      setGscResult(gsc);

      const logRows = (logsRes.data || []) as unknown as SeoOptLogRow[];
      setLogs(logRows);

      // Count recent changes per slug (last 14 days)
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
      const recentChanges = new Map<string, number>();
      for (const log of logRows) {
        if (log.status === 'applied' && log.created_at >= fourteenDaysAgo) {
          recentChanges.set(log.slug, (recentChanges.get(log.slug) || 0) + 1);
        }
      }

      const optimizerReport = runAutoOptimizer(gsc.reports, recentChanges);
      setReport(optimizerReport);
    } catch (err) {
      console.error('[SEO Optimizer] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveSuggestion = async (suggestion: OptimizationSuggestion) => {
    const row = {
      slug: suggestion.slug,
      trigger_type: suggestion.triggerType,
      action_type: suggestion.actionType,
      action_details: JSON.parse(JSON.stringify(suggestion.actionDetails)) as Json,
      metrics_snapshot: JSON.parse(JSON.stringify(suggestion.metricsSnapshot)) as Json,
      status: 'suggested' as const,
    };
    const { error } = await supabase.from('seo_optimization_log').insert([row]);
    if (!error) await loadData();
    return !error;
  };

  const updateStatus = async (id: string, status: 'applied' | 'dismissed' | 'reverted') => {
    const update: Record<string, unknown> = { status };
    if (status === 'applied') update.applied_at = new Date().toISOString();
    const { error } = await supabase.from('seo_optimization_log').update(update).eq('id', id);
    if (!error) await loadData();
    return !error;
  };

  return { gscResult, report, logs, loading, loadData, saveSuggestion, updateStatus };
}
