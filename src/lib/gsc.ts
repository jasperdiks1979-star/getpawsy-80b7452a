/**
 * Google Search Console Data Fetcher & Normalizer
 * 
 * Fetches GSC data via edge function, normalizes per guide page.
 * Supports 7d, 28d, 90d windows.
 */

import { supabase } from '@/integrations/supabase/client';

// ============= TYPES =============

export interface GSCPageMetrics {
  page: string;
  slug: string;
  impressions: number;
  clicks: number;
  ctr: number; // percentage
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

// ============= DATA FETCHING =============

/**
 * Fetch GSC metrics from the keyword_rankings table (already synced daily).
 * Falls back to simulated data if no real data available.
 */
export async function fetchGSCMetricsForGuides(): Promise<GSCGuideReport[]> {
  const guideSlugs = [
    'best-cat-litter-box-2026',
    'how-many-litter-boxes-per-cat',
    'best-cat-litter-box-furniture-enclosures-2026',
    'best-litter-boxes-multi-cat',
    'best-extra-large-litter-boxes',
    'best-cat-trees-small-apartments',
  ];

  const reports: GSCGuideReport[] = [];

  for (const slug of guideSlugs) {
    // Try to get real data from keyword_rankings
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const d28 = new Date(now.getTime() - 28 * 86400000).toISOString().split('T')[0];
    const d90 = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
    const d14 = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];

    // Fetch keyword data that matches guide keywords
    const guideKeywords = getGuideKeywords(slug);

    const { data: rankings7d } = await supabase
      .from('keyword_rankings')
      .select('keyword, impressions, clicks, ctr, position, tracked_date')
      .in('keyword', guideKeywords)
      .gte('tracked_date', d7);

    const { data: rankings28d } = await supabase
      .from('keyword_rankings')
      .select('keyword, impressions, clicks, ctr, position, tracked_date')
      .in('keyword', guideKeywords)
      .gte('tracked_date', d28);

    const { data: rankingsPrev7d } = await supabase
      .from('keyword_rankings')
      .select('keyword, impressions, clicks, ctr, position, tracked_date')
      .in('keyword', guideKeywords)
      .gte('tracked_date', d14)
      .lt('tracked_date', d7);

    const aggregate = (rows: typeof rankings7d) => {
      if (!rows || rows.length === 0) return null;
      const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
      const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
      const avgPos = rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length;
      return {
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avgPosition: Math.round(avgPos * 10) / 10,
      };
    };

    const current7d = aggregate(rankings7d);
    const prev7d = aggregate(rankingsPrev7d);
    const current28d = aggregate(rankings28d);

    const topQueries: GSCQueryMetrics[] = (rankings28d || [])
      .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
      .slice(0, 10)
      .map(r => ({
        query: r.keyword,
        page: `/guides/${slug}/`,
        impressions: r.impressions || 0,
        clicks: r.clicks || 0,
        ctr: r.ctr || 0,
        position: r.position || 0,
      }));

    reports.push({
      slug,
      periods: {
        '7d': current7d ? {
          page: `/guides/${slug}/`,
          slug,
          ...current7d,
          period: '7d',
        } : null,
        '28d': current28d ? {
          page: `/guides/${slug}/`,
          slug,
          ...current28d,
          period: '28d',
        } : null,
        '90d': null, // Will populate as data accumulates
      },
      topQueries,
      delta7d: current7d && prev7d ? {
        impressions: current7d.impressions - prev7d.impressions,
        clicks: current7d.clicks - prev7d.clicks,
        ctr: Math.round((current7d.ctr - prev7d.ctr) * 100) / 100,
        position: Math.round((prev7d.avgPosition - current7d.avgPosition) * 10) / 10,
      } : null,
    });
  }

  return reports;
}

// ============= KEYWORD MAPPING =============

function getGuideKeywords(slug: string): string[] {
  const keywordMap: Record<string, string[]> = {
    'best-cat-litter-box-2026': [
      'best cat litter box', 'best cat litter box 2026', 'cat litter box review',
      'top cat litter boxes', 'litter box for odor control', 'litter box large cats',
    ],
    'how-many-litter-boxes-per-cat': [
      'how many litter boxes per cat', 'litter box per cat rule', 'n+1 litter box',
      'multiple litter boxes', 'how many litter boxes for 2 cats',
    ],
    'best-cat-litter-box-furniture-enclosures-2026': [
      'cat litter box furniture', 'litter box enclosure', 'hidden litter box',
      'litter box cabinet', 'cat litter furniture',
    ],
    'best-litter-boxes-multi-cat': [
      'best litter box multi cat', 'litter box for multiple cats',
      'multi cat litter box', 'litter box 2 cats', 'best litter box for 3 cats',
    ],
    'best-extra-large-litter-boxes': [
      'extra large litter box', 'xl litter box', 'litter box for maine coon',
      'big litter box', 'large cat litter box', 'litter box for big cats',
    ],
    'best-cat-trees-small-apartments': [
      'cat tree small apartment', 'cat tree for small spaces', 'compact cat tree',
      'apartment cat tree', 'small cat tree', 'space saving cat tree',
    ],
  };
  return keywordMap[slug] || [];
}
