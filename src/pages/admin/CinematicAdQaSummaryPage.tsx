import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, Download } from "lucide-react";

type Job = Record<string, any>;

type DuplicateDiag = {
  duplicate_ratio_pct: number;
  threshold_pct: number;
  variation_attempts: number;
  max_variation_attempts: number;
  aborted: boolean;
  accepted_after_variation: boolean;
  per_scene: Array<{
    index: number;
    image_url: string;
    repeat_count: number;
    duplicate_pct: number;
    variation_seed: string | null;
    motion_variant: string | null;
  }>;
};

function pickDuplicateDiag(renderLog: any): DuplicateDiag | null {
  const arr = Array.isArray(renderLog) ? renderLog : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const e: any = arr[i];
    if (e && typeof e === "object" && e.duplicate_diagnostics) return e.duplicate_diagnostics;
  }
  return null;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

function durationMs(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function humanMs(ms: number | null) {
  if (ms == null) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}m ${r}s`;
}

export default function CinematicAdQaSummaryPage() {
  const { jobId = "" } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) setError(error.message);
    else setJob(data);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [jobId]);

  const diag = useMemo(() => (job ? pickDuplicateDiag(job.render_log) : null), [job]);
  const validation = job?.validation_report as any;
  const completed = job?.status === "rendered" || job?.status === "published" || !!job?.output_mp4_url;
  const failed = job?.status === "failed";

  function downloadJson() {
    if (!job) return;
    const summary = {
      job_id: job.id,
      product: { slug: job.product_slug, name: job.product_name },
      status: job.status,
      status_message: job.status_message,
      timings: {
        created_at: job.created_at,
        render_queued_at: job.render_queued_at,
        render_started_at: job.render_started_at,
        render_complete_at: job.render_complete_at,
        queued_to_complete_ms: durationMs(job.render_queued_at, job.render_complete_at),
        rendering_ms: durationMs(job.render_started_at, job.render_complete_at),
      },
      output: {
        mp4: job.output_mp4_url,
        thumbnail: job.output_thumbnail_url,
        duration_seconds: job.output_duration_seconds,
      },
      duplicate_diagnostics: diag,
      validation_report: validation,
      pinterest: {
        pin_url: job.pinterest_pin_url,
        pin_id: job.pinterest_pin_id,
        uploaded_at: job.pinterest_uploaded_at,
        error: job.pinterest_publish_error,
      },
      error_message: job.error_message,
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `qa-summary-${job.id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="container mx-auto p-4">
        <Helmet><title>QA Summary — Not Found</title></Helmet>
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/admin/cinematic-ads"><ArrowLeft className="mr-1 h-3 w-3" /> Back</Link>
        </Button>
        <p className="text-destructive">{error ?? `Job ${jobId} not found.`}</p>
      </div>
    );
  }

  const uniqueSeeds = diag ? Array.from(new Set(diag.per_scene.map(s => s.variation_seed).filter(Boolean))) as string[] : [];

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-3 md:p-6">
      <Helmet>
        <title>Render QA — {job.product_name ?? job.product_slug}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/cinematic-ads"><ArrowLeft className="mr-1 h-3 w-3" /> Control Center</Link>
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-3 w-3" /> Refresh</Button>
          <Button size="sm" variant="outline" onClick={downloadJson}><Download className="mr-1 h-3 w-3" /> JSON</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-lg md:text-xl">
              Render QA — {job.product_name ?? job.product_slug}
            </CardTitle>
            {completed ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Badge>
            ) : failed ? (
              <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>
            ) : (
              <Badge variant="secondary">{job.status}</Badge>
            )}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">{job.id}</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 text-sm">
            <Row k="Status" v={job.status} />
            <Row k="Status message" v={job.status_message ?? "—"} />
            <Row k="Created" v={fmt(job.created_at)} />
            <Row k="Queued" v={fmt(job.render_queued_at)} />
            <Row k="Started" v={fmt(job.render_started_at)} />
            <Row k="Completed" v={fmt(job.render_complete_at)} />
            <Row k="Rendering time" v={humanMs(durationMs(job.render_started_at, job.render_complete_at))} />
            <Row k="Attempts" v={String(job.render_attempts ?? 0)} />
            {job.error_message && <Row k="Error" v={<span className="text-destructive">{job.error_message}</span>} />}
          </div>
          <div className="space-y-1 text-sm">
            <Row k="Output MP4" v={job.output_mp4_url ? <a className="text-primary hover:underline inline-flex items-center" href={job.output_mp4_url} target="_blank" rel="noreferrer">open <ExternalLink className="ml-1 h-3 w-3" /></a> : "—"} />
            <Row k="Duration" v={job.output_duration_seconds ? `${Number(job.output_duration_seconds).toFixed(2)}s` : "—"} />
            <Row k="Pinterest pin" v={job.pinterest_pin_url ? <a className="text-primary hover:underline inline-flex items-center" href={job.pinterest_pin_url} target="_blank" rel="noreferrer">{job.pinterest_pin_id ?? "view"} <ExternalLink className="ml-1 h-3 w-3" /></a> : "—"} />
            <Row k="Pinterest uploaded" v={fmt(job.pinterest_uploaded_at)} />
            {job.pinterest_publish_error && <Row k="Pinterest error" v={<span className="text-destructive">{job.pinterest_publish_error}</span>} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Duplicate Scene Scan</CardTitle></CardHeader>
        <CardContent>
          {!diag ? (
            <p className="text-sm text-muted-foreground">No duplicate-scan diagnostic recorded for this render.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={diag.aborted ? "destructive" : diag.duplicate_ratio_pct > diag.threshold_pct ? "secondary" : "outline"}>
                  {diag.duplicate_ratio_pct}% duplicate
                </Badge>
                <span className="text-muted-foreground">threshold {diag.threshold_pct}%</span>
                <span className="text-muted-foreground">variation pass {diag.variation_attempts}/{diag.max_variation_attempts}</span>
                <span className={diag.aborted ? "text-destructive font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                  {diag.aborted ? "aborted" : diag.accepted_after_variation ? "accepted after variation" : "accepted (below threshold)"}
                </span>
              </div>
              {uniqueSeeds.length > 0 && (
                <div className="mb-3 text-xs">
                  <span className="text-muted-foreground">Variation seeds used: </span>
                  <span className="font-mono">{uniqueSeeds.join(", ")}</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left border-b">
                      <th className="py-1 pr-2">#</th>
                      <th className="py-1 pr-2">dup%</th>
                      <th className="py-1 pr-2">repeat</th>
                      <th className="py-1 pr-2">variation seed</th>
                      <th className="py-1 pr-2">motion</th>
                      <th className="py-1">image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diag.per_scene.map(s => (
                      <tr key={s.index} className="border-b border-border/40">
                        <td className="py-1 pr-2">{s.index}</td>
                        <td className={`py-1 pr-2 font-medium ${s.duplicate_pct >= 50 ? "text-destructive" : s.duplicate_pct >= 25 ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {s.duplicate_pct}%
                        </td>
                        <td className="py-1 pr-2">{s.repeat_count}×</td>
                        <td className="py-1 pr-2 font-mono">{s.variation_seed ?? "—"}</td>
                        <td className="py-1 pr-2">{s.motion_variant ?? "—"}</td>
                        <td className="py-1 max-w-[200px] truncate text-muted-foreground">
                          <a className="hover:underline" href={s.image_url} target="_blank" rel="noreferrer">{s.image_url.split("/").pop()}</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Validation Report</CardTitle></CardHeader>
        <CardContent>
          {!validation ? (
            <p className="text-sm text-muted-foreground">No validation report yet.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 text-xs">
                {validation.passed
                  ? <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" /> Passed</Badge>
                  : <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>}
                {validation.motion_score != null && (
                  <span className="text-muted-foreground">motion score {Number(validation.motion_score).toFixed(2)}</span>
                )}
                <span className="text-muted-foreground">preset {validation.preset ?? "—"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left border-b">
                      <th className="py-1 pr-2">check</th>
                      <th className="py-1 pr-2">expected</th>
                      <th className="py-1 pr-2">observed</th>
                      <th className="py-1">result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(validation.checks ?? []).map((c: any) => (
                      <tr key={c.name} className="border-b border-border/40 align-top">
                        <td className="py-1 pr-2 font-mono">{c.name}</td>
                        <td className="py-1 pr-2 text-muted-foreground">{String(c.expected ?? "—")}</td>
                        <td className="py-1 pr-2">{String(c.observed ?? "—")}</td>
                        <td className="py-1">
                          {c.passed
                            ? <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center"><CheckCircle2 className="mr-1 h-3 w-3" /> pass</span>
                            : <span className="text-destructive inline-flex items-center"><XCircle className="mr-1 h-3 w-3" /> fail{c.message ? ` — ${c.message}` : ""}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}