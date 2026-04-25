import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Octagon,
  Play,
  RefreshCw,
  Square,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useJobRunner, type JobRunStep } from '@/hooks/useJobRunner';

/**
 * Admin queue/job-status page for the `run-all` pipeline.
 *
 * Why this exists separately from /admin/progress:
 *   ProgressDashboard is read-only (KPI tiles, last 10 runs).
 *   This page is the *operator console*: start async runs, watch live
 *   step progress, stream the log tail, and stop a run cooperatively
 *   or with force.
 *
 * All transport (run-all / cancel-run / job-status polling) is handled
 * by useJobRunner so we don't fork that contract.
 */

function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    queued: { label: 'Queued', cls: 'bg-muted text-foreground', icon: CircleDashed },
    running: { label: 'Running', cls: 'bg-primary/15 text-primary border-primary/30', icon: Loader2 },
    success: { label: 'Success', cls: 'bg-green-500/15 text-green-600 border-green-500/30', icon: CheckCircle2 },
    failed: { label: 'Failed', cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: XCircle },
    cancelled: { label: 'Cancelled', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30', icon: Octagon },
    pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground', icon: CircleDashed },
    skipped: { label: 'Skipped', cls: 'bg-muted text-muted-foreground line-through', icon: CircleDashed },
  };
  const meta = map[status ?? ''] ?? { label: status ?? '—', cls: 'bg-muted text-muted-foreground', icon: CircleDashed };
  const Icon = meta.icon;
  const spin = status === 'running' || status === 'queued' ? 'animate-spin' : '';
  return (
    <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
      <Icon className={`w-3 h-3 ${spin}`} />
      {meta.label}
    </Badge>
  );
}

function StepRow({ step }: { step: JobRunStep }) {
  const duration = step.duration_ms ? `${(step.duration_ms / 1000).toFixed(1)}s` : '—';
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">
          {step.step_order}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{step.step_label}</p>
          <p className="text-xs text-muted-foreground truncate">{step.step_key}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">{duration}</span>
        <StatusBadge status={step.status} />
      </div>
    </div>
  );
}

export default function JobsQueuePage() {
  const job = useJobRunner();
  const [actionPending, setActionPending] = useState<null | 'dryrun' | 'fullstack' | 'cancel' | 'force-cancel'>(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll log tail when new entries arrive while a run is active.
  useEffect(() => {
    if (!job.isActive) return;
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.logs.length, job.isActive]);

  const stepCounts = useMemo(() => {
    const counts = { success: 0, failed: 0, skipped: 0, running: 0, pending: 0 };
    for (const s of job.steps) {
      if (s.status in counts) counts[s.status as keyof typeof counts]++;
    }
    return counts;
  }, [job.steps]);

  const handleStart = async (mode: 'dryrun' | 'fullstack') => {
    setActionPending(mode);
    await job.triggerRun(mode, false);
    setActionPending(null);
  };

  const handleCancel = async (force: boolean) => {
    setActionPending(force ? 'force-cancel' : 'cancel');
    await job.cancelRun(undefined, force);
    setActionPending(null);
    setConfirmForce(false);
  };

  const totalDuration = job.run?.duration_ms
    ? `${(job.run.duration_ms / 1000).toFixed(1)}s`
    : job.run?.started_at && job.isActive
    ? `${Math.round((Date.now() - new Date(job.run.started_at).getTime()) / 1000)}s (live)`
    : '—';

  return (
    <>
      <Helmet>
        <title>Jobs Queue · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Jobs Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Start, monitor, and stop async <code className="text-xs px-1 rounded bg-muted">run-all</code> pipelines.
            Polls the latest run every 10s while active.
          </p>
        </header>

        {/* ── Action bar ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 p-4 border border-border/60 rounded-xl bg-card">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStart('dryrun')}
            disabled={job.isActive || actionPending !== null}
          >
            {actionPending === 'dryrun' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start dry-run
          </Button>
          <Button
            size="sm"
            onClick={() => handleStart('fullstack')}
            disabled={job.isActive || actionPending !== null}
          >
            {actionPending === 'fullstack' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Start full run
          </Button>

          <div className="flex-1" />

          <Button
            size="sm"
            variant="outline"
            onClick={() => job.refresh()}
            disabled={actionPending !== null}
          >
            <RefreshCw className={`w-4 h-4 ${job.loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {job.isActive && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCancel(false)}
                disabled={actionPending !== null}
              >
                {actionPending === 'cancel' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Stop (cooperative)
              </Button>
              {confirmForce ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleCancel(true)}
                  disabled={actionPending !== null}
                >
                  {actionPending === 'force-cancel' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Octagon className="w-4 h-4" />
                  )}
                  Confirm force-stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmForce(true)}
                  disabled={actionPending !== null}
                >
                  Force-stop…
                </Button>
              )}
            </>
          )}
        </div>

        {/* ── Error / re-auth banner ─────────────────────── */}
        {job.error && (
          <div className="flex items-start gap-2 p-3 border border-destructive/40 bg-destructive/5 rounded-xl text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">{job.error}</p>
              {job.reauthRequired && (
                <p className="text-xs">Refresh the page or log out and back in to renew your session.</p>
              )}
              {job.traceId && (
                <p className="text-xs opacity-70">trace: {job.traceId}</p>
              )}
            </div>
          </div>
        )}
        {job.appearsStuck && job.isActive && (
          <div className="flex items-start gap-2 p-3 border border-amber-500/40 bg-amber-500/5 rounded-xl text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>No progress for 90s. The run may be stuck — consider force-stop if it doesn't recover.</p>
          </div>
        )}

        {/* ── Run summary ────────────────────────────────── */}
        <section className="border border-border/60 rounded-xl bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Latest run</p>
              <p className="text-sm font-mono text-foreground">{job.run?.id ?? '—'}</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={job.run?.status} />
              <span className="text-xs text-muted-foreground tabular-nums">{totalDuration}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Metric label="Success" value={stepCounts.success} tone="ok" />
            <Metric label="Failed" value={stepCounts.failed} tone="bad" />
            <Metric label="Skipped" value={stepCounts.skipped} tone="muted" />
            <Metric label="Running" value={stepCounts.running} tone="active" />
            <Metric label="Pending" value={stepCounts.pending} tone="muted" />
          </div>
          {job.run?.error_message && (
            <p className="text-xs text-destructive font-mono whitespace-pre-wrap">
              {job.run.error_message}
            </p>
          )}
          {job.run?.started_at && (
            <p className="text-xs text-muted-foreground">
              Started {format(new Date(job.run.started_at), 'PPp')}
              {job.run.finished_at && ` · finished ${format(new Date(job.run.finished_at), 'PPp')}`}
              {job.run.source && ` · source: ${job.run.source}`}
            </p>
          )}
        </section>

        {/* ── Steps ──────────────────────────────────────── */}
        <section className="border border-border/60 rounded-xl bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <h2 className="text-sm font-semibold text-foreground">Steps ({job.steps.length})</h2>
          </div>
          {job.steps.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              {job.loading ? 'Loading…' : 'No steps to display. Start a run to begin.'}
            </p>
          ) : (
            <div>{job.steps.map(s => <StepRow key={s.id} step={s} />)}</div>
          )}
        </section>

        {/* ── Log tail ───────────────────────────────────── */}
        <section className="border border-border/60 rounded-xl bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <h2 className="text-sm font-semibold text-foreground">Log tail</h2>
            <span className="text-xs text-muted-foreground">{job.logs.length} entries</span>
          </div>
          <ScrollArea className="h-72">
            <div ref={logScrollRef} className="p-3 font-mono text-xs space-y-1">
              {job.logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No log entries.</p>
              ) : (
                job.logs.map(l => (
                  <div key={l.id} className="flex gap-2 items-start">
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {format(new Date(l.created_at), 'HH:mm:ss')}
                    </span>
                    <span
                      className={
                        l.level === 'error'
                          ? 'text-destructive shrink-0'
                          : l.level === 'warn'
                          ? 'text-amber-600 dark:text-amber-400 shrink-0'
                          : 'text-muted-foreground shrink-0'
                      }
                    >
                      [{l.level}]
                    </span>
                    {l.step_key && (
                      <span className="text-primary shrink-0">{l.step_key}</span>
                    )}
                    <span className="text-foreground break-words">{l.message}</span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'bad' | 'muted' | 'active' }) {
  const cls =
    tone === 'ok'
      ? 'text-green-600 dark:text-green-400'
      : tone === 'bad'
      ? 'text-destructive'
      : tone === 'active'
      ? 'text-primary'
      : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-muted/40 border border-border/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}