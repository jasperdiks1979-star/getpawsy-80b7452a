import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, X, RefreshCw, Activity } from "lucide-react";
import { toast } from "sonner";

// BackgroundBatchPanel
// ---------------------------------------------------------------------------
// "Run in background" UI. Lets the admin queue a batch (e.g. generate N
// content-director picks or run N autopublish passes) without blocking the
// browser, and watch progress live via Supabase Realtime.
// ---------------------------------------------------------------------------

type Kind = "content_director_batch" | "autopublish_batch";

type Job = {
  id: string;
  kind: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  error: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const KIND_LABEL: Record<Kind, string> = {
  content_director_batch: "Generate N content-director picks",
  autopublish_batch: "Run N autopublish passes",
};

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "default",
  done: "secondary",
  failed: "destructive",
  cancelled: "destructive",
};

export function BackgroundBatchPanel() {
  const [kind, setKind] = useState<Kind>("content_director_batch");
  const [count, setCount] = useState(5);
  const [gapMs, setGapMs] = useState(1500);
  const [archetype, setArchetype] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("background_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15);
    setJobs((data ?? []) as Job[]);
  };

  useEffect(() => {
    load();
    // Subscribe to realtime updates so the progress bar moves live
    const ch = supabase
      .channel("background_jobs_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "background_jobs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const params: Record<string, unknown> = {};
      if (kind === "content_director_batch" && archetype) params.force_archetype = archetype;
      const { data, error } = await supabase.functions.invoke("background-batch-runner", {
        body: { kind, count, gap_ms: gapMs, params },
      });
      if (error) throw error;
      toast.success(`Batch queued (${count} runs)`);
      await load();
    } catch (e) {
      toast.error(`Failed to start: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    await supabase.from("background_jobs").update({ cancel_requested: true }).eq("id", id);
    toast.message("Cancel requested");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" /> Run in Background
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Batch form */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Batch kind</label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="content_director_batch">{KIND_LABEL.content_director_batch}</SelectItem>
                <SelectItem value="autopublish_batch">{KIND_LABEL.autopublish_batch}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Count (max 50)</label>
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Gap between runs (ms)</label>
            <Input type="number" min={0} step={500} value={gapMs} onChange={(e) => setGapMs(Number(e.target.value))} />
          </div>
          <div>
            <Button onClick={start} disabled={busy} className="w-full">
              <Play className="h-3 w-3 mr-1" /> Start
            </Button>
          </div>
        </div>

        {kind === "content_director_batch" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-3">
              <label className="text-xs text-muted-foreground">Force archetype (optional)</label>
              <Select value={archetype || "_auto"} onValueChange={(v) => setArchetype(v === "_auto" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_auto">Auto (let director pick)</SelectItem>
                  <SelectItem value="product_spotlight">product_spotlight</SelectItem>
                  <SelectItem value="multi_product_compilation">multi_product_compilation</SelectItem>
                  <SelectItem value="lifestyle_scene">lifestyle_scene</SelectItem>
                  <SelectItem value="ugc_pov">ugc_pov</SelectItem>
                  <SelectItem value="animated_slideshow">animated_slideshow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Active + recent jobs */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">Recent batches</div>
          {jobs.length === 0 && (
            <div className="text-sm text-muted-foreground p-4 border rounded">No batches yet.</div>
          )}
          {jobs.map((j) => {
            const pct = j.total ? Math.round(((j.completed + j.failed) / j.total) * 100) : 0;
            const tone = STATUS_TONE[j.status] ?? "outline";
            const active = j.status === "queued" || j.status === "running";
            return (
              <div key={j.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={tone}>{j.status}</Badge>
                    <span className="text-xs truncate">{j.kind}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{j.completed + j.failed}/{j.total}</span>
                    {j.failed > 0 && <span className="text-destructive">{j.failed} failed</span>}
                    {active && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(j.id)} className="h-6 px-2">
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <Progress value={pct} />
                <div className="text-[11px] text-muted-foreground flex gap-3">
                  <span>started: {j.started_at ? new Date(j.started_at).toLocaleTimeString() : "—"}</span>
                  <span>finished: {j.finished_at ? new Date(j.finished_at).toLocaleTimeString() : "—"}</span>
                  {j.cancel_requested && !j.finished_at && <span>cancel requested…</span>}
                </div>
                {j.error && <div className="text-[11px] text-destructive">{j.error}</div>}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default BackgroundBatchPanel;
