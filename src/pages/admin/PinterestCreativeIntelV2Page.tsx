import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ClassRow = { functional_class: string; n: number };
type RunRow = { id: string; run_type: string; status: string; totals: any; started_at: string; finished_at: string | null };

export default function PinterestCreativeIntelV2Page() {
  const [coverage, setCoverage] = useState<{ classified: number; total: number }>({ classified: 0, total: 0 });
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ count: classified }, { count: total }, { data: rows }, { data: runRows }] = await Promise.all([
      supabase.from("pcie2_product_understanding").select("*", { count: "exact", head: true }),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("pcie2_product_understanding").select("functional_class"),
      supabase.from("pcie2_runs").select("*").order("started_at", { ascending: false }).limit(10),
    ]);
    setCoverage({ classified: classified ?? 0, total: total ?? 0 });
    const tally = new Map<string, number>();
    (rows ?? []).forEach((r: any) => tally.set(r.functional_class, (tally.get(r.functional_class) ?? 0) + 1));
    setClasses([...tally.entries()].map(([functional_class, n]) => ({ functional_class, n })).sort((a, b) => b.n - a.n));
    setRuns((runRows as any) ?? []);
  }

  useEffect(() => { load(); }, []);

  async function runClassifier() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pcie2-product-classifier", {
        body: { limit: 100, useAI: true, onlyMissing: true },
      });
      if (error) throw error;
      toast.success(`Classified ${data?.totals?.processed ?? 0} products`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Classifier failed");
    } finally {
      setBusy(false);
    }
  }

  const pct = coverage.total ? Math.round((coverage.classified / coverage.total) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Pinterest Creative Intelligence V2</h1>
        <p className="text-sm text-muted-foreground">Wave 1 — Creative Memory + Product Understanding. Publishing is gated by <code>pcie2_publish_enabled</code> (off).</p>
      </header>

      <Card>
        <CardHeader><CardTitle>Product Classification Coverage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="text-3xl font-semibold">{coverage.classified} / {coverage.total} <span className="text-base text-muted-foreground">({pct}%)</span></div>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <Badge key={c.functional_class} variant="secondary">{c.functional_class}: {c.n}</Badge>
            ))}
          </div>
          <Button onClick={runClassifier} disabled={busy}>{busy ? "Classifying…" : "Run Classifier (batch 100)"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {runs.length === 0 && <div className="text-muted-foreground">No runs yet.</div>}
            {runs.map((r) => (
              <div key={r.id} className="flex justify-between border-b pb-1">
                <span>{r.run_type} · {r.status}</span>
                <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                <span>{JSON.stringify(r.totals)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}