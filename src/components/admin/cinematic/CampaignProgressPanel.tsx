import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RefreshCw, Rocket, ExternalLink, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_KEY = "gp.cinematic.last12pack";

export type LastCampaign = {
  campaign_id: string;
  launched_at: string;
  job_ids: string[];
};

export function saveLastCampaign(c: LastCampaign) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {}
  window.dispatchEvent(new CustomEvent("gp:campaign-launched", { detail: c }));
}

function loadLastCampaign(): LastCampaign | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.campaign_id || !Array.isArray(parsed?.job_ids)) return null;
    return parsed as LastCampaign;
  } catch { return null; }
}

type JobRow = {
  id: string;
  status: string;
  status_message: string | null;
  output_mp4_url: string | null;
  pinterest_pin_url: string | null;
  pinterest_uploaded_at: string | null;
  published_at: string | null;
  validation_report: any;
  error_message: string | null;
  updated_at: string;
};

type Bucket = "queued" | "rendering" | "validating" | "published" | "failed";

function bucketize(j: JobRow): Bucket {
  const s = (j.status || "").toLowerCase();
  if (j.pinterest_pin_url || j.published_at || j.pinterest_uploaded_at || s === "published" || s === "pinterest_uploaded") return "published";
  if (s === "failed" || s === "cancelled" || s === "creative_rejected") return "failed";
  if (s === "rendering" || s === "render_queued" || s === "preparing" || s === "prepared") return "rendering";
  if (s === "render_complete" || s === "publishable" || s === "validating" || s === "awaiting_approval") return "validating";
  return "queued";
}

const BUCKET_META: Record<Bucket, { label: string; tone: string }> = {
  queued:     { label: "Queued",     tone: "bg-muted text-foreground" },
  rendering:  { label: "Rendering",  tone: "bg-primary/15 text-primary" },
  validating: { label: "Validating", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  published:  { label: "Published",  tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  failed:     { label: "Failed",     tone: "bg-destructive/15 text-destructive" },
};

export default function CampaignProgressPanel() {
  const [campaign, setCampaign] = useState<LastCampaign | null>(() => loadLastCampaign());
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [exporting, setExporting] = useState(false);

  const exportCsv = useCallback(async () => {
    if (!campaign || campaign.job_ids.length === 0) return;
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from("cinematic_ad_jobs")
        .select([
          "id","product_slug","product_name","product_url","preset","style_preset",
          "hook_variant","hook_text","hook_archetype","cta_text","emotional_register",
          "camera_style","status","status_message","pinterest_pin_id","pinterest_pin_url",
          "pin_destination_url","pin_title","pin_description","output_mp4_url",
          "output_thumbnail_url","output_duration_seconds","motion_score","motion_entropy_score",
          "realism_score","ugc_authenticity_score","emotional_arc_score","thumb_stop_score",
          "human_presence_ratio","cinematic_quality_score","qa_composite_score",
          "validation_v5_passed","creative_reject_reason","error_message","published_at",
          "pinterest_uploaded_at","created_at","updated_at"
        ].join(","))
        .in("id", campaign.job_ids);
      if (error) throw error;
      const records = (data ?? []) as unknown as Record<string, unknown>[];
      const headers = Object.keys(records[0] ?? {
        id: "", product_slug: "", status: "", pinterest_pin_url: "",
      });
      const escape = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(","),
        ...records.map(r => headers.map(h => escape(r[h])).join(",")),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaign.campaign_id}_report.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${records.length} rows`);
    } catch (e: any) {
      toast.error(e?.message ?? "CSV export failed");
    } finally {
      setExporting(false);
    }
  }, [campaign]);

  const fetchRows = useCallback(async (c: LastCampaign | null) => {
    if (!c || c.job_ids.length === 0) { setRows([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select("id,status,status_message,output_mp4_url,pinterest_pin_url,pinterest_uploaded_at,published_at,validation_report,error_message,updated_at")
      .in("id", c.job_ids);
    if (!error && data) setRows(data as JobRow[]);
    setLastFetch(Date.now());
    setLoading(false);
  }, []);

  // Listen for new launches
  useEffect(() => {
    const onLaunched = (e: Event) => {
      const detail = (e as CustomEvent<LastCampaign>).detail;
      if (detail) { setCampaign(detail); fetchRows(detail); }
    };
    window.addEventListener("gp:campaign-launched", onLaunched as EventListener);
    return () => window.removeEventListener("gp:campaign-launched", onLaunched as EventListener);
  }, [fetchRows]);

  // Initial + polling
  useEffect(() => {
    if (!campaign) return;
    fetchRows(campaign);
    const t = setInterval(() => fetchRows(campaign), 8000);
    return () => clearInterval(t);
  }, [campaign, fetchRows]);

  // Realtime
  useEffect(() => {
    if (!campaign || campaign.job_ids.length === 0) return;
    const ch = supabase
      .channel(`campaign-${campaign.campaign_id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cinematic_ad_jobs" }, (payload: any) => {
        const r = payload.new as JobRow;
        if (!campaign.job_ids.includes(r.id)) return;
        setRows((prev) => {
          const idx = prev.findIndex(x => x.id === r.id);
          if (idx === -1) return [...prev, r];
          const copy = prev.slice(); copy[idx] = { ...copy[idx], ...r }; return copy;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaign]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { queued: 0, rendering: 0, validating: 0, published: 0, failed: 0 };
    rows.forEach(r => { c[bucketize(r)] += 1; });
    return c;
  }, [rows]);

  const total = campaign?.job_ids.length ?? 0;
  const known = rows.length;
  const pendingUnknown = Math.max(0, total - known);
  const adjustedQueued = counts.queued + pendingUnknown;
  const pct = total > 0 ? Math.round((counts.published / total) * 100) : 0;

  if (!campaign) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4" /> 12-pack campaign progress
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No campaign launched yet from this browser. Click <strong>Launch 12-pack Pinterest campaign</strong> to start one.
        </CardContent>
      </Card>
    );
  }

  const launchedAgo = Math.max(0, Math.round((Date.now() - new Date(campaign.launched_at).getTime()) / 1000));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4" /> 12-pack campaign progress
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-mono">{campaign.campaign_id}</span> · launched {launchedAgo}s ago · {total} jobs
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2Spinner /> : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
              CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fetchRows(campaign)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{counts.published}/{total} published</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <BucketTile label={BUCKET_META.queued.label}     tone={BUCKET_META.queued.tone}     count={adjustedQueued} />
          <BucketTile label={BUCKET_META.rendering.label}  tone={BUCKET_META.rendering.tone}  count={counts.rendering} />
          <BucketTile label={BUCKET_META.validating.label} tone={BUCKET_META.validating.tone} count={counts.validating} />
          <BucketTile label={BUCKET_META.published.label}  tone={BUCKET_META.published.tone}  count={counts.published} />
          <BucketTile label={BUCKET_META.failed.label}     tone={BUCKET_META.failed.tone}     count={counts.failed} />
        </div>

        {rows.length > 0 && (
          <div className="border rounded-md divide-y max-h-72 overflow-auto">
            {rows.map((r) => {
              const b = bucketize(r);
              const meta = BUCKET_META[b];
              return (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={`${meta.tone} border-transparent`}>{meta.label}</Badge>
                    <span className="truncate font-mono text-muted-foreground">{r.id.slice(0, 8)}</span>
                    {r.status_message && (
                      <span className="truncate text-muted-foreground">· {r.status_message}</span>
                    )}
                  </div>
                  {r.pinterest_pin_url && (
                    <a href={r.pinterest_pin_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 shrink-0">
                      pin <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Updated {Math.max(0, Math.round((Date.now() - lastFetch) / 1000))}s ago · live via realtime + 8s poll
        </p>
      </CardContent>
    </Card>
  );
}

function BucketTile({ label, tone, count }: { label: string; tone: string; count: number }) {
  return (
    <div className={`rounded-md px-3 py-2 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-semibold leading-tight">{count}</div>
    </div>
  );
}

function Loader2Spinner() {
  return <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />;
}