import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  History,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ClipboardList,
  RefreshCcw,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ReleaseRow {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  sync_run_id: string | null;
  sync_summary: any | null;
  validation_summary: any | null;
  error_message: string | null;
}

const PAGE_SIZE = 5;

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso ?? '—';
  }
}

function fmtDuration(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const ms = end - start;
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
    case 'syncing':
      return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Syncing</Badge>;
    case 'validating':
      return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Validating</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/**
 * Per-release status timeline. Renders the three lifecycle steps
 *   (1) Release record created
 *   (2) merchant-sync run
 *   (3) validate-merchant-feed run
 * with timestamps, computed durations, and outcome summaries pulled
 * from `release_reports.sync_summary` / `validation_summary`.
 */
export function ReleaseTimelineCard() {
  const [rows, setRows] = useState<ReleaseRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrolledForHash = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('release_reports')
      .select('id,title,notes,status,created_at,completed_at,updated_at,sync_run_id,sync_summary,validation_summary,error_message')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ReleaseRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link support: when navigating in with #release-<id>, auto-expand the
  // matching row and scroll it into view once the data has loaded. We track
  // which hash we've already handled so re-renders don't keep re-scrolling.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const hash = location.hash;
    if (!hash || !hash.startsWith('#release-')) return;
    if (scrolledForHash.current === hash) return;
    const id = hash.slice('#release-'.length);
    if (!rows.some((r) => r.id === id)) return;
    setExpanded((s) => ({ ...s, [id]: true }));
    scrolledForHash.current = hash;
    // Defer scroll so the expanded panel has a chance to render.
    requestAnimationFrame(() => {
      const el = rowRefs.current[id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, [rows, location.hash]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Release Status Timeline
            </CardTitle>
            <CardDescription className="mt-1">
              Per release: when the record was created, when the Merchant Center sync ran,
              when feed validation completed, and how long each step took.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!error && rows && rows.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No releases reported yet. Use the “Report Release” card above to log your first release.
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-4">
            {rows.map((r) => {
              const isOpen = !!expanded[r.id];
              const isAnchored = location.hash === `#release-${r.id}`;
              return (
                <div
                  key={r.id}
                  id={`release-${r.id}`}
                  ref={(el) => {
                    rowRefs.current[r.id] = el;
                  }}
                  className={cn(
                    'rounded-lg border bg-card scroll-mt-24 transition-shadow',
                    isAnchored && 'border-primary ring-2 ring-primary/30',
                  )}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))
                    }
                    className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.title}</span>
                        {statusBadge(r.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtTime(r.created_at)}
                        </span>
                        {r.completed_at && (
                          <span>
                            Total:{' '}
                            <span className="font-mono">
                              {fmtDuration(r.created_at, r.completed_at) ?? '—'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </button>

                  {isOpen && <ReleaseTimeline release={r} />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReleaseTimeline({ release }: { release: ReleaseRow }) {
  const sync = release.sync_summary ?? {};
  const val = release.validation_summary ?? {};

  // Derive per-step start/end. Sync exposes startedAt/completedAt explicitly
  // (from the merchant-sync edge function). For validation we only have the
  // wall-clock window between sync.completedAt and release.completed_at, so
  // surface that as a best-effort duration.
  const recordStart = release.created_at;
  const recordEnd = sync.startedAt ?? release.updated_at;

  const syncStart = sync.startedAt ?? null;
  const syncEnd = sync.completedAt ?? null;

  const valStart = sync.completedAt ?? null;
  const valEnd = release.completed_at ?? null;

  const steps = [
    {
      key: 'record',
      label: 'Release record created',
      icon: <ClipboardList className="h-4 w-4" />,
      ts: recordStart,
      duration: fmtDuration(recordStart, recordEnd),
      done: true,
      failed: false,
      result: (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>
            <span className="text-foreground font-mono">{release.id.slice(0, 12)}</span>
            <span className="ml-2">title: {release.title}</span>
          </div>
          {release.notes && <div className="line-clamp-2">notes: {release.notes}</div>}
        </div>
      ),
    },
    {
      key: 'sync',
      label: 'merchant-sync',
      icon: <RefreshCcw className="h-4 w-4" />,
      ts: syncStart,
      duration: fmtDuration(syncStart, syncEnd),
      done: !!syncEnd,
      failed:
        release.status === 'failed' && !val.ok && !syncEnd
          ? true
          : Number(sync.errorCount ?? 0) > 0,
      result:
        Object.keys(sync).length > 0 ? (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>
              mode:{' '}
              <span className="font-mono text-foreground">
                {sync.mode_effective ?? '—'}
              </span>
              {sync.runId && (
                <>
                  {' · '}run:{' '}
                  <span className="font-mono text-foreground">
                    {String(sync.runId).slice(0, 12)}
                  </span>
                </>
              )}
            </div>
            <div>
              success:{' '}
              <span className="text-foreground font-mono">
                {sync.successCount ?? 0}/{sync.totalProducts ?? 0}
              </span>
              {Number(sync.errorCount ?? 0) > 0 && (
                <span className="ml-2 text-destructive font-mono">
                  errors: {sync.errorCount}
                </span>
              )}
            </div>
            <div className="font-mono">
              {fmtTime(syncStart)} → {fmtTime(syncEnd)}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No sync data recorded.</div>
        ),
    },
    {
      key: 'validate',
      label: 'validate-merchant-feed',
      icon: <ShieldCheck className="h-4 w-4" />,
      ts: valStart,
      duration: fmtDuration(valStart, valEnd),
      done: !!valEnd && release.status === 'completed',
      failed: release.status === 'failed' && !!syncEnd && !valEnd
        ? true
        : val.ok === false,
      result:
        Object.keys(val).length > 0 ? (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>
              feed items: <span className="font-mono text-foreground">{val.totalItemsInFeed ?? 0}</span>
              {' · '}sample:{' '}
              <span className="font-mono text-foreground">{val.sampleSize ?? 0}</span>
            </div>
            <div>
              ok:{' '}
              <span className="text-foreground font-mono">
                {val.okCount ?? 0}
              </span>
              {' · '}
              fail:{' '}
              <span className={cn('font-mono', Number(val.failCount ?? 0) > 0 ? 'text-destructive' : 'text-foreground')}>
                {val.failCount ?? 0}
              </span>
            </div>
            {Array.isArray(val.topFailReasons) && val.topFailReasons.length > 0 && (
              <div className="line-clamp-2">
                top fails:{' '}
                {val.topFailReasons
                  .map((r: [string, number]) => `${r[0]} (${r[1]})`)
                  .join(', ')}
              </div>
            )}
            <div className="font-mono">
              {fmtTime(valStart)} → {fmtTime(valEnd)}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No validation data recorded.</div>
        ),
    },
  ];

  return (
    <div className="border-t px-3 py-3">
      {release.error_message && (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <span className="font-medium">Error:</span> {release.error_message}
        </div>
      )}
      <ol className="relative space-y-3">
        {steps.map((step, idx) => (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center border',
                  step.failed
                    ? 'bg-destructive/10 border-destructive text-destructive'
                    : step.done
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground',
                )}
              >
                {step.failed ? (
                  <XCircle className="h-4 w-4" />
                ) : step.done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  step.icon
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'w-px flex-1 mt-1',
                    step.done ? 'bg-primary/40' : 'bg-muted-foreground/20',
                  )}
                />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-muted-foreground">{step.icon}</span>
                  {step.label}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{fmtTime(step.ts)}</span>
                  {step.duration && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {step.duration}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-1">{step.result}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}