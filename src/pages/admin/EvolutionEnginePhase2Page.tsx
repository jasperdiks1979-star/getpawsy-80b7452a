import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Counts = {
  trends: number; emotions: number; image_dna: number; clusters: number;
  experiments: number; samples: number; recommendations: number;
  families: number; accuracy: number; runs: number;
};

const FUNCTIONS: { key: string; label: string }[] = [
  { key: "ee-p2-trend-detect", label: "Trend Detect" },
  { key: "ee-p2-emotion-score", label: "Emotion Score" },
  { key: "ee-p2-image-dna", label: "Image DNA" },
  { key: "ee-p2-experiment-track", label: "Experiment Track" },
  { key: "ee-p2-learning-ingest", label: "Learning Ingest" },
  { key: "ee-p2-recommend", label: "Recommend" },
  { key: "ee-p2-nightly", label: "Nightly Orchestrator" },
];

export default function EvolutionEnginePhase2Page() {
  const [counts, setCounts] = useState<Counts>({ trends: 0, emotions: 0, image_dna: 0, clusters: 0, experiments: 0, samples: 0, recommendations: 0, families: 0, accuracy: 0, runs: 0 });
  const [trends, setTrends] = useState<any[]>([]);
  const [emotions, setEmotions] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [recs, setRecs] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [accuracy, setAccuracy] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const h = { head: true as const, count: "exact" as const };
    const c: any = (supabase.from as any);
    const [t, e, d, cl, ex, sa, re, fa, ac, ru, trendList, emoList, famList, expList, recList, runList, accList] = await Promise.all([
      c("ee_p2_trend_signals").select("id", h),
      c("ee_p2_emotion_scores").select("id", h),
      c("ee_p2_image_dna").select("id", h),
      c("ee_p2_image_clusters").select("id", h),
      c("ee_p2_experiments").select("id", h),
      c("ee_p2_training_samples").select("id", h),
      c("ee_p2_recommendations").select("id", h),
      c("ee_p2_winning_families").select("id", h),
      c("ee_p2_model_accuracy").select("id", h),
      c("ee_p2_nightly_runs").select("id", h),
      c("ee_p2_trend_signals").select("*").order("detected_at", { ascending: false }).limit(25),
      c("ee_p2_emotion_scores").select("creative_id, dominant_emotion, scored_at").order("scored_at", { ascending: false }).limit(25),
      c("ee_p2_winning_families").select("*").order("avg_ctr", { ascending: false }).limit(25),
      c("ee_p2_experiments").select("*").order("created_at", { ascending: false }).limit(15),
      c("ee_p2_recommendations").select("*").order("generated_at", { ascending: false }).limit(25),
      c("ee_p2_nightly_runs").select("*").order("started_at", { ascending: false }).limit(10),
      c("ee_p2_model_accuracy").select("*").order("evaluated_at", { ascending: false }).limit(15),
    ]);
    setCounts({
      trends: t.count ?? 0, emotions: e.count ?? 0, image_dna: d.count ?? 0, clusters: cl.count ?? 0,
      experiments: ex.count ?? 0, samples: sa.count ?? 0, recommendations: re.count ?? 0,
      families: fa.count ?? 0, accuracy: ac.count ?? 0, runs: ru.count ?? 0,
    });
    setTrends(trendList.data ?? []);
    setEmotions(emoList.data ?? []);
    setFamilies(famList.data ?? []);
    setExperiments(expList.data ?? []);
    setRecs(recList.data ?? []);
    setRuns(runList.data ?? []);
    setAccuracy(accList.data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function run(fn: string) {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(`${fn}: ${JSON.stringify(data ?? {}).slice(0, 120)}`);
      await load();
    } catch (e: any) {
      toast.error(`${fn} failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  }

  const stat = (label: string, n: number) => (
    <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
    <CardContent><div className="text-2xl font-semibold">{n.toLocaleString()}</div></CardContent></Card>
  );

  return (
    <div className="space-y-6 p-6">
      <Helmet><title>Evolution Engine Phase 2 — Marketing Brain</title><meta name="robots" content="noindex" /></Helmet>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Evolution Engine — Phase 2</h1>
          <p className="text-sm text-muted-foreground">Autonomous AI marketing brain. <Badge variant="secondary">Observation Only</Badge> Never publishes. Never mutates production.</p>
        </div>
        <Button onClick={load} variant="outline">Refresh</Button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stat("Trend Signals", counts.trends)}
        {stat("Emotion Scores", counts.emotions)}
        {stat("Image DNA", counts.image_dna)}
        {stat("Image Clusters", counts.clusters)}
        {stat("Experiments", counts.experiments)}
        {stat("Training Samples", counts.samples)}
        {stat("Recommendations", counts.recommendations)}
        {stat("Winning Families", counts.families)}
        {stat("Model Snapshots", counts.accuracy)}
        {stat("Nightly Runs", counts.runs)}
      </section>

      <Card>
        <CardHeader><CardTitle>Engine Controls</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {FUNCTIONS.map((f) => (
            <Button key={f.key} onClick={() => run(f.key)} disabled={busy === f.key} variant={f.key === "ee-p2-nightly" ? "default" : "secondary"}>
              {busy === f.key ? "Running…" : f.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Trend Heatmap (latest)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Entity</TableHead><TableHead>Score</TableHead><TableHead>Velocity</TableHead></TableRow></TableHeader>
              <TableBody>
                {trends.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><Badge variant="outline">{t.signal_type}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{t.entity_label ?? t.entity_id}</TableCell>
                    <TableCell>{Number(t.score ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{Number(t.velocity ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Emotion Analytics</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Creative</TableHead><TableHead>Dominant</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
              <TableBody>
                {emotions.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{String(e.creative_id).slice(0, 12)}…</TableCell>
                    <TableCell><Badge>{e.dominant_emotion ?? "—"}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.scored_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Winning Headline / Hook / CTA Families</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Pattern</TableHead><TableHead>n</TableHead><TableHead>CTR</TableHead></TableRow></TableHeader>
              <TableBody>
                {families.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell><Badge variant="outline">{f.family_type}</Badge></TableCell>
                    <TableCell className="text-xs">{f.pattern_sample ?? f.pattern}</TableCell>
                    <TableCell>{f.sample_size}</TableCell>
                    <TableCell>{(Number(f.avg_ctr ?? 0) * 100).toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Experiment Results</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Winner</TableHead><TableHead>Uplift</TableHead><TableHead>Conf.</TableHead></TableRow></TableHeader>
              <TableBody>
                {experiments.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell><Badge variant="outline">{e.experiment_type}</Badge></TableCell>
                    <TableCell className="text-xs">{String(e.winner_variant ?? "—").slice(0, 40)}</TableCell>
                    <TableCell>{(Number(e.uplift ?? 0) * 100).toFixed(1)}%</TableCell>
                    <TableCell>{(Number(e.confidence ?? 0) * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>AI Recommendations <span className="text-xs text-muted-foreground font-normal">(observed only — never auto-applied)</span></CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Recommendation</TableHead><TableHead>Reasoning</TableHead><TableHead>Conf.</TableHead></TableRow></TableHeader>
              <TableBody>
                {recs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge>{r.rec_type}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{JSON.stringify(r.recommendation).slice(0, 80)}</TableCell>
                    <TableCell className="text-xs">{r.reasoning}</TableCell>
                    <TableCell>{(Number(r.confidence ?? 0) * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Model Accuracy</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Metric</TableHead><TableHead>Value</TableHead><TableHead>n</TableHead></TableRow></TableHeader>
              <TableBody>
                {accuracy.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{a.model_name} <span className="text-muted-foreground">{a.model_version}</span></TableCell>
                    <TableCell>{a.metric_name}</TableCell>
                    <TableCell>{Number(a.metric_value).toFixed(4)}</TableCell>
                    <TableCell>{a.sample_size}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nightly Runs</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>Steps OK</TableHead></TableRow></TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={r.status === "complete" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{(r.stats?.ok ?? 0)}/{(r.stats?.steps ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}