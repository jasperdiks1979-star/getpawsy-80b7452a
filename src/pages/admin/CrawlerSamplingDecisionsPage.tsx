import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Outcome = 'logged' | 'sampled_out';
type Reason =
  | 'render_trace'
  | 'appeal_page'
  | 'verified_googlebot'
  | 'spoofed_googlebot'
  | 'sampled_in'
  | 'sampled_out';

type RecentRow = {
  id: string;
  created_at: string;
  page_url: string;
  user_agent: string;
  outcome: Outcome;
  reason: Reason;
  always_log: boolean;
  looks_like_render_trace: boolean;
  render_trace_state: string | null;
  is_appeal_page: boolean;
  ua_claims_googlebot: boolean;
  verified_googlebot: boolean;
  spoofed_googlebot: boolean;
  bot_type: string | null;
  sample_rate: number | null;
  sample_roll: number | null;
};

type StatsResponse = {
  window_hours: number;
  from: string;
  totals: {
    total: number;
    logged: number;
    sampled_out: number;
    always_log: number;
    render_trace: number;
    appeal: number;
    verified_bot: number;
    spoofed_bot: number;
  };
  by_reason: Array<{ reason: Reason; outcome: Outcome; count: number }>;
  per_hour: Array<{ hour: string; logged: number; sampled_out: number }>;
  recent: RecentRow[];
};

type BotState = 'verified_bot' | 'spoofed_bot' | 'ua_only_bot' | 'human_or_unknown';

type LastHourResponse = {
  window_minutes: number;
  from: string;
  distinct_pages: number;
  totals: {
    total: number;
    logged: number;
    sampled_out: number;
    always_log: number;
    sampled_probabilistic: number;
    render_trace: number;
    appeal: number;
    verified_bot: number;
    spoofed_bot: number;
    ua_claims_bot: number;
  };
  by_page: Array<{
    page_url: string;
    logged: number;
    sampled_out: number;
    always_log: number;
    sampled_probabilistic: number;
    render_trace: number;
    verified_bot: number;
    spoofed_bot: number;
    total: number;
  }>;
  by_bot_state: Array<{
    bot_state: BotState;
    logged: number;
    sampled_out: number;
    always_log: number;
    sampled_probabilistic: number;
    render_trace: number;
    total: number;
  }>;
};

const BOT_STATE_LABEL: Record<BotState, string> = {
  verified_bot: 'Verified Googlebot',
  spoofed_bot: 'Spoofed Googlebot',
  ua_only_bot: 'UA claims bot',
  human_or_unknown: 'Human / unknown',
};

const REASON_LABEL: Record<Reason, string> = {
  render_trace: 'Render trace',
  appeal_page: 'Appeal page',
  verified_googlebot: 'Verified Googlebot',
  spoofed_googlebot: 'Spoofed Googlebot',
  sampled_in: 'Sampled in',
  sampled_out: 'Sampled out',
};

const REASON_VARIANT: Record<Reason, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  render_trace: 'default',
  appeal_page: 'default',
  verified_googlebot: 'default',
  spoofed_googlebot: 'destructive',
  sampled_in: 'secondary',
  sampled_out: 'outline',
};

export default function CrawlerSamplingDecisionsPage() {
  const [windowHours, setWindowHours] = useState<number>(24);
  const [reasonFilter, setReasonFilter] = useState<'all' | Reason>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('all');

  const query = useQuery({
    queryKey: ['crawler-sampling-decisions', windowHours],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_crawler_sampling_decision_stats', {
        p_window_hours: windowHours,
        p_limit: 200,
      });
      if (error) throw error;
      return data as unknown as StatsResponse;
    },
    refetchInterval: 60_000,
  });

  const lastHour = useQuery({
    queryKey: ['crawler-sampling-last-hour'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_crawler_sampling_last_hour', {
        p_minutes: 60,
        p_top_pages: 20,
      });
      if (error) throw error;
      return data as unknown as LastHourResponse;
    },
    refetchInterval: 30_000,
  });

  const stats = query.data;
  const recent = stats?.recent ?? [];
  const filteredRecent = recent.filter((r) => {
    if (reasonFilter !== 'all' && r.reason !== reasonFilter) return false;
    if (outcomeFilter !== 'all' && r.outcome !== outcomeFilter) return false;
    return true;
  });

  return (
    <>
      <Helmet>
        <title>Sampling Decisions · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2">
              <Link to="/admin">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to admin
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Crawler sampling decisions</h1>
            <p className="text-sm text-muted-foreground">
              Why each crawler-visit was kept or sampled out — render trace, appeal page,
              verified/spoofed Googlebot, or probabilistic sampling.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(windowHours)}
              onValueChange={(v) => setWindowHours(Number(v))}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 1 hour</SelectItem>
                <SelectItem value="6">Last 6 hours</SelectItem>
                <SelectItem value="24">Last 24 hours</SelectItem>
                <SelectItem value="72">Last 3 days</SelectItem>
                <SelectItem value="168">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {query.isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                Failed to load sampling decisions:{' '}
                {(query.error as Error)?.message ?? 'unknown error'}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total decisions" value={stats?.totals.total ?? 0} />
          <StatCard label="Logged" value={stats?.totals.logged ?? 0} tone="success" />
          <StatCard label="Sampled out" value={stats?.totals.sampled_out ?? 0} tone="muted" />
          <StatCard label="Always-log" value={stats?.totals.always_log ?? 0} />
          <StatCard label="Render trace" value={stats?.totals.render_trace ?? 0} />
          <StatCard label="Appeal hits" value={stats?.totals.appeal ?? 0} />
          <StatCard label="Verified bots" value={stats?.totals.verified_bot ?? 0} />
          <StatCard
            label="Spoofed bots"
            value={stats?.totals.spoofed_bot ?? 0}
            tone={stats && stats.totals.spoofed_bot > 0 ? 'danger' : 'default'}
          />
        </div>

        <LastHourPanel query={lastHour} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Counts by reason × outcome</CardTitle>
            <CardDescription>
              Grouped totals across the selected window. Helps spot whether sampling is
              dropping more traffic than expected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!stats || stats.by_reason.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions in this window yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.by_reason.map((row, i) => (
                    <TableRow key={`${row.reason}-${row.outcome}-${i}`}>
                      <TableCell>
                        <Badge variant={REASON_VARIANT[row.reason]}>
                          {REASON_LABEL[row.reason]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.outcome === 'logged' ? (
                          <span className="text-foreground">logged</span>
                        ) : (
                          <span className="text-muted-foreground">sampled out</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent decisions</CardTitle>
              <CardDescription>
                Most recent {recent.length} decisions. Filter to drill into a specific reason
                or outcome.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v as 'all' | Reason)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  <SelectItem value="render_trace">Render trace</SelectItem>
                  <SelectItem value="appeal_page">Appeal page</SelectItem>
                  <SelectItem value="verified_googlebot">Verified Googlebot</SelectItem>
                  <SelectItem value="spoofed_googlebot">Spoofed Googlebot</SelectItem>
                  <SelectItem value="sampled_in">Sampled in</SelectItem>
                  <SelectItem value="sampled_out">Sampled out</SelectItem>
                </SelectContent>
              </Select>
              <Select value={outcomeFilter} onValueChange={(v) => setOutcomeFilter(v as 'all' | Outcome)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All outcomes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="logged">Logged</SelectItem>
                  <SelectItem value="sampled_out">Sampled out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredRecent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching decisions.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Time</TableHead>
                      <TableHead>Page</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Trace</TableHead>
                      <TableHead>Bot</TableHead>
                      <TableHead className="text-right">Rate / Roll</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(r.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate font-mono text-xs" title={r.page_url}>
                          {r.page_url}
                        </TableCell>
                        <TableCell>
                          <Badge variant={REASON_VARIANT[r.reason]}>
                            {REASON_LABEL[r.reason]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.outcome === 'logged' ? (
                            <span className="text-foreground">logged</span>
                          ) : (
                            <span className="text-muted-foreground">sampled out</span>
                          )}
                          {r.always_log && (
                            <Badge variant="outline" className="ml-1">
                              always
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.looks_like_render_trace ? (
                            <Badge variant="secondary">{r.render_trace_state ?? '?'}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.spoofed_googlebot ? (
                            <Badge variant="destructive">spoofed</Badge>
                          ) : r.verified_googlebot ? (
                            <Badge>verified</Badge>
                          ) : r.ua_claims_googlebot ? (
                            <Badge variant="outline">UA only</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {r.bot_type && (
                            <span className="ml-1 text-muted-foreground">{r.bot_type}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.sample_rate !== null ? r.sample_rate.toFixed(3) : '—'}
                          {r.sample_roll !== null && (
                            <span className="text-muted-foreground"> / {r.sample_roll.toFixed(3)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'muted' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-foreground'
      : tone === 'danger'
      ? 'text-destructive'
      : tone === 'muted'
      ? 'text-muted-foreground'
      : 'text-foreground';
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
