import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Run = {
  id: string;
  kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  stats: Record<string, unknown>;
  error: string | null;
};

type Setting = { key: string; value: unknown; description: string | null };
type ProductRow = { product_id: string; pins_count: number; impressions_total: number; revenue_total: number; composite_score: number | null };
type BoardRow = { board_id: string; pins_count: number; impressions_total: number; avg_ctr: number | null; composite_score: number | null };
type PredictionRow = {
  id: string;
  pin_id: string | null;
  predicted_ctr: number | null;
  actual_ctr: number | null;
  predicted_revenue: number | null;
  actual_revenue: number | null;
  confidence: number | null;
  created_at: string;
};

export default function EvolutionEnginePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [counts, setCounts] = useState<{ history: number; events: number; vectors: number }>({ history: 0, events: 0, vectors: 0 });
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [r, s, p, b, pr, h, e, v] = await Promise.all([
      (supabase.from as any)("ee_runs").select("*").order("started_at", { ascending: false }).limit(20),
      (supabase.from as any)("ee_settings").select("*").order("key"),
      (supabase.from as any)("ee_learning_products").select("*").order("composite_score", { ascending: false, nullsFirst: false }).limit(20),
      (supabase.from as any)("ee_learning_boards").select("*").order("composite_score", { ascending: false, nullsFirst: false }).limit(20),
      (supabase.from as any)("ee_predictions").select("*").order("created_at", { ascending: false }).limit(50),
      (supabase.from as any)("ee_learning_history").select("id", { count: "exact", head: true }),
      (supabase.from as any)("ee_learning_events").select("id", { count: "exact", head: true }),
      (supabase.from as any)("ee_learning_vectors").select("id", { count: "exact", head: true }),
    ]);
    setRuns(r.data ?? []);
    setSettings(s.data ?? []);
    setProducts(p.data ?? []);
    setBoards(b.data ?? []);
    setPredictions(pr.data ?? []);
    setCounts({ history: h.count ?? 0, events: e.count ?? 0, vectors: v.count ?? 0 });
  }

  useEffect(() => {
    load();
  }, []);

  async function trigger(fn: string) {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { triggered_by: "evolution-engine-ui" } });
      if (error) throw error;
      toast.success(`${fn} ok`, { description: JSON.stringify(data).slice(0, 200) });
      await load();
    } catch (e: any) {
      toast.error(`${fn} failed`, { description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  }

  const mode = settings.find((x) => x.key === "mode")?.value as string | undefined;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Evolution Engine — Phase 1 (Observation Only)</title>
        <meta name="description" content="GetPawsy Evolution Engine V1 — autonomous marketing brain, observation-only Phase 1 dashboard." />
      </Helmet>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evolution Engine</h1>
          <p className="text-muted-foreground text-sm">Autonomous AI Marketing Brain — Phase 1 foundation</p>
        </div>
        <Badge variant={mode === "auto" ? "destructive" : "secondary"}>MODE: {String(mode ?? "observation_only").toUpperCase()}</Badge>
      </header>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="pt-6 text-sm text-amber-200">
          <strong>Observation-only.</strong> The Evolution Engine cannot publish, gate, or mutate the Publish Queue, Guardian, CI Layer, OAuth, or Recovery Engine. It reads production signals and writes only to <code>ee_*</code> tables.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Learning History rows" value={counts.history} />
        <Stat label="Learning Events" value={counts.events} />
        <Stat label="Feature Vectors" value={counts.vectors} />
        <Stat label="Predictions" value={predictions.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manual triggers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={!!busy} onClick={() => trigger("evolution-learning-ingest")}>
            {busy === "evolution-learning-ingest" ? "Running…" : "Run Learning Ingest"}
          </Button>
          <Button disabled={!!busy} variant="secondary" onClick={() => trigger("evolution-nightly-rollup")}>
            {busy === "evolution-nightly-rollup" ? "Running…" : "Run Nightly Rollup"}
          </Button>
          <Button disabled={!!busy} variant="outline" onClick={() => trigger("evolution-predictive-score")}>
            {busy === "evolution-predictive-score" ? "Running…" : "Score Recent Drafts"}
          </Button>
          <Button disabled={!!busy} variant="ghost" onClick={load}>Refresh</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Top Products (by composite score)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Pins</TableHead><TableHead>Impr.</TableHead><TableHead>Revenue</TableHead><TableHead>Score</TableHead></TableRow></TableHeader>
              <TableBody>
                {products.length === 0 && (<TableRow><TableCell colSpan={5} className="text-muted-foreground text-center">No data yet — run Learning Ingest.</TableCell></TableRow>)}
                {products.map((p) => (
                  <TableRow key={p.product_id}>
                    <TableCell className="font-mono text-xs">{p.product_id.slice(0, 8)}…</TableCell>
                    <TableCell>{p.pins_count}</TableCell>
                    <TableCell>{p.impressions_total}</TableCell>
                    <TableCell>€{Number(p.revenue_total).toFixed(2)}</TableCell>
                    <TableCell>{p.composite_score?.toFixed(3) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Boards</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Board</TableHead><TableHead>Pins</TableHead><TableHead>Impr.</TableHead><TableHead>CTR</TableHead><TableHead>Score</TableHead></TableRow></TableHeader>
              <TableBody>
                {boards.length === 0 && (<TableRow><TableCell colSpan={5} className="text-muted-foreground text-center">No data yet.</TableCell></TableRow>)}
                {boards.map((b) => (
                  <TableRow key={b.board_id}>
                    <TableCell className="font-mono text-xs">{b.board_id}</TableCell>
                    <TableCell>{b.pins_count}</TableCell>
                    <TableCell>{b.impressions_total}</TableCell>
                    <TableCell>{b.avg_ctr != null ? (Number(b.avg_ctr) * 100).toFixed(2) + "%" : "—"}</TableCell>
                    <TableCell>{b.composite_score?.toFixed(3) ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Predictions vs Actuals (latest 50)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pin</TableHead><TableHead>Pred CTR</TableHead><TableHead>Act CTR</TableHead><TableHead>Pred Rev</TableHead><TableHead>Act Rev</TableHead><TableHead>Conf</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.length === 0 && (<TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">No predictions yet.</TableCell></TableRow>)}
              {predictions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.pin_id ?? "—"}</TableCell>
                  <TableCell>{p.predicted_ctr != null ? (Number(p.predicted_ctr) * 100).toFixed(2) + "%" : "—"}</TableCell>
                  <TableCell>{p.actual_ctr != null ? (Number(p.actual_ctr) * 100).toFixed(2) + "%" : "—"}</TableCell>
                  <TableCell>{p.predicted_revenue != null ? `€${Number(p.predicted_revenue).toFixed(2)}` : "—"}</TableCell>
                  <TableCell>{p.actual_revenue != null ? `€${Number(p.actual_revenue).toFixed(2)}` : "—"}</TableCell>
                  <TableCell>{p.confidence != null ? (Number(p.confidence) * 100).toFixed(0) + "%" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Run log</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Duration</TableHead><TableHead>Stats / Error</TableHead></TableRow></TableHeader>
            <TableBody>
              {runs.length === 0 && (<TableRow><TableCell colSpan={5} className="text-muted-foreground text-center">No runs yet.</TableCell></TableRow>)}
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.kind}</TableCell>
                  <TableCell><Badge variant={r.status === "ok" ? "default" : r.status === "running" ? "secondary" : "destructive"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                  <TableCell>{r.duration_ms ? `${r.duration_ms}ms` : "—"}</TableCell>
                  <TableCell className="text-xs font-mono max-w-md truncate">{r.error ?? JSON.stringify(r.stats)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Value</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
            <TableBody>
              {settings.map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="font-mono">{s.key}</TableCell>
                  <TableCell className="font-mono">{JSON.stringify(s.value)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.description ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-3xl font-bold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}