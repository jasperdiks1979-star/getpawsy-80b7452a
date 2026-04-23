import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * useBotRenderSeoCorrelation
 *
 * Joins three signals to flag potential soft-404 SEO damage on PDPs:
 *   1. crawler_visits — bot user-agent + page URL (incl. `?_render=` tag from
 *      the PDP bot-render trace hook)
 *   2. crawler_visits — render state encoded as `_render=shell|rendered|timeout`
 *   3. keyword_rankings (GSC export) — impressions / clicks / position per slug
 *
 * Result rows are keyed by product slug so the admin can see, per page:
 *   - Which bots crawled it
 *   - How many shell / rendered / timeout events were logged
 *   - The current GSC performance (impressions, clicks, avg position)
 *   - A heuristic risk flag for soft-404 indexing
 */

const RENDER_STATES = ['shell', 'rendered', 'timeout'] as const;
export type RenderState = typeof RENDER_STATES[number];

export interface BotSeoRow {
  slug: string;
  pageUrl: string; // canonical /product/<slug>
  botTypes: string[];
  totalCrawls: number;
  shellCount: number;
  renderedCount: number;
  timeoutCount: number;
  shellPct: number;          // (shell + timeout) / totalRenderEvents
  lastCrawlAt: string | null;
  // GSC
  impressions: number;
  clicks: number;
  avgPosition: number | null;
  // Heuristic risk score 0-100 (higher = more soft-404 risk)
  softFourOhFourRisk: number;
  riskLabel: 'low' | 'medium' | 'high' | 'critical';
}

export interface BotSeoSummary {
  totalBotVisits: number;
  uniqueBots: number;
  totalShellEvents: number;
  totalRenderedEvents: number;
  totalTimeoutEvents: number;
  pagesAtRisk: number; // critical + high
}

export interface UseBotRenderSeoResult {
  rows: BotSeoRow[];
  summary: BotSeoSummary;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  windowDays: number;
  setWindowDays: (n: number) => void;
}

function parseSlugAndState(pageUrl: string): { slug: string | null; state: RenderState | null } {
  try {
    const u = new URL(pageUrl, 'https://getpawsy.pet');
    if (!u.pathname.startsWith('/product/')) return { slug: null, state: null };
    const slug = u.pathname.replace(/^\/product\//, '').split('/')[0] || null;
    const stateRaw = u.searchParams.get('_render');
    const state = (RENDER_STATES as readonly string[]).includes(stateRaw ?? '')
      ? (stateRaw as RenderState)
      : null;
    return { slug, state };
  } catch {
    return { slug: null, state: null };
  }
}

function computeRisk(shellPct: number, impressions: number, avgPosition: number | null): {
  score: number;
  label: BotSeoRow['riskLabel'];
} {
  // Heuristic:
  //   shellPct contributes up to 70 pts (linear)
  //   high impressions w/ poor position adds up to 30 pts
  let score = Math.round(shellPct * 70);
  if (impressions > 50 && avgPosition !== null && avgPosition > 20) {
    score += 20;
  } else if (impressions > 10 && avgPosition !== null && avgPosition > 30) {
    score += 10;
  }
  score = Math.min(100, Math.max(0, score));

  let label: BotSeoRow['riskLabel'] = 'low';
  if (score >= 75) label = 'critical';
  else if (score >= 50) label = 'high';
  else if (score >= 25) label = 'medium';

  return { score, label };
}

export function useBotRenderSeoCorrelation(initialWindowDays = 14): UseBotRenderSeoResult {
  const [rows, setRows] = useState<BotSeoRow[]>([]);
  const [summary, setSummary] = useState<BotSeoSummary>({
    totalBotVisits: 0,
    uniqueBots: 0,
    totalShellEvents: 0,
    totalRenderedEvents: 0,
    totalTimeoutEvents: 0,
    pagesAtRisk: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(initialWindowDays);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - windowDays * 86400000).toISOString();

      // 1. Bot crawls of /product/* in the window
      const { data: crawls, error: crawlErr } = await supabase
        .from('crawler_visits')
        .select('page_url, bot_type, is_googlebot, created_at')
        .ilike('page_url', '%/product/%')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (crawlErr) throw crawlErr;

      // 2. Aggregate per slug
      type Agg = {
        slug: string;
        botTypes: Set<string>;
        totalCrawls: number;
        shellCount: number;
        renderedCount: number;
        timeoutCount: number;
        lastCrawlAt: string | null;
      };
      const agg = new Map<string, Agg>();
      let totalBotVisits = 0;
      const allBots = new Set<string>();

      for (const row of crawls ?? []) {
        const { slug, state } = parseSlugAndState(row.page_url);
        if (!slug) continue;
        totalBotVisits += 1;
        if (row.bot_type) allBots.add(row.bot_type);

        let entry = agg.get(slug);
        if (!entry) {
          entry = {
            slug,
            botTypes: new Set<string>(),
            totalCrawls: 0,
            shellCount: 0,
            renderedCount: 0,
            timeoutCount: 0,
            lastCrawlAt: null,
          };
          agg.set(slug, entry);
        }
        entry.totalCrawls += 1;
        if (row.bot_type) entry.botTypes.add(row.bot_type);
        if (state === 'shell') entry.shellCount += 1;
        else if (state === 'rendered') entry.renderedCount += 1;
        else if (state === 'timeout') entry.timeoutCount += 1;
        if (!entry.lastCrawlAt || row.created_at > entry.lastCrawlAt) {
          entry.lastCrawlAt = row.created_at;
        }
      }

      // 3. Pull GSC metrics for the same slugs
      const slugs = Array.from(agg.keys());
      let gscBySlug = new Map<string, { impressions: number; clicks: number; positionSum: number; positionN: number }>();
      if (slugs.length > 0) {
        const { data: gsc, error: gscErr } = await supabase
          .from('keyword_rankings')
          .select('slug, impressions, clicks, position, tracked_date')
          .in('slug', slugs)
          .gte('tracked_date', new Date(Date.now() - windowDays * 86400000).toISOString().split('T')[0])
          .limit(5000);
        if (gscErr) throw gscErr;

        for (const r of gsc ?? []) {
          if (!r.slug) continue;
          const e = gscBySlug.get(r.slug) || { impressions: 0, clicks: 0, positionSum: 0, positionN: 0 };
          e.impressions += r.impressions ?? 0;
          e.clicks += r.clicks ?? 0;
          if (r.position !== null && r.position !== undefined) {
            e.positionSum += Number(r.position);
            e.positionN += 1;
          }
          gscBySlug.set(r.slug, e);
        }
      }

      // 4. Build final rows
      let totalShell = 0;
      let totalRendered = 0;
      let totalTimeout = 0;
      let pagesAtRisk = 0;
      const finalRows: BotSeoRow[] = [];

      for (const entry of agg.values()) {
        totalShell += entry.shellCount;
        totalRendered += entry.renderedCount;
        totalTimeout += entry.timeoutCount;

        const renderEvents = entry.shellCount + entry.renderedCount + entry.timeoutCount;
        const shellPct = renderEvents > 0
          ? (entry.shellCount + entry.timeoutCount) / renderEvents
          : 0;

        const gsc = gscBySlug.get(entry.slug);
        const impressions = gsc?.impressions ?? 0;
        const clicks = gsc?.clicks ?? 0;
        const avgPosition = gsc && gsc.positionN > 0 ? gsc.positionSum / gsc.positionN : null;

        const { score, label } = computeRisk(shellPct, impressions, avgPosition);
        if (label === 'critical' || label === 'high') pagesAtRisk += 1;

        finalRows.push({
          slug: entry.slug,
          pageUrl: `/product/${entry.slug}`,
          botTypes: Array.from(entry.botTypes).sort(),
          totalCrawls: entry.totalCrawls,
          shellCount: entry.shellCount,
          renderedCount: entry.renderedCount,
          timeoutCount: entry.timeoutCount,
          shellPct,
          lastCrawlAt: entry.lastCrawlAt,
          impressions,
          clicks,
          avgPosition,
          softFourOhFourRisk: score,
          riskLabel: label,
        });
      }

      finalRows.sort((a, b) => b.softFourOhFourRisk - a.softFourOhFourRisk || b.totalCrawls - a.totalCrawls);

      setRows(finalRows);
      setSummary({
        totalBotVisits,
        uniqueBots: allBots.size,
        totalShellEvents: totalShell,
        totalRenderedEvents: totalRendered,
        totalTimeoutEvents: totalTimeout,
        pagesAtRisk,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      console.error('[BotRenderSEO] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    load();
  }, [load]);

  return { rows, summary, loading, error, refetch: load, windowDays, setWindowDays };
}