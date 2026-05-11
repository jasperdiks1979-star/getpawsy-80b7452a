import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Loader2, RefreshCw, Send, Shuffle, Search, Play, RotateCw, History, Upload, Sparkles, Star, Wand2, Copy, ExternalLink, CheckCircle2, XCircle, Activity, Bug, Trash2, HeartPulse } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ALLOWED_VIDEO_EXT, MAX_VIDEO_BYTES, formatBytes, validateVideoFile } from "@/lib/pinterest-video-limits";
import { pickTopN, scoreDrafts } from "@/lib/pinterest-video-rank";

type VideoAsset = {
  id: string;
  filename: string;
  public_url: string;
  hook_type: string;
  duration_seconds: number | null;
  publish_count: number;
  is_active: boolean;
  aspect_ratio?: string | null;
};
type QueueRow = {
  id: string;
  asset_id: string;
  status: string;
  title: string;
  description: string;
  hashtags: string[];
  cta_text: string | null;
  pin_id: string | null;
  external_url: string | null;
  error_message: string | null;
  attempt_count: number;
  max_retries: number;
  last_retry_at: string | null;
  created_at: string;
};
type HistoryEntry = {
  id: string;
  queue_id: string | null;
  stage: string;
  status: string;
  payload: any;
  created_at: string;
};

const STATUS_FILTERS = ["all", "draft", "queued", "publishing", "published", "failed"] as const;
const HOOK_BADGE_COLORS: Record<string, string> = {
  pain: "bg-red-100 text-red-700",
  smell: "bg-emerald-100 text-emerald-700",
  time: "bg-blue-100 text-blue-700",
  transformation: "bg-purple-100 text-purple-700",
  social_proof: "bg-amber-100 text-amber-700",
  curiosity: "bg-pink-100 text-pink-700",
  direct: "bg-slate-200 text-slate-800",
  unknown: "bg-muted text-muted-foreground",
};

const STATUS_DOT: Record<string, string> = {
  draft: "bg-slate-400",
  queued: "bg-blue-500",
  publishing: "bg-amber-500",
  retried: "bg-purple-500",
  published: "bg-emerald-500",
  failed: "bg-red-500",
};

function StatusHistory({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="text-xs text-muted-foreground">No history yet.</p>;
  return (
    <ol className="space-y-1.5 text-xs">
      {entries.map((e) => {
        const ts = new Date(e.created_at).toLocaleString();
        const from = e.payload?.from;
        const to = e.payload?.to ?? e.status;
        const attempt = e.payload?.attempt;
        const err = e.payload?.error;
        return (
          <li key={e.id} className="flex gap-2 items-start">
            <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[to] || "bg-muted-foreground"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{from ? `${from} → ${to}` : to}</span>
                {attempt != null && <span className="text-muted-foreground">attempt {attempt}</span>}
                <span className="text-muted-foreground">{ts}</span>
              </div>
              {err && <p className="text-destructive line-clamp-2">{err}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VideoCard({
  asset,
  queue,
  onPublish,
  onReroll,
  onQueueDraft,
  onRetry,
  historyByQueue,
  loadingHistoryId,
  onToggleHistory,
  openHistoryId,
  busyId,
  selectedIds,
  onToggleSelect,
  topPickIds,
}: {
  asset: VideoAsset;
  queue: QueueRow[];
  onPublish: (id: string) => void;
  onReroll: (id: string) => void;
  onQueueDraft: (asset_id: string) => void;
  onRetry: (id: string) => void;
  historyByQueue: Record<string, HistoryEntry[]>;
  loadingHistoryId: string | null;
  onToggleHistory: (id: string) => void;
  openHistoryId: string | null;
  busyId: string | null;
  selectedIds: Set<string>;
  onToggleSelect: (queue_id: string) => void;
  topPickIds: Set<string>;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) el.play().catch(() => {});
        else el.pause();
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Card className="overflow-hidden border">
      <div className="relative bg-black aspect-[9/16] max-h-[60vh]">
        <video
          ref={ref}
          src={asset.public_url}
          muted
          playsInline
          loop
          preload="metadata"
          className="h-full w-full object-contain"
        />
        <Badge className={`absolute top-2 left-2 ${HOOK_BADGE_COLORS[asset.hook_type] || HOOK_BADGE_COLORS.unknown}`}>
          {asset.hook_type}
        </Badge>
        {asset.publish_count > 0 && (
          <Badge variant="secondary" className="absolute top-2 right-2">
            ×{asset.publish_count}
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground truncate" title={asset.filename}>{asset.filename}</p>
        {queue.length === 0 ? (
          <Button size="sm" className="w-full h-11" onClick={() => onQueueDraft(asset.id)} disabled={busyId === asset.id}>
            {busyId === asset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Generate draft</>}
          </Button>
        ) : (
          queue.map((q) => (
            <div
              key={q.id}
              className={`space-y-2 border-t pt-2 ${selectedIds.has(q.id) ? "ring-2 ring-primary rounded-md -mx-1 px-2 py-2" : ""}`}
            >
              <div className="flex items-center gap-2">
                <Badge variant={q.status === "published" ? "default" : q.status === "failed" ? "destructive" : "outline"}>
                  {q.status}
                </Badge>
                {topPickIds.has(q.id) && (
                  <Badge className="gap-1 bg-amber-500 hover:bg-amber-500/90 text-white">
                    <Star className="h-3 w-3" /> Top pick
                  </Badge>
                )}
                {q.attempt_count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {q.attempt_count}/{q.max_retries ?? 3} attempts
                  </span>
                )}
                {q.status !== "published" && q.status !== "publishing" && (
                  <label className="ml-auto inline-flex items-center gap-1 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selectedIds.has(q.id)}
                      onChange={() => onToggleSelect(q.id)}
                    />
                    Select
                  </label>
                )}
              </div>
              <p className="text-sm font-semibold leading-snug">{q.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{q.description}</p>
              {q.error_message && <p className="text-xs text-destructive line-clamp-2">{q.error_message}</p>}
              {q.external_url && (
                <a href={q.external_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                  View on Pinterest →
                </a>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="flex-1 min-w-[88px] h-10" onClick={() => onReroll(q.id)} disabled={busyId === q.id || q.status === "published"}>
                  <Shuffle className="h-4 w-4 mr-1" /> Reroll
                </Button>
                {q.status === "failed" ? (
                  <Button
                    size="sm"
                    className="flex-1 min-w-[88px] h-10"
                    onClick={() => onRetry(q.id)}
                    disabled={busyId === q.id || (q.attempt_count >= (q.max_retries ?? 3))}
                  >
                    {busyId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RotateCw className="h-4 w-4 mr-1" /> Retry</>}
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1 min-w-[88px] h-10" onClick={() => onPublish(q.id)} disabled={busyId === q.id || q.status === "published"}>
                    {busyId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Publish</>}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-10" onClick={() => onToggleHistory(q.id)} aria-label="Toggle history">
                  <History className="h-4 w-4" />
                </Button>
              </div>
              {openHistoryId === q.id && (
                <div className="rounded-md bg-muted/50 p-2 mt-2">
                  {loadingHistoryId === q.id
                    ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading history…</div>
                    : <StatusHistory entries={historyByQueue[q.id] || []} />}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export default function PinterestVideoQueuePage() {
  const [assets, setAssets] = useState<VideoAsset[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [hookFilter, setHookFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyByQueue, setHistoryByQueue] = useState<Record<string, HistoryEntry[]>>({});
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [autoSelectedOnce, setAutoSelectedOnce] = useState(false);
  const [publishingBatch, setPublishingBatch] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareStep, setPrepareStep] = useState<string>("");
  const [publishingTest, setPublishingTest] = useState(false);
  type StepTrace = { step: string; traceId: string; fn: string; ok: boolean; message?: string };
  const [stepTraces, setStepTraces] = useState<StepTrace[]>([]);
  // Snapshot of the queue IDs used in the last publish run, so the user can
  // re-run *exactly* the same publish step even after the selection was cleared.
  const [lastPublishIds, setLastPublishIds] = useState<string[]>([]);
  const [rerunningStep, setRerunningStep] = useState<null | "discovery" | "drafts" | "publish">(null);

  // ── Debug Console state ─────────────────────────────────────────────
  type DebugEvent = {
    id: string;
    started_at: string;
    duration_ms: number | null;
    fn: string;
    action: string;
    http_status: number | null;
    ok: boolean;
    pending: boolean;
    request: unknown;
    response: unknown;
    error: string | null;
    trace_id: string | null;
  };
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [discoveryDetail, setDiscoveryDetail] = useState<any | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState<string | null>(null);

  // Direct fetch wrapper so we capture HTTP status, raw response and timing.
  // Falls back to a clear "Admin auth required" message on 401/403.
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const invokeDebug = useCallback(async (fn: string, body: Record<string, unknown>): Promise<DebugEvent> => {
    const started = performance.now();
    const startedIso = new Date().toISOString();
    const eventId = crypto.randomUUID();
    const startedEvent: DebugEvent = {
      id: eventId,
      started_at: startedIso,
      duration_ms: null,
      fn,
      action: String(body.action || "—"),
      http_status: null,
      ok: false,
      pending: true,
      request: body,
      response: null,
      error: null,
      trace_id: null,
    };
    setDebugEvents((prev) => [startedEvent, ...prev].slice(0, 50));
    let http_status: number | null = null;
    let response: unknown = null;
    let error: string | null = null;
    let ok = false;
    let trace_id: string | null = null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token || SUPABASE_ANON}`,
        },
        body: JSON.stringify(body),
      });
      http_status = res.status;
      const text = await res.text();
      try { response = text ? JSON.parse(text) : null; } catch { response = text; }
      const r: any = response;
      trace_id = r?.traceId || r?.trace_id || null;
      ok = res.ok && (r?.ok ?? true);
      if (res.status === 401) error = "Admin auth required (401 Unauthorized)";
      else if (res.status === 403) error = "Admin auth required (403 Forbidden)";
      else if (!res.ok) error = `HTTP ${res.status}`;
      else if (r && r.ok === false) {
        error = ["FORBIDDEN", "UNAUTHENTICATED"].includes(r.code)
          ? "Admin auth required"
          : `${r.code || "ERROR"}: ${r.message || ""}`;
      }
    } catch (e: any) {
      error = e?.message || "Network error";
    }
    const ev: DebugEvent = {
      id: eventId,
      started_at: startedIso,
      duration_ms: Math.round(performance.now() - started),
      fn,
      action: String(body.action || "—"),
      http_status,
      ok,
      pending: false,
      request: body,
      response,
      error,
      trace_id,
    };
    setDebugEvents((prev) => prev.map((item) => item.id === eventId ? ev : item).slice(0, 50));
    if (!ok) {
      toast({
        title: `${fn} failed`,
        description: error || "See Debug Console",
        variant: "destructive",
      });
    }
    return ev;
  }, [SUPABASE_URL, SUPABASE_ANON]);

  const runHealthCheck = useCallback(async (fn: string) => {
    setHealthBusy(fn);
    try {
      // Sentinel action: every function returns a JSON body even for unknown
      // actions, so reachability + auth state can be inferred from the result.
      await invokeDebug(fn, { action: "__health_check__" });
    } finally {
      setHealthBusy(null);
    }
  }, [invokeDebug]);

  const createDraftFromUrl = useCallback(async () => {
    const url = manualUrl.trim();
    if (!url) { toast({ title: "Paste a public MP4 URL first", variant: "destructive" }); return; }
    if (!/\.mp4(\?|$)/i.test(url)) {
      toast({ title: "Not an .mp4 URL", description: "URL must end in .mp4", variant: "destructive" });
      return;
    }
    setManualBusy(true);
    try {
      const filename = decodeURIComponent(url.split("/").pop() || `manual-${Date.now()}.mp4`);
      // Best-effort parse of bucket/path from a Supabase public URL.
      const m = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      const storage_bucket = m?.[1] || "external";
      const storage_path = m?.[2] || url;
      const content_hash = `manual-${url}`;
      const { data: asset, error: insErr } = await supabase
        .from("pinterest_video_assets")
        .upsert({
          filename,
          storage_bucket,
          storage_path,
          public_url: url,
          hook_type: "direct",
          content_hash,
          is_active: true,
        }, { onConflict: "content_hash" })
        .select("id")
        .maybeSingle();
      if (insErr || !asset?.id) {
        toast({ title: "Insert failed", description: insErr?.message || "no id", variant: "destructive" });
        return;
      }
      const ev = await invokeDebug("pinterest-video-publisher", { action: "queue_draft", asset_id: asset.id });
      if (ev.ok) {
        toast({ title: "Draft created from URL", description: `asset ${asset.id.slice(0, 8)}…` });
      }
    } finally {
      setManualBusy(false);
    }
  }, [manualUrl, invokeDebug]);

  const pushTrace = useCallback((t: StepTrace) => {
    setStepTraces((prev) => [...prev, t]);
    // Fire a toast with a direct, pre-filtered Logs link for this exact step
    // so the user never has to refresh or scroll to find diagnostics.
    const url = `/admin/pinterest-video-logs?trace=${encodeURIComponent(t.traceId)}&fn=${encodeURIComponent(t.fn)}`;
    toast({
      title: `${t.ok ? "✓" : "✗"} ${t.step}`,
      description: `${t.fn} · ${t.message || (t.ok ? "ok" : "failed")} · trace ${t.traceId.slice(0, 8)}…`,
      variant: t.ok ? "default" : "destructive",
      action: (
        <ToastAction altText="View logs" onClick={() => window.open(url, "_blank", "noopener")}>
          View logs
        </ToastAction>
      ),
    });
  }, []);
  const copyTrace = (id: string) => {
    navigator.clipboard?.writeText(id).then(
      () => toast({ title: "Trace ID copied", description: id }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [a, q] = await Promise.all([
      supabase.from("pinterest_video_assets").select("*").order("created_at", { ascending: false }),
      supabase.from("pinterest_video_queue").select("*").order("created_at", { ascending: false }),
    ]);
    setAssets((a.data as VideoAsset[]) || []);
    setQueue((q.data as QueueRow[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      toast({ title: "Discovery started", description: "Calling pinterest-video-discovery…" });
      const ev = await invokeDebug("pinterest-video-discovery", { action: "discover" });
      const data: any = ev.response || {};
      if (ev.error && !data?.traceId) throw new Error(ev.error);
      setDiscoveryDetail(data);
      toast({
        title: data?.ok ? "Discovery complete" : "Discovery blocked",
        description: data?.ok
          ? `Scanned ${data?.scanned ?? 0} files, inserted ${data?.inserted ?? 0}.`
          : (ev.error || data?.code || "See Debug Console"),
        variant: data?.ok ? "default" : "destructive",
      });
      if (data?.traceId) pushTrace({
        step: "Discovery",
        fn: "pinterest-video-discovery",
        traceId: data.traceId,
        ok: !!data?.ok,
        message: `scanned ${data?.scanned ?? 0} · inserted ${data?.inserted ?? 0}`,
      });
      await load();
      return data;
    } catch (e: any) {
      toast({ title: "Discovery failed", description: e?.message || "Unknown error", variant: "destructive" });
      throw e;
    } finally { setDiscovering(false); }
  };

  const onPickFiles = () => fileInputRef.current?.click();

  const onFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    // 1) Validate every file BEFORE any network call.
    const valid: File[] = [];
    for (const f of files) {
      const v = validateVideoFile(f);
      if (v.ok === false) {
        toast({ title: v.title, description: v.message, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    if (!valid.length) return;

    setUploading(true);
    let uploaded = 0;
    try {
      for (const f of valid) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `uploads/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage
          .from("pinterest-ads")
          .upload(path, f, { contentType: f.type || "video/mp4", upsert: false });
        if (error) {
          toast({ title: `Upload failed: ${f.name}`, description: error.message, variant: "destructive" });
          continue;
        }
        uploaded++;
      }
      if (uploaded > 0) {
        toast({ title: "Upload complete", description: `${uploaded} of ${valid.length} file(s) uploaded. Running discovery…` });
        await runDiscovery();
      }
    } finally {
      setUploading(false);
    }
  };

  const callPublisher = async (action: string, payload: Record<string, unknown>, busy: string) => {
    setBusyId(busy);
    try {
      toast({ title: `${action.replace(/_/g, " ")} started`, description: "Calling pinterest-video-publisher…" });
      const ev = await invokeDebug("pinterest-video-publisher", { action, ...payload });
      const data: any = ev.response || {};
      const error = ev.error ? new Error(ev.error) : null;
      if (data?.ok) toast({ title: action.replace("_", " "), description: data?.message || "Done" });
      else toast({ title: "Failed", description: `${data?.code}: ${data?.message || ""}`, variant: "destructive" });
      if (data?.traceId) pushTrace({
        step: action.replace(/_/g, " "),
        fn: "pinterest-video-publisher",
        traceId: data.traceId,
        ok: !error && !!data?.ok,
        message: error ? error.message : (data?.ok ? (data?.message || "ok") : (data?.code || data?.message || "failed")),
      });
      await load();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const toggleHistory = useCallback(async (queue_id: string) => {
    if (openHistoryId === queue_id) { setOpenHistoryId(null); return; }
    setOpenHistoryId(queue_id);
    if (historyByQueue[queue_id]) return;
    setLoadingHistoryId(queue_id);
    const { data } = await supabase
      .from("pinterest_video_publish_log")
      .select("*")
      .eq("queue_id", queue_id)
      .order("created_at", { ascending: true });
    setHistoryByQueue((prev) => ({ ...prev, [queue_id]: (data as HistoryEntry[]) || [] }));
    setLoadingHistoryId(null);
  }, [openHistoryId, historyByQueue]);

  const queueByAsset = useMemo(() => {
    const m = new Map<string, QueueRow[]>();
    for (const q of queue) {
      if (statusFilter !== "all" && q.status !== statusFilter) continue;
      const arr = m.get(q.asset_id) || [];
      arr.push(q);
      m.set(q.asset_id, arr);
    }
    return m;
  }, [queue, statusFilter]);

  const visibleAssets = useMemo(() => {
    return assets.filter((a) => {
      if (hookFilter !== "all" && a.hook_type !== hookFilter) return false;
      if (statusFilter !== "all") return (queueByAsset.get(a.id) || []).length > 0;
      return true;
    });
  }, [assets, hookFilter, statusFilter, queueByAsset]);

  // Score every eligible draft once per queue/assets refresh.
  const ranked = useMemo(() => scoreDrafts(queue as any, assets as any), [queue, assets]);
  const topPickIds = useMemo(() => new Set(ranked.slice(0, 3).map((s) => s.draft.id)), [ranked]);

  // Auto-select the top 3 the first time we see eligible drafts after load.
  useEffect(() => {
    if (autoSelectedOnce) return;
    if (loading) return;
    if (ranked.length === 0) return;
    setSelectedIds(new Set(ranked.slice(0, 3).map((s) => s.draft.id)));
    setAutoSelectedOnce(true);
  }, [ranked, loading, autoSelectedOnce]);

  const toggleSelect = useCallback((qid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid); else next.add(qid);
      return next;
    });
  }, []);

  const autoPickBest3 = useCallback(() => {
    const ids = pickTopN(queue as any, assets as any, 3);
    setSelectedIds(new Set(ids));
    toast({ title: "Top 3 selected", description: `Ranked ${ranked.length} eligible drafts.` });
  }, [queue, assets, ranked.length]);

  // One-click: discover → queue drafts for all → readiness report.
  const runPrepareAll = useCallback(async () => {
    setPreparing(true);
    setStepTraces([]);
    try {
      setPrepareStep("Discovering videos…");
      try { await runDiscovery(); } catch { /* toast already shown */ }

      setPrepareStep("Generating drafts…");
      try {
        toast({ title: "Draft generation started", description: "Calling pinterest-video-publisher…" });
        const ev = await invokeDebug("pinterest-video-publisher", { action: "queue_all_drafts" });
        const data: any = ev.response || {};
        if (data?.traceId) pushTrace({
          step: "Generate drafts",
          fn: "pinterest-video-publisher",
          traceId: data.traceId,
          ok: !!data?.ok,
          message: data?.ok
            ? `created ${data?.created_count ?? 0}`
            : (data?.code || data?.message || "failed"),
        });
        if (!data?.ok) {
          toast({ title: "Draft generation failed", description: ev.error || data?.message || "Unknown error", variant: "destructive" });
        }
      } catch (e: any) {
        toast({ title: "Draft generation failed", description: e?.message || "Unknown error", variant: "destructive" });
      }

      setPrepareStep("Checking readiness…");
      const [{ data: aData }, { data: qData }] = await Promise.all([
        supabase.from("pinterest_video_assets").select("*").order("created_at", { ascending: false }),
        supabase.from("pinterest_video_queue").select("*").order("created_at", { ascending: false }),
      ]);
      const freshAssets = (aData as VideoAsset[]) || [];
      const freshQueue = (qData as QueueRow[]) || [];
      setAssets(freshAssets);
      setQueue(freshQueue);

      const assetById = new Map(freshAssets.map((a) => [a.id, a]));
      let ready = 0; let blocked = 0; let published = 0; let failed = 0;
      const issues: string[] = [];
      for (const q of freshQueue) {
        if (q.status === "published") { published++; continue; }
        if (q.status === "failed") { failed++; continue; }
        const a = assetById.get(q.asset_id);
        const probs: string[] = [];
        if (!a?.public_url) probs.push("missing video URL");
        if (!a?.is_active) probs.push("asset inactive");
        if (!q.title?.trim()) probs.push("missing title");
        if (!q.description?.trim()) probs.push("missing description");
        if (probs.length) { blocked++; issues.push(`${a?.filename || q.asset_id}: ${probs.join(", ")}`); }
        else ready++;
      }

      // Re-run auto-select against fresh data.
      const ids = pickTopN(freshQueue as any, freshAssets as any, 3);
      setSelectedIds(new Set(ids));

      toast({
        title: "Pipeline ready",
        description: `${ready} ready · ${blocked} blocked · ${published} published · ${failed} failed${issues.length ? ` · first issue: ${issues[0]}` : ""}`,
        variant: blocked > 0 && ready === 0 ? "destructive" : "default",
      });
    } finally {
      setPreparing(false);
      setPrepareStep("");
    }
  }, [pushTrace]);

  const publishSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setLastPublishIds(ids);
    setPublishingBatch(true);
    let okCount = 0; let failCount = 0;
    try {
      for (const qid of ids) {
        try {
          toast({ title: "Publish started", description: `Calling pinterest-video-publisher for ${qid.slice(0, 8)}…` });
          const ev = await invokeDebug("pinterest-video-publisher", { action: "publish", queue_id: qid });
          const data: any = ev.response || {};
          const error = ev.error ? new Error(ev.error) : null;
          if (data?.traceId) pushTrace({
            step: `Publish ${qid.slice(0, 6)}…`,
            fn: "pinterest-video-publisher",
            traceId: data.traceId,
            ok: !error && !!data?.ok,
            message: error ? error.message : (data?.ok ? (data?.message || "ok") : (data?.code || data?.message || "failed")),
          });
          if (error || !data?.ok) failCount++; else okCount++;
        } catch { failCount++; }
      }
      toast({
        title: "Batch publish complete",
        description: `${okCount} published · ${failCount} failed`,
        variant: failCount > 0 ? "destructive" : "default",
      });
      setSelectedIds(new Set());
      await load();
    } finally {
      setPublishingBatch(false);
    }
  }, [selectedIds, load, pushTrace]);

  // Publish exactly ONE test video pin — picks the highest-ranked eligible draft
  // (vertical, strong hook, relevance) and runs the publisher for it only.
  const publishOneTest = useCallback(async () => {
    const eligible = ranked.filter((s) =>
      s.draft.status !== "published" && s.draft.status !== "publishing"
    );
    if (eligible.length === 0) {
      toast({
        title: "No eligible draft",
        description: "Run Discover → Generate drafts first, then try again.",
        variant: "destructive",
      });
      return;
    }
    const best = eligible[0].draft;
      setLastPublishIds([best.id]);
    setPublishingTest(true);
    try {
      toast({ title: "Test publish started", description: `Publishing exactly 1 video pin (${best.id.slice(0, 8)}…)` });
      const ev = await invokeDebug("pinterest-video-publisher", { action: "publish", queue_id: best.id });
      const data: any = ev.response || {};
      const error = ev.error ? new Error(ev.error) : null;
      const traceId = data?.traceId;
      if (traceId) pushTrace({
        step: `Test publish ${best.id.slice(0, 6)}…`,
        fn: "pinterest-video-publisher",
        traceId,
        ok: !error && !!data?.ok,
        message: error ? error.message : (data?.ok ? (data?.message || "ok") : (data?.code || data?.message || "failed")),
      });
      const success = !error && !!data?.ok;
      toast({
        title: success ? "Test pin published" : "Test publish failed",
        description: success
          ? `pin_id=${data?.pin_id || "?"} · pin_url=${data?.external_url || data?.pin_url || "?"}`
          : `${data?.code || error?.message || "unknown"} — see Debug Console response JSON`,
        variant: success ? "default" : "destructive",
      });
      await load();
    } catch (e) {
      toast({ title: "Test publish crashed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPublishingTest(false);
    }
  }, [ranked, pushTrace, load]);

  // ───────────────── Per-step rerun helpers ─────────────────
  // Each helper repeats exactly one stage of the pipeline with the same input
  // it would have used inside `runPrepareAll` / `publishSelected`, so the user
  // can iterate on a single failing stage without re-running the whole flow.
  const rerunDraftGeneration = useCallback(async () => {
    setRerunningStep("drafts");
    try {
      toast({ title: "Draft rerun started", description: "Calling pinterest-video-publisher…" });
      const ev = await invokeDebug("pinterest-video-publisher", { action: "queue_all_drafts" });
      const data: any = ev.response || {};
      if (data?.traceId) pushTrace({
        step: "Generate drafts (rerun)",
        fn: "pinterest-video-publisher",
        traceId: data.traceId,
        ok: !!data?.ok,
        message: data?.ok ? `created ${data?.created_count ?? 0}` : (data?.code || data?.message || "failed"),
      });
      if (!data?.ok) {
        toast({ title: "Draft generation failed", description: ev.error || data?.message || "Unknown error", variant: "destructive" });
      }
      await load();
    } catch (e: any) {
      toast({ title: "Draft rerun crashed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRerunningStep(null);
    }
  }, [pushTrace, load]);

  const rerunPublish = useCallback(async () => {
    const ids = lastPublishIds.length > 0 ? lastPublishIds : Array.from(selectedIds);
    if (ids.length === 0) {
      toast({
        title: "Nothing to rerun",
        description: "Publish at least one pin first, or select drafts to publish.",
        variant: "destructive",
      });
      return;
    }
    setRerunningStep("publish");
    let okCount = 0; let failCount = 0;
    try {
      for (const qid of ids) {
        try {
          const { data, error } = await supabase.functions.invoke("pinterest-video-publisher", {
            body: { action: "publish", queue_id: qid },
          });
          if (data?.traceId) pushTrace({
            step: `Publish rerun ${qid.slice(0, 6)}…`,
            fn: "pinterest-video-publisher",
            traceId: data.traceId,
            ok: !error && !!data?.ok,
            message: error ? error.message : (data?.ok ? (data?.message || "ok") : (data?.code || data?.message || "failed")),
          });
          if (error || !data?.ok) failCount++; else okCount++;
        } catch { failCount++; }
      }
      toast({
        title: "Publish rerun complete",
        description: `${okCount} published · ${failCount} failed (${ids.length} pin${ids.length === 1 ? "" : "s"})`,
        variant: failCount > 0 ? "destructive" : "default",
      });
      await load();
    } finally {
      setRerunningStep(null);
    }
  }, [lastPublishIds, selectedIds, pushTrace, load]);

  const rerunDiscovery = useCallback(async () => {
    setRerunningStep("discovery");
    try {
      await runDiscovery();
    } finally {
      setRerunningStep(null);
    }
  }, []);

  const hookOptions = useMemo(() => {
    const set = new Set<string>(["all"]);
    assets.forEach((a) => set.add(a.hook_type));
    return Array.from(set);
  }, [assets]);

  return (
    <div className="container mx-auto px-3 py-4 pb-32 max-w-3xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Pinterest Video Queue</h1>
        <p className="text-sm text-muted-foreground">
          Discover MP4s and publish them as Pinterest Video Pins. ·{" "}
          <a href="/admin/pinterest-video-logs" className="underline underline-offset-2 hover:text-foreground">
            View diagnostic logs
          </a>
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          onClick={runPrepareAll}
          disabled={preparing || discovering || uploading || busyId === "all"}
          className="h-11"
          size="sm"
        >
          {preparing
            ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {prepareStep || "Preparing…"}</>
            : <><Wand2 className="h-4 w-4 mr-1" /> Prepare all (1-click)</>}
        </Button>
        <Button onClick={runDiscovery} disabled={discovering} className="h-11" size="sm">
          {discovering ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
          Discover videos
        </Button>
        <Button onClick={onPickFiles} disabled={uploading || discovering} className="h-11" size="sm" variant="outline">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
          Upload MP4
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={[...ALLOWED_VIDEO_EXT, "video/mp4", "video/quicktime"].join(",")}
          className="hidden"
          onChange={onFilesSelected}
        />
        <Button
          variant="outline"
          onClick={async () => {
            // Refresh = reload queue/assets AND ping metrics-sync so the
            // Debug Console shows reachability + full request/response.
            await Promise.all([
              load(),
              invokeDebug("pinterest-video-metrics-sync", { action: "refresh_status" }),
            ]);
          }}
          disabled={loading}
          className="h-11"
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <Button variant="secondary" onClick={() => callPublisher("queue_all_drafts", {}, "all")} disabled={busyId === "all"} className="h-11" size="sm">
          <Play className="h-4 w-4 mr-1" /> Queue drafts for all
        </Button>
        <Button
          variant="secondary"
          onClick={autoPickBest3}
          disabled={ranked.length === 0}
          className="h-11"
          size="sm"
        >
          <Sparkles className="h-4 w-4 mr-1" /> Auto-select best 3
        </Button>
        <Button
          onClick={publishOneTest}
          disabled={publishingTest || ranked.length === 0}
          className="h-11 bg-emerald-600 hover:bg-emerald-600/90 text-white"
          size="sm"
        >
          {publishingTest
            ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Publishing test pin…</>
            : <><Send className="h-4 w-4 mr-1" /> Publish 1 Test Video Pin</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Allowed: {ALLOWED_VIDEO_EXT.join(", ")} · Max {formatBytes(MAX_VIDEO_BYTES)} per file.
      </p>

      <Card className="p-3 mb-3 border-dashed">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Rerun a single step (same input)
          </p>
          <span className="text-[10px] text-muted-foreground">
            Last publish set: {lastPublishIds.length > 0 ? `${lastPublishIds.length} pin${lastPublishIds.length === 1 ? "" : "s"}` : "—"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={rerunDiscovery}
            disabled={rerunningStep !== null || discovering}
          >
            {rerunningStep === "discovery"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <RotateCw className="h-3.5 w-3.5 mr-1" />}
            Rerun discovery
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={rerunDraftGeneration}
            disabled={rerunningStep !== null}
          >
            {rerunningStep === "drafts"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <RotateCw className="h-3.5 w-3.5 mr-1" />}
            Rerun draft generation
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={rerunPublish}
            disabled={rerunningStep !== null || (lastPublishIds.length === 0 && selectedIds.size === 0)}
            title={lastPublishIds.length > 0
              ? `Republish the last ${lastPublishIds.length} pin(s)`
              : (selectedIds.size > 0 ? `Publish ${selectedIds.size} selected` : "No pins to republish yet")}
          >
            {rerunningStep === "publish"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <RotateCw className="h-3.5 w-3.5 mr-1" />}
            Rerun publish ({lastPublishIds.length || selectedIds.size})
          </Button>
        </div>
      </Card>

      <Card className="p-3 mb-3 border-dashed">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
            <Bug className="h-3.5 w-3.5" /> Debug console
          </p>
          {debugEvents.length > 0 && (
            <button
              type="button"
              onClick={() => setDebugEvents([])}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3 w-3" /> Clear ({debugEvents.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {[
            "pinterest-video-discovery",
            "pinterest-video-publisher",
            "pinterest-video-metrics-sync",
          ].map((fn) => (
            <Button
              key={fn}
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => runHealthCheck(fn)}
              disabled={healthBusy === fn}
            >
              {healthBusy === fn
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                : <HeartPulse className="h-3.5 w-3.5 mr-1" />}
              Health: {fn.replace(/^pinterest-video-/, "pv-")}
            </Button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <Input
            placeholder="Paste public MP4 URL (https://…/file.mp4)"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            className="h-10"
          />
          <Button
            onClick={createDraftFromUrl}
            disabled={manualBusy || !manualUrl.trim()}
            className="h-10"
            size="sm"
          >
            {manualBusy
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <Sparkles className="h-4 w-4 mr-1" />}
            Create draft from URL
          </Button>
        </div>

        {discoveryDetail && (
          <div className="rounded-md border bg-muted/40 p-2 mb-3 text-xs space-y-1">
            <div className="font-semibold">Last discovery</div>
            <div className="text-muted-foreground">
              scanned <b>{discoveryDetail.scanned ?? 0}</b> · matched <b>{discoveryDetail.matched ?? 0}</b> · inserted <b>{discoveryDetail.inserted ?? 0}</b> · skipped (small) <b>{discoveryDetail.skipped_undersized ?? 0}</b> · skipped (big) <b>{discoveryDetail.skipped_oversized ?? 0}</b>
            </div>
            {(discoveryDetail.inserted ?? 0) === 0 && (
              <div className="text-amber-600">
                Buckets searched: <code>pinterest-ads</code>, <code>tiktok-media</code>, <code>admin-resources</code> · pattern <code>(getpawsy-tiktok-|getpawsy-litterbox-|timepain|smell|direct).*\.mp4</code>
              </div>
            )}
            {Array.isArray(discoveryDetail.skipped) && discoveryDetail.skipped.length > 0 && (
              <details>
                <summary className="cursor-pointer">Skipped files ({discoveryDetail.skipped.length})</summary>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-auto">
                  {discoveryDetail.skipped.map((s: any, i: number) => (
                    <li key={i} className="font-mono text-[10px] truncate">
                      <span className="text-amber-600">{s.reason}</span> — {s.filename}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {Array.isArray(discoveryDetail.errors) && discoveryDetail.errors.length > 0 && (
              <details>
                <summary className="cursor-pointer text-destructive">Errors ({discoveryDetail.errors.length})</summary>
                <ul className="mt-1 space-y-0.5 max-h-32 overflow-auto">
                  {discoveryDetail.errors.map((e: string, i: number) => (
                    <li key={i} className="font-mono text-[10px] text-destructive">{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {debugEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Activity className="h-3 w-3" /> No debug events yet — every action will record HTTP status, payload, response and duration here.
          </p>
        ) : (
          <ol className="space-y-2 max-h-96 overflow-auto">
            {debugEvents.map((ev) => (
              <li key={ev.id} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {ev.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  <span className="font-mono text-[10px]">{new Date(ev.started_at).toLocaleTimeString()}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono">{ev.fn.replace(/^pinterest-video-/, "pv-")}</Badge>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{ev.action}</Badge>
                  <Badge
                    variant={ev.http_status && ev.http_status < 400 ? "default" : "destructive"}
                    className={`h-5 px-1.5 text-[10px] ${ev.http_status && ev.http_status < 400 ? "bg-emerald-500 hover:bg-emerald-500/90" : ""}`}
                  >
                    HTTP {ev.http_status ?? "—"}
                  </Badge>
                  <span className="text-muted-foreground">{ev.duration_ms}ms</span>
                  {ev.trace_id && (
                    <a
                      href={`/admin/pinterest-video-logs?trace=${encodeURIComponent(ev.trace_id)}&fn=${encodeURIComponent(ev.fn)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Logs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {ev.error && <p className="mt-1 text-destructive">{ev.error}</p>}
                <details className="mt-1">
                  <summary className="cursor-pointer text-muted-foreground">Request / Response</summary>
                  <div className="grid sm:grid-cols-2 gap-2 mt-1">
                    <pre className="rounded bg-muted/60 p-2 text-[10px] overflow-auto max-h-48 whitespace-pre-wrap break-all">{JSON.stringify(ev.request, null, 2)}</pre>
                    <pre className="rounded bg-muted/60 p-2 text-[10px] overflow-auto max-h-48 whitespace-pre-wrap break-all">{typeof ev.response === "string" ? ev.response : JSON.stringify(ev.response, null, 2)}</pre>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {stepTraces.length > 0 && (
        <Card className="p-3 mb-3 border-dashed">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pipeline trace IDs
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const text = stepTraces
                    .map((t) => `${t.ok ? "ok " : "FAIL"} ${t.fn}\t${t.traceId}\t${t.step}${t.message ? ` — ${t.message}` : ""}`)
                    .join("\n");
                  navigator.clipboard?.writeText(text).then(
                    () => toast({ title: "Copied all trace IDs", description: `${stepTraces.length} step(s)` }),
                    () => toast({ title: "Copy failed", variant: "destructive" }),
                  );
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                <Copy className="h-3 w-3" /> Copy all
              </button>
              <button
                type="button"
                onClick={() => {
                  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                  const payload = {
                    exported_at: new Date().toISOString(),
                    page: "pinterest-video-queue",
                    count: stepTraces.length,
                    traces: stepTraces,
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `pv-pipeline-traces-${stamp}.json`;
                  document.body.appendChild(a); a.click(); a.remove();
                  URL.revokeObjectURL(url);
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
                  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
                  const header = ["step", "function", "status", "trace_id", "message"].join(",");
                  const body = stepTraces
                    .map((t) => [t.step, t.fn, t.ok ? "ok" : "failed", t.traceId, t.message || ""].map(esc).join(","))
                    .join("\n");
                  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `pv-pipeline-traces-${stamp}.csv`;
                  document.body.appendChild(a); a.click(); a.remove();
                  URL.revokeObjectURL(url);
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => setStepTraces([])}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <ol className="space-y-1.5">
            {stepTraces.map((t, i) => (
              <li key={`${t.traceId}-${i}`} className="flex items-center gap-2 text-xs flex-wrap">
                {t.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                <span className="font-medium shrink-0">{t.step}</span>
                <Badge
                  variant={t.ok ? "default" : "destructive"}
                  className={`h-5 px-1.5 text-[10px] uppercase tracking-wide shrink-0 ${t.ok ? "bg-emerald-500 hover:bg-emerald-500/90" : ""}`}
                >
                  {t.ok ? "ok" : "failed"}
                </Badge>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono shrink-0" title={t.fn}>
                  {t.fn.replace(/^pinterest-video-/, "pv-")}
                </Badge>
                {t.message && <span className="text-muted-foreground truncate">· {t.message}</span>}
                <button
                  type="button"
                  onClick={() => copyTrace(t.traceId)}
                  className="ml-auto inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Copy trace ID"
                  title={t.traceId}
                >
                  {t.traceId.slice(0, 8)}…
                  <Copy className="h-3 w-3" />
                </button>
                <a
                  href={`/admin/pinterest-video-logs?trace=${encodeURIComponent(t.traceId)}&fn=${encodeURIComponent(t.fn)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
                >
                  Logs <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {STATUS_FILTERS.map((s) => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} className="h-9 shrink-0" onClick={() => setStatusFilter(s)}>
            {s}
          </Button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
        {hookOptions.map((h) => (
          <Button key={h} size="sm" variant={hookFilter === h ? "default" : "outline"} className="h-8 shrink-0 text-xs" onClick={() => setHookFilter(h)}>
            {h}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : visibleAssets.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No videos found. Tap <strong>Discover videos</strong> to scan storage.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleAssets.map((a) => (
            <VideoCard
              key={a.id}
              asset={a}
              queue={queueByAsset.get(a.id) || []}
              busyId={busyId}
              onQueueDraft={(id) => callPublisher("queue_draft", { asset_id: id }, id)}
              onPublish={(id) => callPublisher("publish", { queue_id: id }, id)}
              onReroll={(id) => callPublisher("reroll", { queue_id: id }, id)}
              onRetry={(id) => callPublisher("retry", { queue_id: id }, id)}
              historyByQueue={historyByQueue}
              loadingHistoryId={loadingHistoryId}
              onToggleHistory={toggleHistory}
              openHistoryId={openHistoryId}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              topPickIds={topPickIds}
            />
          ))}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
          <div className="container mx-auto max-w-3xl px-3 py-3 flex items-center gap-3">
            <div className="text-sm">
              <span className="font-semibold">{selectedIds.size}</span> selected
              {topPickIds.size > 0 && (
                <span className="text-muted-foreground"> · {Array.from(selectedIds).filter((id) => topPickIds.has(id)).length} top pick(s)</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-10"
              onClick={() => setSelectedIds(new Set())}
              disabled={publishingBatch}
            >
              Clear
            </Button>
            <Button size="sm" className="h-10" onClick={publishSelected} disabled={publishingBatch}>
              {publishingBatch
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Publishing…</>
                : <><Send className="h-4 w-4 mr-1" /> Publish selected</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}