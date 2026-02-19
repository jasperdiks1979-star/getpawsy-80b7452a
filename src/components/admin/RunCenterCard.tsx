import { useState, useEffect, useCallback } from 'react';
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
  RefreshCw, SkipForward, ChevronDown, ChevronUp, FileJson, Copy, Zap, Shield, Globe,
} from 'lucide-react';
import { useJobRunner, type JobRunStep, type JobRunLog } from '@/hooks/useJobRunner';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface RedirectResult {
  url: string;
  status: number;
  location: string | null;
  server: string | null;
  cfRay: string | null;
  redirectSource: string;
}

export function RunCenterCard() {
  const { run, steps, logs, loading, triggering, isActive, error, reauthRequired, traceId, triggerRun, refresh } = useJobRunner();
  const [logsOpen, setLogsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmFullStack, setConfirmFullStack] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);
  const [redirectDebug, setRedirectDebug] = useState<RedirectResult[] | null>(null);
  const [redirectLoading, setRedirectLoading] = useState(false);

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

  const runRedirectDebug = useCallback(async () => {
    setRedirectLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('domain-health-check');
      if (fnErr) throw fnErr;
      const results = (data?.results || []).map((r: any) => ({
        url: r.target,
        status: r.hops?.[0]?.status || 0,
        location: r.hops?.[0]?.location || null,
        server: r.hops?.[0]?.server || null,
        cfRay: r.hops?.[0]?.cfRay || null,
        redirectSource: r.hops?.[0]?.cfRay && r.hops?.[0]?.server?.toLowerCase().includes('cloudflare') ? 'cloudflare' : 'origin',
      }));
      setRedirectDebug(results);
    } catch (e) {
      toast.error('Redirect debug failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRedirectLoading(false);
    }
  }, []);

  const handleRun = async (mode: 'dryrun' | 'fullstack') => {
    setConfirmFullStack(false);
    const result = await triggerRun(mode);
    if (result?.ok) {
      toast.success(mode === 'dryrun' ? 'Dry Run started' : 'Full Stack pipeline started');
    } else if (result?.reauthRequired) {
      toast.error('Session expired or GSC re-auth needed. Please refresh and try again.');
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

  if (loading) return null;

  // Check if any step has reauthRequired in its result
  const gscStep = steps.find(s => s.step_key === 'gsc_query_level_sync');
  const gscNeedsReauth = reauthRequired || 
    (gscStep?.status === 'failed' && (
      gscStep?.error_message?.includes('re-auth') || 
      gscStep?.error_message?.includes('service account') ||
      gscStep?.error_message?.includes('GOOGLE_SERVICE_ACCOUNT_JSON') ||
      gscStep?.error_message?.includes('Token exchange') ||
      gscStep?.error_message?.includes('Invalid token')
    ));

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
          {/* Reauth warning */}
          {gscNeedsReauth && (
            <div className="text-[10px] bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20 rounded px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="font-medium">Google Search Console auth issue</span>
              </div>
              <p className="pl-4">
                {gscStep?.error_message || 'GSC token needs re-configuration.'}
                {' '}The pipeline will continue with other steps, but GSC data won't sync until fixed.
              </p>
              <p className="pl-4 text-muted-foreground">
                Check that the GOOGLE_SERVICE_ACCOUNT_JSON secret is correctly configured in your backend settings.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-wrap gap-2 items-start">
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
            <div className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 rounded px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{error}</span>
              </div>
              {traceId && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <span>Trace: {traceId}</span>
                  <button onClick={() => { navigator.clipboard.writeText(traceId); toast.success('Trace ID copied'); }} className="hover:text-foreground">
                    <Copy className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
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

              {/* TraceId for completed runs */}
              {run.report && (run.report as Record<string, unknown>)?.traceId && (
                <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                  Trace: {String((run.report as Record<string, unknown>).traceId)}
                  <button onClick={() => { navigator.clipboard.writeText(String((run.report as Record<string, unknown>).traceId)); toast.success('Trace ID copied'); }} className="hover:text-foreground">
                    <Copy className="h-2 w-2" />
                  </button>
                </div>
              )}

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

          {/* Redirect Debug */}
          <div className="border-t pt-2 space-y-1.5">
            <Button
              variant="ghost" size="sm"
              className="gap-1.5 text-[10px] h-6 px-2"
              onClick={runRedirectDebug}
              disabled={redirectLoading}
            >
              {redirectLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
              Redirect Debug
            </Button>
            {redirectDebug && (
              <div className="space-y-0.5 font-mono text-[9px]">
                {redirectDebug.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 px-1.5 py-0.5 rounded bg-muted/30">
                    <Badge variant={r.status >= 300 && r.status < 400 ? 'outline' : 'destructive'} className="text-[8px] h-3.5 px-1 shrink-0">
                      {r.status}
                    </Badge>
                    <div className="min-w-0">
                      <span className="text-muted-foreground">{r.url}</span>
                      {r.location && <span className="text-foreground"> → {r.location}</span>}
                      <span className="text-muted-foreground/60 ml-1">({r.redirectSource}{r.server ? `, ${r.server}` : ''})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={cn("h-3 w-3 shrink-0", colors[step.status], step.status === 'running' && 'animate-spin')} />
        <span className={cn("truncate", step.status === 'skipped' && 'line-through text-muted-foreground')}>{step.step_label}</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 ml-2">
        {step.duration_ms != null && <span>{fmtDur(step.duration_ms)}</span>}
        {step.error_message && <span className="text-destructive truncate max-w-[120px]" title={step.error_message}>{step.error_message}</span>}
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
