/**
 * PlacementOverviewPage — single-pane summary of how each /go CTA placement
 * is performing. For every placement (bio_primary, bio_secondary, bio_sticky,
 * bio_post_image, bio_video_cta, etc.) the page surfaces:
 *
 *   • CTR (clicks ÷ impressions)
 *   • Time-to-visible (median + p90 — how fast cold traffic actually
 *     sees the placement after page mount)
 *   • Time-to-click (median + p90 — engagement speed)
 *   • First-click winner (which placement most often captures the very
 *     first CTA click in a session — the true intent trigger)
 *
 * Daily trend charts (impressions, clicks, CTR, time-to-visible) sit
 * beneath the leader table so regressions are obvious at a glance.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trophy, Eye, MousePointerClick, Timer, Gauge, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  exportLpFunnelCsv,
  downloadCsv,
  type LpFunnelExportOptions,
} from '@/lib/lpFunnelExport';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

type OverviewRow = {
  placement: string;
  impressions: number;
  clicks: number;
  ctr_pct: number;
  median_time_to_visible_ms: number | null;
  p90_time_to_visible_ms: number | null;
  median_time_to_click_ms: number | null;
  p90_time_to_click_ms: number | null;
  median_dwell_ms: number | null;
  first_click_wins: number;
};

type TrendRow = {
  day: string;
  placement: string;
  impressions: number;
  clicks: number;
  ctr_pct: number;
  median_time_to_visible_ms: number | null;
  median_time_to_click_ms: number | null;
};

type CohortRow = {
  placement: string;
  cohort: 'first_session' | 'returning' | string;
  impressions: number;
  clicks: number;
  ctr_pct: number;
  median_time_to_visible_ms: number | null;
  median_time_to_click_ms: number | null;
  first_click_wins: number;
};

const PLACEMENT_LABELS: Record<string, string> = {
  bio_primary: 'Primary (above the fold)',
  bio_secondary: 'Secondary (final CTA)',
  bio_sticky: 'Sticky (mobile bar)',
  bio_post_image: 'Post-image CTA',
  bio_video_cta: 'Video demo CTA',
  uplift_proof: 'Proof block',
  uplift_nudge: 'Nudge block',
  uplift_arrow: 'Animated arrow',
};

// Stable colour per placement so trend charts stay visually anchored even
// when the placement order shuffles between days.
const PLACEMENT_COLORS: Record<string, string> = {
  bio_primary: 'hsl(25, 95%, 53%)',
  bio_secondary: 'hsl(217, 91%, 60%)',
  bio_sticky: 'hsl(142, 71%, 45%)',
  bio_post_image: 'hsl(280, 70%, 60%)',
  bio_video_cta: 'hsl(346, 87%, 60%)',
  uplift_proof: 'hsl(48, 96%, 53%)',
  uplift_nudge: 'hsl(195, 85%, 50%)',
  uplift_arrow: 'hsl(0, 0%, 60%)',
};

function colorFor(p: string): string {
  return PLACEMENT_COLORS[p] ?? 'hsl(220, 9%, 50%)';
}

function fmtMs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(1)} s`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

/** Pivot the long-form trend rows into one row per day with a column per
 *  placement, which is the shape recharts expects for a multi-line chart. */
function pivotTrend(
  rows: TrendRow[],
  metric: 'ctr_pct' | 'impressions' | 'clicks' | 'median_time_to_visible_ms',
): { data: Array<Record<string, string | number | null>>; placements: string[] } {
  const placements = Array.from(new Set(rows.map((r) => r.placement))).sort();
  const byDay = new Map<string, Record<string, string | number | null>>();
  for (const r of rows) {
    const slot = byDay.get(r.day) ?? { day: r.day };
    slot[r.placement] = r[metric] ?? null;
    byDay.set(r.day, slot);
  }
  return {
    data: Array.from(byDay.values()).sort((a, b) => String(a.day).localeCompare(String(b.day))),
    placements,
  };
}

export default function PlacementOverviewPage() {
  const [days, setDays] = useState(14);
  const [cohort, setCohort] = useState<'all' | 'first_session' | 'returning'>('all');
  const [overview, setOverview] = useState<OverviewRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [cohortRows, setCohortRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const cohortParam = cohort === 'all' ? null : cohort;
    Promise.all([
      supabase.rpc('get_placement_overview', {
        p_days: days,
        p_include_internal: false,
        p_cohort: cohortParam,
      }),
      supabase.rpc('get_placement_overview_trend', {
        p_days: days,
        p_include_internal: false,
        p_cohort: cohortParam,
      }),
      supabase.rpc('get_placement_overview_by_cohort', {
        p_days: days,
        p_include_internal: false,
      }),
    ]).then(([ov, tr, ch]) => {
      if (cancelled) return;
      if (ov.error) setError(ov.error.message);
      else setOverview((ov.data ?? []) as OverviewRow[]);
      if (tr.error && !ov.error) setError(tr.error.message);
      else setTrend((tr.data ?? []) as TrendRow[]);
      if (ch.error && !ov.error && !tr.error) setError(ch.error.message);
      else setCohortRows((ch.data ?? []) as CohortRow[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [days, cohort]);

  // Highest CTR (with a minimum sample-size guard so a 1/1 row doesn't crown
  // itself the winner) and absolute first-click leader.
  const ctrWinner = useMemo(() => {
    const eligible = overview.filter((r) => r.impressions >= 50);
    if (eligible.length === 0) return null;
    return eligible.reduce((a, b) => (a.ctr_pct >= b.ctr_pct ? a : b));
  }, [overview]);

  const firstClickWinner = useMemo(() => {
    if (overview.length === 0) return null;
    return overview.reduce((a, b) => (a.first_click_wins >= b.first_click_wins ? a : b));
  }, [overview]);

  const totals = useMemo(() => {
    return overview.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.clicks += r.clicks;
        return acc;
      },
      { impressions: 0, clicks: 0 },
    );
  }, [overview]);
  const blendedCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const ctrPivot = useMemo(() => pivotTrend(trend, 'ctr_pct'), [trend]);
  const impPivot = useMemo(() => pivotTrend(trend, 'impressions'), [trend]);
  const ttvPivot = useMemo(() => pivotTrend(trend, 'median_time_to_visible_ms'), [trend]);

  // Pivot the cohort rows into one entry per placement with `first` and
  // `returning` columns + delta. Placements with zero data on either side
  // still render so the gap is obvious.
  const cohortCompare = useMemo(() => {
    const map = new Map<string, { first?: CohortRow; returning?: CohortRow }>();
    for (const r of cohortRows) {
      const slot = map.get(r.placement) ?? {};
      if (r.cohort === 'first_session') slot.first = r;
      else if (r.cohort === 'returning') slot.returning = r;
      map.set(r.placement, slot);
    }
    return Array.from(map.entries())
      .map(([placement, v]) => {
        const firstCtr = v.first?.ctr_pct ?? 0;
        const retCtr = v.returning?.ctr_pct ?? 0;
        return {
          placement,
          first: v.first,
          returning: v.returning,
          deltaPp: retCtr - firstCtr, // returning − cold (positive = returning clicks more)
        };
      })
      .sort((a, b) => (b.first?.impressions ?? 0) - (a.first?.impressions ?? 0));
  }, [cohortRows]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">CTA Placement Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-placement CTR, time-to-visible, time-to-click and first-click winners on{' '}
            <code className="text-xs">/go</code>. Excludes internal traffic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={cohort} onValueChange={(v) => setCohort(v as typeof cohort)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All visitors</SelectItem>
              <SelectItem value="first_session">Cold TikTok (first session)</SelectItem>
              <SelectItem value="returning">Returning visitors</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 days</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Cohort comparison — first_session vs returning, side by side per placement.
          This is the heatmap counterpart inside the app: identical rows so a
          regression on cold traffic alone is immediately visible. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cohort comparison · cold TikTok vs returning</CardTitle>
        </CardHeader>
        <CardContent>
          {cohortCompare.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No cohort-tagged events yet — fresh /go visits will start populating this once
              deployed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Placement</th>
                    <th className="py-2 pr-3 text-right">Cold impr.</th>
                    <th className="py-2 pr-3 text-right">Cold CTR</th>
                    <th className="py-2 pr-3 text-right">Cold time-to-click</th>
                    <th className="py-2 pr-3 text-right">Returning impr.</th>
                    <th className="py-2 pr-3 text-right">Returning CTR</th>
                    <th className="py-2 pr-3 text-right">Returning time-to-click</th>
                    <th className="py-2 pr-3 text-right">Δ CTR (pp)</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortCompare.map((c) => {
                    const deltaClass =
                      c.deltaPp > 0
                        ? 'text-emerald-600'
                        : c.deltaPp < 0
                          ? 'text-red-600'
                          : 'text-muted-foreground';
                    return (
                      <tr key={c.placement} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                            style={{ background: colorFor(c.placement) }}
                          />
                          {PLACEMENT_LABELS[c.placement] ?? c.placement}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {(c.first?.impressions ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {fmtPct(c.first?.ctr_pct)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">
                          {fmtMs(c.first?.median_time_to_click_ms)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {(c.returning?.impressions ?? 0).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {fmtPct(c.returning?.ctr_pct)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">
                          {fmtMs(c.returning?.median_time_to_click_ms)}
                        </td>
                        <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${deltaClass}`}>
                          {c.deltaPp > 0 ? '+' : ''}
                          {c.deltaPp.toFixed(2)} pp
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-3">
                Δ CTR = returning − cold. Positive = returning visitors click more on this
                placement (i.e. it works as a re-engagement nudge); negative = the placement
                punches harder against fresh TikTok traffic. Pair this view with the matching
                Microsoft Clarity heatmap (filter <code>cohort = first_session</code> vs{' '}
                <code>cohort = returning</code>) to see WHY the gap exists.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">Error: {error}</CardContent>
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" /> Impressions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.impressions.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <MousePointerClick className="w-3.5 h-3.5" /> Clicks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.clicks.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5" /> Blended CTR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtPct(blendedCtr)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Trophy className="w-3.5 h-3.5" /> CTR Winner
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ctrWinner ? (
              <>
                <div className="text-base font-semibold">
                  {PLACEMENT_LABELS[ctrWinner.placement] ?? ctrWinner.placement}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtPct(ctrWinner.ctr_pct)} · {ctrWinner.impressions.toLocaleString()} impr.
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Not enough data (≥50 impr.)</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-placement leader table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Per-placement summary</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : overview.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No CTA events recorded in this window yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Placement</th>
                    <th className="py-2 pr-3 text-right">Impressions</th>
                    <th className="py-2 pr-3 text-right">Clicks</th>
                    <th className="py-2 pr-3 text-right">CTR</th>
                    <th className="py-2 pr-3 text-right">Time-to-visible (p50 / p90)</th>
                    <th className="py-2 pr-3 text-right">Time-to-click (p50 / p90)</th>
                    <th className="py-2 pr-3 text-right">Dwell (p50)</th>
                    <th className="py-2 pr-3 text-right">First-click wins</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.map((r) => {
                    const isCtrWinner = ctrWinner?.placement === r.placement;
                    const isFirstWinner =
                      firstClickWinner?.placement === r.placement &&
                      firstClickWinner.first_click_wins > 0;
                    return (
                      <tr key={r.placement} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                            style={{ background: colorFor(r.placement) }}
                          />
                          {PLACEMENT_LABELS[r.placement] ?? r.placement}
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {r.placement}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {r.impressions.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {r.clicks.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            {fmtPct(r.ctr_pct)}
                            {isCtrWinner && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                top
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">
                          {fmtMs(r.median_time_to_visible_ms)} / {fmtMs(r.p90_time_to_visible_ms)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">
                          {fmtMs(r.median_time_to_click_ms)} / {fmtMs(r.p90_time_to_click_ms)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">
                          {fmtMs(r.median_dwell_ms)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            {r.first_click_wins.toLocaleString()}
                            {isFirstWinner && (
                              <Badge className="text-[9px] px-1 py-0 bg-[hsl(25,95%,53%)] text-white">
                                <Trophy className="w-2.5 h-2.5 mr-0.5" /> winner
                              </Badge>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trend charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TrendChart
          title="CTR per placement (%)"
          icon={<Gauge className="w-4 h-4" />}
          data={ctrPivot.data}
          placements={ctrPivot.placements}
          unit="%"
        />
        <TrendChart
          title="Impressions per placement"
          icon={<Eye className="w-4 h-4" />}
          data={impPivot.data}
          placements={impPivot.placements}
        />
        <TrendChart
          title="Median time-to-visible (ms)"
          icon={<Timer className="w-4 h-4" />}
          data={ttvPivot.data}
          placements={ttvPivot.placements}
          unit=" ms"
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4" /> First-click attribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Counts the very first CTA click in each session — the placement that actually
              triggers intent. Subsequent clicks within the same session are excluded.
            </p>
            <div className="space-y-2">
              {overview.length === 0 && (
                <div className="text-sm text-muted-foreground">No data.</div>
              )}
              {overview
                .slice()
                .sort((a, b) => b.first_click_wins - a.first_click_wins)
                .map((r) => {
                  const max = Math.max(1, ...overview.map((x) => x.first_click_wins));
                  const pct = (r.first_click_wins / max) * 100;
                  return (
                    <div key={r.placement} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {PLACEMENT_LABELS[r.placement] ?? r.placement}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.first_click_wins.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: colorFor(r.placement) }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Reusable multi-line trend chart for the per-placement metrics. */
function TrendChart({
  title,
  icon,
  data,
  placements,
  unit = '',
}: {
  title: string;
  icon: React.ReactNode;
  data: Array<Record<string, string | number | null>>;
  placements: string[];
  unit?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">No data.</div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}${unit}`} />
                <Tooltip
                  formatter={(value: number | string) => `${value}${unit}`}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {placements.map((p) => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    name={PLACEMENT_LABELS[p] ?? p}
                    stroke={colorFor(p)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}