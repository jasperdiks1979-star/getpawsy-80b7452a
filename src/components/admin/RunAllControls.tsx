import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Play, Loader2, CheckCircle, XCircle, Clock, Shield, AlertTriangle, RefreshCw, StopCircle,
} from 'lucide-react';
import { useJobRunner } from '@/hooks/useJobRunner';
import { GovernorStatusDisplay } from '@/components/admin/GovernorStatusDisplay';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const LS_DRY_RUN_KEY = 'runall-dryrun-toggle';
const LS_LAST_RUN_KEY = 'runall-last-run';

interface LastRunSummary {
  runId: string;
  traceId: string | null;
  status: string;
  timestamp: string;
  submittedCount?: number;
  mode: string;
  failedStep?: string;
  failedError?: string;
}

/**
 * Compact "Run ALL" master control — placed next to the products pill on the Admin Dashboard.
 * Provides dry run toggle, guarded indexing confirm, cooldown handling, and status display.
 */
export function RunAllControls() {
  const { run, steps, loading, triggering, isActive, error, reauthRequired, traceId, triggerRun, cancelRun, refresh, appearsStuck, resetView } = useJobRunner();
  const [cancelling, setCancelling] = useState(false);

  // Persist dry run toggle
  const [dryRun, setDryRun] = useState(() => {
    try { return localStorage.getItem(LS_DRY_RUN_KEY) !== 'false'; } catch { return true; }
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);
  const [lastRun, setLastRun] = useState<LastRunSummary | null>(() => {
    try { const v = localStorage.getItem(LS_LAST_RUN_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
  });

  // Persist toggle
  useEffect(() => {
    try { localStorage.setItem(LS_DRY_RUN_KEY, String(dryRun)); } catch {}
  }, [dryRun]);

  // Sync last run from server data
  useEffect(() => {
    if (!run) return;
    const failedStep = steps.find(s => s.status === 'failed');
    const summary: LastRunSummary = {
      runId: run.id,
      traceId: traceId || null,
      status: run.status,
      timestamp: run.started_at || run.created_at,
      mode: (run.report as any)?.mode || 'fullstack',
      submittedCount: (run.report as any)?.indexing?.submittedCount,
      failedStep: failedStep?.step_label,
      failedError: failedStep?.error_message || undefined,
    };
    setLastRun(summary);
    try { localStorage.setItem(LS_LAST_RUN_KEY, JSON.stringify(summary)); } catch {}
  }, [run, steps, traceId]);

  // Governor-based adaptive evaluation replaces static cooldown
  // GovernorStatusDisplay component handles countdown and re-evaluation

  const handleClick = useCallback(() => {
    if (dryRun) {
      doRun('dryrun');
    } else {
      setConfirmOpen(true);
    }
  }, [dryRun]);

  const doRun = async (mode: 'dryrun' | 'fullstack') => {
    setConfirmOpen(false);
    const result = await triggerRun(mode, forceOverride);
    if (result?.ok) {
      toast.success(mode === 'dryrun' ? 'Dry Run started' : 'Full Stack pipeline started');
    } else if (result?.reauthRequired) {
      toast.error('GSC re-auth needed. Pipeline will still run other steps.');
    } else {
      const reason = result?.reason || 'Failed to start pipeline';
      toast.error(reason);
    }
  };

  const handleCancel = useCallback(async (force = false) => {
    setCancelling(true);
    const result = await cancelRun(undefined, force);
    setCancelling(false);
    if (result?.ok) {
      toast.success(force ? 'Run force-cancelled' : 'Cancel requested — pipeline will stop between steps');
    } else {
      toast.error(result?.reason || 'Failed to cancel');
    }
  }, [cancelRun]);

  const disabled = isActive || triggering;

  if (loading) return null;

  // Time ago helper
  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const statusIcons: Record<string, typeof CheckCircle> = {
    success: CheckCircle, failed: XCircle, running: Loader2, queued: Clock,
  };
  const statusColors: Record<string, string> = {
    success: 'text-green-500', failed: 'text-destructive', running: 'text-primary', queued: 'text-muted-foreground',
  };

  const displayRun = run || lastRun;
  const displayStatus = displayRun?.status || 'idle';
  const StatusIcon = statusIcons[displayStatus] || Clock;

  return (
    <>
      {/* Compact control group */}
      <div className="flex flex-col gap-1.5">
        {/* Adaptive Execution Status */}
        <GovernorStatusDisplay
          mode={dryRun ? 'dryrun' : 'fullstack'}
          forceOverride={forceOverride}
          onForceOverrideChange={setForceOverride}
        />
        <div className="flex items-center gap-2 flex-wrap">
          {/* Dry Run toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <Switch
              checked={dryRun}
              onCheckedChange={setDryRun}
              disabled={disabled}
              className="scale-75 origin-left"
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              Dry Run
            </span>
          </label>

          {/* Run button */}
          <Button
            size="sm"
            variant={dryRun ? 'outline' : 'destructive'}
            onClick={handleClick}
            disabled={disabled}
            className="gap-1.5 text-xs h-8 px-3"
          >
            {triggering || isActive ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : dryRun ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
            {isActive
              ? 'Running…'
              : dryRun
                ? 'Run ALL (Dry Run)'
                : 'Run ALL + Indexing'}
          </Button>

          {/* Cancel button — always visible when active */}
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCancel(false)}
              disabled={cancelling}
              className="gap-1.5 text-xs h-8 px-3 border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              {cancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <StopCircle className="h-3.5 w-3.5" />
              )}
              Cancel
            </Button>
          )}

          {/* Force Override — only when stuck */}
          {appearsStuck && isActive && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleCancel(true)}
              disabled={cancelling}
              className="gap-1.5 text-xs h-8 px-3"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Force Stop
            </Button>
          )}
        </div>

        {/* Last run status chip */}
        {displayRun && (
          <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
            <StatusIcon
              className={cn(
                'h-3 w-3 shrink-0',
                statusColors[displayStatus],
                displayStatus === 'running' && 'animate-spin'
              )}
            />
            <span className={cn('capitalize', statusColors[displayStatus])}>
              {displayStatus}
            </span>
            {'timestamp' in displayRun && displayRun.timestamp && (
              <span className="text-muted-foreground">
                {timeAgo(displayRun.timestamp)}
              </span>
            )}
            {run?.started_at && !('timestamp' in displayRun && displayRun.timestamp) && (
              <span className="text-muted-foreground">
                {timeAgo(run.started_at)}
              </span>
            )}
            {(displayRun as any)?.submittedCount != null && (displayRun as any).submittedCount > 0 && (
              <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                {(displayRun as any).submittedCount} submitted
              </Badge>
            )}
            {displayStatus === 'failed' && (displayRun as any)?.failedStep && (
              <span className="text-destructive truncate max-w-[140px]" title={(displayRun as any).failedError}>
                {(displayRun as any).failedStep}
              </span>
            )}
          </div>
        )}

        {/* Stuck run warning */}
        {appearsStuck && isActive && (
          <div className="flex items-center gap-1.5 text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1 flex-wrap">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Run appears stuck — will auto-release after timeout</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] gap-1"
              onClick={resetView}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
        )}
        {!isActive && run?.error_message?.includes('auto-released') && (
          <div className="flex items-center gap-1.5 text-[10px] text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Run auto-released after timeout</span>
          </div>
        )}
      </div>

      {/* Full Stack confirmation modal */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Run Full Stack + Indexing?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-sm">This will run the full 9-step automation <strong>AND</strong> submit URLs for indexing:</p>
                <ul className="list-disc pl-4 text-xs space-y-0.5 text-muted-foreground">
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
            <AlertDialogAction onClick={() => doRun('fullstack')}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
