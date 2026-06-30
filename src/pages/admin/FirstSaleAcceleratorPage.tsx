import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Rocket, RefreshCw } from "lucide-react";

type ScoreRow = {
  product_id: string;
  product_slug: string | null;
  product_name: string | null;
  fsps: number;
  rank: number | null;
  mode: string;
  components: Record<string, number> | null;
  computed_at: string;
};

type Run = {
  id: string;
  status: string;
  scored_count: number;
  reprioritized_count: number;
  top_products: Array<{ slug: string; name: string; fsps: number }>;
  estimated_hours_to_first_sale: number | null;
  completed_at: string | null;
  details: Record<string, unknown> | null;
};

export default function FirstSaleAcceleratorPage() {
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: lastRun }, { data: scores }] = await Promise.all([
      supabase.from("gv6_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("gv6_first_sale_scores").select("*").order("fsps", { ascending: false }).limit(50),
    ]);
    setRun((lastRun as Run | null) ?? null);
    setRows((scores ?? []) as ScoreRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const trigger = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("first-sale-accelerator", { body: {} });
      if (error) throw error;
      toast({ title: "Accelerator finished", description: `Scored ${data?.scored ?? 0} products, reprioritized ${data?.reprioritized ?? 0} pins.` });
      await load();
    } catch (e) {
      toast({ title: "Accelerator failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const eta = run?.estimated_hours_to_first_sale ?? null;
  const top10 = rows.slice(0, 10);

  return (
    <>
      <Helmet><title>First Sale Accelerator | GetPawsy Admin</title></Helmet>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Rocket className="h-7 w-7" /> First Sale Accelerator</h1>
            <p className="text-muted-foreground">Genesis V6 — maximise probability of the first organic Pinterest sale.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
            <Button onClick={trigger} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              {running ? "Running" : "Run Accelerator"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">Mode</CardTitle></CardHeader><CardContent><Badge>{run?.details && typeof run.details === "object" ? String((run.details as { mode?: string }).mode ?? "—") : "—"}</Badge></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Products Scored</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{run?.scored_count ?? 0}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Pins Reprioritized</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{run?.reprioritized_count ?? 0}</CardContent></Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">ETA to First Sale</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{eta != null ? `${Math.round(eta)}h` : "—"}</CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Top 10 — Most Likely First Sale</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {top10.map((r, i) => (
                <div key={r.product_id} className="flex items-center justify-between border-b last:border-0 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-muted-foreground w-6">#{i + 1}</span>
                    <a href={`/products/${r.product_slug}`} target="_blank" rel="noreferrer" className="truncate hover:underline">{r.product_name ?? r.product_slug}</a>
                  </div>
                  <Badge variant={r.fsps >= 70 ? "default" : "secondary"}>FSPS {r.fsps}</Badge>
                </div>
              ))}
              {top10.length === 0 && <p className="text-muted-foreground">No scores yet — run the accelerator.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Full Ranking (Top 50)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">#</th><th>Product</th><th>FSPS</th><th>Mode</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="py-1">{i + 1}</td>
                    <td className="max-w-[480px] truncate"><a className="hover:underline" href={`/products/${r.product_slug}`} target="_blank" rel="noreferrer">{r.product_name}</a></td>
                    <td>{r.fsps}</td>
                    <td><Badge variant="outline">{r.mode}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}