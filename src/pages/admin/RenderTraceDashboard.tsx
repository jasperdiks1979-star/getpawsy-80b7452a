import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Legend,
  AreaChart, Area, ResponsiveContainer,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Download, RefreshCw, Search, ShieldAlert, TrendingDown,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';

// -----------------------------------------------------------------------------
// Render-trace dashboard
// -----------------------------------------------------------------------------
// The PDP bot-render hook (`usePdpBotRenderTrace`) ships render-state pings to
// the `log-crawler-visit` edge function, which persists them in `crawler_visits`
// with the slug encoded in `page_url` and the state tag (shell/rendered/timeout)
// embedded in `user_agent` as `pdp-render-trace/<state>`.
//
// This page reads those rows directly and gives ops a fast way to spot:
//   - timeout spikes (regressions in PDP hydration or product fetch)
//   - slugs stuck in "shell" without ever reaching "rendered"
//   - day-over-day trend changes per state
// -----------------------------------------------------------------------------

type RenderState = 'shell' | 'rendered' | 'timeout';

const STATE_ORDER: RenderState[] = ['shell', 'rendered', 'timeout'];

const STATE_COLORS: Record<RenderState, string> = {
  shell: 'hsl(217, 91%, 60%)',     // blue — the baseline ping
  rendered: 'hsl(142, 76%, 36%)',  // emerald — healthy
  timeout: 'hsl(0, 84%, 60%)',     // red — regression signal
};

// ─── Malformed row reasons ───────────────────────────────────────────────────
// Mirrors the classification done by the `get_render_trace_stats` RPC so the
// UI can label each sample row consistently.
type MalformedReason =
  | 'missing_state_tag'
  | 'unknown_state_tag'
  | 'unparseable_page_url'
  | 'empty_slug_path';

const REASON_LABELS: Record<MalformedReason, string> = {
  missing_state_tag: 'Missing state tag',
  unknown_state_tag: 'Unknown state tag',
  unparseable_page_url: 'Unparseable page_url',
  empty_slug_path: 'Empty slug path',
};

interface MalformedRow {
  reason: MalformedReason;
  page_url: string;
  user_agent: string;
  created_at: string;
  raw_tag: string | null;
}

interface SlugStats {
  slug: string;
  shell: number;
  rendered: number;
  timeout: number;
  total: number;
  render_rate: number;
  timeout_rate: number;
}

// ─── Server response shape ──────────────────────────────────────────────────
// Mirrors what `public.get_render_trace_stats` returns. Keeping it explicit
// here means the dashboard never has to decode jsonb shapes ad-hoc and the
// RPC is the single source of truth for aggregation.
interface PerDayBucket {
  date: string;
  shell: number;
  rendered: number;
  timeout: number;
}

interface RenderTraceStats {
  window_days: number;
  totals: { shell: number; rendered: number; timeout: number };
  per_day: PerDayBucket[];
  slug_total: number;
  slug_limit: number;
  slug_offset: number;
  slugs: SlugStats[];
  malformed_counts: Partial<Record<MalformedReason, number>>;
  malformed_samples: MalformedRow[];
}

const SLUG_PAGE_SIZE = 25;
// We always fetch the chart's top 15 slugs separately at offset 0 so changing
// pages in the per-slug table doesn't redraw the bar chart underneath it.
const CHART_TOP_N = 15;

export default function RenderTraceDashboard() {
  const [windowDays, setWindowDays] = useState<number>(7);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  // Debounce the search so each keystroke doesn't fire a new RPC call.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);
  // Reset pagination whenever the user changes the window or search filter —
  // otherwise page 4 of an old result set leaks into a fresh query.
  useEffect(() => {
    setPage(0);
  }, [windowDays, debouncedSearch]);

  // ─── Overview query ─────────────────────────────────────────────────────
  // This fetches totals, per-day counts, malformed samples, and the top
  // CHART_TOP_N slugs that drive the bar chart. It is intentionally NOT
  // re-fetched when the user paginates the per-slug table — only when the
  // window or search filter changes.
  const overview = useQuery({
    queryKey: ['render-trace-overview', windowDays, debouncedSearch],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_render_trace_stats', {
        p_window_days: windowDays,
        p_search: debouncedSearch || null,
        p_slug_limit: CHART_TOP_N,
        p_slug_offset: 0,
        p_malformed_limit: 10,
      });
      if (error) throw error;
      return data as unknown as RenderTraceStats;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  // ─── Paginated slug query ───────────────────────────────────────────────
  // Page 0 reuses the overview's slug slice when no search is active and the
  // page size matches; otherwise we issue a dedicated RPC call. We keep the
  // previous page visible while a new one loads to avoid a flicker.
  const slugPage = useQuery({
    queryKey: ['render-trace-slugs', windowDays, debouncedSearch, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_render_trace_stats', {
        p_window_days: windowDays,
        p_search: debouncedSearch || null,
        p_slug_limit: SLUG_PAGE_SIZE,
        p_slug_offset: page * SLUG_PAGE_SIZE,
        p_malformed_limit: 0, // overview already has them
      });
      if (error) throw error;
      return data as unknown as RenderTraceStats;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const isLoading = overview.isLoading;
  const isRefetching = overview.isFetching || slugPage.isFetching;
  const error = overview.error ?? slugPage.error;
  const refetch = () => {
    overview.refetch();
    slugPage.refetch();
  };

  const totals = overview.data?.totals ?? { shell: 0, rendered: 0, timeout: 0 };
  const perDay = overview.data?.per_day ?? [];
  const chartSlugs = overview.data?.slugs ?? [];
  const slugTotal = overview.data?.slug_total ?? 0;
  const malformed = overview.data?.malformed_samples ?? [];
  const malformedByReason = overview.data?.malformed_counts ?? {};
  const malformedTotal = useMemo(
    () => Object.values(malformedByReason).reduce((a, b) => a + (b ?? 0), 0),
    [malformedByReason],
  );
  const pageSlugs = slugPage.data?.slugs ?? [];

  const totalEvents = totals.shell + totals.rendered + totals.timeout;
  const overallTimeoutRate = totals.shell > 0 ? totals.timeout / totals.shell : 0;
  const overallRenderRate = totals.shell > 0 ? Math.min(1, totals.rendered / totals.shell) : 0;

  const totalPages = Math.max(1, Math.ceil(slugTotal / SLUG_PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  // ─── CSV export ──────────────────────────────────────────────────────────
  // Bundles the three tables admins look at (totals, per-day, top slugs) into
  // ONE file with section headers, so an analyst can open it in a spreadsheet
  // without juggling multiple downloads. Top slugs is capped at the same 100
  // rows we render in the table to keep the file tractable.
  const handleExportCsv = () => {
    const lines: string[] = [];
    const stamp = format(new Date(), 'yyyy-MM-dd_HHmm');
    const fromLabel = format(subDays(new Date(), windowDays - 1), 'yyyy-MM-dd');
    const toLabel = format(new Date(), 'yyyy-MM-dd');

    lines.push(`# Render-Trace Health export`);
    lines.push(`# Window: ${fromLabel} to ${toLabel} (${windowDays} day${windowDays === 1 ? '' : 's'})`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');

    // 1) Totals
    lines.push('## Totals');
    lines.push('metric,value');
    lines.push(`total_events,${totalEvents}`);
    lines.push(`shell,${totals.shell}`);
    lines.push(`rendered,${totals.rendered}`);
    lines.push(`timeout,${totals.timeout}`);
    lines.push(`render_rate,${(overallRenderRate * 100).toFixed(2)}%`);
    lines.push(`timeout_rate,${(overallTimeoutRate * 100).toFixed(2)}%`);
    lines.push(`unique_slugs,${perSlug.length}`);
    lines.push('');

    // 2) Per-day
    lines.push('## Per day');
    lines.push('date,shell,rendered,timeout,total');
    for (const d of perDay) {
      const tot = d.shell + d.rendered + d.timeout;
      lines.push(`${d.date},${d.shell},${d.rendered},${d.timeout},${tot}`);
    }
    lines.push('');

    // 3) Top slugs (apply the active search filter so the export matches the
    //    table the user is currently looking at).
    lines.push('## Top slugs (filtered, max 100)');
    lines.push('slug,shell,rendered,timeout,total,render_rate_pct,timeout_rate_pct');
    for (const s of filteredSlugs.slice(0, 100)) {
      // Quote the slug in case it ever contains a comma or quote.
      const safeSlug = `"${s.slug.replace(/"/g, '""')}"`;
      lines.push(
        `${safeSlug},${s.shell},${s.rendered},${s.timeout},${s.total},` +
          `${(s.renderRate * 100).toFixed(2)},${(s.timeoutRate * 100).toFixed(2)}`,
      );
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `render-trace_${windowDays}d_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>Render-Trace Health | GetPawsy Admin</title>
        <meta name="description" content="PDP render-state telemetry dashboard for spotting hydration regressions." />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              PDP Render-Trace Health
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Counts of <code>pdp-render-trace</code> events by state and slug. Use this to
              quickly spot timeout spikes or slugs that never reach <code>rendered</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="3">Last 3 days</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={isLoading || totalEvents === 0}
              title={totalEvents === 0 ? 'No data to export' : 'Download totals, per-day & top slugs as CSV'}
            >
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Failed to load render-trace events.
            </CardContent>
          </Card>
        )}

        {!isLoading && malformed.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                Malformed render-trace pings
                <Badge variant="outline" className="ml-1 border-destructive/40 text-destructive">
                  {malformed.length.toLocaleString()}
                </Badge>
              </CardTitle>
              <CardDescription>
                These rows arrived with a <code>pdp-render-trace</code> marker but couldn't be
                parsed into a valid <code>(slug, state)</code> pair, so they're excluded from every
                chart above. A persistent count usually means the client-side hook or a referrer
                is sending an unexpected <code>user_agent</code> or <code>page_url</code> shape.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(REASON_LABELS) as MalformedReason[])
                  .filter((r) => malformedByReason[r] > 0)
                  .map((r) => (
                    <Badge key={r} variant="secondary" className="gap-1.5">
                      {REASON_LABELS[r]}
                      <span className="tabular-nums font-mono text-xs opacity-80">
                        {malformedByReason[r].toLocaleString()}
                      </span>
                    </Badge>
                  ))}
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Reason</TableHead>
                      <TableHead className="w-[160px]">When</TableHead>
                      <TableHead>page_url</TableHead>
                      <TableHead>user_agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {malformed.slice(0, 10).map((row, i) => (
                      <TableRow key={`${row.created_at}-${i}`}>
                        <TableCell className="align-top">
                          <Badge variant="outline" className="text-[11px]">
                            {REASON_LABELS[row.reason]}
                          </Badge>
                          {row.reason === 'unknown_state_tag' && row.rawTag && (
                            <div
                              className="text-[11px] text-muted-foreground mt-1 font-mono truncate max-w-[160px]"
                              title={row.rawTag}
                            >
                              tag: {row.rawTag}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {format(new Date(row.created_at), 'MMM d, HH:mm:ss')}
                        </TableCell>
                        <TableCell
                          className="align-top font-mono text-[11px] max-w-[280px] truncate"
                          title={row.page_url}
                        >
                          {row.page_url || <span className="italic text-muted-foreground">(empty)</span>}
                        </TableCell>
                        <TableCell
                          className="align-top font-mono text-[11px] max-w-[320px] truncate"
                          title={row.user_agent}
                        >
                          {row.user_agent || <span className="italic text-muted-foreground">(empty)</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {malformed.length > 10 && (
                <p className="text-xs text-muted-foreground">
                  Showing 10 most recent of {malformed.length.toLocaleString()} malformed rows in this window.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Total events"
            value={isLoading ? null : totalEvents.toLocaleString()}
            hint={`${perSlug.length} unique slug${perSlug.length === 1 ? '' : 's'}`}
          />
          <SummaryCard
            label="Shell"
            value={isLoading ? null : totals.shell.toLocaleString()}
            hint="Initial bot ping"
            color={STATE_COLORS.shell}
          />
          <SummaryCard
            label="Rendered"
            value={isLoading ? null : totals.rendered.toLocaleString()}
            hint={isLoading ? '' : `${(overallRenderRate * 100).toFixed(1)}% of shell`}
            color={STATE_COLORS.rendered}
          />
          <SummaryCard
            label="Timeout"
            value={isLoading ? null : totals.timeout.toLocaleString()}
            hint={isLoading ? '' : `${(overallTimeoutRate * 100).toFixed(1)}% of shell`}
            color={STATE_COLORS.timeout}
            danger={overallTimeoutRate > 0.05}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily trend by state</CardTitle>
            <CardDescription>
              Stacked event counts per day. Watch for sudden timeout spikes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : perDay.length === 0 ? (
              <EmptyState message="No render-trace events recorded in this window." />
            ) : (
              <ChartContainer
                config={{
                  shell: { label: 'Shell', color: STATE_COLORS.shell },
                  rendered: { label: 'Rendered', color: STATE_COLORS.rendered },
                  timeout: { label: 'Timeout', color: STATE_COLORS.timeout },
                }}
                className="h-[260px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={perDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'MMM d')} fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Area type="monotone" dataKey="shell" stackId="1" stroke={STATE_COLORS.shell} fill={STATE_COLORS.shell} fillOpacity={0.35} />
                    <Area type="monotone" dataKey="rendered" stackId="1" stroke={STATE_COLORS.rendered} fill={STATE_COLORS.rendered} fillOpacity={0.45} />
                    <Area type="monotone" dataKey="timeout" stackId="1" stroke={STATE_COLORS.timeout} fill={STATE_COLORS.timeout} fillOpacity={0.55} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top slugs by event volume</CardTitle>
            <CardDescription>
              Slugs ordered by total render-trace events. Bars stacked by state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : perSlug.length === 0 ? (
              <EmptyState message="Nothing to chart yet." />
            ) : (
              <ChartContainer
                config={{
                  shell: { label: 'Shell', color: STATE_COLORS.shell },
                  rendered: { label: 'Rendered', color: STATE_COLORS.rendered },
                  timeout: { label: 'Timeout', color: STATE_COLORS.timeout },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perSlug.slice(0, 15)} layout="vertical" margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} fontSize={12} />
                    <YAxis type="category" dataKey="slug" width={140} fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="shell" stackId="a" fill={STATE_COLORS.shell} />
                    <Bar dataKey="rendered" stackId="a" fill={STATE_COLORS.rendered} />
                    <Bar dataKey="timeout" stackId="a" fill={STATE_COLORS.timeout}>
                      {perSlug.slice(0, 15).map((s) => (
                        <Cell key={s.slug} fill={STATE_COLORS.timeout} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Per-slug breakdown</CardTitle>
              <CardDescription>
                Sorted by timeouts first. A high timeout rate or zero rendered events is a regression signal.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by slug…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : filteredSlugs.length === 0 ? (
              <EmptyState message={search ? 'No slugs match that filter.' : 'No render-trace data yet.'} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slug</TableHead>
                      <TableHead className="text-right">Shell</TableHead>
                      <TableHead className="text-right">Rendered</TableHead>
                      <TableHead className="text-right">Timeout</TableHead>
                      <TableHead className="text-right">Render rate</TableHead>
                      <TableHead className="text-right">Timeout rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSlugs.slice(0, 100).map((s) => {
                      const isRegression = s.timeoutRate > 0.1 || (s.shell > 0 && s.rendered === 0);
                      return (
                        <TableRow key={s.slug} className={isRegression ? 'bg-destructive/5' : undefined}>
                          <TableCell className="font-mono text-xs max-w-[260px] truncate" title={s.slug}>
                            {s.slug}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{s.shell}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.rendered}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.timeout > 0 ? (
                              <span className="text-destructive font-medium">{s.timeout}</span>
                            ) : s.timeout}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{(s.renderRate * 100).toFixed(0)}%</TableCell>
                          <TableCell className="text-right">
                            {isRegression ? (
                              <Badge variant="destructive" className="gap-1">
                                <TrendingDown className="h-3 w-3" />
                                {(s.timeoutRate * 100).toFixed(0)}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground tabular-nums">{(s.timeoutRate * 100).toFixed(0)}%</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredSlugs.length > 100 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing top 100 of {filteredSlugs.length}. Refine the filter to narrow.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

interface SummaryCardProps {
  label: string;
  value: string | null;
  hint?: string;
  color?: string;
  danger?: boolean;
}

function SummaryCard({ label, value, hint, color, danger }: SummaryCardProps) {
  return (
    <Card className={danger ? 'border-destructive/40' : undefined}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
          {label}
        </div>
        <div className={`text-2xl font-bold mt-1 ${danger ? 'text-destructive' : ''}`}>
          {value ?? <Skeleton className="h-7 w-16" />}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
      <Activity className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}