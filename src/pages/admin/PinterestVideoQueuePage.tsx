import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Send, Shuffle, Search, Play, RotateCw, History, Upload, Sparkles, Star } from "lucide-react";
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
      await load();
    } catch (e: any) {
      toast({ title: "Discovery failed", description: e?.message || "Unknown error", variant: "destructive" });
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
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Allowed: {ALLOWED_VIDEO_EXT.join(", ")} · Max {formatBytes(MAX_VIDEO_BYTES)} per file.
      </p>

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
            />
          ))}
        </div>
      )}
    </div>
  );
}