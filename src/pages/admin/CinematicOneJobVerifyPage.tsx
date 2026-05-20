import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Loader2, Circle, AlertCircle } from "lucide-react";

type JobRow = {
  id: string;
  product_slug: string;
  status: string;
  status_message: string | null;
  render_queued_at: string | null;
  render_started_at: string | null;
  render_complete_at: string | null;
  approved_at: string | null;
  pinterest_uploaded_at: string | null;
  pinterest_pin_url: string | null;
  output_mp4_url: string | null;
  error_message: string | null;
  auto_publish?: boolean | null;
};

const STAGES: Array<{ key: string; label: string; timestampField: keyof JobRow; matchStatus?: string[] }> = [
  { key: "render_queued", label: "Render queued", timestampField: "render_queued_at", matchStatus: ["render_queued"] },
  { key: "rendering", label: "Rendering", timestampField: "render_started_at", matchStatus: ["rendering"] },
  { key: "render_complete", label: "Render complete", timestampField: "render_complete_at", matchStatus: ["render_complete", "rendered"] },
  { key: "awaiting_approval", label: "Awaiting approval", timestampField: "approved_at", matchStatus: ["awaiting_approval"] },
  { key: "pinterest_uploaded", label: "Pinterest uploaded", timestampField: "pinterest_uploaded_at", matchStatus: ["pinterest_uploaded", "published"] },
];

function stageState(job: JobRow | null, stageIdx: number): "pending" | "active" | "done" | "error" {
  if (!job) return "pending";
  if (job.status === "failed") return stageIdx === 0 ? "error" : "pending";
  const stage = STAGES[stageIdx];
  const ts = job[stage.timestampField];
  if (ts) return "done";
  if (stage.matchStatus?.includes(job.status)) return "active";
  // Active = the earliest non-done stage whose timestamp isn't set and matches a downstream status
  const earlierAllDone = STAGES.slice(0, stageIdx).every((s) => Boolean(job[s.timestampField]));
  if (earlierAllDone && !ts) return "active";
  return "pending";
}

export default function CinematicOneJobVerifyPage() {
  const [slug, setSlug] = useState("");
  const [products, setProducts] = useState<Array<{ slug: string; name: string }>>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [starting, setStarting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Load a short list of in-stock products to pick from
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products_public")
        .select("slug, name")
        .eq("is_active", true)
        .limit(25);
      if (data) setProducts(data as any);
    })();
  }, []);

  const refresh = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select("id, product_slug, status, status_message, render_queued_at, render_started_at, render_complete_at, approved_at, pinterest_uploaded_at, pinterest_pin_url, output_mp4_url, error_message, auto_publish")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[one-job] poll error", error);
      return;
    }
    if (data) setJob(data as JobRow);
  }, []);

  // Poll every 3s while a job is active
  useEffect(() => {
    if (!jobId) return;
    refresh(jobId);
    pollRef.current = window.setInterval(() => refresh(jobId), 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [jobId, refresh]);

  const start = async () => {
    const productSlug = slug.trim();
    if (!productSlug) {
      toast.error("Pick a product slug first");
      return;
    }
    setStarting(true);
    setJob(null);
    setJobId(null);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-autopilot", {
        body: {
          product_slug: productSlug,
          autopilot_threshold: 0, // force queue render for verification
        },
      });
      if (error) throw error;
      const id = (data as any)?.job_id;
      if (!id) throw new Error((data as any)?.message ?? "no job_id returned");
      setJobId(id);
      toast.success(`Job started: ${id.slice(0, 8)}…`);
    } catch (e: any) {
      console.error("[one-job] start failed", e);
      toast.error(e?.message ?? "Failed to start job");
    } finally {
      setStarting(false);
    }
  };

  const approve = async () => {
    if (!jobId) return;
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-approve", {
        body: { job_id: jobId },
      });
      if (error) throw error;
      toast.success("Approved & queued");
      refresh(jobId);
    } catch (e: any) {
      console.error("[one-job] approve failed", e);
      toast.error(e?.message ?? "Approve failed");
    } finally {
      setApproving(false);
    }
  };

  const resetToQueued = async () => {
    if (!jobId) return;
    if (!confirm("Reset this job to render_queued? This clears worker, started_at and error.")) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "retry_render", job_id: jobId },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.message ?? "reset failed");
      toast.success("Job reset to render_queued");
      refresh(jobId);
    } catch (e: any) {
      console.error("[one-job] reset failed", e);
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const isTerminal = useMemo(() => {
    if (!job) return false;
    return ["pinterest_uploaded", "published", "failed"].includes(job.status);
  }, [job]);

  useEffect(() => {
    if (isTerminal && pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isTerminal]);

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-6">
      <Helmet>
        <title>One-Job Verification — Cinematic Ads</title>
      </Helmet>

      <div>
        <h1 className="text-2xl font-semibold">One-Job Verification</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run exactly one cinematic ad job and watch every pipeline stage in real time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Pick a product</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="product-slug (e.g. dog-chew-toy-choke-proof-food-dispenser)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={starting || Boolean(jobId)}
          />
          {products.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {products.slice(0, 12).map((p) => (
                <Button
                  key={p.slug}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto py-1 text-xs"
                  disabled={starting || Boolean(jobId)}
                  onClick={() => setSlug(p.slug)}
                >
                  {p.name.length > 40 ? p.name.slice(0, 40) + "…" : p.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={start} disabled={starting || !slug.trim() || Boolean(jobId && !isTerminal)}>
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start one-job verification
            </Button>
            {jobId && (
              <Button
                variant="outline"
                onClick={() => {
                  setJobId(null);
                  setJob(null);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {jobId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">2. Pipeline progress</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Job</span>
              <code className="font-mono text-xs">{jobId}</code>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  navigator.clipboard.writeText(jobId);
                  toast.success("Job ID copied");
                }}
              >
                Copy
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={job?.status === "failed" ? "destructive" : "secondary"}>
                {job?.status ?? "loading…"}
              </Badge>
              {job?.status_message && (
                <span className="text-xs text-muted-foreground">{job.status_message}</span>
              )}
            </div>

            <ol className="space-y-2">
              {STAGES.map((stage, idx) => {
                const state = stageState(job, idx);
                const ts = job?.[stage.timestampField] as string | null | undefined;
                return (
                  <li
                    key={stage.key}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    <div className="shrink-0">
                      {state === "done" && <Check className="h-4 w-4 text-green-600" />}
                      {state === "active" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {state === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
                      {state === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{stage.label}</div>
                      {ts && (
                        <div className="text-xs text-muted-foreground">
                          {new Date(ts).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {stage.key === "awaiting_approval" && job?.status === "awaiting_approval" && (
                      <Button size="sm" onClick={approve} disabled={approving}>
                        {approving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        Approve & queue
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>

            {job?.error_message && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {job.error_message}
              </div>
            )}

            {(job?.output_mp4_url || job?.pinterest_pin_url) && (
              <div className="space-y-1 text-sm">
                {job?.output_mp4_url && (
                  <div>
                    MP4:{" "}
                    <a
                      href={job.output_mp4_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-primary"
                    >
                      open
                    </a>
                  </div>
                )}
                {job?.pinterest_pin_url && (
                  <div>
                    Pinterest pin:{" "}
                    <a
                      href={job.pinterest_pin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-primary"
                    >
                      {job.pinterest_pin_url}
                    </a>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
