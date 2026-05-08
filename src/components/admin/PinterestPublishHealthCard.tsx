import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Activity, Zap, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Health = {
  queue_counts: Record<string, number>;
  recent_attempts: number;
  recent_successes: number;
  avg_publish_ms: number;
  last_cron_run_at: string | null;
};

export function PinterestPublishHealthCard() {
  const [health, setHealth] = useState<Health | null>(null);
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
        .select("auto_approve_queue")
        .eq("id", 1)
        .maybeSingle();
      setAutoApprove(!!(rt as any)?.auto_approve_queue);
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

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Publish Health & Recovery
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
            <div className="text-muted-foreground">Last cron</div>
            <div className="font-medium">
              {lastRunMin !== null ? `${lastRunMin}m ago` : "never"}
            </div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Success rate (50)</div>
            <div className="font-medium">{successRate !== null ? `${successRate}%` : "—"}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Avg publish</div>
            <div className="font-medium">{health?.avg_publish_ms ? `${health.avg_publish_ms}ms` : "—"}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-muted-foreground">Recent attempts</div>
            <div className="font-medium">{health?.recent_attempts ?? 0}</div>
          </div>
        </div>

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
