// Genesis V3 — Product Intelligence Engine (Phase 2)
// Reads gv3_pi_scores / gv3_pi_runs / gv3_pi_recommendations.
// Does NOT duplicate Canonical Analytics — scores are derived in the edge function.
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type ScoreRow = {
  product_id: string;
  window_days: number;
  sessions: number; product_views: number; add_to_carts: number;
  checkouts: number; purchases: number; revenue_cents: number; aov_cents: number;
  traffic_score: number; view_score: number; atc_score: number; checkout_score: number;
  purchase_score: number; revenue_score: number; aov_score: number; profit_score: number;
  pinterest_score: number; tiktok_score: number; seo_score: number;
  cro_risk_score: number; confidence_score: number; overall_score: number;
  classification: string | null; reason: string | null;
  evidence: any; components: any; last_scored_at: string;
};

type Recommendation = {
  id: string; product_id: string; classification: string;
  recommended_action: string; reason: string | null; priority: number;
  expected_impact: string | null; confidence: number; created_at: string;
};

type RunRow = {
  id: string; status: string; trigger_source: string;
  products_scored: number; recommendations_written: number;
  started_at: string | null; finished_at: string | null;
  error_message: string | null; report: any; created_at: string;
};

const CLASS_COLOR: Record<string, string> = {
  "Winner": "bg-emerald-600",
  "Promising": "bg-emerald-500/70",
  "Needs CRO": "bg-amber-600",
  "Needs Traffic": "bg-blue-600",
  "Needs Better Creative": "bg-fuchsia-600",
  "Needs SEO": "bg-indigo-600",
  "Price Resistance": "bg-orange-700",
  "Shipping Risk": "bg-red-700",
  "Low Confidence": "bg-zinc-500",
  "Candidate to Pause": "bg-red-600",
  "Candidate to Promote": "bg-teal-600",
};

const CLASS_LIST = Object.keys(CLASS_COLOR);

export default function ProductIntelligenceV3Page() {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [products, setProducts] = useState<Record<string, { name: string; slug: string | null; price: number | null }>>({});
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [openProduct, setOpenProduct] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: r }, { data: rec }] = await Promise.all([
      supabase.from("gv3_pi_scores").select("*").order("overall_score", { ascending: false }).limit(1000),
      supabase.from("gv3_pi_runs").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("gv3_pi_recommendations").select("*").order("priority", { ascending: false }).limit(2000),
    ]);
    setScores((s ?? []) as ScoreRow[]);
    setRuns((r ?? []) as RunRow[]);
    setRecs((rec ?? []) as Recommendation[]);
    const ids = Array.from(new Set((s ?? []).map((x: any) => x.product_id)));
    if (ids.length) {
      const { data: p } = await supabase.from("products").select("id, name, slug, price").in("id", ids);
      const map: Record<string, any> = {};
      for (const pr of p ?? []) map[(pr as any).id] = { name: (pr as any).name, slug: (pr as any).slug, price: (pr as any).price };
      setProducts(map);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("product-intelligence-run", {
        body: { trigger: "manual" },
      });
      if (error) throw error;
      toast.success(`Scored ${data?.products_scored ?? 0} products`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const filtered = useMemo(() => {
    return scores.filter((s) => {
      if (filter !== "ALL" && s.classification !== filter) return false;
      if (!q) return true;
      const name = products[s.product_id]?.name || "";
      return name.toLowerCase().includes(q.toLowerCase()) || s.product_id.includes(q);
    });
  }, [scores, products, filter, q]);

  const classCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of scores) if (s.classification) c[s.classification] = (c[s.classification] || 0) + 1;
    return c;
  }, [scores]);

  const lastRun = runs[0];

  const drilldownRecs = openProduct ? recs.filter((r) => r.product_id === openProduct) : [];
  const drilldownScore = openProduct ? scores.find((s) => s.product_id === openProduct) : null;

  return (
    <div className="space-y-6 p-6">
      <Helmet><title>Product Intelligence V3 · GetPawsy Admin</title></Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Product Intelligence V3</h1>
          <p className="text-sm text-muted-foreground">Genesis V3 · Phase 2 — Scores, classifies and recommends from canonical data. Read-only (no auto-actions).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" /> Reload</Button>
          <Button onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />} Run Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Products scored</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{scores.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Last run</CardTitle></CardHeader><CardContent className="text-sm">{lastRun ? `${lastRun.status} · ${new Date(lastRun.created_at).toLocaleString()}` : "—"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Window</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{lastRun?.report?.window_days ?? scores[0]?.window_days ?? 30}d</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Recommendations</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{recs.length}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Classifications</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === "ALL" ? "default" : "outline"} onClick={() => setFilter("ALL")}>All · {scores.length}</Button>
          {CLASS_LIST.map((c) => (
            <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} onClick={() => setFilter(c)}>
              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${CLASS_COLOR[c]}`} /> {c} · {classCounts[c] || 0}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between gap-3 items-center">
            <CardTitle className="text-sm">Products ({filtered.length})</CardTitle>
            <Input placeholder="Search by name or id…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">Overall</TableHead>
                  <TableHead className="text-right">Conf.</TableHead>
                  <TableHead className="text-right">Sess</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">ATC</TableHead>
                  <TableHead className="text-right">Co</TableHead>
                  <TableHead className="text-right">Buy</TableHead>
                  <TableHead className="text-right">Rev</TableHead>
                  <TableHead className="text-right">Pin</TableHead>
                  <TableHead className="text-right">TT</TableHead>
                  <TableHead className="text-right">SEO</TableHead>
                  <TableHead className="text-right">CRO risk</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((s) => {
                  const p = products[s.product_id];
                  const cls = s.classification || "—";
                  return (
                    <TableRow key={s.product_id} className="cursor-pointer" onClick={() => setOpenProduct(s.product_id)}>
                      <TableCell className="max-w-[280px] truncate">{p?.name || s.product_id}</TableCell>
                      <TableCell><Badge className={`${CLASS_COLOR[cls] || "bg-zinc-500"} text-white`}>{cls}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{Math.round(s.overall_score)}</TableCell>
                      <TableCell className="text-right">{Math.round(s.confidence_score)}</TableCell>
                      <TableCell className="text-right">{s.sessions}</TableCell>
                      <TableCell className="text-right">{s.product_views}</TableCell>
                      <TableCell className="text-right">{s.add_to_carts}</TableCell>
                      <TableCell className="text-right">{s.checkouts}</TableCell>
                      <TableCell className="text-right">{s.purchases}</TableCell>
                      <TableCell className="text-right">€{(s.revenue_cents / 100).toFixed(0)}</TableCell>
                      <TableCell className="text-right">{Math.round(s.pinterest_score)}</TableCell>
                      <TableCell className="text-right">{Math.round(s.tiktok_score)}</TableCell>
                      <TableCell className="text-right">{Math.round(s.seo_score)}</TableCell>
                      <TableCell className="text-right">{Math.round(s.cro_risk_score)}</TableCell>
                      <TableCell><Button size="sm" variant="ghost">Open</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openProduct && drilldownScore && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Drilldown · {products[openProduct]?.name || openProduct}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setOpenProduct(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(drilldownScore.components || {}).map(([k, v]) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">{k.replace(/_/g, " ")}</div>
                  <div className="text-lg font-semibold">{Math.round(Number(v))}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="font-semibold mb-1">Funnel ({drilldownScore.window_days}d)</div>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">{JSON.stringify(drilldownScore.evidence, null, 2)}</pre>
            </div>
            <div>
              <div className="font-semibold mb-1">Recommendations</div>
              <ul className="space-y-1">
                {drilldownRecs.map((r) => (
                  <li key={r.id} className="rounded border p-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`${CLASS_COLOR[r.classification] || "bg-zinc-500"} text-white`}>{r.classification}</Badge>
                      <span className="text-xs text-muted-foreground">priority {r.priority} · confidence {Math.round(r.confidence)}</span>
                    </div>
                    <div className="mt-1"><strong>Action:</strong> {r.recommended_action}</div>
                    {r.reason && <div className="text-xs text-muted-foreground">Reason: {r.reason}</div>}
                    {r.expected_impact && <div className="text-xs text-muted-foreground">Expected: {r.expected_impact}</div>}
                  </li>
                ))}
              </ul>
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
              <TableHead className="text-right">Scored</TableHead><TableHead className="text-right">Recs</TableHead><TableHead>Error</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={r.status === "ok" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{r.trigger_source}</TableCell>
                  <TableCell className="text-right">{r.products_scored}</TableCell>
                  <TableCell className="text-right">{r.recommendations_written}</TableCell>
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