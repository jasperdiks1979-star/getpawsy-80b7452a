import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Check, ScrollText, RefreshCw, Pause, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Per-timeline-step evidence viewer.
 *
 * Shows the full JSON payload for a release step (record / merchant-sync /
 * validate-merchant-feed) plus — when a `runId` is available — the matching
 * job-runs row, its steps and the most recent log lines fetched live via the
 * `job-status` edge function. Designed for "I need to debug why this release
 * failed" workflows without leaving the admin page.
 */

export type StepEvidenceKind = 'record' | 'sync' | 'validate';

interface JobRun {
  id: string;
  job_name?: string | null;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  total_steps?: number | null;
  current_step?: number | null;
  metadata?: unknown;
}
interface JobStep {
  id: string;
  step_order: number;
  step_name: string;
  status: string;
  message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}
interface JobLog {
  id: string;
  level: string;
  message: string;
  created_at: string;
  metadata?: unknown;
}
interface JobStatusResponse {
  ok: boolean;
  reason?: string;
  run?: JobRun | null;
  steps?: JobStep[];
  logs?: JobLog[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: StepEvidenceKind;
  stepLabel: string;
  releaseId: string;
  releaseTitle: string;
  /** Raw payload for the step (sync_summary / validation_summary / record meta). */
  payload: unknown;
  /** Optional runId from sync_summary.runId — drives job-status fetch. */
  runId?: string | null;
  /** Optional release-level error_message to surface alongside step JSON. */
  errorMessage?: string | null;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success('Copied to clipboard');
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Copy failed');
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return (
    <pre className="max-h-[40vh] overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words">
      {text}
    </pre>
  );
}

function logLevelClass(level: string) {
  const l = level.toLowerCase();
  if (l === 'error' || l === 'fatal') return 'text-destructive';
  if (l === 'warn' || l === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (l === 'success') return 'text-emerald-600 dark:text-emerald-400';
  return 'text-muted-foreground';
}

export function ReleaseStepEvidenceDialog({
  open,
  onOpenChange,
  kind,
  stepLabel,
  releaseId,
  releaseTitle,
  payload,
  runId,
  errorMessage,
}: Props) {
  const [jobData, setJobData] = useState<JobStatusResponse | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Tick once a second so the "x seconds ago" label stays live without
  // re-fetching the network on every render.
  const [, setNowTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobStatus = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!runId) return;
      if (mode === 'initial') setJobLoading(true);
      const { data, error } = await supabase.functions.invoke('job-status', {
        body: { runId },
      });
      if (error) {
        setJobError(error.message ?? 'Failed to load job status');
        if (mode === 'initial') setJobData(null);
      } else {
        const resp = (data ?? {}) as JobStatusResponse;
        if (!resp.ok) {
          setJobError(resp.reason ?? 'job-status returned ok:false');
        } else {
          setJobError(null);
        }
        setJobData(resp);
      }
      setLastFetchedAt(Date.now());
      if (mode === 'initial') setJobLoading(false);
    },
    [runId],
  );

  // Initial fetch + reset on open/close.
  useEffect(() => {
    if (!open || !runId) {
      setJobData(null);
      setJobError(null);
      setLastFetchedAt(null);
      return;
    }
    let cancelled = false;
    setJobLoading(true);
    setJobError(null);
    (async () => {
      const { data, error } = await supabase.functions.invoke('job-status', {
        body: { runId },
      });
      if (cancelled) return;
      if (error) {
        setJobError(error.message ?? 'Failed to load job status');
        setJobData(null);
      } else {
        const resp = (data ?? {}) as JobStatusResponse;
        if (!resp.ok) setJobError(resp.reason ?? 'job-status returned ok:false');
        setJobData(resp);
      }
      setLastFetchedAt(Date.now());
      setJobLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, runId]);

  // Auto-refresh every 10s while the dialog is open and toggle is on.
  // We also pause polling when the tab is hidden to avoid wasted invokes.
  useEffect(() => {
    if (!open || !runId || !autoRefresh) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchJobStatus('refresh');
    };
    intervalRef.current = setInterval(tick, 10_000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, runId, autoRefresh, fetchJobStatus]);

  // Drive the "updated Ns ago" label.
  useEffect(() => {
    if (!open || !lastFetchedAt) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [open, lastFetchedAt]);

  const secondsAgo = lastFetchedAt
    ? Math.max(0, Math.round((Date.now() - lastFetchedAt) / 1000))
    : null;

  const fullEvidence = {
    release: { id: releaseId, title: releaseTitle },
    step: { kind, label: stepLabel },
    runId: runId ?? null,
    errorMessage: errorMessage ?? null,
    payload: payload ?? null,
    jobRun: jobData?.run ?? null,
    jobSteps: jobData?.steps ?? null,
    jobLogs: jobData?.logs ?? null,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            {stepLabel} — evidence
          </DialogTitle>
          <DialogDescription>
            Volledige JSON van deze release-stap{runId ? ', plus live job-status logs' : ''}.
            Handig voor debugging en hand-off naar engineering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono">release: {releaseId.slice(0, 12)}</Badge>
            {runId && <Badge variant="outline" className="font-mono">run: {runId.slice(0, 12)}</Badge>}
            <Badge variant="secondary" className="capitalize">{kind}</Badge>
            <div className="ml-auto">
              <CopyButton
                text={JSON.stringify(fullEvidence, null, 2)}
                label="Copy all evidence"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <span className="font-medium">Release error:</span> {errorMessage}
            </div>
          )}

          {/* Step payload */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Step payload</h4>
              <CopyButton text={JSON.stringify(payload ?? null, null, 2)} label="Copy" />
            </div>
            <JsonBlock value={payload ?? { note: 'no payload recorded for this step' }} />
          </section>

          {/* Job run + steps + logs */}
          {runId && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Job run, steps &amp; logs</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {jobLoading ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </span>
                  ) : (
                    lastFetchedAt && (
                      <span aria-live="polite">
                        {autoRefresh ? 'Auto' : 'Paused'} · updated{' '}
                        {secondsAgo !== null && secondsAgo < 5
                          ? 'just now'
                          : `${secondsAgo}s ago`}
                      </span>
                    )
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    onClick={() => fetchJobStatus('refresh')}
                    disabled={jobLoading}
                    title="Refresh now"
                  >
                    <RefreshCw className={cn('h-3 w-3', jobLoading && 'animate-spin')} />
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    onClick={() => setAutoRefresh((v) => !v)}
                    title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh (10s)'}
                  >
                    {autoRefresh ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {autoRefresh ? 'Pause' : 'Auto 10s'}
                  </Button>
                </div>
              </div>
              {jobError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {jobError}
                </div>
              )}
              {!jobLoading && !jobError && jobData?.run && (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">job_runs row</div>
                    <JsonBlock value={jobData.run} />
                  </div>
                  {Array.isArray(jobData.steps) && jobData.steps.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        steps ({jobData.steps.length})
                      </div>
                      <JsonBlock value={jobData.steps} />
                    </div>
                  )}
                  {Array.isArray(jobData.logs) && jobData.logs.length > 0 ? (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        recent logs ({jobData.logs.length})
                      </div>
                      <div className="max-h-[30vh] overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] font-mono leading-relaxed">
                        {jobData.logs.map((l) => (
                          <div key={l.id} className="flex gap-2 py-0.5">
                            <span className="text-muted-foreground shrink-0">
                              {new Date(l.created_at).toLocaleTimeString()}
                            </span>
                            <span className={cn('uppercase shrink-0 w-12', logLevelClass(l.level))}>
                              {l.level}
                            </span>
                            <span className="whitespace-pre-wrap break-words">{l.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    !jobLoading && (
                      <div className="text-xs italic text-muted-foreground">
                        No log lines recorded for this run.
                      </div>
                    )
                  )}
                </div>
              )}
              {!jobLoading && !jobError && !jobData?.run && (
                <div className="text-xs italic text-muted-foreground">
                  Geen job_runs record gevonden voor runId {runId.slice(0, 12)}.
                </div>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
