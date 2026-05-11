import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Loader2, RefreshCw, Send, Shuffle, Search, Play, RotateCw, History, Upload, Sparkles, Star, Wand2, Copy, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
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
      const { data, error } = await supabase.functions.invoke("pinterest-video-discovery");
      if (error) throw error;
      toast({ title: "Discovery complete", description: `Scanned ${data?.scanned ?? 0} files, inserted ${data?.inserted ?? 0}.` });
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
      const { data, error } = await supabase.functions.invoke("pinterest-video-publisher", { body: { action, ...payload } });
      if (error) throw error;
      if (data?.ok) toast({ title: action.replace("_", " "), description: data?.message || "Done" });
      else toast({ title: "Failed", description: `${data?.code}: ${data?.message || ""}`, variant: "destructive" });
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
        const { data, error } = await supabase.functions.invoke("pinterest-video-publisher", {
          body: { action: "queue_all_drafts" },
        });
        if (error) throw error;
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
          toast({ title: "Draft generation failed", description: data?.message || "Unknown error", variant: "destructive" });
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
          const { data, error } = await supabase.functions.invoke("pinterest-video-publisher", {
            body: { action: "publish", queue_id: qid },
          });
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
      const { data, error } = await supabase.functions.invoke("pinterest-video-publisher", {
        body: { action: "publish", queue_id: best.id },
      });
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
          ? `pin_id=${data?.pin_id || "?"} · board=${data?.board_id || "?"}`
          : `${data?.code || error?.message || "unknown"} — open Logs for full Pinterest API response`,
        variant: success ? "default" : "destructive",
      });
      await load();
    } catch (e) {
      toast({ title: "Test publish crashed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPublishingTest(false);
    }
  }, [ranked, pushTrace, load]);

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
        <Button variant="outline" onClick={load} disabled={loading} className="h-11" size="sm">
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