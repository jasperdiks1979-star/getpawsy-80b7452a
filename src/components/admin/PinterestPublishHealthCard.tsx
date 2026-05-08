import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Activity, Zap, RefreshCw, ShieldCheck, AlertCircle, Link2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Health = {
  queue_counts: Record<string, number>;
  recent_attempts: number;
  recent_successes: number;
  avg_publish_ms: number;
  last_cron_run_at: string | null;
  last_cron_status?: string | null;
  last_cron_success?: boolean | null;
  last_cron_duration_ms?: number | null;
  last_cron_processed?: number | null;
  last_cron_failed?: number | null;
  last_cron_error?: string | null;
  last_cron_message?: string | null;
  last_success_at?: string | null;
  cron_runs_24h?: number;
  cron_success_24h?: number;
};

type Connection = {
  active_board_name: string | null;
  active_board_id: string | null;
  active_pinterest_connection_id: string | null;
  production_publish_verified: boolean | null;
  production_publish_verified_at: string | null;
  warmup_until: string | null;
  daily_pin_cap: number | null;
  min_gap_minutes: number | null;
  last_pin_published_at: string | null;
  last_pin_external_url: string | null;
  last_pin_publish_error: string | null;
};

export function PinterestPublishHealthCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("pinterest_publish_health");
      if (error) throw error;
      setHealth(data as Health);
      const { data: rt } = await supabase
        .from("pinterest_runtime_settings")
        .select("auto_approve_queue, active_board_name, active_board_id, active_pinterest_connection_id, production_publish_verified, production_publish_verified_at, warmup_until, daily_pin_cap, min_gap_minutes, last_pin_published_at, last_pin_external_url, last_pin_publish_error")
        .eq("id", 1)
        .maybeSingle();
      setAutoApprove(!!(rt as any)?.auto_approve_queue);
      setConn(rt as any);
    } catch (e: any) {
      toast.error(`Health load failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggleAutoApprove = async (next: boolean) => {
    const { error } = await supabase
      .from("pinterest_runtime_settings")
      .update({ auto_approve_queue: next } as any)
      .eq("id", 1);
    if (error) return toast.error(error.message);
    setAutoApprove(next);
    toast.success(next ? "Auto-approve ON — cron will publish queued pins without per-pin approval" : "Auto-approve OFF");
  };

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    setLastResponse(null);
    try {
      const r = await fn();
      setLastResponse(r);
      toast.success(`${label}: done`);
    } catch (e: any) {
      toast.error(`${label}: ${e?.message || e}`);
    } finally {
      setBusy(null);
      load();
    }
  };

  const publishNext = () =>
    run("Publish next now", async () => {
      const { data, error } = await supabase.functions.invoke("pinterest-publish-now", {
        body: { mode: "next" },
      });
      if (error) throw error;
      return data;
    });

  const approveAll = () =>
    run("Approve all queued", async () => {
      const { data, error } = await supabase
        .from("pinterest_pin_queue")
        .update({ approved_at: new Date().toISOString() } as any)
        .eq("status", "queued")
        .is("approved_at", null)
        .select("id");
      if (error) throw error;
      return { approved: data?.length ?? 0 };
    });

  const resetStuck = () =>
    run("Reset stuck publishing", async () => {
      const { data, error } = await supabase
        .from("pinterest_pin_queue")
        .update({ status: "queued", publishing_started_at: null } as any)
        .eq("status", "publishing")
        .select("id");
      if (error) throw error;
      return { reset: data?.length ?? 0 };
    });

  const retryFailed = () =>
    run("Retry failed", async () => {
      const { data, error } = await supabase
        .from("pinterest_pin_queue")
        .update({
          status: "queued",
          publish_attempts: 0,
          retries: 0,
          last_publish_error: null,
          error_message: null,
        } as any)
        .eq("status", "failed")
        .select("id");
      if (error) throw error;
      return { retried: data?.length ?? 0 };
    });

  const counts = health?.queue_counts || {};
  const lastRun = health?.last_cron_run_at ? new Date(health.last_cron_run_at) : null;
  const lastRunMin = lastRun ? Math.round((Date.now() - lastRun.getTime()) / 60000) : null;
  const successRate = health && health.recent_attempts > 0
    ? Math.round((health.recent_successes / health.recent_attempts) * 100)
    : null;
  const lastSuccess = health?.last_success_at ? new Date(health.last_success_at) : null;
  const lastSuccessMin = lastSuccess ? Math.round((Date.now() - lastSuccess.getTime()) / 60000) : null;
  // Cron schedule is */5 (every 5 minutes); compute next tick from last run
  const CRON_INTERVAL_MIN = 5;
  const nextRun = lastRun
    ? new Date(lastRun.getTime() + CRON_INTERVAL_MIN * 60_000)
    : null;
  const nextRunMin = nextRun ? Math.max(0, Math.round((nextRun.getTime() - Date.now()) / 60000)) : null;
  // Health verdict — green if cron ran in last 10m AND last run succeeded
  // (or no error AND queue is draining); yellow if delayed (>15m); red if
  // never or last run errored.
  const cronHealth: "healthy" | "delayed" | "failed" | "unknown" =
    !lastRun
      ? "unknown"
      : health?.last_cron_status === "failed" || health?.last_cron_success === false
        ? "failed"
        : (lastRunMin ?? 999) > 15
          ? "delayed"
          : "healthy";
  const healthBadge =
    cronHealth === "healthy"
      ? <Badge className="bg-green-500/15 text-green-600 gap-1"><CheckCircle2 className="h-3 w-3" /> Healthy</Badge>
      : cronHealth === "delayed"
        ? <Badge className="bg-yellow-500/15 text-yellow-700 gap-1"><AlertCircle className="h-3 w-3" /> Delayed</Badge>
        : cronHealth === "failed"
          ? <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>
          : <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" /> Unknown</Badge>;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Publish Health & Recovery
          {healthBadge}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pinterest connection status */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4" />
            Pinterest connection
            {conn?.active_pinterest_connection_id ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" /> Not connected
              </Badge>
            )}
            {conn?.production_publish_verified && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Production verified
              </Badge>
            )}
            {conn?.warmup_until && new Date(conn.warmup_until) > new Date() && (
              <Badge variant="outline">Warm-up</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">Active board</div>
              <div className="font-medium truncate">{conn?.active_board_name || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Daily cap / gap</div>
              <div className="font-medium">
                {conn?.daily_pin_cap ?? "—"} / {conn?.min_gap_minutes ?? "—"}m
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Last published</div>
              <div className="font-medium">
                {conn?.last_pin_published_at
                  ? `${Math.round((Date.now() - new Date(conn.last_pin_published_at).getTime()) / 60000)}m ago`
                  : "never"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Last pin</div>
              <div className="font-medium truncate">
                {conn?.last_pin_external_url ? (
                  <a href={conn.last_pin_external_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    View on Pinterest
                  </a>
                ) : "—"}
              </div>
            </div>
          </div>
          {conn?.last_pin_publish_error && (
            <div className="text-[11px] text-destructive border-l-2 border-destructive pl-2">
              Last error: {conn.last_pin_publish_error}
            </div>
          )}
        </div>

        {/* Queue counts */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {["draft", "queued", "publishing", "posted", "failed", "skipped"].map((s) => (
            <div key={s} className="rounded border p-2 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">{s}</div>
              <div className="text-lg font-semibold">{counts[s] ?? 0}</div>
            </div>
          ))}
        </div>

        {/* Health summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Last cron run</div>
            <div className="font-medium">
              {lastRunMin !== null ? `${lastRunMin}m ago` : "never"}
            </div>
            {health?.last_cron_message && (
              <div className="text-[10px] text-muted-foreground truncate" title={health.last_cron_message}>
                {health.last_cron_message}
              </div>
            )}
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Last success</div>
            <div className="font-medium">
              {lastSuccessMin !== null ? `${lastSuccessMin}m ago` : "never"}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Next run (~)</div>
            <div className="font-medium">
              {nextRunMin !== null ? (nextRunMin === 0 ? "any moment" : `in ${nextRunMin}m`) : "—"}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Last duration</div>
            <div className="font-medium">
              {health?.last_cron_duration_ms != null ? `${health.last_cron_duration_ms}ms` : "—"}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Last processed / failed</div>
            <div className="font-medium">
              {(health?.last_cron_processed ?? 0)} / {(health?.last_cron_failed ?? 0)}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Runs (24h)</div>
            <div className="font-medium">
              {health?.cron_runs_24h ?? 0}
              {(health?.cron_runs_24h ?? 0) > 0 && (
                <span className="text-muted-foreground"> · {Math.round(((health?.cron_success_24h ?? 0) / (health?.cron_runs_24h ?? 1)) * 100)}% ok</span>
              )}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Avg publish (50)</div>
            <div className="font-medium">{health?.avg_publish_ms ? `${health.avg_publish_ms}ms` : "—"}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Publish success rate</div>
            <div className="font-medium">{successRate !== null ? `${successRate}%` : "—"}</div>
          </div>
        </div>

        {cronHealth === "failed" && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs flex items-start gap-2">
            <XCircle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium">Cron failed on last run</div>
              <div className="text-muted-foreground">
                {health?.last_cron_error || health?.last_cron_message || "Check edge function logs for pinterest-cron-worker."}
              </div>
            </div>
          </div>
        )}
        {cronHealth === "delayed" && (
          <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <div className="font-medium">Cron delayed</div>
              <div className="text-muted-foreground">
                Last tick was {lastRunMin}m ago. Expected every {CRON_INTERVAL_MIN}m.
              </div>
            </div>
          </div>
        )}
        {cronHealth === "unknown" && (
          <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <div className="font-medium">No cron telemetry yet</div>
              <div className="text-muted-foreground">
                Waiting for the first scheduled tick (runs every {CRON_INTERVAL_MIN} minutes).
              </div>
            </div>
          </div>
        )}

        {/* Auto-approve toggle */}
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="text-sm">
            <div className="font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Auto-approve queued pins
              <Badge variant={autoApprove ? "default" : "secondary"}>
                {autoApprove ? "ON" : "OFF"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              When ON, cron publishes queued pins without requiring per-pin approval. Use to drain a backlog.
            </div>
          </div>
          <Switch checked={autoApprove} onCheckedChange={toggleAutoApprove} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={publishNext} disabled={!!busy}>
            {busy === "Publish next now"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Zap className="h-4 w-4 mr-2" />}
            Publish next now
          </Button>
          <Button variant="secondary" onClick={approveAll} disabled={!!busy}>
            Approve all queued
          </Button>
          <Button variant="secondary" onClick={resetStuck} disabled={!!busy}>
            Reset stuck publishing
          </Button>
          <Button variant="secondary" onClick={retryFailed} disabled={!!busy}>
            Retry failed
          </Button>
        </div>

        {lastResponse && (
          <pre className="rounded border bg-muted/40 p-2 text-[10px] max-h-48 overflow-auto">
            {JSON.stringify(lastResponse, null, 2)}
          </pre>
        )}

        {(counts.queued > 0 && !autoApprove && (counts.posted ?? 0) === 0) && (
          <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <div className="font-medium">Queue not draining</div>
              <div className="text-muted-foreground">
                {counts.queued} pins queued but cron requires approval. Either toggle Auto-approve ON, or click "Approve all queued".
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
