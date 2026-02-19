import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play, Loader2, CheckCircle, XCircle, Clock, AlertTriangle,
  RefreshCw, SkipForward, ChevronDown, ChevronUp, FileJson, Copy, Zap, Shield,
} from 'lucide-react';
import { useJobRunner, type JobRunStep, type JobRunLog } from '@/hooks/useJobRunner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function RunCenterCard() {
  const { run, steps, logs, loading, triggering, isActive, error, triggerRun, refresh } = useJobRunner();
  const [logsOpen, setLogsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmFullStack, setConfirmFullStack] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);

  // Parse cooldown from error
  const cooldownMatch = error?.match(/Next manual run allowed at (.+)/);
  const cooldownTarget = cooldownMatch ? new Date(cooldownMatch[1]) : null;

  useEffect(() => {
    if (!cooldownTarget) { setCooldownRemaining(null); return; }
    const tick = () => {
      const diff = cooldownTarget.getTime() - Date.now();
      if (diff <= 0) { setCooldownRemaining(null); refresh(); return; }
      setCooldownRemaining(`${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [cooldownTarget, refresh]);

  const handleRun = async (mode: 'dryrun' | 'fullstack') => {
    setConfirmFullStack(false);
    const result = await triggerRun(mode);
    if (result?.ok) {
      toast.success(mode === 'dryrun' ? 'Dry Run started' : 'Full Stack pipeline started');
    } else {
      toast.error(result?.reason || 'Failed to start pipeline');
    }
  };

  const copyReport = () => {
    if (run?.report) {
      navigator.clipboard.writeText(JSON.stringify(run.report, null, 2));
      toast.success('Report JSON copied');
    }
  };

  const disabled = isActive || triggering || !!cooldownRemaining;

  if (loading) return null; // Don't show skeleton on main dashboard — keep it clean

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Run Center
              </CardTitle>
              <CardDescription className="text-xs">
                Manual pipeline execution · 9 steps · 30 min cooldown
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={triggering}>
              <RefreshCw className={cn("h-3.5 w-3.5", isActive && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="space-y-0.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRun('dryrun')}
                disabled={disabled}
                className="gap-1.5 text-xs"
              >
                {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {isActive ? 'Running…' : cooldownRemaining ? `Cooldown: ${cooldownRemaining}` : 'Run ALL (Dry Run)'}
              </Button>
              <p className="text-[10px] text-muted-foreground pl-0.5">Runs everything except indexing submits.</p>
            </div>
            <div className="space-y-0.5">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmFullStack(true)}
                disabled={disabled}
                className="gap-1.5 text-xs"
              >
                {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                {isActive ? 'Running…' : cooldownRemaining ? `Cooldown: ${cooldownRemaining}` : 'Run ALL (Full Stack + Indexing)'}
              </Button>
              <p className="text-[10px] text-muted-foreground pl-0.5">Includes indexing submits (guarded).</p>
            </div>
          </div>

          {/* Error (non-cooldown) */}
          {error && !isActive && !cooldownRemaining && (
            <div className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 rounded px-2 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {/* Run status */}
          {run && (
            <div className="space-y-2">
              {/* Status line */}
              <div className="flex items-center justify-between text-[10px] flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={run.status} />
                  <span className="text-muted-foreground">
                    {run.source} · {run.report && (run.report as Record<string, unknown>)?.mode ? String((run.report as Record<string, unknown>).mode) : 'fullstack'}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {run.started_at && <span>{new Date(run.started_at).toLocaleString()}</span>}
                  {run.duration_ms != null && <span> · {fmtDur(run.duration_ms)}</span>}
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-0.5">
                {steps.map(s => <StepRow key={s.id} step={s} />)}
              </div>

              {/* Action row */}
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => setLogsOpen(!logsOpen)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {logsOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                  {logsOpen ? 'Hide logs' : `Logs (${logs.length})`}
                </button>
                {run.report && (
                  <>
                    <button
                      onClick={() => setReportOpen(!reportOpen)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <FileJson className="h-2.5 w-2.5" />
                      {reportOpen ? 'Hide report' : 'Report'}
                    </button>
                    <button
                      onClick={copyReport}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="h-2.5 w-2.5" /> Copy JSON
                    </button>
                  </>
                )}
              </div>

              {logsOpen && logs.length > 0 && (
                <ScrollArea className="h-40 border rounded bg-muted/30">
                  <div className="p-1.5 space-y-0 font-mono text-[10px]">
                    {logs.map(l => <LogLine key={l.id} log={l} />)}
                  </div>
                </ScrollArea>
              )}

              {reportOpen && run.report && (
                <ScrollArea className="h-48 border rounded bg-muted/30">
                  <pre className="p-2 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(run.report, null, 2)}
                  </pre>
                </ScrollArea>
              )}
            </div>
          )}

          {!run && !error && (
            <p className="text-center py-3 text-[10px] text-muted-foreground">
              No runs yet. Use Dry Run or Full Stack to start.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Confirm Full Stack */}
      <AlertDialog open={confirmFullStack} onOpenChange={setConfirmFullStack}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Full Stack + Indexing?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>This will run full SEO automation <strong>AND</strong> submit URLs for indexing:</p>
                <ul className="mt-2 space-y-0.5 list-disc pl-4 text-xs">
                  <li>Max 20 URLs per run (allowlisted to getpawsy.pet)</li>
                  <li>7-day dedupe — won't resubmit recent URLs</li>
                  <li>Aborts if crawl health check has critical failures</li>
                  <li>All other changes saved as drafts</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRun('fullstack')}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: typeof CheckCircle; variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    queued: { icon: Clock, variant: 'secondary', label: 'Queued' },
    running: { icon: Loader2, variant: 'default', label: 'Running' },
    success: { icon: CheckCircle, variant: 'outline', label: 'Success' },
    failed: { icon: XCircle, variant: 'destructive', label: 'Failed' },
    cancelled: { icon: XCircle, variant: 'secondary', label: 'Cancelled' },
  };
  const c = cfg[status] || cfg.queued;
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="text-[9px] gap-0.5 h-4 px-1">
      <Icon className={cn("h-2.5 w-2.5", status === 'running' && "animate-spin")} />
      {c.label}
    </Badge>
  );
}

function StepRow({ step }: { step: JobRunStep }) {
  const icons: Record<string, typeof CheckCircle> = { pending: Clock, running: Loader2, success: CheckCircle, failed: XCircle, skipped: SkipForward };
  const colors: Record<string, string> = { pending: 'text-muted-foreground', running: 'text-primary', success: 'text-green-500', failed: 'text-destructive', skipped: 'text-muted-foreground/50' };
  const Icon = icons[step.status] || Clock;
  return (
    <div className="flex items-center justify-between text-[10px] py-0.5 px-1.5 rounded hover:bg-muted/50">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3", colors[step.status], step.status === 'running' && 'animate-spin')} />
        <span className={cn(step.status === 'skipped' && 'line-through text-muted-foreground')}>{step.step_label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {step.duration_ms != null && <span>{fmtDur(step.duration_ms)}</span>}
        {step.error_message && <span className="text-destructive truncate max-w-[150px]" title={step.error_message}>{step.error_message}</span>}
      </div>
    </div>
  );
}

function LogLine({ log }: { log: JobRunLog }) {
  const lc: Record<string, string> = { info: 'text-muted-foreground', warn: 'text-yellow-500', error: 'text-destructive', debug: 'text-muted-foreground/60' };
  return (
    <div className={cn("flex gap-1.5", lc[log.level])}>
      <span className="text-muted-foreground/50 shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
      <span className="uppercase font-bold w-8 shrink-0 text-right">{log.level}</span>
      <span className="break-all">{log.message}</span>
    </div>
  );
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
