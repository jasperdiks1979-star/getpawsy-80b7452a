import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowLeft, ExternalLink, RefreshCw,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
// Per-slug render-trace drill-down
// -----------------------------------------------------------------------------
// Reached from `/dashboard/render-trace` via the slug column or the top-slugs
// chart. Shows hourly state counts + a daily trend for a single product slug,
// using the `get_render_trace_slug_timeline` RPC. The slug is read from the URL
// path param (`:slug`) and the window from the `?w=` query param so links from
// the parent dashboard can preserve the active window.
// -----------------------------------------------------------------------------

type RenderState = 'shell' | 'rendered' | 'timeout';

const STATE_COLORS: Record<RenderState, string> = {
  shell: 'hsl(217, 91%, 60%)',
  rendered: 'hsl(142, 76%, 36%)',
  timeout: 'hsl(0, 84%, 60%)',
};

interface HourBucket {
  hour: string; // ISO timestamp at hour boundary, UTC
  shell: number;
  rendered: number;
  timeout: number;
}

interface DayBucket {
  date: string; // YYYY-MM-DD
  shell: number;
  rendered: number;
  timeout: number;
}

interface SlugTimeline {
  slug: string;
  window_days: number;
  totals: { shell: number; rendered: number; timeout: number };
  first_seen: string | null;
  last_seen: string | null;
  per_hour: HourBucket[];
  per_day: DayBucket[];
}

const WINDOW_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
];

export default function RenderTraceSlugDetail() {
  const params = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const slug = decodeURIComponent(params.slug ?? '');
  const windowDays = Math.max(1, Math.min(90, Number(searchParams.get('w')) || 7));

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['render-trace-slug-timeline', slug, windowDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_render_trace_slug_timeline', {
        p_slug: slug,
        p_window_days: windowDays,
      });
      if (error) throw error;
      return data as unknown as SlugTimeline;
    },
    enabled: !!slug,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const totals = data?.totals ?? { shell: 0, rendered: 0, timeout: 0 };
  const totalEvents = totals.shell + totals.rendered + totals.timeout;
  const renderRate = totals.shell > 0 ? Math.min(1, totals.rendered / totals.shell) : 0;
  const timeoutRate = totals.shell > 0 ? totals.timeout / totals.shell : 0;
  const perHour = data?.per_hour ?? [];
  const perDay = data?.per_day ?? [];

  // Recent hours (descending) for the table — cap at 48 so the page stays light
  // even when a slug has been pinged for the full 30-day window.
  const recentHours = useMemo(
    () => [...perHour].sort((a, b) => (a.hour < b.hour ? 1 : -1)).slice(0, 48),
    [perHour],
  );

  const setWindow = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('w', v);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <Helmet>
        <title>Render-Trace · {slug || 'slug'} | GetPawsy Admin</title>
        <meta name="description" content="Per-slug PDP render-state timeline." />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <Link
              to={`/dashboard/render-trace`}
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to render-trace overview
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Slug timeline
            </h1>
            <p className="text-sm text-muted-foreground mt-1 break-all font-mono">{slug}</p>
            {data?.first_seen && (
              <p className="text-xs text-muted-foreground mt-1">
                First seen {format(parseISO(data.first_seen), 'MMM d, HH:mm')} ·
                {' '}Last seen {format(parseISO(data.last_seen ?? data.first_seen), 'MMM d, HH:mm')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(windowDays)} onValueChange={setWindow}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/products/${slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Open PDP
              </a>
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Failed to load slug timeline.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total events" value={isLoading ? null : totalEvents.toLocaleString()} />
          <SummaryCard label="Shell" value={isLoading ? null : totals.shell.toLocaleString()} color={STATE_COLORS.shell} />
          <SummaryCard
            label="Rendered"
            value={isLoading ? null : totals.rendered.toLocaleString()}
            hint={isLoading ? '' : `${(renderRate * 100).toFixed(1)}% of shell`}
            color={STATE_COLORS.rendered}
          />
          <SummaryCard
            label="Timeout"
            value={isLoading ? null : totals.timeout.toLocaleString()}
            hint={isLoading ? '' : `${(timeoutRate * 100).toFixed(1)}% of shell`}
            color={STATE_COLORS.timeout}
            danger={timeoutRate > 0.05}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hourly state counts</CardTitle>
            <CardDescription>
              Stacked bars per hour (UTC). Use this to pinpoint when a regression started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : perHour.length === 0 ? (
              <EmptyState message="No render-trace events recorded for this slug in this window." />
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
                  <BarChart data={perHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h) => format(parseISO(h), windowDays <= 1 ? 'HH:mm' : 'MMM d HH:00')}
                      fontSize={11}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Bar dataKey="shell" stackId="a" fill={STATE_COLORS.shell} />
                    <Bar dataKey="rendered" stackId="a" fill={STATE_COLORS.rendered} />
                    <Bar dataKey="timeout" stackId="a" fill={STATE_COLORS.timeout} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily trend</CardTitle>
            <CardDescription>Stacked area per day over the active window.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : perDay.length === 0 ? (
              <EmptyState message="No daily data yet." />
            ) : (
              <ChartContainer
                config={{
                  shell: { label: 'Shell', color: STATE_COLORS.shell },
                  rendered: { label: 'Rendered', color: STATE_COLORS.rendered },
                  timeout: { label: 'Timeout', color: STATE_COLORS.timeout },
                }}
                className="h-[220px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={perDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'MMM d')} fontSize={12} />
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
            <CardTitle className="text-base">Recent hours</CardTitle>
            <CardDescription>
              Most recent {recentHours.length} hourly buckets with at least one event.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : recentHours.length === 0 ? (
              <EmptyState message="No hourly buckets to show." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hour (UTC)</TableHead>
                      <TableHead className="text-right">Shell</TableHead>
                      <TableHead className="text-right">Rendered</TableHead>
                      <TableHead className="text-right">Timeout</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentHours.map((h) => {
                      const total = h.shell + h.rendered + h.timeout;
                      return (
                        <TableRow key={h.hour} className={h.timeout > 0 ? 'bg-destructive/5' : undefined}>
                          <TableCell className="font-mono text-xs">
                            {format(parseISO(h.hour), 'MMM d, HH:00')}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{h.shell}</TableCell>
                          <TableCell className="text-right tabular-nums">{h.rendered}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {h.timeout > 0 ? (
                              <span className="text-destructive font-medium">{h.timeout}</span>
                            ) : h.timeout}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{total}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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
