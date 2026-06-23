import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Rocket,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  ImageOff,
  Copy as CopyIcon,
  Wand2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmAiCostDialog } from "@/components/admin/ConfirmAiCostDialog";
import { AiCostBreakdown } from "@/components/admin/AiCostBreakdown";
import { assessCostAsync, estimatePipelineCredits, type CostAssessment } from "@/lib/aiPricing";

type Row = {
  id: string;
  product_id: string;
  product_slug: string;
  product_name: string | null;
  category_key: string | null;
  pin_variant: string | null;
  pin_title: string | null;
  pin_description: string | null;
  pin_image_url: string | null;
  destination_link: string | null;
  board_name: string | null;
  status: string;
  scheduled_at: string | null;
  hook_group: string | null;
  content_type: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  image_hash: string | null;
  pin_image_phash: string | null;
  meta: any;
};

type ImgInfo = { w: number; h: number; ok: boolean };

const STATUS_APPROVED = "queued"; // approved drafts move to queued + approved_at set
const STATUS_REJECTED = "rejected";
const STATUS_DRAFT = "draft";

export default function PinterestWarmupPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [imgInfo, setImgInfo] = useState<Record<string, ImgInfo>>({});
  const [regenProgress, setRegenProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingScope, setPendingScope] = useState<"all" | "overused" | null>(null);
  const [assessment, setAssessment] = useState<CostAssessment | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("pinterest_pin_queue")
      .select(
        "id,product_id,product_slug,product_name,category_key,pin_variant,pin_title,pin_description,pin_image_url,destination_link,board_name,status,scheduled_at,hook_group,content_type,approved_at,rejection_reason,image_hash,pin_image_phash,meta"
      )
      .or("idempotency_key.like.warmup30:%,idempotency_key.like.warmup30:%:r%")
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(1000);
    setRows((data || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-warmup-orchestrator", { body: {} });
      if (error) throw error;
      toast.success(`Inserted ${(data as any)?.inserted ?? 0} drafts`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setRunning(false);
    }
  };

  // ---------- derived analytics ----------
  const analytics = useMemo(() => {
    const titleCount = new Map<string, number>();
    const descCount = new Map<string, number>();
    const urlCount = new Map<string, number>();
    const hookCount = new Map<string, number>();
    const imgHashCount = new Map<string, number>();
    for (const r of rows) {
      const t = (r.pin_title || "").trim().toLowerCase();
      const d = (r.pin_description || "").trim().toLowerCase();
      const u = (r.destination_link || "").trim().toLowerCase();
      const h = (r.hook_group || "").trim().toLowerCase();
      const ih = (r.pin_image_phash || r.image_hash || "").trim();
      if (t) titleCount.set(t, (titleCount.get(t) || 0) + 1);
      if (d) descCount.set(d, (descCount.get(d) || 0) + 1);
      if (u) urlCount.set(u, (urlCount.get(u) || 0) + 1);
      if (h) hookCount.set(h, (hookCount.get(h) || 0) + 1);
      if (ih) imgHashCount.set(ih, (imgHashCount.get(ih) || 0) + 1);
    }
    return { titleCount, descCount, urlCount, hookCount, imgHashCount };
  }, [rows]);

  const flagsFor = (r: Row) => {
    const f: string[] = [];
    const t = (r.pin_title || "").trim().toLowerCase();
    const d = (r.pin_description || "").trim().toLowerCase();
    const u = (r.destination_link || "").trim().toLowerCase();
    const h = (r.hook_group || "").trim().toLowerCase();
    const ih = (r.pin_image_phash || r.image_hash || "").trim();
    if (t && (analytics.titleCount.get(t) || 0) > 1) f.push("dup_title");
    if (d && (analytics.descCount.get(d) || 0) > 1) f.push("dup_desc");
    if (u && (analytics.urlCount.get(u) || 0) > 1) f.push("dup_url");
    if (h && (analytics.hookCount.get(h) || 0) > 3) f.push("overused_hook");
    if (ih && (analytics.imgHashCount.get(ih) || 0) > 1) f.push("dup_image");
    if (!r.pin_image_url) f.push("missing_image");
    const info = imgInfo[r.id];
    if (info) {
      if (!info.ok) f.push("image_load_error");
      else if (info.w < 600 || info.h < 900) f.push("low_resolution");
    }
    return f;
  };

  // ---------- mutations ----------
  const update = async (ids: string[], patch: Record<string, any>) => {
    if (!ids.length) return;
    setBusy(`update:${ids.length}`);
    const { error } = await (supabase as any).from("pinterest_pin_queue").update(patch).in("id", ids);
    setBusy(null);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? ({ ...r, ...patch } as Row) : r)));
    toast.success(`Updated ${ids.length} pin(s)`);
  };

  const approve = (ids: string[]) =>
    update(ids, { status: STATUS_APPROVED, approved_at: new Date().toISOString(), rejection_reason: null });
  const reject = (ids: string[], reason = "manual_review") =>
    update(ids, { status: STATUS_REJECTED, rejection_reason: reason, approved_at: null });
  const reopen = (ids: string[]) =>
    update(ids, { status: STATUS_DRAFT, approved_at: null, rejection_reason: null });

  const runRegenerate = async (scope: "all" | "overused", ids?: string[]) => {
    setBusy(`regen:${scope}`);
    setRegenProgress({ done: 0, total: 0 });
    try {
      let safety = 60; // max 60 batches (≈180 products) per click
      let totalDone = 0;
      let totalSeen = 0;
      while (safety-- > 0) {
        const { data, error } = await supabase.functions.invoke("pinterest-warmup-regenerate", {
          body: { scope, ids, batchSize: 3 },
        });
        if (error) throw error;
        const j = data as any;
        const processed = Number(j?.processed || 0);
        const remaining = Number(j?.remainingProducts || 0);
        totalDone += processed;
        totalSeen = totalDone + remaining;
        setRegenProgress({ done: totalDone, total: totalSeen });
        if (j?.failed?.length) {
          console.warn("[warmup-regen] failed", j.failed);
        }
        if (processed === 0 || remaining === 0) break;
      }
      toast.success(`Regenerated ${totalDone} product${totalDone === 1 ? "" : "s"} with fresh AI hooks + images`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Regeneration failed");
    } finally {
      setBusy(null);
      setRegenProgress(null);
    }
  };

  const regenerateOverusedHooks = () => {
    const overused = [...analytics.hookCount.entries()].filter(([, n]) => n > 3).map(([k]) => k);
    if (!overused.length) {
      toast.info("No overused hooks (>3) found");
      return;
    }
    return openConfirm("overused", overused.length);
  };

  const regenerateAll = () => {
    const distinctProducts = new Set(rows.map((r) => r.product_id)).size;
    return openConfirm("all", distinctProducts);
  };

  const openConfirm = async (scope: "all" | "overused", count: number) => {
    const credits = estimatePipelineCredits("pinterest_regeneration", count);
    const a = await assessCostAsync(credits);
    setAssessment(a);
    setPendingScope(scope);
    setConfirmOpen(true);
  };

  // ---------- partitions ----------
  const pending = rows.filter((r) => r.status === STATUS_DRAFT);
  const approved = rows.filter((r) => r.status === STATUS_APPROVED && r.approved_at);
  const rejected = rows.filter((r) => r.status === STATUS_REJECTED);

  const categories = Array.from(new Set(rows.map((r) => r.category_key || "uncategorized")));

  const uniqueHooks = new Set(rows.map((r) => (r.hook_group || "").trim().toLowerCase()).filter(Boolean)).size;
  const uniqueTitles = analytics.titleCount.size;
  const uniqueDescs = analytics.descCount.size;
  const uniqueImages = analytics.imgHashCount.size;

  const overusedHookCount = [...analytics.hookCount.values()].filter((n) => n > 3).length;

  return (
    <div className="p-6 space-y-4">
      <Helmet>
        <title>Pinterest Review — Admin</title>
      </Helmet>
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Rocket className="h-5 w-5" /> Pinterest Visual Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Inspect every draft pin before publishing. Nothing publishes until you approve.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={regenerateOverusedHooks} disabled={!!busy}>
            <Wand2 className="h-4 w-4 mr-2" />
            Regenerate overused hooks
          </Button>
          <Button variant="outline" size="sm" onClick={regenerateAll} disabled={!!busy}>
            <Wand2 className="h-4 w-4 mr-2" />
            Regenerate ALL (AI)
          </Button>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Build / Refresh Drafts
          </Button>
        </div>
      </header>

      {assessment && pendingScope && (
        <AiCostBreakdown assessment={assessment} scopeLabel={`Pinterest regeneration · ${pendingScope}`} />
      )}

      {assessment && pendingScope && (
        <ConfirmAiCostDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={pendingScope === "all" ? "Regenerate ALL warmup drafts" : "Regenerate overused hooks"}
          productCount={Math.round(assessment.required.credits / 2)}
          assessment={assessment}
          confirmLabel="Regenerate"
          onConfirm={() => {
            setConfirmOpen(false);
            const scope = pendingScope;
            setPendingScope(null);
            if (scope) void runRegenerate(scope);
          }}
        />
      )}

      {regenProgress && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <div className="text-sm">
              Regenerating with AI Creative Director — {regenProgress.done}
              {regenProgress.total ? ` / ${regenProgress.total}` : ""} products done
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ["Total", rows.length],
          ["Pending", pending.length],
          ["Approved", approved.length],
          ["Rejected", rejected.length],
          ["Unique hooks", uniqueHooks],
          ["Unique images", uniqueImages],
        ].map(([k, v]) => (
          <Card key={String(k)}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-2xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Diversity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Content diversity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Stat label="Unique titles" value={`${uniqueTitles} / ${rows.length}`} />
          <Stat label="Unique descriptions" value={`${uniqueDescs} / ${rows.length}`} />
          <Stat label="Unique hooks" value={`${uniqueHooks}`} sub={overusedHookCount ? `${overusedHookCount} overused (>3)` : "healthy"} warn={overusedHookCount > 0} />
          <Stat label="Unique images" value={`${uniqueImages} / ${rows.length}`} />
        </CardContent>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="ready">Ready to Publish ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
          <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-6 mt-4">
          {categories.map((cat) => {
            const list = pending.filter((r) => (r.category_key || "uncategorized") === cat);
            if (!list.length) return null;
            return (
              <CategoryBlock
                key={cat}
                cat={cat}
                list={list}
                flagsFor={flagsFor}
                onApprove={approve}
                onReject={reject}
                onImgInfo={(id, info) => setImgInfo((m) => ({ ...m, [id]: info }))}
              />
            );
          })}
          {pending.length === 0 && <Empty msg="Nothing pending — all drafts have been reviewed." />}
        </TabsContent>

        <TabsContent value="ready" className="space-y-6 mt-4">
          {approved.length === 0 ? (
            <Empty msg="No approved pins yet. Approve drafts in the Pending tab." />
          ) : (
            <CategoryBlock
              cat="✅ Ready to publish"
              list={approved}
              flagsFor={flagsFor}
              onApprove={() => {}}
              onReject={reject}
              onReopen={reopen}
              onImgInfo={(id, info) => setImgInfo((m) => ({ ...m, [id]: info }))}
              showReopen
            />
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-6 mt-4">
          {rejected.length === 0 ? (
            <Empty msg="No rejected pins." />
          ) : (
            <CategoryBlock
              cat="Rejected"
              list={rejected}
              flagsFor={flagsFor}
              onApprove={approve}
              onReject={() => {}}
              onReopen={reopen}
              onImgInfo={(id, info) => setImgInfo((m) => ({ ...m, [id]: info }))}
              showReopen
            />
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-6 mt-4">
          {categories.map((cat) => {
            const list = rows.filter((r) => (r.category_key || "uncategorized") === cat);
            if (!list.length) return null;
            return (
              <CategoryBlock
                key={cat}
                cat={cat}
                list={list}
                flagsFor={flagsFor}
                onApprove={approve}
                onReject={reject}
                onReopen={reopen}
                onImgInfo={(id, info) => setImgInfo((m) => ({ ...m, [id]: info }))}
                showReopen
              />
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className={`text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground border rounded p-6 text-center">{msg}</div>;
}

function CategoryBlock({
  cat,
  list,
  flagsFor,
  onApprove,
  onReject,
  onReopen,
  onImgInfo,
  showReopen,
}: {
  cat: string;
  list: Row[];
  flagsFor: (r: Row) => string[];
  onApprove: (ids: string[]) => void;
  onReject: (ids: string[], reason?: string) => void;
  onReopen?: (ids: string[]) => void;
  onImgInfo: (id: string, info: ImgInfo) => void;
  showReopen?: boolean;
}) {
  const ids = list.map((r) => r.id);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          {cat} <span className="text-muted-foreground font-normal">({list.length})</span>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onApprove(ids)}>
            <Check className="h-4 w-4 mr-1" /> Approve all
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReject(ids, "bulk_reject")}>
            <X className="h-4 w-4 mr-1" /> Reject all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {list.map((r) => (
          <PinCard
            key={r.id}
            row={r}
            flags={flagsFor(r)}
            onApprove={() => onApprove([r.id])}
            onReject={() => onReject([r.id])}
            onReopen={onReopen ? () => onReopen([r.id]) : undefined}
            onImgInfo={(info) => onImgInfo(r.id, info)}
            showReopen={showReopen}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PinCard({
  row,
  flags,
  onApprove,
  onReject,
  onReopen,
  onImgInfo,
  showReopen,
}: {
  row: Row;
  flags: string[];
  onApprove: () => void;
  onReject: () => void;
  onReopen?: () => void;
  onImgInfo: (info: ImgInfo) => void;
  showReopen?: boolean;
}) {
  const ctr = row.meta?.predicted_ctr_pct;
  const date = row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : "unscheduled";
  return (
    <div className="rounded-lg border overflow-hidden flex flex-col bg-card">
      <div className="relative aspect-[2/3] bg-muted">
        {row.pin_image_url ? (
          <img
            src={row.pin_image_url}
            alt={row.pin_title || "pin"}
            loading="lazy"
            className="w-full h-full object-cover"
            onLoad={(e) => {
              const img = e.currentTarget;
              onImgInfo({ w: img.naturalWidth, h: img.naturalHeight, ok: true });
            }}
            onError={() => onImgInfo({ w: 0, h: 0, ok: false })}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <ImageOff className="h-8 w-8 mb-1" />
            <span className="text-xs">No image</span>
          </div>
        )}
        {flags.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
            {flags.map((f) => (
              <Badge key={f} variant="destructive" className="text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {f.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        )}
        {typeof ctr === "number" && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
            CTR {ctr}%
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-1 text-xs flex-1">
        <div className="font-semibold text-sm line-clamp-2">{row.pin_title}</div>
        <div className="text-muted-foreground line-clamp-3">{row.pin_description}</div>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant="outline">{row.category_key || "—"}</Badge>
          <Badge variant="outline">{row.board_name}</Badge>
          <Badge variant="outline">{row.content_type}</Badge>
          {row.hook_group && <Badge variant="outline">hook: {row.hook_group}</Badge>}
        </div>
        <div className="text-muted-foreground pt-1">📅 {date}</div>
        {row.destination_link && (
          <a
            href={row.destination_link}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline truncate max-w-full"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{row.destination_link.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
        {row.rejection_reason && (
          <div className="text-destructive text-[11px] pt-1">Reason: {row.rejection_reason}</div>
        )}
      </div>
      <div className="p-2 border-t flex gap-2">
        {showReopen && onReopen ? (
          <Button size="sm" variant="outline" className="flex-1" onClick={onReopen}>
            <CopyIcon className="h-3 w-3 mr-1" /> Reopen
          </Button>
        ) : null}
        <Button size="sm" variant="default" className="flex-1" onClick={onApprove}>
          <Check className="h-3 w-3 mr-1" /> Approve
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onReject}>
          <X className="h-3 w-3 mr-1" /> Reject
        </Button>
      </div>
    </div>
  );
}