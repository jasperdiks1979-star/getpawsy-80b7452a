import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play, Loader2, CheckCircle, XCircle, Clock, AlertTriangle,
  RefreshCw, SkipForward, Terminal, ChevronDown, ChevronUp, FileJson,
} from 'lucide-react';
import { useJobRunner, type JobRunStep, type JobRunLog } from '@/hooks/useJobRunner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function RunAllPanel() {
  const { run, steps, logs, loading, triggering, isActive, error, triggerRun, refresh } = useJobRunner();
  const [logsOpen, setLogsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);

  // Parse cooldown from error message
  const cooldownMatch = error?.match(/Next manual run allowed at (.+)/);
  const cooldownTarget = cooldownMatch ? new Date(cooldownMatch[1]) : null;

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownTarget) {
      setCooldownRemaining(null);
      return;
    }

    const tick = () => {
      const diff = cooldownTarget.getTime() - Date.now();
      if (diff <= 0) {
        setCooldownRemaining(null);
        refresh();
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCooldownRemaining(`${mins}m ${secs}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownTarget, refresh]);

  const handleConfirmRun = async () => {
    setConfirmOpen(false);
    const result = await triggerRun();
    if (result?.ok) {
      toast.success('Full Stack pipeline started');
    } else {
      toast.error(result?.reason || 'Failed to start pipeline');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                Pipeline Runner (Full Stack)
              </CardTitle>
              <CardDescription>
                GSC sync · Crawl health · Perf snapshot · Orphan detection · CTR recovery · Ranking push · Content queue · Indexing submit
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={refresh} disabled={triggering}>
              <RefreshCw className={cn("h-4 w-4", isActive && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Action Button */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={isActive || triggering || !!cooldownRemaining}
              className="gap-2"
            >
              {triggering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isActive
                ? 'Run in progress…'
                : cooldownRemaining
                  ? `Cooldown: ${cooldownRemaining}`
                  : 'Run ALL now (Full Stack)'}
            </Button>
          </div>

          {/* Error display (excluding cooldown which is shown on button) */}
          {error && !isActive && !cooldownRemaining && (
            <div className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Run Status */}
          {run && (
            <div className="space-y-3">
              {/* Run header */}
              <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={run.status} />
                  <span className="text-muted-foreground">
                    Source: <span className="font-medium">{run.source}</span>
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {run.started_at && (
                    <span>Started: {new Date(run.started_at).toLocaleString()}</span>
                  )}
                  {run.duration_ms != null && (
                    <span className="ml-2">· {formatDuration(run.duration_ms)}</span>
                  )}
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-1.5">
                {steps.map(step => (
                  <StepRow key={step.id} step={step} />
                ))}
              </div>

              {/* Action row: logs + report */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setLogsOpen(!logsOpen)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {logsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {logsOpen ? 'Hide logs' : `Show logs (${logs.length})`}
                </button>

                {run.report && (
                  <button
                    onClick={() => setReportOpen(!reportOpen)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <FileJson className="h-3 w-3" />
                    {reportOpen ? 'Hide report' : 'View report JSON'}
                  </button>
                )}
              </div>

              {/* Log viewer */}
              {logsOpen && logs.length > 0 && (
                <ScrollArea className="h-56 border rounded bg-muted/30">
                  <div className="p-2 space-y-0.5 font-mono text-[11px]">
                    {logs.map(log => (
                      <LogLine key={log.id} log={log} />
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Report JSON viewer */}
              {reportOpen && run.report && (
                <ScrollArea className="h-64 border rounded bg-muted/30">
                  <pre className="p-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(run.report, null, 2)}
                  </pre>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Empty state */}
          {!run && !error && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No runs yet. Click "Run ALL now" to execute the full pipeline.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Full Stack Pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              This will execute the entire SEO automation pipeline including:
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li>GSC query-level sync</li>
                <li>Crawl & domain health check</li>
                <li>Performance snapshot</li>
                <li>Orphan detection & internal link plan</li>
                <li>CTR recovery optimizer</li>
                <li>Ranking push builder</li>
                <li>Content generation queue</li>
                <li><strong>Indexing URL submissions</strong> (max 20 URLs, deduped)</li>
                <li>Consolidated report compilation</li>
              </ul>
              <p className="mt-2 text-xs">
                All generated changes are saved as drafts. Indexing submissions are real and will be sent to search engines.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRun}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    queued: { icon: Clock, variant: 'secondary', label: 'Queued' },
    running: { icon: Loader2, variant: 'default', label: 'Running' },
    success: { icon: CheckCircle, variant: 'outline', label: 'Success' },
    failed: { icon: XCircle, variant: 'destructive', label: 'Failed' },
    cancelled: { icon: XCircle, variant: 'secondary', label: 'Cancelled' },
  };

  const c = config[status] || config.queued;
  const Icon = c.icon;

  return (
    <Badge variant={c.variant} className="text-[10px] gap-1">
      <Icon className={cn("h-3 w-3", status === 'running' && "animate-spin")} />
      {c.label}
    </Badge>
  );
}

function StepRow({ step }: { step: JobRunStep }) {
  const icons: Record<string, typeof CheckCircle> = {
    pending: Clock, running: Loader2, success: CheckCircle, failed: XCircle, skipped: SkipForward,
  };
  const colors: Record<string, string> = {
    pending: 'text-muted-foreground', running: 'text-primary',
    success: 'text-green-500', failed: 'text-destructive', skipped: 'text-muted-foreground/50',
  };

  const Icon = icons[step.status] || Clock;

  return (
    <div className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", colors[step.status], step.status === 'running' && 'animate-spin')} />
        <span className={cn(step.status === 'skipped' && 'line-through text-muted-foreground')}>
          {step.step_label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        {step.duration_ms != null && <span>{formatDuration(step.duration_ms)}</span>}
        {step.error_message && (
          <span className="text-destructive truncate max-w-[200px]" title={step.error_message}>
            {step.error_message}
          </span>
        )}
      </div>
    </div>
  );
}

function LogLine({ log }: { log: JobRunLog }) {
  const levelColors: Record<string, string> = {
    info: 'text-muted-foreground', warn: 'text-yellow-500',
    error: 'text-destructive', debug: 'text-muted-foreground/60',
  };

  return (
    <div className={cn("flex gap-2", levelColors[log.level])}>
      <span className="text-muted-foreground/50 shrink-0">
        {new Date(log.created_at).toLocaleTimeString()}
      </span>
      <span className="uppercase font-bold w-10 shrink-0 text-right">{log.level}</span>
      <span className="break-all">{log.message}</span>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
