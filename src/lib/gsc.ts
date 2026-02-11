/**
 * Google Search Console Data Fetcher
 * 
 * Fetches synced GSC data from keyword_rankings table (populated by edge function).
 * Provides structured reports per guide slug with proper loading/empty states.
 */

import { supabase } from '@/integrations/supabase/client';

// ============= TYPES =============

export interface GSCPageMetrics {
  page: string;
  slug: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  period: '7d' | '28d' | '90d';
}

export interface GSCQueryMetrics {
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface GSCGuideReport {
  slug: string;
  periods: {
    '7d': GSCPageMetrics | null;
    '28d': GSCPageMetrics | null;
    '90d': GSCPageMetrics | null;
  };
  topQueries: GSCQueryMetrics[];
  delta7d: {
    impressions: number;
    clicks: number;
    ctr: number;
    position: number;
  } | null;
}

export type GSCDataStatus = 'loading' | 'no_sync' | 'no_data' | 'ready' | 'active';

export interface GSCOptimizationFlag {
  slug: string;
  flag: 'rank_boost_candidate' | 'ctr_optimization_required' | 'indexing_boost';
  reason: string;
  impressions: number;
  position: number;
  ctr: number;
}

export interface GSCFetchResult {
  reports: GSCGuideReport[];
  status: GSCDataStatus;
  statusMessage: string;
  lastSyncedAt: string | null;
  totalRows: number;
  sitewide?: {
    totalImpressions: number;
    totalClicks: number;
    avgPosition: number;
    totalGuidesWithData: number;
    totalQueries: number;
  };
  optimizationFlags?: GSCOptimizationFlag[];
}

// ============= DATA FETCHING =============

/**
 * Fetch GSC metrics from the keyword_rankings table.
 * Returns structured data with explicit status for dashboard display.
 */
export async function fetchGSCMetricsForGuides(): Promise<GSCFetchResult> {
  // Fetch all rows with a slug (guide-level data)
  const { data: allRankings, error } = await supabase
    .from('keyword_rankings')
    .select('keyword, slug, impressions, clicks, ctr, position, tracked_date, last_synced_at')
    .not('slug', 'is', null)
    .order('tracked_date', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('[GSC] Fetch error:', error);
    return {
      reports: [],
      status: 'no_sync',
      statusMessage: `Database error: ${error.message}`,
      lastSyncedAt: null,
      totalRows: 0,
    };
  }

  if (!allRankings || allRankings.length === 0) {
    return {
      reports: [],
      status: 'no_sync',
      statusMessage: 'No GSC data synced yet. Click "Force GSC Sync" to fetch data from Google Search Console.',
      lastSyncedAt: null,
      totalRows: 0,
    };
  }

  // Get last sync timestamp
  const lastSyncedAt = allRankings
    .filter(r => r.last_synced_at)
    .sort((a, b) => new Date(b.last_synced_at!).getTime() - new Date(a.last_synced_at!).getTime())[0]?.last_synced_at || null;

  // Group by slug
  const slugMap = new Map<string, typeof allRankings>();
  for (const row of allRankings) {
    if (!row.slug) continue;
    if (!slugMap.has(row.slug)) slugMap.set(row.slug, []);
    slugMap.get(row.slug)!.push(row);
  }

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const d14 = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];
  const d28 = new Date(now.getTime() - 28 * 86400000).toISOString().split('T')[0];

  const reports: GSCGuideReport[] = [];

  for (const [slug, rows] of slugMap) {
    // Separate slug-level aggregates (keyword === slug) from query-level data
    const slugRows = rows.filter(r => r.keyword === slug);
    const queryRows = rows.filter(r => r.keyword !== slug);

    // Use the most recent slug-level aggregate for metrics
    const latestSlug = slugRows[0]; // already sorted desc

    const buildPeriodMetrics = (periodRows: typeof slugRows, period: '7d' | '28d' | '90d'): GSCPageMetrics | null => {
      if (!periodRows || periodRows.length === 0) return null;
      // Sum across period
      const totalImpr = periodRows.reduce((s, r) => s + (r.impressions || 0), 0);
      const totalClicks = periodRows.reduce((s, r) => s + (r.clicks || 0), 0);
      const avgPos = periodRows.reduce((s, r) => s + (r.position || 0), 0) / periodRows.length;
      return {
        page: `/guides/${slug}/`,
        slug,
        impressions: totalImpr,
        clicks: totalClicks,
        ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
        avgPosition: Math.round(avgPos * 10) / 10,
        period,
      };
    };

    // For guide-level, just use latest row data
    const current7d = latestSlug ? {
      page: `/guides/${slug}/`,
      slug,
      impressions: latestSlug.impressions || 0,
      clicks: latestSlug.clicks || 0,
      ctr: latestSlug.ctr ? latestSlug.ctr * 100 : 0,
      avgPosition: latestSlug.position || 0,
      period: '7d' as const,
    } : null;

    // 28d: aggregate all slug-level rows in last 28 days
    const rows28d = slugRows.filter(r => r.tracked_date >= d28);
    const metrics28d = buildPeriodMetrics(rows28d, '28d');

    // Top queries from query-level data
    const topQueries: GSCQueryMetrics[] = queryRows
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 10)
      .map(r => ({
        query: r.keyword,
        page: `/guides/${slug}/`,
        impressions: r.impressions || 0,
        clicks: r.clicks || 0,
        ctr: (r.ctr || 0) * 100,
        position: r.position || 0,
      }));

    reports.push({
      slug,
      periods: {
        '7d': current7d,
        '28d': metrics28d,
        '90d': null,
      },
      topQueries,
      delta7d: null, // Will compute once we have multiple sync points
    });
  }

  // Compute sitewide metrics
  const totalImpressions = reports.reduce((s, r) => s + (r.periods['7d']?.impressions || 0), 0);
  const totalClicks = reports.reduce((s, r) => s + (r.periods['7d']?.clicks || 0), 0);
  const positionValues = reports.filter(r => r.periods['7d']?.avgPosition).map(r => r.periods['7d']!.avgPosition);
  const avgPosition = positionValues.length > 0 ? Math.round((positionValues.reduce((s, p) => s + p, 0) / positionValues.length) * 10) / 10 : 0;
  const totalQueries = reports.reduce((s, r) => s + r.topQueries.length, 0);

  // Generate optimization flags
  const optimizationFlags: GSCOptimizationFlag[] = [];
  for (const report of reports) {
    const d7 = report.periods['7d'];
    if (!d7) {
      optimizationFlags.push({ slug: report.slug, flag: 'indexing_boost', reason: 'No impressions — needs internal link boost or indexing', impressions: 0, position: 0, ctr: 0 });
      continue;
    }
    if (d7.impressions > 100 && d7.avgPosition >= 8 && d7.avgPosition <= 20) {
      optimizationFlags.push({ slug: report.slug, flag: 'rank_boost_candidate', reason: `Position ${d7.avgPosition} with ${d7.impressions} impressions — push to top 5`, impressions: d7.impressions, position: d7.avgPosition, ctr: d7.ctr });
    }
    if (d7.impressions > 300 && d7.ctr < 2) {
      optimizationFlags.push({ slug: report.slug, flag: 'ctr_optimization_required', reason: `CTR ${d7.ctr.toFixed(2)}% with ${d7.impressions} impressions — title/meta optimization needed`, impressions: d7.impressions, position: d7.avgPosition, ctr: d7.ctr });
    }
    if (d7.impressions === 0) {
      optimizationFlags.push({ slug: report.slug, flag: 'indexing_boost', reason: 'Zero impressions despite being indexed', impressions: 0, position: d7.avgPosition, ctr: 0 });
    }
  }

  const isActive = reports.length > 0 && totalImpressions > 0;

  return {
    reports,
    status: isActive ? 'active' : reports.length > 0 ? 'ready' : 'no_data',
    statusMessage: isActive
      ? `ACTIVE — ${reports.length} guides synced, ${totalImpressions} impressions, avg position ${avgPosition}`
      : reports.length > 0
      ? `${reports.length} guides with GSC data`
      : 'GSC data synced but no guide pages matched. Ensure guides are indexed.',
    lastSyncedAt,
    totalRows: allRankings.length,
    sitewide: {
      totalImpressions,
      totalClicks,
      avgPosition,
      totalGuidesWithData: reports.length,
      totalQueries,
    },
    optimizationFlags,
  };
}
/**
 * Trigger a manual GSC sync via the edge function.
 */
export async function triggerGSCSync(): Promise<{
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, message: 'Not authenticated. Please log in first.' };
  }

  const response = await supabase.functions.invoke('fetch-keyword-rankings', {
    body: { action: 'sync' },
  });

  if (response.error) {
    return {
      success: false,
      message: `Sync failed: ${response.error.message}`,
    };
  }

  return {
    success: true,
    message: response.data?.message || `Synced ${response.data?.count || 0} guide slugs, ${response.data?.queryCount || 0} queries`,
    data: response.data,
  };
}

// ============= GSC DIAGNOSTIC =============

export interface GSCDiagnosticResult {
  status: 'OK' | 'NO_DATA' | 'ERROR';
  property: string;
  propertyType: string;
  serviceAccountEmail: string;
  connected: boolean;
  rowsFetched?: number;
  dateRange?: { start: string; end: string };
  sampleRows?: Array<{ page: string; impressions: number; clicks: number; position: number }>;
  issue?: string;
  fix_recommendation?: string;
  possible_causes?: string[];
}

/**
 * Run GSC diagnostic test — validates connection, property, and returns sample data.
 */
export async function runGSCDiagnostic(): Promise<GSCDiagnosticResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      status: 'ERROR',
      property: 'sc-domain:getpawsy.pet',
      propertyType: 'DOMAIN',
      serviceAccountEmail: 'unknown',
      connected: false,
      issue: 'Not authenticated',
      fix_recommendation: 'Log in as admin first.',
    };
  }

  const response = await supabase.functions.invoke('fetch-keyword-rankings', {
    body: { action: 'gsc_diagnostic' },
  });

  if (response.error) {
    return {
      status: 'ERROR',
      property: 'sc-domain:getpawsy.pet',
      propertyType: 'DOMAIN',
      serviceAccountEmail: 'unknown',
      connected: false,
      issue: response.error.message,
      fix_recommendation: 'Check edge function logs for details.',
    };
  }

  return response.data as GSCDiagnosticResult;
}
