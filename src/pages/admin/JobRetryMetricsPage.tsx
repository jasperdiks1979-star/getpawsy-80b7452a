import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, RefreshCw, Skull, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface FailureEventContext {
  jobId?: string;
  attempts?: number;
  jobType?: string;
  maxAttempts?: number;
  backoffMinutes?: number;
  policyMatched?: { provider: string | null; jobType: string | null } | null;
}

interface FailureEvent {
  id: string;
  provider: string;
  severity: string;
  message: string;
  context: FailureEventContext | null;
  created_at: string;
}

interface JobRow {
  provider: string;
  job_type: string;
  status: string;
  attempts: number | null;
}

const WINDOW_OPTIONS = [
  { label: 'Laatste 1 uur', hours: 1 },
  { label: 'Laatste 6 uur', hours: 6 },
  { label: 'Laatste 24 uur', hours: 24 },
  { label: 'Laatste 7 dagen', hours: 24 * 7 },
];

export default function JobRetryMetricsPage() {
  const [windowHours, setWindowHours] = useState<number>(24);

  const sinceIso = useMemo(
    () => new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString(),
    [windowHours],
  );

  const eventsQuery = useQuery({
    queryKey: ['job-retry-metrics-events', windowHours],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_events')
        .select('id, provider, severity, message, context, created_at')
        .eq('event_type', 'job_failed')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as FailureEvent[];
    },
    refetchInterval: 30_000,
  });

  const jobsQuery = useQuery({
    queryKey: ['job-retry-metrics-jobs', windowHours],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_jobs')
        .select('provider, job_type, status, attempts')
        .gte('updated_at', sinceIso)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
    refetchInterval: 30_000,
  });

  const events = eventsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];

  // Aggregate per (provider, job_type)
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        provider: string;
        jobType: string;
        retries: number;
        deadFailures: number;
        backoffPattern: number[];
        lastError: string | null;
        lastSeen: string | null;
        currentDead: number;
        currentFailed: number;
        currentRunning: number;
        currentSuccess: number;
      }
    >();

    for (const ev of events) {
      const provider = ev.provider ?? 'unknown';
      const jobType = ev.context?.jobType ?? 'unknown';
      const key = `${provider}::${jobType}`;
      const existing =
        map.get(key) ??
        {
          provider,
          jobType,
          retries: 0,
          deadFailures: 0,
          backoffPattern: [] as number[],
          lastError: null as string | null,
          lastSeen: null as string | null,
          currentDead: 0,
          currentFailed: 0,
          currentRunning: 0,
          currentSuccess: 0,
        };
      if (ev.severity === 'error') existing.deadFailures += 1;
      else existing.retries += 1;
      const backoff = ev.context?.backoffMinutes;
      if (typeof backoff === 'number' && !existing.backoffPattern.includes(backoff)) {
        existing.backoffPattern.push(backoff);
      }
      if (!existing.lastSeen || ev.created_at > existing.lastSeen) {
        existing.lastSeen = ev.created_at;
        existing.lastError = ev.message;
      }
      map.set(key, existing);
    }

    for (const job of jobs) {
      const key = `${job.provider}::${job.job_type}`;
      const existing =
        map.get(key) ??
        {
          provider: job.provider,
          jobType: job.job_type,
          retries: 0,
          deadFailures: 0,
          backoffPattern: [],
          lastError: null,
          lastSeen: null,
          currentDead: 0,
          currentFailed: 0,
          currentRunning: 0,
          currentSuccess: 0,
        };
      if (job.status === 'dead') existing.currentDead += 1;
      else if (job.status === 'failed') existing.currentFailed += 1;
      else if (job.status === 'running') existing.currentRunning += 1;
      else if (job.status === 'success') existing.currentSuccess += 1;
      map.set(key, existing);
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.deadFailures - a.deadFailures || b.retries - a.retries || b.currentFailed - a.currentFailed,
    );
  }, [events, jobs]);

  // Top-line totals
  const totals = useMemo(() => {
    const retries = events.filter((e) => e.severity !== 'error').length;
    const dead = events.filter((e) => e.severity === 'error').length;
    const currentFailed = jobs.filter((j) => j.status === 'failed').length;
    const currentDead = jobs.filter((j) => j.status === 'dead').length;
    return { retries, dead, currentFailed, currentDead };
  }, [events, jobs]);

  const isLoading = eventsQuery.isLoading || jobsQuery.isLoading;

  return (
    <>
      <Helmet>
        <title>Job Retry Metrics | GetPawsy Admin</title>
      </Helmet>
      <div className="container py-8 space-y-6 max-w-6xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Job Retry Metrics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Retries, mislukkingen en backoff-patronen per provider en jobtype.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Select
              value={String(windowHours)}
              onValueChange={(v) => setWindowHours(Number(v))}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt.hours} value={String(opt.hours)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                eventsQuery.refetch();
                jobsQuery.refetch();
              }}
              disabled={isLoading}
              aria-label="Vernieuwen"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Top-line totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Retries (window)"
            value={totals.retries}
            icon={<RefreshCw className="h-4 w-4" />}
            tone="warning"
          />
          <MetricCard
            label="Dead failures"
            value={totals.dead}
            icon={<Skull className="h-4 w-4" />}
            tone="destructive"
          />
          <MetricCard
            label="Failed (huidig)"
            value={totals.currentFailed}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="warning"
          />
          <MetricCard
            label="Dead (huidig)"
            value={totals.currentDead}
            icon={<TrendingDown className="h-4 w-4" />}
            tone="destructive"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per provider × jobtype</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Geen retry-events of jobs gevonden in dit venster.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Job Type</TableHead>
                      <TableHead className="text-right">Retries</TableHead>
                      <TableHead className="text-right">Dead</TableHead>
                      <TableHead className="text-right">Huidig failed/dead</TableHead>
                      <TableHead>Backoff pattern (min)</TableHead>
                      <TableHead>Laatste fout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((row) => (
                      <TableRow key={`${row.provider}::${row.jobType}`}>
                        <TableCell className="font-mono text-xs">{row.provider}</TableCell>
                        <TableCell className="font-mono text-xs">{row.jobType}</TableCell>
                        <TableCell className="text-right">
                          {row.retries > 0 ? (
                            <Badge variant="secondary">{row.retries}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.deadFailures > 0 ? (
                            <Badge variant="destructive">{row.deadFailures}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {row.currentFailed > 0 || row.currentDead > 0 ? (
                            <span>
                              {row.currentFailed > 0 && (
                                <Badge variant="outline" className="mr-1">
                                  {row.currentFailed} failed
                                </Badge>
                              )}
                              {row.currentDead > 0 && (
                                <Badge variant="destructive">{row.currentDead} dead</Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.backoffPattern.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <div className="flex gap-1 flex-wrap">
                              {row.backoffPattern
                                .slice()
                                .sort((a, b) => a - b)
                                .map((m) => (
                                  <Badge key={m} variant="outline" className="font-mono text-xs">
                                    {m}m
                                  </Badge>
                                ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground max-w-[260px] truncate"
                          title={row.lastError ?? ''}
                        >
                          {row.lastError ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Auto-refresh elke 30 seconden. Retries en dead-failures komen uit{' '}
          <code>marketing_events</code> (job_failed). Huidige status uit <code>marketing_jobs</code>.
        </p>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'warning' | 'destructive';
}) {
  const toneClass =
    tone === 'destructive'
      ? 'text-destructive bg-destructive/10'
      : 'text-amber-600 bg-amber-500/10 dark:text-amber-400';
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-md ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}