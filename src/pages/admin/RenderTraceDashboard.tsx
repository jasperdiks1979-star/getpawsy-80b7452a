import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, subDays, startOfDay } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Legend,
  AreaChart, Area, ResponsiveContainer,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowLeft, Download, RefreshCw, Search, ShieldAlert, TrendingDown,
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

const STATE_TAG_RE = /pdp-render-trace\/([a-z0-9_-]+)/i;

function extractState(userAgent: string | null): RenderState | null {
  if (!userAgent) return null;
  const m = userAgent.match(STATE_TAG_RE);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  return (STATE_ORDER as string[]).includes(tag) ? (tag as RenderState) : null;
}

function extractSlug(pageUrl: string): string {
  try {
    const u = new URL(pageUrl, 'https://getpawsy.pet');
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : pageUrl;
  } catch {
    return pageUrl;
  }
}

// ─── Malformed row detection ─────────────────────────────────────────────────
// We expect every row returned by the dashboard query to (a) carry a
// recognizable `pdp-render-trace/<state>` tag, and (b) have a `page_url`
// that parses to a non-empty slug under a real path (e.g. `/products/foo`).
// If either fails the upstream client is sending malformed pings — these are
// the only events that silently drop out of every chart and table above, so
// we surface them explicitly with a sample.
type MalformedReason =
  | 'missing_state_tag'        // no pdp-render-trace/<x> match at all
  | 'unknown_state_tag'        // matched, but tag isn't shell|rendered|timeout
  | 'unparseable_page_url'     // URL() throws even with the base
  | 'empty_slug_path';         // URL parsed but path was empty / no slug

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
  rawTag: string | null;
}

function classifyRow(row: TraceRow): MalformedRow | null {
  const ua = row.user_agent ?? '';
  const m = ua.match(STATE_TAG_RE);
  const rawTag = m ? m[1] : null;

  let stateReason: MalformedReason | null = null;
  if (!m) {
    stateReason = 'missing_state_tag';
  } else {
    const tag = m[1].toLowerCase();
    if (!(STATE_ORDER as string[]).includes(tag)) {
      stateReason = 'unknown_state_tag';
    }
  }

  let urlReason: MalformedReason | null = null;
  try {
    const u = new URL(row.page_url, 'https://getpawsy.pet');
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length === 0) urlReason = 'empty_slug_path';
  } catch {
    urlReason = 'unparseable_page_url';
  }

  // State problems take precedence — they're the more common upstream bug.
  const reason = stateReason ?? urlReason;
  if (!reason) return null;
  return {
    reason,
    page_url: row.page_url,
    user_agent: ua,
    created_at: row.created_at,
    rawTag,
  };
}

interface TraceRow {
  page_url: string;
  user_agent: string;
  created_at: string;
}

interface SlugStats {
  slug: string;
  shell: number;
  rendered: number;
  timeout: number;
  total: number;
  renderRate: number;
  timeoutRate: number;
}

export default function RenderTraceDashboard() {
  const [windowDays, setWindowDays] = useState<number>(7);
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['render-trace-dashboard', windowDays],
    queryFn: async () => {
      const fromDate = startOfDay(subDays(new Date(), windowDays - 1));
      const { data, error } = await supabase
        .from('crawler_visits')
        .select('page_url, user_agent, created_at')
        .ilike('user_agent', '%pdp-render-trace%')
        .gte('created_at', fromDate.toISOString())
        .order('created_at', { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data as TraceRow[];
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const { totals, perDay, perSlug, malformed, malformedByReason } = useMemo(() => {
    const t = { shell: 0, rendered: 0, timeout: 0 };
    const dayMap = new Map<string, { date: string; shell: number; rendered: number; timeout: number }>();
    const slugMap = new Map<string, SlugStats>();
    const bad: MalformedRow[] = [];
    const byReason: Record<MalformedReason, number> = {
      missing_state_tag: 0,
      unknown_state_tag: 0,
      unparseable_page_url: 0,
      empty_slug_path: 0,
    };

    for (const row of data ?? []) {
      const state = extractState(row.user_agent);
      if (!state) {
        const cls = classifyRow(row);
        if (cls) {
          bad.push(cls);
          byReason[cls.reason] += 1;
        }
        continue;
      }
      // State extracted cleanly — but the URL may still be malformed.
      const cls = classifyRow(row);
      if (cls && (cls.reason === 'unparseable_page_url' || cls.reason === 'empty_slug_path')) {
        bad.push(cls);
        byReason[cls.reason] += 1;
      }
      t[state] += 1;

      const day = format(new Date(row.created_at), 'yyyy-MM-dd');
      let dayBucket = dayMap.get(day);
      if (!dayBucket) {
        dayBucket = { date: day, shell: 0, rendered: 0, timeout: 0 };
        dayMap.set(day, dayBucket);
      }
      dayBucket[state] += 1;

      const slug = extractSlug(row.page_url);
      let slugBucket = slugMap.get(slug);
      if (!slugBucket) {
        slugBucket = { slug, shell: 0, rendered: 0, timeout: 0, total: 0, renderRate: 0, timeoutRate: 0 };
        slugMap.set(slug, slugBucket);
      }
      slugBucket[state] += 1;
      slugBucket.total += 1;
    }

    for (const s of slugMap.values()) {
      const denom = s.shell || s.total || 1;
      s.renderRate = Math.min(1, s.rendered / denom);
      s.timeoutRate = Math.min(1, s.timeout / denom);
    }

    const dayArr = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const slugArr = Array.from(slugMap.values()).sort((a, b) => b.timeout - a.timeout || b.total - a.total);
    // Most recent first — easier to spot a regression that started today.
    bad.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { totals: t, perDay: dayArr, perSlug: slugArr, malformed: bad, malformedByReason: byReason };
  }, [data]);

  const filteredSlugs = useMemo(() => {
    if (!search.trim()) return perSlug;
    const q = search.toLowerCase();
    return perSlug.filter(s => s.slug.toLowerCase().includes(q));
  }, [perSlug, search]);

  const totalEvents = totals.shell + totals.rendered + totals.timeout;
  const overallTimeoutRate = totals.shell > 0 ? totals.timeout / totals.shell : 0;
  const overallRenderRate = totals.shell > 0 ? Math.min(1, totals.rendered / totals.shell) : 0;

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