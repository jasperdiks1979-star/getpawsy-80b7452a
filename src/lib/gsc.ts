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

export type GSCDataStatus = 'loading' | 'no_sync' | 'no_data' | 'ready' | 'active' | 'error';

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

export interface GSCSyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  reason: string;
  status: string;
  days: number;
  guide_count: number;
  rows_upserted: number;
  pages_with_data: number;
  total_impressions: number;
  total_clicks: number;
  total_raw_rows: number;
  unmatched_rows: number;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

export interface GSCSyncSettings {
  auto_sync_enabled: boolean;
  sync_hour: number;
  sync_minute: number;
  updated_at: string;
}

// ============= DATA FETCHING =============

export async function fetchGSCMetricsForGuides(): Promise<GSCFetchResult> {
  // Check last sync run status from edge function
  let lastSyncRun: GSCSyncRun | null = null;
  try {
    const runsResponse = await supabase.functions.invoke('fetch-keyword-rankings', {
      body: { action: 'get_sync_runs', limit: 1 },
    });
    const runs = (runsResponse.data?.runs || []) as GSCSyncRun[];
    lastSyncRun = runs[0] || null;
  } catch {
    // Ignore — will show no_sync status
  }

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
      status: 'error',
      statusMessage: `Database error: ${error.message}`,
      lastSyncedAt: null,
      totalRows: 0,
    };
  }

  if (!allRankings || allRankings.length === 0) {
    // Determine status based on last sync run
    let status: GSCDataStatus = 'no_sync';
    let statusMessage = 'No GSC data synced yet. Click "Force GSC Sync" to fetch data.';

    if (lastSyncRun) {
      if (lastSyncRun.status === 'error') {
        status = 'error';
        statusMessage = `Last sync failed: ${lastSyncRun.error_message || 'Unknown error'}`;
      } else if (lastSyncRun.total_raw_rows > 0 && lastSyncRun.guide_count === 0) {
        // GSC returned rows but none matched guides — guides aren't indexed yet
        status = 'no_data';
        statusMessage = `WAITING FOR INDEXING — GSC returned ${lastSyncRun.total_raw_rows} rows but 0 matched guide pages. Guide URLs (/guides/*) are not yet indexed by Google. Ensure sitemap is submitted and recheck in 24–72h.`;
      } else if (lastSyncRun.status === 'no_data') {
        status = 'no_data';
        statusMessage = 'Sync ran but GSC returned no data at all. Domain may be too new.';
      } else if (lastSyncRun.status === 'success' && lastSyncRun.guide_count === 0) {
        status = 'no_data';
        statusMessage = 'WAITING FOR INDEXING — Sync succeeded but no guide URLs found in GSC. Submit sitemap and recheck in 24–72h.';
      }
    }

    return {
      reports: [],
      status,
      statusMessage,
      lastSyncedAt: lastSyncRun?.finished_at || null,
      totalRows: 0,
    };
  }

  const lastSyncedAt = allRankings
    .filter(r => r.last_synced_at)
    .sort((a, b) => new Date(b.last_synced_at!).getTime() - new Date(a.last_synced_at!).getTime())[0]?.last_synced_at || null;

  const slugMap = new Map<string, typeof allRankings>();
  for (const row of allRankings) {
    if (!row.slug) continue;
    if (!slugMap.has(row.slug)) slugMap.set(row.slug, []);
    slugMap.get(row.slug)!.push(row);
  }

  const d28 = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];

  const reports: GSCGuideReport[] = [];

  for (const [slug, rows] of slugMap) {
    const slugRows = rows.filter(r => r.keyword === slug);
    const queryRows = rows.filter(r => r.keyword !== slug);
    const latestSlug = slugRows[0];

    const buildPeriodMetrics = (periodRows: typeof slugRows, period: '7d' | '28d' | '90d'): GSCPageMetrics | null => {
      if (!periodRows || periodRows.length === 0) return null;
      const totalImpr = periodRows.reduce((s, r) => s + (r.impressions || 0), 0);
      const totalClicks = periodRows.reduce((s, r) => s + (r.clicks || 0), 0);
      const avgPos = periodRows.reduce((s, r) => s + (r.position || 0), 0) / periodRows.length;
      return {
        page: `/${slug}`, slug,
        impressions: totalImpr, clicks: totalClicks,
        ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
        avgPosition: Math.round(avgPos * 10) / 10, period,
      };
    };

    const current7d = latestSlug ? {
      page: `/${slug}`, slug,
      impressions: latestSlug.impressions || 0,
      clicks: latestSlug.clicks || 0,
      ctr: latestSlug.ctr ? latestSlug.ctr * 100 : 0,
      avgPosition: latestSlug.position || 0,
      period: '7d' as const,
    } : null;

    const rows28d = slugRows.filter(r => r.tracked_date >= d28);
    const metrics28d = buildPeriodMetrics(rows28d, '28d');

    const topQueries: GSCQueryMetrics[] = queryRows
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 10)
      .map(r => ({
        query: r.keyword, page: `/${slug}`,
        impressions: r.impressions || 0, clicks: r.clicks || 0,
        ctr: (r.ctr || 0) * 100, position: r.position || 0,
      }));

    reports.push({
      slug,
      periods: { '7d': current7d, '28d': metrics28d, '90d': null },
      topQueries,
      delta7d: null,
    });
  }

  const totalImpressions = reports.reduce((s, r) => s + (r.periods['7d']?.impressions || 0), 0);
  const totalClicks = reports.reduce((s, r) => s + (r.periods['7d']?.clicks || 0), 0);
  const positionValues = reports.filter(r => r.periods['7d']?.avgPosition).map(r => r.periods['7d']!.avgPosition);
  const avgPosition = positionValues.length > 0 ? Math.round((positionValues.reduce((s, p) => s + p, 0) / positionValues.length) * 10) / 10 : 0;
  const totalQueries = reports.reduce((s, r) => s + r.topQueries.length, 0);

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
      : 'GSC data synced but no guide pages matched.',
    lastSyncedAt,
    totalRows: allRankings.length,
    sitewide: {
      totalImpressions, totalClicks, avgPosition,
      totalGuidesWithData: reports.length, totalQueries,
    },
    optimizationFlags,
  };
}

// ============= SYNC TRIGGER =============

export async function triggerGSCSync(): Promise<{
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, message: 'Not authenticated. Please log in first.', data: { ok: false, stage: 'auth', error: 'No session' } };
  }

  try {
    console.log('[GSC Sync] Frontend: invoking fetch-keyword-rankings with action=sync');
    const response = await supabase.functions.invoke('fetch-keyword-rankings', {
      body: { action: 'sync' },
    });

    console.log('[GSC Sync] Frontend: response error=', response.error, 'data=', response.data);

    if (response.error) {
      return {
        success: false,
        message: `Sync failed: ${response.error.message}`,
        data: { ok: false, stage: 'invoke', error: response.error.message },
      };
    }

    const d = response.data || {};
    const guideCount = d.count || 0;
    const queryCount = d.queryCount || 0;
    const totalRaw = d.totalRawRows || 0;
    const unmatched = d.unmatchedRows || 0;
    const totalImpressions = d.totalImpressions || 0;
    const totalClicks = d.totalClicks || 0;

    const debugWarning = d.debug?.warning || null;
    const knownGuides = d.knownGuideCount || 0;
    const topPrefixes = d.debug?.topUnmatchedPrefixes?.map((p: { prefix: string; count: number }) => `${p.prefix}(${p.count})`).join(', ') || '';

    const msg = guideCount > 0
      ? `✅ Synced ${guideCount} guide slugs, ${queryCount} queries (${totalImpressions} impressions, ${totalClicks} clicks)`
      : totalRaw > 0
        ? `⏳ WAITING FOR INDEXING — GSC returned ${totalRaw} rows but 0 matched guide URLs. Top patterns: ${topPrefixes || 'N/A'}. Guide pages (/guides/*) are not yet indexed. Ensure sitemap is submitted in Google Search Console and recheck in 24–72h.`
        : `⚠️ GSC returned 0 rows. Domain may be too new or service account lacks access.`;

    return {
      success: guideCount > 0,
      message: msg,
      data: d,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[GSC Sync] Frontend exception:', errMsg);
    return {
      success: false,
      message: `Sync exception: ${errMsg}`,
      data: { ok: false, stage: 'exception', error: errMsg },
    };
  }
}

// ============= SYNC RUNS =============

export async function fetchSyncRuns(limit = 10): Promise<GSCSyncRun[]> {
  const response = await supabase.functions.invoke('fetch-keyword-rankings', {
    body: { action: 'get_sync_runs', limit },
  });
  if (response.error) {
    console.error('[GSC] Failed to fetch sync runs:', response.error);
    return [];
  }
  return (response.data?.runs || []) as GSCSyncRun[];
}

// ============= SYNC SETTINGS =============

export async function fetchSyncSettings(): Promise<GSCSyncSettings> {
  const response = await supabase.functions.invoke('fetch-keyword-rankings', {
    body: { action: 'get_sync_settings' },
  });
  return (response.data?.settings || { auto_sync_enabled: true, sync_hour: 3, sync_minute: 30, updated_at: '' }) as GSCSyncSettings;
}

export async function updateSyncSettings(autoSyncEnabled: boolean): Promise<boolean> {
  const response = await supabase.functions.invoke('fetch-keyword-rankings', {
    body: { action: 'update_sync_settings', auto_sync_enabled: autoSyncEnabled },
  });
  return response.data?.ok === true;
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

export async function runGSCDiagnostic(): Promise<GSCDiagnosticResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      status: 'ERROR', property: 'sc-domain:getpawsy.pet', propertyType: 'DOMAIN',
      serviceAccountEmail: 'unknown', connected: false,
      issue: 'Not authenticated', fix_recommendation: 'Log in as admin first.',
    };
  }

  const response = await supabase.functions.invoke('fetch-keyword-rankings', {
    body: { action: 'gsc_diagnostic' },
  });

  if (response.error) {
    return {
      status: 'ERROR', property: 'sc-domain:getpawsy.pet', propertyType: 'DOMAIN',
      serviceAccountEmail: 'unknown', connected: false,
      issue: response.error.message, fix_recommendation: 'Check edge function logs for details.',
    };
  }

  return response.data as GSCDiagnosticResult;
}
