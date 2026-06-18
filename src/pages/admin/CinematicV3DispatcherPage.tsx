import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, RefreshCw, Play, AlertTriangle, Activity } from "lucide-react";
import { Link } from "react-router-dom";

type Config = {
  enabled: boolean;
  min_queue_size: number;
  low_water_mark: number;
  max_retries: number;
  emergency_idle_minutes: number;
  last_dispatch_at: string | null;
  last_emergency_at: string | null;
  last_refill_at: string | null;
};

type QueueRow = {
  id: string;
  product_slug: string;
  priority_score: number;
  priority_reason: string;
  status: string;
  attempts: number;
  last_error: string | null;
  last_job_id: string | null;
  enqueued_at: string;
  dispatched_at: string | null;
};

type LogRow = {
  id: string;
  event_type: string;
  product_slug: string | null;
  job_id: string | null;
  outcome: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type Job = {
  id: string;
  product_slug: string;
  status: string;
  qa_total: number | null;
  qa_passed: boolean;
  created_at: string;
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}

function ago(ts: string | null) {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") return <Badge variant="secondary">pending</Badge>;
  if (s === "dispatched") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">dispatched</Badge>;
  if (s === "skipped" || s === "failed") return <Badge variant="destructive">{s}</Badge>;
  return <Badge>{s}</Badge>;
}

export default function CinematicV3DispatcherPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [lastJob, setLastJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [refilling, setRefilling] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [lastPolled, setLastPolled] = useState<Date | null>(null);
  const [handoff, setHandoff] = useState<{ approved: number; attached: number; queued: number; uploading: number; published: number; failed: number } | null>(null);
  const [draining, setDraining] = useState(false);

  async function load() {
    setLoading(true);
    const [cfg, q, lg, approved, attached, queued, uploading, published, failed] = await Promise.all([
      supabase.from("cinematic_v3_dispatch_config").select("*").eq("id", true).maybeSingle(),
      supabase.from("cinematic_v3_dispatch_queue").select("*").order("priority_score", { ascending: false }).order("enqueued_at", { ascending: true }).limit(100),
      supabase.from("cinematic_v3_dispatch_log").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("cinematic_v3_jobs").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("product_media").select("id", { count: "exact", head: true }).eq("source", "cinematic_v3"),
      supabase.from("pinterest_video_queue").select("id", { count: "exact", head: true }).in("status", ["pending", "scheduled", "draft", "retried"]),
      supabase.from("pinterest_video_queue").select("id", { count: "exact", head: true }).in("status", ["publishing", "processing"]),
      supabase.from("pinterest_video_queue").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("pinterest_video_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    if (cfg.error) toast.error(cfg.error.message);
    setConfig((cfg.data as any) ?? null);
    setQueue((q.data as any) ?? []);
    setLogs((lg.data as any) ?? []);
    setHandoff({
      approved: approved.count ?? 0,
      attached: attached.count ?? 0,
      queued: queued.count ?? 0,
      uploading: uploading.count ?? 0,
      published: published.count ?? 0,
      failed: failed.count ?? 0,
    });

    const lastDispatchLog = (lg.data ?? []).find((l: any) => l.event_type === "dispatch" && l.job_id);
    if (lastDispatchLog?.job_id) {
      const { data: job } = await supabase.from("cinematic_v3_jobs")
        .select("id, product_slug, status, qa_total, qa_passed, created_at")
        .eq("id", lastDispatchLog.job_id).maybeSingle();
      setLastJob((job as any) ?? null);
    } else {
      setLastJob(null);
    }
    setLastPolled(new Date());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const pendingCount = useMemo(() => queue.filter((q) => q.status === "pending").length, [queue]);
  const dispatchedCount = useMemo(() => queue.filter((q) => q.status === "dispatched").length, [queue]);
  const failedRows = useMemo(() => queue.filter((q) => q.attempts > 0 || q.status === "skipped"), [queue]);
  const nextProduct = useMemo(() => queue.find((q) => q.status === "pending") ?? null, [queue]);

  async function triggerRefill() {
    setRefilling(true);
    const { data, error } = await supabase.functions.invoke("cinematic-v3-queue-refill", { body: {} });
    if (error) toast.error(error.message);
    else toast.success(`Refill added ${(data as any)?.added ?? 0}`);
    await load();
    setRefilling(false);
  }

  async function triggerDispatch() {
    setDispatching(true);
    const { data, error } = await supabase.functions.invoke("cinematic-v3-auto-dispatcher", { body: {} });
    if (error) toast.error(error.message);
    else {
      const r: any = (data as any)?.result;
      if (r?.dispatched) toast.success(`Dispatched ${r.product_slug}`);
      else toast.message(`Dispatcher: ${r?.reason ?? "no-op"}`);
    }
    await load();
    setDispatching(false);
  }

  async function triggerDrain() {
    setDraining(true);
    const { data, error } = await supabase.functions.invoke("pinterest-video-queue-drain", { body: { limit: 3 } });
    if (error) toast.error(error.message);
    else {
      const r: any = data ?? {};
      toast.success(`Drain: picked ${r.picked ?? 0} · published ${r.published ?? 0} · failed ${r.failed ?? 0}`);
    }
    await load();
    setDraining(false);
  }

  async function toggleEnabled(v: boolean) {
    setSavingEnabled(true);
    const { error } = await supabase.from("cinematic_v3_dispatch_config").update({ enabled: v }).eq("id", true);
    if (error) toast.error(error.message);
    else { setConfig((c) => c ? { ...c, enabled: v } : c); toast.success(`Dispatcher ${v ? "enabled" : "paused"}`); }
    setSavingEnabled(false);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cinematic V3 Auto Dispatcher</h1>
          <p className="text-sm text-muted-foreground">Autonomous queue → render → QA pipeline. Cron runs every 15 minutes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={triggerRefill} disabled={refilling}>
            {refilling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />} Refill queue
          </Button>
          <Button size="sm" onClick={triggerDispatch} disabled={dispatching}>
            {dispatching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Dispatch now
          </Button>
          <Button variant="outline" size="sm" onClick={triggerDrain} disabled={draining}>
            {draining ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Activity className="h-4 w-4 mr-1" />} Drain video queue
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-lg font-semibold">{config?.enabled ? "Active" : "Paused"}</span>
            <Switch checked={!!config?.enabled} onCheckedChange={toggleEnabled} disabled={savingEnabled || !config} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Last polled {lastPolled ? lastPolled.toLocaleTimeString() : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Queue size</div>
          <div className="mt-1 text-2xl font-semibold">{pendingCount}</div>
          <div className="text-xs text-muted-foreground">target {config?.min_queue_size ?? 10} · low&lt;{config?.low_water_mark ?? 5} · {dispatchedCount} dispatched</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Last dispatch</div>
          <div className="mt-1 text-lg font-semibold">{ago(config?.last_dispatch_at ?? null)}</div>
          <div className="text-xs text-muted-foreground">{fmt(config?.last_dispatch_at ?? null)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Emergency recovery</div>
          <div className="mt-1 text-lg font-semibold">{ago(config?.last_emergency_at ?? null)}</div>
          <div className="text-xs text-muted-foreground">trigger after {config?.emergency_idle_minutes ?? 30}m idle</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Post-approval handoff</div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/cinematic-v3-repair">Open repair tool</Link>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <div><div className="text-xs text-muted-foreground">Approved videos</div><div className="text-2xl font-semibold">{handoff?.approved ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Attached to PDP</div><div className="text-2xl font-semibold">{handoff?.attached ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-semibold">{handoff?.queued ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Uploading</div><div className="text-2xl font-semibold">{handoff?.uploading ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Published to Pinterest</div><div className="text-2xl font-semibold">{handoff?.published ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Failed</div><div className="text-2xl font-semibold">{handoff?.failed ?? "—"}</div></div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Next product</div>
          {nextProduct ? (
            <div>
              <div className="font-mono text-sm">{nextProduct.product_slug}</div>
              <div className="text-xs text-muted-foreground mt-1">
                priority {nextProduct.priority_score} · {nextProduct.priority_reason} · attempts {nextProduct.attempts}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Queue is empty. Click <em>Refill queue</em>.</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Last render</div>
          {lastJob ? (
            <div>
              <div className="font-mono text-sm">{lastJob.product_slug}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <Badge variant={lastJob.qa_passed ? "default" : "secondary"}>{lastJob.status}</Badge>
                <span>QA {lastJob.qa_total ?? "—"}</span>
                <span>{ago(lastJob.created_at)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No render dispatched yet.</div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Failed / retrying ({failedRows.length})
        </div>
        {failedRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No failed dispatches.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground text-left">
                <tr><th className="py-1 pr-3">Product</th><th>Status</th><th>Attempts</th><th>Last error</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {failedRows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="py-1 pr-3 font-mono">{r.product_slug}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.attempts}</td>
                    <td className="text-xs text-muted-foreground max-w-md truncate">{r.last_error ?? "—"}</td>
                    <td className="text-xs text-muted-foreground">{ago(r.dispatched_at ?? r.enqueued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Recent dispatch log</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="py-1 pr-3">When</th><th>Event</th><th>Outcome</th><th>Product</th><th>Details</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border/40 align-top">
                  <td className="py-1 pr-3 text-xs text-muted-foreground whitespace-nowrap">{ago(l.created_at)}</td>
                  <td><Badge variant="outline">{l.event_type}</Badge></td>
                  <td className="text-xs">{l.outcome ?? "—"}</td>
                  <td className="font-mono text-xs">{l.product_slug ?? "—"}</td>
                  <td className="text-xs text-muted-foreground max-w-md truncate">{JSON.stringify(l.details)}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={5} className="text-sm text-muted-foreground py-4">No events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}