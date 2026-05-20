import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2, Play, RotateCcw, RefreshCw, X, Trash2, Send, Copy, Download,
  ExternalLink, Wand2, AlertTriangle, Zap, Filter, FileDown,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

type Job = {
  id: string;
  product_slug: string;
  product_name: string | null;
  product_id: string | null;
  status: string;
  status_message: string | null;
  created_at: string;
  updated_at: string;
  render_queued_at: string | null;
  render_started_at: string | null;
  render_complete_at: string | null;
  render_heartbeat_at: string | null;
  render_worker_id: string | null;
  render_attempts: number | null;
  render_log: any;
  output_mp4_url: string | null;
  output_thumbnail_url: string | null;
  output_duration_seconds: number | null;
  pinterest_pin_url: string | null;
  pinterest_pin_id: string | null;
  pinterest_publish_error: string | null;
  pinterest_uploaded_at: string | null;
  error_message: string | null;
  approved_for_render: boolean | null;
};

type FilterKey = "all" | "queued" | "rendering" | "completed" | "failed" | "cancelled" | "stuck";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "rendering", label: "Rendering" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "stuck", label: "Stuck" },
];

const STUCK_MS = 10 * 60 * 1000;
const STALE_HEARTBEAT_MS = 90 * 1000;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "rendering") return "default";
  if (status === "pinterest_uploaded" || status === "published" || status === "render_complete") return "secondary";
  return "outline";
}

function isStuck(j: Job): boolean {
  if (j.status !== "rendering") return false;
  const ref = j.render_heartbeat_at ?? j.render_started_at;
  if (!ref) return true;
  return Date.now() - new Date(ref).getTime() > STUCK_MS;
}

function isStale(j: Job): boolean {
  if (j.status !== "rendering") return false;
  const ref = j.render_heartbeat_at;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() > STALE_HEARTBEAT_MS;
}

function isZombieWorker(j: Job): boolean {
  if (j.status !== "rendering") return false;
  if (j.render_heartbeat_at) return false;
  if (!j.render_started_at) return false;
  return Date.now() - new Date(j.render_started_at).getTime() > STALE_HEARTBEAT_MS;
}

function isAutoRecovered(j: Job): boolean {
  if ((j.render_attempts ?? 0) < 1) return false;
  return typeof j.status_message === "string" && j.status_message.startsWith("Auto-recovered");
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function elapsed(from: string | null, to?: string | null) {
  if (!from) return "—";
  const end = to ? new Date(to).getTime() : Date.now();
  const ms = end - new Date(from).getTime();
  if (ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

export default function CinematicAdsControlCenterPage() {
  const [rows, setRows] = useState<Job[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, string | null>>({});
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [diagJob, setDiagJob] = useState<Job | null>(null);
  const pollRef = useRef<number | null>(null);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select(
        "id,product_slug,product_name,product_id,status,status_message,created_at,updated_at,render_queued_at,render_started_at,render_complete_at,render_heartbeat_at,render_worker_id,render_attempts,render_log,output_mp4_url,output_thumbnail_url,output_duration_seconds,pinterest_pin_url,pinterest_pin_id,pinterest_publish_error,pinterest_uploaded_at,error_message,approved_for_render"
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[control-center] fetch failed", error);
      toast.error("Failed to load jobs");
      return;
    }
    setRows((data ?? []) as Job[]);
    setLoading(false);

    // Fetch any missing product images.
    const slugs = Array.from(new Set((data ?? []).map((r: any) => r.product_slug).filter(Boolean)));
    const missing = slugs.filter((s) => !(s in productImages));
    if (missing.length > 0) {
      const { data: prods } = await supabase
        .from("products_public")
        .select("slug,image_url")
        .in("slug", missing);
      if (prods) {
        setProductImages((prev) => {
          const next = { ...prev };
          for (const p of prods as any[]) next[p.slug] = p.image_url ?? "";
          return next;
        });
      }
    }
  }, [productImages]);

  useEffect(() => {
    fetchRows();
    pollRef.current = window.setInterval(fetchRows, 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "queued" && r.status !== "render_queued") return false;
      if (filter === "rendering" && r.status !== "rendering") return false;
      if (filter === "completed" && !["render_complete", "pinterest_uploaded", "published"].includes(r.status)) return false;
      if (filter === "failed" && r.status !== "failed") return false;
      if (filter === "cancelled" && r.status !== "cancelled") return false;
      if (filter === "stuck" && !isStuck(r)) return false;
      if (q) {
        const hay = `${r.product_slug} ${r.product_name ?? ""} ${r.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let queued = 0, rendering = 0, failed = 0, completedToday = 0;
    const durations: number[] = [];
    for (const r of rows) {
      if (r.status === "render_queued") queued++;
      if (r.status === "rendering") rendering++;
      if (r.status === "failed") failed++;
      if (r.render_complete_at && new Date(r.render_complete_at) >= today) completedToday++;
      if (r.render_started_at && r.render_complete_at) {
        durations.push(new Date(r.render_complete_at).getTime() - new Date(r.render_started_at).getTime());
      }
    }
    const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : 0;
    const stuck = rows.filter(isStuck).length;
    return { queued, rendering, failed, completedToday, avg, stuck };
  }, [rows]);

  const setRowBusy = (id: string, label: string | null) =>
    setBusy((p) => ({ ...p, [id]: label }));

  const call = async (action: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
      body: { action, ...body },
    });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.message ?? `${action} failed`);
    return data;
  };

  const dispatchGithub = async (jobId: string) => {
    return call("trigger_github_workflow", { job_id: jobId });
  };

  const renderNow = async (j: Job) => {
    setRowBusy(j.id, "render");
    try {
      if (j.status !== "render_queued") {
        await call("retry_render", { job_id: j.id });
      }
      const r = await dispatchGithub(j.id);
      toast.success(`Dispatched render • run #${r.run_id ?? "queued"}`);
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Render dispatch failed");
    } finally {
      setRowBusy(j.id, null);
    }
  };

  const retryRender = async (j: Job) => {
    setRowBusy(j.id, "retry");
    try {
      await call("retry_render", { job_id: j.id });
      await dispatchGithub(j.id);
      toast.success("Re-queued & dispatched");
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setRowBusy(j.id, null);
    }
  };

  const resetQueued = async (j: Job) => {
    setRowBusy(j.id, "reset");
    try {
      await call("retry_render", { job_id: j.id });
      toast.success("Reset to render_queued");
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setRowBusy(j.id, null);
    }
  };

  const cancelRender = async (j: Job) => {
    if (!confirm("Cancel this render?")) return;
    setRowBusy(j.id, "cancel");
    try {
      await call("cancel_render", { job_id: j.id });
      toast.success("Cancelled");
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Cancel failed");
    } finally {
      setRowBusy(j.id, null);
    }
  };

  const deleteJob = async (j: Job) => {
    if (!confirm(`Delete job ${j.id.slice(0, 8)}? This cannot be undone.`)) return;
    setRowBusy(j.id, "delete");
    try {
      await call("delete_job", { job_id: j.id });
      toast.success("Deleted");
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setRowBusy(j.id, null);
    }
  };

  const publishPin = async (j: Job) => {
    setRowBusy(j.id, "publish");
    try {
      await call("retry_publish", { job_id: j.id });
      toast.success("Pinterest publish triggered");
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Publish failed");
    } finally {
      setRowBusy(j.id, null);
    }
  };

  const renderAllQueued = async () => {
    if (!confirm(`Dispatch all ${stats.queued} queued renders to GitHub?`)) return;
    setBulkBusy("render_all");
    try {
      const r = await call("render_all_queued", {});
      toast.success(`Dispatched ${r.dispatched?.filter((d: any) => d.ok).length ?? 0} / ${r.queued_count ?? 0}`);
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk dispatch failed");
    } finally {
      setBulkBusy(null);
    }
  };

  const publishableCount = useMemo(
    () => rows.filter((r) => !!r.output_mp4_url && !r.pinterest_pin_url).length,
    [rows],
  );

  const publishAllCompleted = async () => {
    if (!confirm(`Publish all ${publishableCount} completed job(s) to Pinterest?`)) return;
    setBulkBusy("publish_all");
    try {
      const r = await call("publish_all_completed", {});
      toast.success(`Published ${r.published_count ?? 0} / ${r.completed_count ?? 0} to Pinterest`);
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk publish failed");
    } finally {
      setBulkBusy(null);
    }
  };

  const autoHealNow = async () => {
    setBulkBusy("auto_heal");
    try {
      const r = await call("auto_heal_stuck", {});
      toast.success(`Healed ${r.healed_count ?? 0} stuck job(s)`);
      fetchRows();
    } catch (e: any) {
      toast.error(e?.message ?? "Auto-heal failed");
    } finally {
      setBulkBusy(null);
    }
  };

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const exportToCsv = () => {
    const headers = [
      "id",
      "product_name",
      "product_slug",
      "status",
      "status_message",
      "created_at",
      "updated_at",
      "render_queued_at",
      "render_started_at",
      "render_complete_at",
      "render_heartbeat_at",
      "render_worker_id",
      "render_attempts",
      "output_mp4_url",
      "output_thumbnail_url",
      "output_duration_seconds",
      "pinterest_pin_url",
      "pinterest_pin_id",
      "pinterest_uploaded_at",
      "error_message",
      "pinterest_publish_error",
    ];
    const rows = filtered.map((j) => [
      j.id,
      j.product_name ?? "",
      j.product_slug ?? "",
      j.status,
      j.status_message ?? "",
      j.created_at,
      j.updated_at,
      j.render_queued_at ?? "",
      j.render_started_at ?? "",
      j.render_complete_at ?? "",
      j.render_heartbeat_at ?? "",
      j.render_worker_id ?? "",
      String(j.render_attempts ?? ""),
      j.output_mp4_url ?? "",
      j.output_thumbnail_url ?? "",
      String(j.output_duration_seconds ?? ""),
      j.pinterest_pin_url ?? "",
      j.pinterest_pin_id ?? "",
      j.pinterest_uploaded_at ?? "",
      j.error_message ?? "",
      j.pinterest_publish_error ?? "",
    ]);
    const escape = (v: string) => {
      const s = String(v ?? "");
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
      return s;
    };
    const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().split("T")[0];
    a.download = `cinematic_jobs_${filter}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} job(s) to CSV`);
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-3 py-4 md:px-6">
      <Helmet>
        <title>Cinematic Ads Control Center · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cinematic Ads Control Center</h1>
          <p className="text-sm text-muted-foreground">One-click rendering, retries and Pinterest publishing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchRows}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={autoHealNow} disabled={bulkBusy === "auto_heal"}>
            {bulkBusy === "auto_heal" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Auto-heal stuck
          </Button>
          <Button size="sm" onClick={renderAllQueued} disabled={bulkBusy === "render_all" || stats.queued === 0}>
            {bulkBusy === "render_all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Render all queued ({stats.queued})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={publishAllCompleted}
            disabled={bulkBusy === "publish_all" || publishableCount === 0}
          >
            {bulkBusy === "publish_all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Publish all completed ({publishableCount})
          </Button>
        </div>
      </header>

      <AutopilotHealthPanel />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {[
          { label: "Queued", value: stats.queued },
          { label: "Rendering", value: stats.rendering },
          { label: "Stuck", value: stats.stuck },
          { label: "Failed", value: stats.failed },
          { label: "Done today", value: stats.completedToday },
          { label: "Avg render", value: stats.avg ? `${stats.avg}s` : "—" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className="h-7"
          >
            {f.label}
            {f.key === "stuck" && stats.stuck > 0 && (
              <span className="ml-1 rounded bg-destructive/20 px-1 text-[10px] text-destructive">{stats.stuck}</span>
            )}
          </Button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or job id…"
          className="h-8 max-w-xs"
        />
        <Button size="sm" variant="outline" onClick={exportToCsv} disabled={filtered.length === 0} className="h-8 gap-1.5">
          <FileDown className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Table / Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          No jobs match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => {
            const stuck = isStuck(j);
            const img = productImages[j.product_slug];
            const b = busy[j.id];
            const progress =
              j.status === "render_complete" || j.status === "pinterest_uploaded" || j.status === "published" ? 100
              : j.status === "rendering" ? 60
              : j.status === "render_queued" ? 20
              : 0;
            return (
              <Card key={j.id} className={stuck ? "border-destructive/40" : ""}>
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-start gap-3">
                    {img ? (
                      <img src={img} alt={j.product_name ?? j.product_slug} className="h-14 w-14 shrink-0 rounded-md object-cover" loading="lazy" />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium">{j.product_name ?? j.product_slug}</div>
                        <Badge variant={statusVariant(j.status)} className="capitalize">{j.status.replace(/_/g, " ")}</Badge>
                        {stuck && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Stuck
                          </Badge>
                        )}
                        {!stuck && isStale(j) && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Stale
                          </Badge>
                        )}
                        {isZombieWorker(j) && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Zombie worker
                          </Badge>
                        )}
                        {isAutoRecovered(j) && (
                          <Badge variant="secondary">Auto recovered</Badge>
                        )}
                        {j.pinterest_pin_url && <Badge variant="secondary">Pinned</Badge>}
                        {j.render_attempts ? (
                          <span className="text-[10px] text-muted-foreground">×{j.render_attempts}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>id: {j.id.slice(0, 8)}…</span>
                        <button onClick={() => copy(j.id, "Job ID copied")} className="hover:text-foreground">
                          <Copy className="inline h-3 w-3" />
                        </button>
                        <span>created {fmt(j.created_at)}</span>
                        <span>updated {fmt(j.updated_at)}</span>
                        {j.render_worker_id && <span>worker {j.render_worker_id}</span>}
                        {j.status === "rendering" && <span>elapsed {elapsed(j.render_started_at)}</span>}
                      </div>
                      {/* Progress */}
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full transition-all ${j.status === "failed" ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {j.status_message && (
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{j.status_message}</div>
                      )}
                      {j.error_message && (
                        <div className="mt-1 line-clamp-2 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                          {j.error_message}
                        </div>
                      )}
                    </div>
                  </div>

                  {j.output_mp4_url && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                      <video
                        src={j.output_mp4_url}
                        controls
                        preload="metadata"
                        poster={j.output_thumbnail_url ?? undefined}
                        className="h-24 w-auto rounded"
                      />
                      <div className="flex flex-col gap-1">
                        <a href={j.output_mp4_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                          <Download className="h-3 w-3" /> Download MP4
                        </a>
                        {j.output_duration_seconds && (
                          <span className="text-[11px] text-muted-foreground">{j.output_duration_seconds}s</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {(j.status === "render_queued" || j.status === "prepared" || j.status === "awaiting_approval") && (
                      <Button size="sm" onClick={() => renderNow(j)} disabled={!!b}>
                        {b === "render" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
                        Render now
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => retryRender(j)} disabled={!!b}>
                      {b === "retry" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
                      Retry
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => resetQueued(j)} disabled={!!b}>
                      {b === "reset" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                      Reset queued
                    </Button>
                    {j.status === "rendering" && (
                      <Button size="sm" variant="outline" onClick={() => cancelRender(j)} disabled={!!b}>
                        {b === "cancel" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}
                        Cancel
                      </Button>
                    )}
                    {j.output_mp4_url && !j.pinterest_pin_url && (
                      <Button size="sm" variant="secondary" onClick={() => publishPin(j)} disabled={!!b}>
                        {b === "publish" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                        Publish Pin
                      </Button>
                    )}
                    {j.pinterest_pin_url && (
                      <a href={j.pinterest_pin_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="mr-1 h-3 w-3" /> View pin
                        </Button>
                      </a>
                    )}
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => setDiagJob(j)}>Diagnostics</Button>
                      </SheetTrigger>
                      <a href={`/admin/cinematic-ads/${j.id}/qa`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost">QA</Button>
                      </a>
                      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                        <SheetHeader>
                          <SheetTitle>Job diagnostics</SheetTitle>
                        </SheetHeader>
                        {diagJob && diagJob.id === j.id && (
                          <div className="mt-4 space-y-2 text-xs">
                            <Row label="Job ID" value={diagJob.id} onCopy={() => copy(diagJob.id)} />
                            <Row label="Product" value={`${diagJob.product_name ?? diagJob.product_slug} (${diagJob.product_slug})`} />
                            <Row label="Status" value={diagJob.status} />
                            <Row label="Worker" value={diagJob.render_worker_id ?? "—"} />
                            <Row label="Queued at" value={fmt(diagJob.render_queued_at)} />
                            <Row label="Started at" value={fmt(diagJob.render_started_at)} />
                            <Row label="Heartbeat" value={fmt(diagJob.render_heartbeat_at)} />
                            <Row label="Completed at" value={fmt(diagJob.render_complete_at)} />
                            <Row label="Attempts" value={String(diagJob.render_attempts ?? 0)} />
                            <Row label="MP4" value={diagJob.output_mp4_url ?? "—"} />
                            <Row label="Pin URL" value={diagJob.pinterest_pin_url ?? "—"} />
                            {diagJob.error_message && (
                              <div className="rounded bg-destructive/10 p-2 text-destructive">{diagJob.error_message}</div>
                            )}
                            {diagJob.pinterest_publish_error && (
                              <div className="rounded bg-destructive/10 p-2 text-destructive">Pin error: {diagJob.pinterest_publish_error}</div>
                            )}
                            <JobLogsViewer
                              job={diagJob}
                              onRefresh={async () => {
                                const { data } = await supabase
                                  .from("cinematic_ad_jobs")
                                  .select("*")
                                  .eq("id", diagJob.id)
                                  .maybeSingle();
                                if (data) setDiagJob(data as Job);
                              }}
                            />
                          </div>
                        )}
                      </SheetContent>
                    </Sheet>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteJob(j)} disabled={!!b}>
                      {b === "delete" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-start gap-2 border-b pb-1">
      <div className="w-24 shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 break-all">{value}</div>
      {onCopy && (
        <button onClick={onCopy} className="text-muted-foreground hover:text-foreground">
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

type LogLine = { ts?: string; level: string; message: string; isFfmpeg: boolean };

function normalizeLogs(raw: any): LogLine[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [raw];
  const out: LogLine[] = [];
  for (const item of arr) {
    if (item == null) continue;
    if (typeof item === "string") {
      const s = item.trim();
      if (!s) continue;
      out.push({ level: detectLevel(s), message: s, isFfmpeg: isFfmpegLine(s) });
    } else if (typeof item === "object") {
      const message =
        typeof item.message === "string" ? item.message :
        typeof item.msg === "string" ? item.msg :
        typeof item.line === "string" ? item.line :
        JSON.stringify(item);
      const level = String(item.level ?? item.severity ?? detectLevel(message)).toLowerCase();
      const ts = item.ts ?? item.timestamp ?? item.time ?? item.at;
      out.push({ ts: ts ? String(ts) : undefined, level, message, isFfmpeg: isFfmpegLine(message) });
    }
  }
  return out;
}

function detectLevel(s: string): string {
  const l = s.toLowerCase();
  if (/\b(error|fatal|failed|exception|abort)\b/.test(l)) return "error";
  if (/\b(warn|warning)\b/.test(l)) return "warn";
  if (isFfmpegLine(s)) return "ffmpeg";
  return "info";
}

function isFfmpegLine(s: string): boolean {
  return /\b(frame=|fps=|time=|bitrate=|speed=|Lavf|Lavc|ffmpeg|remotion)/i.test(s);
}

function JobLogsViewer({ job, onRefresh }: { job: Job; onRefresh: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error" | "ffmpeg">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => normalizeLogs(job.render_log), [job.render_log]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter(l => {
      if (level !== "all" && l.level !== level) return false;
      if (q && !l.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lines, query, level]);

  const isLive = job.status === "rendering" || job.status === "render_queued";

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => { onRefresh().catch(() => {}); }, 4000);
    return () => clearInterval(id);
  }, [isLive, onRefresh]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  const ffmpegProgress = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].message.match(/frame=\s*(\d+).*?fps=\s*([\d.]+).*?time=\s*([\d:.]+).*?speed=\s*([\d.]+x)/);
      if (m) return { frame: m[1], fps: m[2], time: m[3], speed: m[4] };
    }
    return null;
  }, [lines]);

  // Pull the most recent duplicate-scene diagnostic out of render_log.
  const duplicateDiag = useMemo(() => {
    const raw = Array.isArray(job.render_log) ? job.render_log : [];
    for (let i = raw.length - 1; i >= 0; i--) {
      const entry: any = raw[i];
      if (entry && typeof entry === "object" && entry.duplicate_diagnostics) {
        return entry.duplicate_diagnostics as {
          duplicate_ratio_pct: number;
          threshold_pct: number;
          variation_attempts: number;
          max_variation_attempts: number;
          aborted: boolean;
          accepted_after_variation: boolean;
          per_scene: Array<{
            index: number;
            image_url: string;
            image_hash?: string | null;
            hash_group?: number;
            repeat_count: number;
            duplicate_pct: number;
            variation_seed: string | null;
            motion_variant: string | null;
          }>;
        };
      }
    }
    return null;
  }, [job.render_log]);

  const counts = useMemo(() => {
    const c = { info: 0, warn: 0, error: 0, ffmpeg: 0 };
    for (const l of lines) if (l.level in c) (c as any)[l.level]++;
    return c;
  }, [lines]);

  function downloadLog() {
    const text = lines.map(l => `${l.ts ?? ""} [${l.level}] ${l.message}`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `render-log-${job.id}.log`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function copyAll() {
    const text = filtered.map(l => `${l.ts ?? ""} [${l.level}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Logs copied"));
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium">Render log <span className="text-muted-foreground">({filtered.length}/{lines.length})</span></div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={copyAll} disabled={filtered.length === 0}><Copy className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={downloadLog} disabled={lines.length === 0}><Download className="h-3 w-3" /></Button>
        </div>
      </div>
      {ffmpegProgress && (
        <div className="mb-2 rounded border bg-muted/40 p-2 font-mono text-[10px]">
          ffmpeg → frame <b>{ffmpegProgress.frame}</b> · fps <b>{ffmpegProgress.fps}</b> · time <b>{ffmpegProgress.time}</b> · speed <b>{ffmpegProgress.speed}</b>
        </div>
      )}
      {duplicateDiag && (
        <div className="mb-3 rounded border bg-muted/30 p-2 text-[10px]">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-medium">Scene duplicate scan</span>
            <Badge variant={duplicateDiag.aborted ? "destructive" : duplicateDiag.duplicate_ratio_pct > duplicateDiag.threshold_pct ? "secondary" : "outline"}>
              {duplicateDiag.duplicate_ratio_pct}% dup
            </Badge>
            <span className="text-muted-foreground">
              threshold {duplicateDiag.threshold_pct}% ·
              variation pass {duplicateDiag.variation_attempts}/{duplicateDiag.max_variation_attempts}
            </span>
            <span className={duplicateDiag.aborted ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
              {duplicateDiag.aborted
                ? "aborted"
                : duplicateDiag.accepted_after_variation
                  ? "accepted after variation"
                  : "accepted (below threshold)"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[10px]">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="pr-2">#</th>
                  <th className="pr-2">dup%</th>
                  <th className="pr-2">rep</th>
                  <th className="pr-2">variation seed</th>
                  <th className="pr-2">motion</th>
                  <th>image</th>
                </tr>
              </thead>
              <tbody>
                {duplicateDiag.per_scene.map(s => (
                  <tr key={s.index} className="border-t border-border/40">
                    <td className="pr-2">{s.index}</td>
                    <td className={`pr-2 ${s.duplicate_pct >= 50 ? "text-destructive" : s.duplicate_pct >= 25 ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
                      {s.duplicate_pct}%
                    </td>
                    <td className="pr-2">{s.repeat_count}×</td>
                    <td className="pr-2">{s.variation_seed ?? "—"}</td>
                    <td className="pr-2">{s.motion_variant ?? "—"}</td>
                    <td className="max-w-[140px] truncate text-muted-foreground">
                      <a href={s.image_url} target="_blank" rel="noreferrer" className="hover:underline">{s.image_url.split("/").pop()}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {(["all", "info", "warn", "error", "ffmpeg"] as const).map(k => (
          <button
            key={k}
            onClick={() => setLevel(k)}
            className={`rounded border px-2 py-0.5 text-[10px] ${level === k ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {k}{k !== "all" && ` (${(counts as any)[k] ?? 0})`}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          auto-scroll
        </label>
      </div>
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search logs..."
        className="mb-2 h-8 text-xs"
      />
      <div
        ref={scrollRef}
        className="max-h-80 overflow-auto rounded border bg-background font-mono text-[10px] leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="p-3 text-center text-muted-foreground">No log lines{lines.length > 0 ? " match filter" : " yet"}.</div>
        ) : (
          filtered.map((l, i) => (
            <div
              key={i}
              className={`flex gap-2 border-b border-border/40 px-2 py-0.5 ${
                l.level === "error" ? "bg-destructive/10 text-destructive" :
                l.level === "warn" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" :
                l.isFfmpeg ? "text-blue-600 dark:text-blue-400" : ""
              }`}
            >
              <span className="w-8 shrink-0 text-right text-muted-foreground">{i + 1}</span>
              {l.ts && <span className="shrink-0 text-muted-foreground">{l.ts.replace("T", " ").slice(0, 19)}</span>}
              <span className="shrink-0 uppercase text-muted-foreground">[{l.level}]</span>
              <span className="min-w-0 whitespace-pre-wrap break-all">{l.message}</span>
            </div>
          ))
        )}
      </div>
      {isLive && (
        <div className="mt-1 text-[10px] text-muted-foreground">Live — refreshing every 4s while {job.status}.</div>
      )}
    </div>
  );
}