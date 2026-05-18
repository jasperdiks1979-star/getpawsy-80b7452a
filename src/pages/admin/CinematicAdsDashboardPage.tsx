import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Clock, CheckCircle2, XCircle, Film, ExternalLink, Bell, Play, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type StatusFilter = "all" | "queued" | "rendering" | "complete" | "failed";

interface Job {
  id: string;
  product_slug: string;
  hook_variant: string;
  status: string;
  status_message: string | null;
  error_message: string | null;
  created_at: string;
  prepared_at: string | null;
  render_queued_at: string | null;
  render_started_at: string | null;
  render_complete_at: string | null;
  rendered_at: string | null;
  pinterest_uploaded_at: string | null;
  last_pinterest_attempt_at: string | null;
  published_at: string | null;
  output_mp4_url: string | null;
  output_thumbnail_url: string | null;
  output_duration_seconds: number | null;
  output_file_size_bytes: number | null;
  render_attempts: number;
  render_worker_id: string | null;
  pinterest_asset_id: string | null;
  pinterest_pin_id: string | null;
  pinterest_pin_url: string | null;
  pinterest_publish_error: string | null;
  pinterest_publish_attempts: number;
}

interface TimelineEvent {
  at: string;
  source: "job" | "worker" | "pinterest";
  stage: string;
  status: "ok" | "fail" | "info" | "pending";
  detail?: string;
  payload?: Record<string, unknown> | null;
}

const STATUS_BUCKETS: Record<Exclude<StatusFilter, "all">, string[]> = {
  queued: ["pending", "preparing", "prepared", "render_queued"],
  rendering: ["rendering"],
  complete: ["render_complete", "pinterest_uploaded", "published"],
  failed: ["render_failed", "pinterest_failed", "failed"],
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", preparing: "secondary", prepared: "secondary", render_queued: "secondary",
  rendering: "default",
  render_complete: "outline", pinterest_uploaded: "outline", published: "default",
  render_failed: "destructive", pinterest_failed: "destructive", failed: "destructive",
};

function bucketOf(status: string): Exclude<StatusFilter, "all"> | null {
  for (const [k, v] of Object.entries(STATUS_BUCKETS)) {
    if (v.includes(status)) return k as Exclude<StatusFilter, "all">;
  }
  return null;
}

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return iso; }
}

function buildTimeline(job: Job, publishLog: any[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const push = (at: string | null, stage: string, status: TimelineEvent["status"], detail?: string, payload?: any, source: TimelineEvent["source"] = "job") => {
    if (!at) return;
    events.push({ at, source, stage, status, detail, payload });
  };
  push(job.created_at, "job created", "info", `product=${job.product_slug} hook=${job.hook_variant}`);
  push(job.prepared_at, "scenes prepared", "ok");
  push(job.render_queued_at, "render queued", "info", `attempts=${job.render_attempts}`);
  push(job.render_started_at, "render started", "info", job.render_worker_id ? `worker=${job.render_worker_id}` : undefined);
  push(job.render_complete_at || job.rendered_at, "render complete", "ok",
    job.output_mp4_url ? `mp4 size=${fmtBytes(job.output_file_size_bytes)} dur=${job.output_duration_seconds ?? "?"}s` : undefined);
  if (job.status === "render_failed") {
    push(job.render_complete_at || new Date().toISOString(), "render failed", "fail", job.error_message ?? undefined);
  }
  push(job.pinterest_uploaded_at, "pinterest uploaded", "ok",
    job.pinterest_pin_id ? `pin=${job.pinterest_pin_id}` : undefined);
  if (job.pinterest_publish_error) {
    push(job.last_pinterest_attempt_at, "pinterest publish failed", "fail", job.pinterest_publish_error, null, "pinterest");
  }
  push(job.published_at, "published", "ok");

  for (const row of publishLog) {
    events.push({
      at: row.created_at,
      source: "pinterest",
      stage: row.stage,
      status: row.status === "ok" ? "ok" : row.status === "fail" ? "fail" : "info",
      detail: row.trace_id ? `trace=${row.trace_id}` : undefined,
      payload: row.payload || null,
    });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
}

function downloadJobsCsv(jobs: Job[], filename: string) {
  const headers = [
    "id", "product_slug", "hook_variant", "status", "status_message", "error_message",
    "created_at", "prepared_at", "render_queued_at", "render_started_at", "render_complete_at",
    "rendered_at", "pinterest_uploaded_at", "last_pinterest_attempt_at", "published_at",
    "output_mp4_url", "output_thumbnail_url", "output_duration_seconds", "output_file_size_bytes",
    "render_attempts", "render_worker_id", "pinterest_asset_id", "pinterest_pin_id",
    "pinterest_pin_url", "pinterest_publish_error", "pinterest_publish_attempts",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const rows = jobs.map((j) => headers.map((h) => esc((j as unknown as Record<string, unknown>)[h])).join(",")).join("\n");
  const csv = `${headers.join(",")}\n${rows}`;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CinematicAdsDashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Job | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [alertSettings, setAlertSettings] = useState<any>(null);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [runningCheck, setRunningCheck] = useState(false);

  const loadAlerts = useCallback(async () => {
    const [{ data: s }, { data: a }] = await Promise.all([
      supabase.from("cinematic_ad_alert_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("cinematic_ad_alert_log").select("*").order("created_at", { ascending: false }).limit(25),
    ]);
    if (s) setAlertSettings(s);
    setAlerts(a || []);
  }, []);

  useEffect(() => {
    loadAlerts();
    const t = setInterval(loadAlerts, 30_000);
    return () => clearInterval(t);
  }, [loadAlerts]);

  const saveAlertSettings = useCallback(async (patch: Record<string, unknown>) => {
    setAlertSaving(true);
    const { error } = await supabase
      .from("cinematic_ad_alert_settings")
      .update(patch as any)
      .eq("id", 1);
    setAlertSaving(false);
    if (error) { toast.error(error.message); return; }
    setAlertSettings((prev: any) => ({ ...(prev || {}), ...patch }));
    toast.success("Alert settings saved");
  }, []);

  const runAlertCheckNow = useCallback(async () => {
    setRunningCheck(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-alert-monitor", { body: {} });
      if (error) throw error;
      const d = data as any;
      toast.success(`Checked ${d?.candidates_examined ?? 0} candidates · ${d?.new_alerts ?? 0} new alerts · ${d?.emails_sent ?? 0} emails sent`);
      await loadAlerts();
    } catch (e: any) {
      toast.error(e?.message || "Monitor run failed");
    } finally {
      setRunningCheck(false);
    }
  }, [loadAlerts]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select("id, product_slug, hook_variant, status, status_message, error_message, created_at, prepared_at, render_queued_at, render_started_at, render_complete_at, rendered_at, pinterest_uploaded_at, last_pinterest_attempt_at, published_at, output_mp4_url, output_thumbnail_url, output_duration_seconds, output_file_size_bytes, render_attempts, render_worker_id, pinterest_asset_id, pinterest_pin_id, pinterest_pin_url, pinterest_publish_error, pinterest_publish_attempts")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setJobs(data as unknown as Job[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = { all: jobs.length, queued: 0, rendering: 0, complete: 0, failed: 0 };
    for (const j of jobs) {
      const b = bucketOf(j.status);
      if (b) base[b]++;
    }
    return base;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter !== "all") {
        if (bucketOf(j.status) !== filter) return false;
      }
      if (q && !j.product_slug.toLowerCase().includes(q) && !j.id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, filter, query]);

  const openJob = useCallback(async (job: Job) => {
    setSelected(job);
    setTimeline([]);
    setTimelineLoading(true);
    let publishLog: any[] = [];
    if (job.pinterest_asset_id) {
      const { data: queueRows } = await supabase
        .from("pinterest_video_queue")
        .select("id")
        .eq("asset_id", job.pinterest_asset_id);
      const queueIds = (queueRows || []).map((r: any) => r.id);
      if (queueIds.length) {
        const { data: logRows } = await supabase
          .from("pinterest_video_publish_log")
          .select("stage, status, payload, trace_id, created_at")
          .in("queue_id", queueIds)
          .order("created_at", { ascending: true })
          .limit(200);
        publishLog = logRows || [];
      }
    }
    setTimeline(buildTimeline(job, publishLog));
    setTimelineLoading(false);
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Film className="h-5 w-5" /> Cinematic Ads — Job Status
          </h1>
          <p className="text-xs text-muted-foreground">Live view of the queue → render → Pinterest pipeline. Polls every 15s.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const today = new Date().toISOString().split("T")[0];
              const label = filter === "all" ? "all" : filter;
              downloadJobsCsv(filtered, `cinematic_ads_${label}_${today}.csv`);
            }}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">All <Badge variant="secondary" className="ml-2">{counts.all}</Badge></TabsTrigger>
          <TabsTrigger value="queued">Queued <Badge variant="secondary" className="ml-2">{counts.queued}</Badge></TabsTrigger>
          <TabsTrigger value="rendering">Rendering <Badge variant="secondary" className="ml-2">{counts.rendering}</Badge></TabsTrigger>
          <TabsTrigger value="complete">Complete <Badge variant="secondary" className="ml-2">{counts.complete}</Badge></TabsTrigger>
          <TabsTrigger value="failed">Failed <Badge variant="secondary" className="ml-2">{counts.failed}</Badge></TabsTrigger>
        </TabsList>
      </Tabs>

      <Input
        placeholder="Filter by product slug or job id"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      <Card className="border-amber-500/30">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" /> Failure alerts
            {alertSettings && (
              <Badge variant={alertSettings.enabled ? "default" : "secondary"} className="ml-1">
                {alertSettings.enabled ? "ON" : "OFF"}
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={runAlertCheckNow} disabled={runningCheck}>
            {runningCheck ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Play className="h-3 w-3 mr-2" />}
            Run check now
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {alertSettings && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <Label className="text-xs">Recipient email</Label>
                <Input
                  type="email"
                  defaultValue={alertSettings.recipient_email}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== alertSettings.recipient_email) saveAlertSettings({ recipient_email: v });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">Stuck queued (min)</Label>
                <Input
                  type="number"
                  min={1}
                  defaultValue={alertSettings.queued_threshold_minutes}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0 && v !== alertSettings.queued_threshold_minutes) saveAlertSettings({ queued_threshold_minutes: v });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">Stuck rendering (min)</Label>
                <Input
                  type="number"
                  min={1}
                  defaultValue={alertSettings.rendering_threshold_minutes}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0 && v !== alertSettings.rendering_threshold_minutes) saveAlertSettings({ rendering_threshold_minutes: v });
                  }}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-4">
                <Switch
                  checked={alertSettings.enabled}
                  onCheckedChange={(v) => saveAlertSettings({ enabled: v })}
                  disabled={alertSaving}
                />
                <span className="text-xs text-muted-foreground">
                  Monitor runs every 5 minutes. Detects stuck render_queued / rendering jobs and recent render_failed or pinterest publish failures.
                  Alerts are deduped per incident; email delivery requires the app email infrastructure.
                </span>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold mb-2">Recent alerts ({alerts.length})</div>
            {alerts.length === 0 ? (
              <div className="text-xs text-muted-foreground p-2 border rounded">No alerts recorded yet.</div>
            ) : (
              <div className="border rounded divide-y max-h-72 overflow-auto">
                {alerts.map((a) => (
                  <div key={a.id} className="p-2 text-xs flex flex-col sm:flex-row sm:items-center gap-2">
                    <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] w-fit">
                      {a.severity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] w-fit font-mono">{a.alert_type}</Badge>
                    <span className="flex-1 truncate">{a.summary}</span>
                    <span className="text-muted-foreground shrink-0">{fmtRelative(a.created_at)}</span>
                    <Badge variant={a.email_sent ? "default" : "outline"} className="text-[10px] shrink-0">
                      {a.email_sent ? "emailed" : a.email_error ? "email failed" : "logged"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Jobs ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No jobs match the current filter.</div>
          ) : (
            <div className="divide-y">
              {filtered.map((j) => {
                const variant = STATUS_VARIANT[j.status] || "secondary";
                const lastTouch = j.published_at || j.pinterest_uploaded_at || j.render_complete_at || j.render_started_at || j.render_queued_at || j.created_at;
                return (
                  <button
                    key={j.id}
                    onClick={() => openJob(j)}
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                  >
                    <div className="flex items-center gap-2 sm:w-44 shrink-0">
                      <Badge variant={variant} className="font-mono text-[10px]">{j.status}</Badge>
                      {j.render_attempts > 1 && (
                        <Badge variant="outline" className="text-[10px]">×{j.render_attempts}</Badge>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{j.product_slug}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {j.hook_variant} · {j.id.slice(0, 8)} · {fmtRelative(lastTouch)}
                      </div>
                      {(j.error_message || j.pinterest_publish_error) && (
                        <div className="text-[11px] text-destructive truncate mt-0.5">
                          {j.pinterest_publish_error || j.error_message}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                      {j.output_mp4_url && <span className="flex items-center gap-1"><Film className="h-3 w-3" /> MP4</span>}
                      {j.pinterest_pin_id && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> Pin</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle className="truncate">{selected?.product_slug}</SheetTitle>
            <SheetDescription className="text-xs font-mono break-all">
              {selected?.id}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-3 mt-2 flex-1 overflow-hidden flex flex-col">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={STATUS_VARIANT[selected.status] || "secondary"}>{selected.status}</Badge>
                <Badge variant="outline">hook: {selected.hook_variant}</Badge>
                {selected.render_worker_id && <Badge variant="outline">worker: {selected.render_worker_id.slice(0, 12)}</Badge>}
                <Badge variant="outline">render ×{selected.render_attempts}</Badge>
                <Badge variant="outline">pinterest ×{selected.pinterest_publish_attempts}</Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {selected.output_mp4_url && (
                  <a href={selected.output_mp4_url} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    MP4 ({fmtBytes(selected.output_file_size_bytes)}) <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {selected.pinterest_pin_url && (
                  <a href={selected.pinterest_pin_url} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    Pin <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="text-xs font-semibold flex items-center gap-2 pt-2">
                <Clock className="h-3 w-3" /> Timeline
              </div>
              <ScrollArea className="flex-1 border rounded-md">
                {timelineLoading ? (
                  <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading events…
                  </div>
                ) : timeline.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground">No events recorded.</div>
                ) : (
                  <ol className="p-3 space-y-2">
                    {timeline.map((e, i) => (
                      <li key={i} className="text-xs border-l-2 pl-3 py-1" style={{ borderColor: e.status === "fail" ? "hsl(var(--destructive))" : e.status === "ok" ? "hsl(142 76% 36%)" : "hsl(var(--muted-foreground))" }}>
                        <div className="flex items-center gap-2">
                          {e.status === "fail" ? <XCircle className="h-3 w-3 text-destructive" /> : e.status === "ok" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Clock className="h-3 w-3 text-muted-foreground" />}
                          <span className="font-medium">{e.stage}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{e.source}</Badge>
                          <span className="text-muted-foreground ml-auto">{fmtRelative(e.at)}</span>
                        </div>
                        {e.detail && <div className="text-muted-foreground mt-0.5 break-all">{e.detail}</div>}
                        {e.payload && (
                          <pre className="mt-1 text-[10px] bg-muted/40 rounded p-1 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                            {JSON.stringify(e.payload, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}