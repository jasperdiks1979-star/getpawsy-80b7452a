import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, RotateCw, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface JobRow {
  id: string;
  product_slug: string | null;
  status: string | null;
  status_message: string | null;
  motion_quality_score: number | null;
  motion_score: number | null;
  motion_regen_attempts: number | null;
  regenerate_count: number | null;
  motion_storyboard: any;
  motion_quality_breakdown: any;
  error_message: string | null;
  output_mp4_url: string | null;
  output_thumbnail_url: string | null;
  created_at: string;
  updated_at: string | null;
}

interface QualityEvent {
  id: string;
  job_id: string;
  source: string;
  attempt_number: number;
  score: number | null;
  threshold: number | null;
  decision: string | null;
  notes: string | null;
  breakdown: any;
  created_at: string;
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (score >= 40) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-destructive/15 text-destructive";
}

function decisionColor(d: string | null): string {
  switch (d) {
    case "pass": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "regen_queued": return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "manual_review": return "bg-destructive/15 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function CinematicMotionForensicsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<QualityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [regening, setRegening] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "low" | "failed">("all");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("cinematic_ad_jobs")
      .select(
        "id, product_slug, status, status_message, motion_quality_score, motion_score, motion_regen_attempts, regenerate_count, motion_storyboard, motion_quality_breakdown, error_message, output_mp4_url, output_thumbnail_url, created_at, updated_at"
      )
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (filter === "low") query = query.lt("motion_quality_score", 70);
    if (filter === "failed") query = query.not("error_message", "is", null);

    const { data, error } = await query;
    if (error) {
      toast.error(`Failed to load jobs: ${error.message}`);
      setLoading(false);
      return;
    }
    setJobs((data ?? []) as any);
    setLoading(false);
  }, [filter]);

  const fetchEvents = useCallback(async (jobId: string) => {
    setEventsLoading(true);
    const { data, error } = await supabase
      .from("cinematic_motion_quality_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(`Failed to load events: ${error.message}`);
      setEvents([]);
    } else {
      setEvents((data ?? []) as any);
    }
    setEventsLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => { if (selectedId) fetchEvents(selectedId); }, [selectedId, fetchEvents]);

  const handleRegenerate = async (jobId: string) => {
    if (!confirm("Restart this job? This will rebuild assets and increment the regenerate counter.")) return;
    setRegening(jobId);
    const { data, error } = await supabase.functions.invoke("cinematic-ad-regenerate", {
      body: { job_id: jobId, reason: "admin: motion forensics restart" },
    });
    setRegening(null);
    if (error || !(data as any)?.ok) {
      toast.error((data as any)?.message ?? error?.message ?? "Restart failed");
      return;
    }
    toast.success(`Restart dispatched (count: ${(data as any).regenerate_count})`);
    fetchJobs();
  };

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <>
      <Helmet>
        <title>Motion Forensics — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Motion Forensics</h1>
            <p className="text-muted-foreground mt-1">
              Per-job storyboards, motion quality breakdowns, regen attempts and restart controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border">
              {(["all", "low", "failed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm capitalize ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {f === "low" ? "Score < 70" : f}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-6">
          {/* Job list */}
          <Card className="h-fit max-h-[80vh] overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Jobs ({jobs.length})</CardTitle>
              <CardDescription>Most recent 100 jobs</CardDescription>
            </CardHeader>
            <CardContent className="overflow-y-auto p-0 flex-1">
              {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : jobs.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No jobs match this filter.</p>
              ) : (
                <ul className="divide-y">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <button
                        onClick={() => setSelectedId(j.id)}
                        className={`w-full text-left p-3 hover:bg-accent/50 transition-colors flex items-start gap-2 ${selectedId === j.id ? "bg-accent" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs truncate">{j.product_slug ?? j.id.slice(0, 8)}</span>
                            <Badge variant="outline" className="text-[10px]">{j.status ?? "—"}</Badge>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${scoreColor(j.motion_quality_score)}`}>
                              MQ {j.motion_quality_score ?? "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              regen {j.motion_regen_attempts ?? 0}/{j.regenerate_count ?? 0}
                            </span>
                            {j.error_message && <AlertCircle className="h-3 w-3 text-destructive" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {j.updated_at ? formatDistanceToNow(new Date(j.updated_at), { addSuffix: true }) : "—"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Detail panel */}
          <div className="space-y-4 min-w-0">
            {!selected ? (
              <Card><CardContent className="p-12 text-center text-muted-foreground">Select a job to inspect its motion forensics.</CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="text-lg break-all">{selected.product_slug ?? "(no slug)"}</CardTitle>
                        <CardDescription className="font-mono text-xs break-all">{selected.id}</CardDescription>
                      </div>
                      <Button
                        onClick={() => handleRegenerate(selected.id)}
                        disabled={regening === selected.id}
                        size="sm"
                      >
                        {regening === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                        Restart job
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <Metric label="Status" value={selected.status ?? "—"} />
                    <Metric label="Motion Quality" value={selected.motion_quality_score ?? "—"} highlight={scoreColor(selected.motion_quality_score)} />
                    <Metric label="Motion Score" value={selected.motion_score ?? "—"} />
                    <Metric label="Regen attempts" value={`${selected.motion_regen_attempts ?? 0} / ${selected.regenerate_count ?? 0}`} />
                    {selected.status_message && (
                      <div className="col-span-full text-xs text-muted-foreground">
                        <strong className="text-foreground">Status:</strong> {selected.status_message}
                      </div>
                    )}
                    {selected.error_message && (
                      <div className="col-span-full p-3 rounded bg-destructive/10 text-destructive text-xs">
                        <strong>Error:</strong> {selected.error_message}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {selected.output_mp4_url && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Output</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      <video
                        src={selected.output_mp4_url}
                        poster={selected.output_thumbnail_url ?? undefined}
                        controls
                        className="w-full max-w-sm rounded border bg-black"
                      />
                      <a href={selected.output_mp4_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline break-all">
                        {selected.output_mp4_url}
                      </a>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Motion Quality Breakdown</CardTitle>
                    <CardDescription>Raw scoring components from the renderer</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selected.motion_quality_breakdown ? (
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-80">{JSON.stringify(selected.motion_quality_breakdown, null, 2)}</pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No breakdown recorded for this job.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Motion Storyboard</CardTitle>
                    <CardDescription>Scene plan used by the cinematic motion engine</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {Array.isArray(selected.motion_storyboard) && selected.motion_storyboard.length > 0 ? (
                      <ol className="space-y-2">
                        {selected.motion_storyboard.map((scene: any, i: number) => (
                          <li key={i} className="border rounded p-3 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <strong className="text-sm">Scene {i + 1}</strong>
                              {scene?.duration != null && <span className="text-muted-foreground">{scene.duration}s</span>}
                            </div>
                            {scene?.camera && <p><span className="text-muted-foreground">Camera:</span> {scene.camera}</p>}
                            {scene?.shot && <p><span className="text-muted-foreground">Shot:</span> {scene.shot}</p>}
                            {scene?.description && <p className="mt-1">{scene.description}</p>}
                          </li>
                        ))}
                      </ol>
                    ) : selected.motion_storyboard ? (
                      <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-80">{JSON.stringify(selected.motion_storyboard, null, 2)}</pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No storyboard recorded.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quality Events Log</CardTitle>
                    <CardDescription>Every scoring attempt — pass / regen_queued / manual_review</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {eventsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : events.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No events recorded for this job.</p>
                    ) : (
                      <ul className="space-y-2">
                        {events.map((e) => (
                          <li key={e.id} className="border rounded p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">#{e.attempt_number}</Badge>
                                <span className="text-muted-foreground">{e.source}</span>
                                {e.decision && (
                                  <span className={`px-1.5 py-0.5 rounded ${decisionColor(e.decision)}`}>
                                    {e.decision === "pass" ? <CheckCircle2 className="h-3 w-3 inline mr-1" /> : null}
                                    {e.decision}
                                  </span>
                                )}
                              </div>
                              <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                            </div>
                            <p>
                              Score <strong>{e.score ?? "—"}</strong> / threshold {e.threshold ?? "—"}
                            </p>
                            {e.notes && <p className="text-muted-foreground">{e.notes}</p>}
                            {e.breakdown && (
                              <details>
                                <summary className="cursor-pointer text-muted-foreground">breakdown</summary>
                                <pre className="mt-1 bg-muted p-2 rounded overflow-auto">{JSON.stringify(e.breakdown, null, 2)}</pre>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-medium ${highlight ? `inline-block px-2 py-0.5 rounded ${highlight}` : ""}`}>{value}</div>
    </div>
  );
}