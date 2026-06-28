import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, RefreshCw, Brain } from "lucide-react";
import { toast } from "sonner";

type Registry = { engine_key: string; display_name: string; category: string; weight: number; status: string };
type Review = { engine_key: string; period_start: string; period_end: string; overall_grade: number | null; letter_grade: string | null; prediction_accuracy: number | null; ctr_accuracy: number | null; conversion_accuracy: number | null; profit_contribution_cents: number | null; sample_size: number | null };
type Leaderboard = { snapshot_date: string; rankings: Array<{ rank: number; engine: string; grade: number | null; letter: string | null }>; most_accurate: string | null; most_profitable: string | null; worst_performer: string | null };
type Run = { id: string; started_at: string; ended_at: string | null; status: string; engines_reviewed: number | null; decisions_evaluated: number | null; weight_adjustments: number | null };
type Calib = { id: string; engine_key: string; predicted_avg: number | null; actual_success_rate: number | null; calibration_error: number | null; sample_size: number; period_end: string };

export default function MetaIntelligencePage() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [registry, setRegistry] = useState<Registry[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [calib, setCalib] = useState<Calib[]>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mil-meta-intelligence", { body: { action: "snapshot" } });
      if (error) throw error;
      setRegistry((data?.registry ?? []) as Registry[]);
      setReviews((data?.reviews ?? []) as Review[]);
      setLeaderboard((data?.leaderboard ?? null) as Leaderboard | null);
      setRuns((data?.runs ?? []) as Run[]);
      setCalib((data?.calibration ?? []) as Calib[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "MIL load failed");
    } finally { setLoading(false); }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("mil-meta-intelligence", { body: { action: "run", trigger: "manual" } });
      if (error) throw error;
      toast.success(`MIL reviewed ${data?.reviews?.length ?? 0} engines`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "MIL run failed");
    } finally { setRunning(false); }
  };

  useEffect(() => { refresh(); }, []);

  const latestByEngine = new Map<string, Review>();
  reviews.forEach((r) => { if (!latestByEngine.has(r.engine_key)) latestByEngine.set(r.engine_key, r); });

  return (
    <>
      <Helmet>
        <title>Meta Intelligence Layer | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Brain className="h-6 w-6" /> Meta Intelligence Layer</h1>
            <p className="text-sm text-muted-foreground">The executive board above every AI engine. Reviews, grades, calibrates and ranks every subsystem weekly.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="ml-2">Refresh</span>
            </Button>
            <Button size="sm" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}<span className="ml-2">Run Review</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Engines Governed</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{registry.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Most Accurate AI</CardTitle></CardHeader><CardContent><div className="text-base font-medium truncate">{leaderboard?.most_accurate ?? "—"}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Most Profitable AI</CardTitle></CardHeader><CardContent><div className="text-base font-medium truncate">{leaderboard?.most_profitable ?? "—"}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Worst Performer</CardTitle></CardHeader><CardContent><div className="text-base font-medium truncate">{leaderboard?.worst_performer ?? "—"}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="leaderboard">
          <TabsList>
            <TabsTrigger value="leaderboard">AI Leaderboard</TabsTrigger>
            <TabsTrigger value="reviews">Performance Reviews</TabsTrigger>
            <TabsTrigger value="calibration">Confidence Calibration</TabsTrigger>
            <TabsTrigger value="registry">Registry</TabsTrigger>
            <TabsTrigger value="runs">Loop Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <Card>
              <CardHeader><CardTitle>Ranked Engines</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!leaderboard && <p className="text-sm text-muted-foreground">No snapshot yet — run the review.</p>}
                {leaderboard?.rankings?.map((r) => (
                  <div key={r.engine} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-3"><Badge variant="outline">#{r.rank}</Badge><div className="font-medium">{r.engine}</div></div>
                    <div className="flex items-center gap-2"><Badge>{r.letter ?? "—"}</Badge><span className="text-sm text-muted-foreground">{r.grade ?? "—"}</span></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews">
            <Card>
              <CardHeader><CardTitle>Latest Weekly Reviews</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Array.from(latestByEngine.values()).map((r) => (
                  <div key={r.engine_key} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{r.engine_key}</div>
                      <Badge>{r.letter_grade ?? "—"} · {r.overall_grade ?? "—"}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      pred {(r.prediction_accuracy ?? 0).toFixed(2)} · ctr {(r.ctr_accuracy ?? 0).toFixed(2)} · cvr {(r.conversion_accuracy ?? 0).toFixed(2)} · profit ${(((r.profit_contribution_cents ?? 0)) / 100).toFixed(0)} · n={r.sample_size ?? 0}
                    </div>
                  </div>
                ))}
                {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calibration">
            <Card>
              <CardHeader><CardTitle>Confidence vs Reality</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {calib.length === 0 && <p className="text-sm text-muted-foreground">No calibration samples yet.</p>}
                {calib.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <div className="font-medium">{c.engine_key}</div>
                      <div className="text-xs text-muted-foreground">predicted {((c.predicted_avg ?? 0) * 100).toFixed(0)}% · actual {((c.actual_success_rate ?? 0) * 100).toFixed(0)}% · n={c.sample_size}</div>
                    </div>
                    <Badge variant={Math.abs(c.calibration_error ?? 0) > 0.15 ? "destructive" : "secondary"}>err {((c.calibration_error ?? 0) * 100).toFixed(1)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registry">
            <Card>
              <CardHeader><CardTitle>Governed Engines</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {registry.map((e) => (
                  <div key={e.engine_key} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <div className="font-medium">{e.display_name}</div>
                      <div className="text-xs text-muted-foreground">{e.category} · {e.engine_key}</div>
                    </div>
                    <div className="flex items-center gap-2"><Badge variant="outline">weight {Number(e.weight).toFixed(2)}</Badge><Badge>{e.status}</Badge></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card>
              <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {runs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <div className="font-medium">{new Date(r.started_at).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">engines {r.engines_reviewed ?? 0} · decisions {r.decisions_evaluated ?? 0} · weight adj {r.weight_adjustments ?? 0}</div>
                    </div>
                    <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}