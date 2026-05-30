import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, Shield, RefreshCw, FileText, Play, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";

type SafetyJob = {
  id: string;
  product_slug: string;
  status: string;
  status_message: string | null;
  preflight_status: string | null;
  preflight_reasons: string[] | null;
  qa_passed: boolean | null;
  qa_reasons: string[] | null;
  blocked_reason: string | null;
  legacy_unverified: boolean;
  is_safe_to_publish: boolean;
  creative_plan: unknown | null;
  output_mp4_url: string | null;
  output_thumbnail_url: string | null;
  pinterest_pin_url: string | null;
  pushed_to_pinterest_at: string | null;
  render_attempts: number;
  error_message: string | null;
  updated_at: string;
  created_at: string;
};

type Bucket = "needs_attention" | "ready_to_render" | "pending_qa" | "approved" | "published" | "failed";

function bucketFor(j: SafetyJob): Bucket {
  if (j.pushed_to_pinterest_at) return "published";
  if (j.status === "failed" || j.status === "rejected_low_quality" || j.legacy_unverified) return "failed";
  if (j.is_safe_to_publish) return "approved";
  if (j.output_mp4_url) return "pending_qa";
  if (j.preflight_status === "pass" && j.creative_plan) return "ready_to_render";
  return "needs_attention";
}

export default function CinematicAdsSafetyPanel() {
  const [jobs, setJobs] = useState<SafetyJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select("id,product_slug,status,status_message,preflight_status,preflight_reasons,qa_passed,qa_reasons,blocked_reason,legacy_unverified,is_safe_to_publish,creative_plan,output_mp4_url,output_thumbnail_url,pinterest_pin_url,pushed_to_pinterest_at,render_attempts,error_message,updated_at,created_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setJobs((data ?? []) as SafetyJob[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => {
    const out: Record<Bucket, SafetyJob[]> = {
      needs_attention: [], ready_to_render: [], pending_qa: [],
      approved: [], published: [], failed: [],
    };
    for (const j of jobs) out[bucketFor(j)].push(j);
    return out;
  }, [jobs]);

  const counts = {
    scanned: jobs.length,
    safe_to_publish: jobs.filter((j) => j.is_safe_to_publish).length,
    legacy_blocked: jobs.filter((j) => j.legacy_unverified).length,
    rejected: jobs.filter((j) => j.status === "rejected_low_quality").length,
    ready: buckets.ready_to_render.length,
    pending_qa: buckets.pending_qa.length,
    published: buckets.published.length,
    failed: buckets.failed.length,
  };

  async function runPreflight(jobId: string) {
    setBusyId(jobId);
    const { data, error } = await supabase.functions.invoke("cinematic-ad-preflight", { body: { job_id: jobId } });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    const r = (data as any)?.results?.[0];
    toast[r?.preflight_status === "pass" ? "success" : "warning"](
      `Preflight ${r?.preflight_status ?? "?"}${r?.reasons?.length ? `: ${r.reasons.join(", ")}` : ""}`
    );
    load();
  }
  async function generatePlan(jobId: string) {
    setBusyId(jobId);
    const { data, error } = await supabase.functions.invoke("cinematic-ad-plan", { body: { job_id: jobId } });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Plan generated (${(data as any)?.plan?.generated_by ?? "ok"})`);
    load();
  }
  async function publishPin(jobId: string) {
    if (!confirm("Publish this pin to Pinterest? Only safe-to-publish jobs are allowed.")) return;
    setBusyId(jobId);
    const { data, error } = await supabase.functions.invoke("cinematic-ad-push-pinterest", { body: { job_id: jobId } });
    setBusyId(null);
    if (error || !(data as any)?.ok) {
      toast.error((data as any)?.message ?? error?.message ?? "Publish refused");
      return;
    }
    toast.success("Pushed to Pinterest");
    load();
  }

  async function bulkRunPreflight(bucket: Bucket) {
    const ids = buckets[bucket].map((j) => j.id).slice(0, 50);
    if (!ids.length) return;
    if (!confirm(`Run preflight on ${ids.length} jobs? Free, no credits used.`)) return;
    setLoading(true);
    await supabase.functions.invoke("cinematic-ad-preflight", { body: { job_ids: ids } });
    setLoading(false);
    load();
  }

  const renderRow = (j: SafetyJob) => (
    <div key={j.id} className="border rounded-md p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate max-w-[300px]">{j.product_slug}</span>
            <Badge variant="outline" className="text-[10px]">{j.status}</Badge>
            {j.legacy_unverified && (
              <Badge variant="destructive" className="text-[10px] gap-1"><Lock className="h-3 w-3" />legacy_unverified</Badge>
            )}
            {j.is_safe_to_publish && (
              <Badge className="text-[10px] bg-green-600">safe to publish</Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">preflight: {j.preflight_status ?? "not_run"}</Badge>
            {j.creative_plan ? <Badge variant="secondary" className="text-[10px]">plan ✓</Badge> : null}
            {j.output_mp4_url ? <Badge variant="secondary" className="text-[10px]">mp4 ✓</Badge> : null}
          </div>
          {j.blocked_reason && (
            <p className="text-xs text-destructive mt-1 break-words"><b>Blocked:</b> {j.blocked_reason}</p>
          )}
          {(j.preflight_reasons?.length ?? 0) > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">Preflight: {j.preflight_reasons!.join(", ")}</p>
          )}
          {(j.qa_reasons?.length ?? 0) > 0 && (
            <p className="text-[11px] text-muted-foreground">QA: {j.qa_reasons!.join(", ")}</p>
          )}
          {j.error_message && <p className="text-[11px] text-destructive">Err: {j.error_message}</p>}
          <p className="text-[10px] text-muted-foreground mt-1">
            attempts: {j.render_attempts} · updated {new Date(j.updated_at).toLocaleString()}
          </p>
        </div>
        {j.output_thumbnail_url && (
          <img src={j.output_thumbnail_url} alt="" className="w-12 h-20 object-cover rounded shrink-0" loading="lazy" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busyId === j.id} onClick={() => runPreflight(j.id)}>
          <Shield className="h-3 w-3 mr-1" />Run Preflight
        </Button>
        <Button size="sm" variant="outline" disabled={busyId === j.id} onClick={() => generatePlan(j.id)}>
          <FileText className="h-3 w-3 mr-1" />Generate Script Only
        </Button>
        <Button
          size="sm"
          variant={j.is_safe_to_publish ? "default" : "outline"}
          disabled={!j.is_safe_to_publish || busyId === j.id}
          onClick={() => publishPin(j.id)}
          title={!j.is_safe_to_publish ? "Blocked: not safe to publish" : "Publish to Pinterest"}
        >
          <Play className="h-3 w-3 mr-1" />Publish Pin
        </Button>
        {j.output_mp4_url && (
          <a href={j.output_mp4_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs underline text-muted-foreground">
            <ExternalLink className="h-3 w-3 mr-1" />mp4
          </a>
        )}
        {j.pinterest_pin_url && (
          <a href={j.pinterest_pin_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs underline text-muted-foreground">
            <ExternalLink className="h-3 w-3 mr-1" />pin
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="border border-amber-500/40 bg-amber-500/10 rounded-md p-3 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-semibold">Low-quality slideshow renders are blocked.</p>
          <p className="text-xs text-muted-foreground">
            Only jobs with <code>preflight_status=pass</code>, a generated creative plan, and a passing QA score
            can be published to Pinterest. Legacy renders predating the new gate are marked{" "}
            <code>legacy_unverified</code> and cannot be force-pushed.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Cinematic Ads — Safety & QA</CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="border rounded p-2"><div className="text-muted-foreground">Scanned</div><div className="text-lg font-semibold">{counts.scanned}</div></div>
            <div className="border rounded p-2"><div className="text-muted-foreground">Safe to publish</div><div className="text-lg font-semibold text-green-600">{counts.safe_to_publish}</div></div>
            <div className="border rounded p-2"><div className="text-muted-foreground">Legacy blocked</div><div className="text-lg font-semibold text-amber-600">{counts.legacy_blocked}</div></div>
            <div className="border rounded p-2"><div className="text-muted-foreground">Rejected low quality</div><div className="text-lg font-semibold text-destructive">{counts.rejected}</div></div>
          </div>

          <Tabs defaultValue="needs_attention">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="needs_attention">Needs Attention ({buckets.needs_attention.length})</TabsTrigger>
              <TabsTrigger value="ready_to_render">Ready to Render ({buckets.ready_to_render.length})</TabsTrigger>
              <TabsTrigger value="pending_qa">Pending QA ({buckets.pending_qa.length})</TabsTrigger>
              <TabsTrigger value="approved">Approved ({buckets.approved.length})</TabsTrigger>
              <TabsTrigger value="published">Published ({buckets.published.length})</TabsTrigger>
              <TabsTrigger value="failed">Failed ({buckets.failed.length})</TabsTrigger>
            </TabsList>
            {(Object.keys(buckets) as Bucket[]).map((b) => (
              <TabsContent key={b} value={b} className="space-y-2 mt-3">
                {b === "needs_attention" && buckets[b].length > 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => bulkRunPreflight("needs_attention")}>
                      Bulk: Run Preflight on all (free)
                    </Button>
                  </div>
                )}
                {buckets[b].length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No jobs in this tab.</p>
                ) : buckets[b].slice(0, 30).map(renderRow)}
                {buckets[b].length > 30 && (
                  <p className="text-xs text-muted-foreground text-center">Showing 30 of {buckets[b].length}.</p>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}