// Genesis V3 — Phase 3 · Pinterest Growth Intelligence
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Score = {
  product_id: string; pinterest_growth_score: number; classification: string | null;
  reason: string | null; evidence: any; components: any; predicted_opportunity: number;
  confidence: number; pinterest_saturation: number; last_scored_at: string;
};
type Rec = {
  id: string; product_id: string; classification: string; recommended_action: string;
  reason: string | null; content_strategy: any; priority: number; expected_impact: string | null;
  confidence: number; created_at: string;
};
type Run = {
  id: string; status: string; trigger_source: string; window_days: number;
  products_analyzed: number; products_promoted: number; recommendations_written: number;
  error_message: string | null; report: any; created_at: string;
};

const CLS_COLOR: Record<string, string> = {
  "Promote Immediately": "bg-emerald-600",
  "Needs New Creative": "bg-fuchsia-600",
  "Needs Better Images": "bg-amber-600",
  "Needs Better Copy": "bg-amber-500",
  "Seasonal Opportunity": "bg-teal-600",
  "Hold": "bg-zinc-500",
  "Do Not Promote": "bg-red-600",
  "Low Confidence": "bg-zinc-400",
};
const CLS_LIST = Object.keys(CLS_COLOR);

export default function PinterestGrowthPage() {
  const [scores, setScores] = useState<Score[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [products, setProducts] = useState<Record<string, { name: string; image_url: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: r }, { data: rn }] = await Promise.all([
      supabase.from("gv3_pin_growth_scores").select("*").order("pinterest_growth_score", { ascending: false }).limit(1000),
      supabase.from("gv3_pin_growth_recommendations").select("*").order("priority", { ascending: false }).limit(2000),
      supabase.from("gv3_pin_growth_runs").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setScores((s ?? []) as Score[]);
    setRecs((r ?? []) as Rec[]);
    setRuns((rn ?? []) as Run[]);
    const ids = Array.from(new Set((s ?? []).map((x: any) => x.product_id)));
    if (ids.length) {
      const { data: p } = await supabase.from("products").select("id, name, image_url").in("id", ids);
      const m: Record<string, any> = {};
      for (const pr of p ?? []) m[(pr as any).id] = { name: (pr as any).name, image_url: (pr as any).image_url };
      setProducts(m);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-growth-run", { body: { trigger: "manual" } });
      if (error) throw error;
      toast.success(`Analyzed ${data?.analyzed ?? 0} products`);
      await load();
    } catch (e: any) { toast.error(e?.message || "Run failed"); }
    finally { setRunning(false); }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of scores) if (s.classification) c[s.classification] = (c[s.classification] || 0) + 1;
    return c;
  }, [scores]);

  const filtered = useMemo(() => {
    return scores.filter((s) => {
      if (filter !== "ALL" && s.classification !== filter) return false;
      if (!q) return true;
      const n = products[s.product_id]?.name || "";
      return n.toLowerCase().includes(q.toLowerCase()) || s.product_id.includes(q);
    });
  }, [scores, filter, q, products]);

  const lastRun = runs[0];
  const drillScore = open ? scores.find((s) => s.product_id === open) : null;
  const drillRecs = open ? recs.filter((r) => r.product_id === open) : [];

  return (
    <div className="space-y-6 p-6">
      <Helmet><title>Pinterest Growth · Genesis V3</title></Helmet>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Growth Intelligence</h1>
          <p className="text-sm text-muted-foreground">Genesis V3 · Phase 3 — recommendations only; no auto-publishing or deletion.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()}><RefreshCw className="h-4 w-4 mr-1" /> Reload</Button>
          <Button onClick={runNow} disabled={running}>{running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Run Now</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Products analyzed</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{scores.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Promote immediately</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-emerald-600">{counts["Promote Immediately"] || 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Do not promote</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-red-600">{counts["Do Not Promote"] || 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Last run</CardTitle></CardHeader><CardContent className="text-sm">{lastRun ? `${lastRun.status} · ${new Date(lastRun.created_at).toLocaleString()}` : "—"}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Classifications</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === "ALL" ? "default" : "outline"} onClick={() => setFilter("ALL")}>All · {scores.length}</Button>
          {CLS_LIST.map((c) => (
            <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} onClick={() => setFilter(c)}>
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${CLS_COLOR[c]}`} /> {c} · {counts[c] || 0}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center gap-3">
            <CardTitle className="text-sm">Ranked for Pinterest ({filtered.length})</CardTitle>
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">PGS</TableHead>
                  <TableHead className="text-right">Predicted opp.</TableHead>
                  <TableHead className="text-right">Saturation</TableHead>
                  <TableHead className="text-right">Conf.</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((s) => (
                  <TableRow key={s.product_id} className="cursor-pointer" onClick={() => setOpen(s.product_id)}>
                    <TableCell className="max-w-[320px] truncate">{products[s.product_id]?.name || s.product_id}</TableCell>
                    <TableCell><Badge className={`${CLS_COLOR[s.classification || ""] || "bg-zinc-500"} text-white`}>{s.classification || "—"}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{Math.round(s.pinterest_growth_score)}</TableCell>
                    <TableCell className="text-right">{Math.round(s.predicted_opportunity)}</TableCell>
                    <TableCell className="text-right">{s.pinterest_saturation}</TableCell>
                    <TableCell className="text-right">{Math.round(s.confidence)}</TableCell>
                    <TableCell><Button size="sm" variant="ghost">Open</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && drillScore && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">{products[open]?.name || open}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setOpen(null)}>Close</Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(drillScore.components || {}).map(([k, v]) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                  <div className="text-lg font-semibold">{Math.round(Number(v))}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="font-semibold mb-1">Evidence</div>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{JSON.stringify(drillScore.evidence, null, 2)}</pre>
            </div>
            <div>
              <div className="font-semibold mb-1">Recommendations</div>
              {drillRecs.map((r) => (
                <div key={r.id} className="rounded border p-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`${CLS_COLOR[r.classification] || "bg-zinc-500"} text-white`}>{r.classification}</Badge>
                    <span className="text-xs text-muted-foreground">priority {r.priority} · confidence {Math.round(r.confidence)}</span>
                  </div>
                  <div className="mt-1"><strong>Action:</strong> {r.recommended_action}</div>
                  {r.reason && <div className="text-xs text-muted-foreground">Reason: {r.reason}</div>}
                  {r.expected_impact && <div className="text-xs text-muted-foreground">Expected: {r.expected_impact}</div>}
                  {r.content_strategy && Object.keys(r.content_strategy).length > 0 && (
                    <details className="mt-1"><summary className="text-xs cursor-pointer">Content strategy</summary>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{JSON.stringify(r.content_strategy, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent runs</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Started</TableHead><TableHead>Status</TableHead><TableHead>Trigger</TableHead>
              <TableHead className="text-right">Analyzed</TableHead><TableHead className="text-right">Promoted</TableHead><TableHead>Error</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={r.status === "ok" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{r.trigger_source}</TableCell>
                  <TableCell className="text-right">{r.products_analyzed}</TableCell>
                  <TableCell className="text-right">{r.products_promoted}</TableCell>
                  <TableCell className="text-xs text-red-600">{r.error_message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}