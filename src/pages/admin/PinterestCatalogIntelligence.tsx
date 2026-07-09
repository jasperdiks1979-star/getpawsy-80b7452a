import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCcw, Sparkles, Target } from "lucide-react";

type ProductRow = {
  product_id: string;
  product_slug: string | null;
  product_name: string;
  category: string | null;
  price: number;
  margin: number;
  image_count: number;
  image_url: string | null;
  ever_published: boolean;
  times_published: number;
  s_category_headroom: number;
  s_margin: number;
  s_price_band: number;
  s_visual_richness: number;
  s_lifestyle: number;
  s_emotional: number;
  s_seasonal: number;
  s_us_demand: number;
  s_uniqueness: number;
  s_board_compat: number | null;
  pinterest_potential_score: number;
  pinterest_class:
    | "Pinterest Hero"
    | "High Potential"
    | "Good Candidate"
    | "Support Content"
    | "Low Priority"
    | "Not Pinterest Suitable";
  publish_priority: number;
};

type CategoryRow = {
  category: string;
  products: number;
  published: number;
  untapped: number;
  avg_score: number;
  max_score: number;
  heroes: number;
  untapped_heroes: number;
  high_potential: number;
  weak: number;
  avg_margin: number;
};

const classColors: Record<ProductRow["pinterest_class"], string> = {
  "Pinterest Hero": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "High Potential": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Good Candidate": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Support Content": "bg-slate-500/15 text-slate-300 border-slate-500/30",
  "Low Priority": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Not Pinterest Suitable": "bg-red-500/15 text-red-300 border-red-500/30",
};

function ClassPill({ c }: { c: ProductRow["pinterest_class"] }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${classColors[c]}`}>{c}</span>;
}

// Greedy diversified priority queue: no more than `capPerCat` from same category in each window of `windowSize`.
function diversify(rows: ProductRow[], size: number, windowSize = 6, capPerCat = 2): ProductRow[] {
  const sorted = [...rows].sort((a, b) => b.publish_priority - a.publish_priority);
  const out: ProductRow[] = [];
  const remaining = [...sorted];
  while (out.length < size && remaining.length) {
    const windowStart = Math.max(0, out.length - windowSize + 1);
    const catCounts: Record<string, number> = {};
    for (const r of out.slice(windowStart)) {
      const k = r.category ?? "—";
      catCounts[k] = (catCounts[k] ?? 0) + 1;
    }
    const idx = remaining.findIndex((r) => (catCounts[r.category ?? "—"] ?? 0) < capPerCat);
    if (idx === -1) {
      out.push(remaining.shift()!);
    } else {
      out.push(remaining.splice(idx, 1)[0]);
    }
  }
  return out;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PinterestCatalogIntelligence() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueSize, setQueueSize] = useState(25);
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([
        supabase.from("v_pinterest_product_potential").select("*").order("publish_priority", { ascending: false }).limit(1000),
        supabase.from("v_pinterest_category_potential").select("*").order("avg_score", { ascending: false }),
      ]);
      if (p.error) throw p.error;
      setRows((p.data ?? []) as ProductRow[]);
      setCats((c.data ?? []) as CategoryRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const classCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.pinterest_class] = (c[r.pinterest_class] ?? 0) + 1;
    return c;
  }, [rows]);

  const untappedHeroes = useMemo(
    () => rows.filter((r) => r.pinterest_class === "Pinterest Hero" && !r.ever_published),
    [rows]
  );
  const seasonal = useMemo(
    () => rows.filter((r) => r.s_seasonal >= 7).sort((a, b) => b.pinterest_potential_score - a.pinterest_potential_score).slice(0, 20),
    [rows]
  );
  const queue = useMemo(() => diversify(rows.filter((r) => !r.ever_published), queueSize), [rows, queueSize]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(f) ||
        (r.category ?? "").toLowerCase().includes(f) ||
        r.pinterest_class.toLowerCase().includes(f)
    );
  }, [rows, filter]);

  const totalCoverage = rows.length ? ((rows.filter((r) => r.ever_published).length / rows.length) * 100).toFixed(1) : "0";
  const heroCoverage = classCounts["Pinterest Hero"] ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Helmet>
        <title>Pinterest Catalog Intelligence — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6" /> Pinterest Catalog Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only. Scores every active product for Pinterest distribution potential (0–100). No publishing or queue mutation.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />} Refresh
        </Button>
      </header>

      {error && <div className="text-sm text-red-400 border border-red-500/30 rounded p-3 bg-red-500/10">Error: {error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Products scored" value={String(rows.length)} sub={`${totalCoverage}% ever promoted`} />
        <Stat label="Pinterest Heroes" value={String(heroCoverage)} sub={`${untappedHeroes.length} untapped`} />
        <Stat label="High Potential" value={String(classCounts["High Potential"] ?? 0)} />
        <Stat label="Good Candidates" value={String(classCounts["Good Candidate"] ?? 0)} />
        <Stat label="Weak / Unsuitable" value={String((classCounts["Low Priority"] ?? 0) + (classCounts["Not Pinterest Suitable"] ?? 0))} />
      </div>

      {/* Class distribution + Category heatmap */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Class distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(["Pinterest Hero", "High Potential", "Good Candidate", "Support Content", "Low Priority", "Not Pinterest Suitable"] as const).map((k) => {
              const n = classCounts[k] ?? 0;
              const pct = rows.length ? (n / rows.length) * 100 : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <ClassPill c={k} />
                    <span className="tabular-nums">{n} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Category heatmap</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Category</th>
                  <th className="py-1 pr-2 text-right">Prods</th>
                  <th className="py-1 pr-2 text-right">Avg</th>
                  <th className="py-1 pr-2 text-right">Heroes</th>
                  <th className="py-1 pr-2 text-right">Untapped ★</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.category} className="border-t">
                    <td className="py-1 pr-2 max-w-[180px] truncate">{c.category}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{c.products}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <span
                        className={
                          c.avg_score >= 70 ? "text-emerald-400" : c.avg_score >= 55 ? "text-cyan-400" : "text-amber-400"
                        }
                      >
                        {c.avg_score}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{c.heroes}</td>
                    <td className="py-1 pr-2 text-right tabular-nums font-semibold text-fuchsia-300">{c.untapped_heroes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Publishing priority queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" /> Publishing priority queue (diversified)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            {[25, 50, 100].map((n) => (
              <Button key={n} size="sm" variant={queueSize === n ? "default" : "outline"} onClick={() => setQueueSize(n)}>
                Top {n}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground self-center ml-2">
              Rules: unpublished first · ≤ 2 from same category per rolling 6-pin window.
            </span>
          </div>
          <ScoredTable rows={queue} showRank />
        </CardContent>
      </Card>

      {/* Untapped heroes */}
      <Card>
        <CardHeader><CardTitle>Untapped heroes ({untappedHeroes.length})</CardTitle></CardHeader>
        <CardContent><ScoredTable rows={untappedHeroes.slice(0, 30)} /></CardContent>
      </Card>

      {/* Seasonal opportunities */}
      <Card>
        <CardHeader><CardTitle>Seasonal opportunities (summer)</CardTitle></CardHeader>
        <CardContent><ScoredTable rows={seasonal} /></CardContent>
      </Card>

      {/* Full opportunity matrix */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Product opportunity matrix ({filtered.length})</CardTitle>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, category, class…"
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ScoredTable rows={filtered.slice(0, 400)} showComponents />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Score = category_headroom (15) + margin (15) + price_band (10) + visual_richness (10) + lifestyle (10) + emotional (10) + seasonal (10) + us_demand (10) + uniqueness (5) + board_compat (5) = 100.
      </p>
    </div>
  );
}

function ScoredTable({
  rows,
  showRank,
  showComponents,
}: {
  rows: ProductRow[];
  showRank?: boolean;
  showComponents?: boolean;
}) {
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">No products.</div>;
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          {showRank && <th className="py-1 pr-2 text-right">#</th>}
          <th className="py-1 pr-2">Product</th>
          <th className="py-1 pr-2">Category</th>
          <th className="py-1 pr-2 text-right">Price</th>
          <th className="py-1 pr-2 text-right">Margin</th>
          <th className="py-1 pr-2 text-right">Score</th>
          <th className="py-1 pr-2">Class</th>
          {showComponents && (
            <>
              <th className="py-1 pr-2 text-right" title="Category headroom">Head</th>
              <th className="py-1 pr-2 text-right" title="Margin">Mgn</th>
              <th className="py-1 pr-2 text-right" title="Price band">Prc</th>
              <th className="py-1 pr-2 text-right" title="Visual richness">Vis</th>
              <th className="py-1 pr-2 text-right" title="Lifestyle">Lif</th>
              <th className="py-1 pr-2 text-right" title="Emotional">Emo</th>
              <th className="py-1 pr-2 text-right" title="Seasonal">Sea</th>
              <th className="py-1 pr-2 text-right" title="US demand">US</th>
              <th className="py-1 pr-2 text-right" title="Uniqueness">Un</th>
              <th className="py-1 pr-2 text-right" title="Board compat">Brd</th>
            </>
          )}
          <th className="py-1 pr-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.product_id} className="border-t">
            {showRank && <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{i + 1}</td>}
            <td className="py-1 pr-2 max-w-[280px] truncate">{r.product_name}</td>
            <td className="py-1 pr-2 max-w-[140px] truncate">{r.category ?? "—"}</td>
            <td className="py-1 pr-2 text-right tabular-nums">${Number(r.price).toFixed(0)}</td>
            <td className="py-1 pr-2 text-right tabular-nums">${Number(r.margin).toFixed(0)}</td>
            <td className="py-1 pr-2 text-right tabular-nums font-semibold">{r.pinterest_potential_score}</td>
            <td className="py-1 pr-2"><ClassPill c={r.pinterest_class} /></td>
            {showComponents && (
              <>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_category_headroom}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_margin}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_price_band}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_visual_richness}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_lifestyle}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_emotional}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_seasonal}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_us_demand}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_uniqueness}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{r.s_board_compat ?? 0}</td>
              </>
            )}
            <td className="py-1 pr-2">
              {r.ever_published ? (
                <Badge variant="outline" className="text-[10px]">published ×{r.times_published}</Badge>
              ) : (
                <Badge className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/30">untapped</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}