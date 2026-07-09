import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCcw, Rocket, Target, Sparkles } from "lucide-react";

type WaveRow = {
  wave_rank: number;
  product_id: string;
  product_slug: string | null;
  product_name: string;
  category: string | null;
  price: number;
  margin: number;
  image_url: string | null;
  image_count: number;
  ever_published: boolean;
  times_published: number;
  s_category_headroom: number;
  s_margin: number;
  s_board_compat: number | null;
  pinterest_potential_score: number;
  pinterest_class: string;
  n_margin: number;
  n_untapped: number;
  n_headroom: number;
  n_board: number;
  n_potential: number;
  wave_score: number;
  wave_bucket:
    | "Wave 2 — Priority Untapped"
    | "Wave 2 — Untapped"
    | "Wave 3 — Untapped"
    | "Wave 3 — Boost"
    | "Backlog";
};

const bucketColors: Record<WaveRow["wave_bucket"], string> = {
  "Wave 2 — Priority Untapped": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "Wave 2 — Untapped": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Wave 3 — Untapped": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Wave 3 — Boost": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Backlog: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

function BucketPill({ b }: { b: WaveRow["wave_bucket"] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${bucketColors[b] ?? bucketColors.Backlog}`}>
      {b}
    </span>
  );
}

function Bar({ value, hint }: { value: number; hint: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2" title={hint}>
      <div className="h-1.5 w-16 rounded bg-slate-700/60 overflow-hidden">
        <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{pct}</span>
    </div>
  );
}

// Enforce ≤ capPerCat products of the same category within any window of `windowSize`.
function diversify(rows: WaveRow[], size: number, windowSize = 6, capPerCat = 2): WaveRow[] {
  const sorted = [...rows].sort((a, b) => a.wave_rank - b.wave_rank);
  const out: WaveRow[] = [];
  const pool = [...sorted];
  while (out.length < size && pool.length) {
    const windowStart = Math.max(0, out.length - windowSize + 1);
    const counts: Record<string, number> = {};
    for (const r of out.slice(windowStart)) {
      const k = r.category ?? "—";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const idx = pool.findIndex((r) => (counts[r.category ?? "—"] ?? 0) < capPerCat);
    if (idx === -1) {
      out.push(pool.shift()!);
    } else {
      out.push(pool.splice(idx, 1)[0]);
    }
  }
  return out;
}

export default function PinterestWaveOpportunity() {
  const [rows, setRows] = useState<WaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<"all" | WaveRow["wave_bucket"]>("all");
  const [onlyUntapped, setOnlyUntapped] = useState(true);
  const [minMargin, setMinMargin] = useState(0);
  const [waveSize, setWaveSize] = useState(20);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("v_pinterest_wave_opportunity" as any)
      .select("*")
      .order("wave_rank", { ascending: true })
      .limit(500);
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as WaveRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (onlyUntapped && r.ever_published) return false;
      if (bucket !== "all" && r.wave_bucket !== bucket) return false;
      if (minMargin > 0 && (r.margin ?? 0) < minMargin) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = `${r.product_name} ${r.category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, onlyUntapped, bucket, minMargin, query]);

  const nextWave = useMemo(() => diversify(filtered, waveSize), [filtered, waveSize]);

  const summary = useMemo(() => {
    const untapped = rows.filter((r) => !r.ever_published);
    const priority = rows.filter((r) => r.wave_bucket === "Wave 2 — Priority Untapped");
    const heroes = rows.filter((r) => r.pinterest_class === "Pinterest Hero" && !r.ever_published);
    const avgMargin =
      nextWave.length === 0 ? 0 : nextWave.reduce((s, r) => s + Number(r.margin || 0), 0) / nextWave.length;
    const avgScore =
      nextWave.length === 0 ? 0 : nextWave.reduce((s, r) => s + Number(r.wave_score || 0), 0) / nextWave.length;
    const cats = new Set(nextWave.map((r) => r.category ?? "—")).size;
    return {
      total: rows.length,
      untapped: untapped.length,
      priority: priority.length,
      untappedHeroes: heroes.length,
      avgMargin,
      avgScore,
      cats,
    };
  }, [rows, nextWave]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Helmet>
        <title>Pinterest Wave Opportunity Engine</title>
        <meta
          name="description"
          content="Ranks never-promoted and high-margin products for the next Pinterest publishing wave."
        />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Pinterest Wave Opportunity Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Reads <code className="text-xs">v_pinterest_wave_opportunity</code>. Same inputs as Catalog Intelligence,
            reweighted for the next wave: margin 30% · untapped 25% · headroom 15% · board 15% · potential 15%.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </header>

      {err && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 text-sm text-red-300">{err}</CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Products scored", value: summary.total },
          { label: "Untapped", value: summary.untapped },
          { label: "Priority untapped", value: summary.priority },
          { label: "Untapped heroes", value: summary.untappedHeroes },
          { label: "Wave avg margin", value: `$${summary.avgMargin.toFixed(0)}` },
          { label: "Wave avg score", value: summary.avgScore.toFixed(1) },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="text-lg font-semibold tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search product or category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-56"
          />
          <select
            className="h-8 rounded border bg-background text-sm px-2"
            value={bucket}
            onChange={(e) => setBucket(e.target.value as any)}
          >
            <option value="all">All buckets</option>
            <option value="Wave 2 — Priority Untapped">Wave 2 — Priority Untapped</option>
            <option value="Wave 2 — Untapped">Wave 2 — Untapped</option>
            <option value="Wave 3 — Untapped">Wave 3 — Untapped</option>
            <option value="Wave 3 — Boost">Wave 3 — Boost</option>
            <option value="Backlog">Backlog</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyUntapped}
              onChange={(e) => setOnlyUntapped(e.target.checked)}
            />
            Only never-promoted
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Min margin $
            <Input
              type="number"
              value={minMargin}
              onChange={(e) => setMinMargin(Number(e.target.value) || 0)}
              className="h-7 w-20"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Wave size
            <Input
              type="number"
              value={waveSize}
              onChange={(e) => setWaveSize(Math.max(1, Math.min(60, Number(e.target.value) || 20)))}
              className="h-7 w-16"
            />
          </label>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} matching · showing top {nextWave.length} diversified
          </div>
        </CardContent>
      </Card>

      {/* Recommended next wave */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Recommended next wave (diversified, ≤2 per category per rolling 6)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-10">#</th>
                  <th className="text-left px-3 py-2">Product</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-right px-3 py-2">Margin</th>
                  <th className="text-left px-3 py-2">Margin·30%</th>
                  <th className="text-left px-3 py-2">Untapped·25%</th>
                  <th className="text-left px-3 py-2">Headroom·15%</th>
                  <th className="text-left px-3 py-2">Board·15%</th>
                  <th className="text-left px-3 py-2">Potential·15%</th>
                  <th className="text-right px-3 py-2">Wave</th>
                  <th className="text-left px-3 py-2">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading &&
                  nextWave.map((r, i) => (
                    <tr key={r.product_id} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {r.image_url && (
                            <img
                              src={r.image_url}
                              alt=""
                              className="h-8 w-8 rounded object-cover border border-border/60"
                              loading="lazy"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="truncate max-w-[320px]" title={r.product_name}>
                              {r.product_name}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {!r.ever_published && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                  <Sparkles className="h-3 w-3 mr-0.5" />
                                  never promoted
                                </Badge>
                              )}
                              <span>potential {r.pinterest_potential_score}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.category ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${Number(r.price).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${Number(r.margin).toFixed(0)}</td>
                      <td className="px-3 py-2"><Bar value={r.n_margin} hint={`margin ${r.margin}`} /></td>
                      <td className="px-3 py-2"><Bar value={r.n_untapped} hint={r.ever_published ? "already promoted" : "never promoted"} /></td>
                      <td className="px-3 py-2"><Bar value={r.n_headroom} hint={`category headroom ${r.s_category_headroom}`} /></td>
                      <td className="px-3 py-2"><Bar value={r.n_board} hint={`board compat ${r.s_board_compat ?? 0}`} /></td>
                      <td className="px-3 py-2"><Bar value={r.n_potential} hint={`potential ${r.pinterest_potential_score}`} /></td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.wave_score}</td>
                      <td className="px-3 py-2"><BucketPill b={r.wave_bucket} /></td>
                    </tr>
                  ))}
                {!loading && nextWave.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-muted-foreground">
                      No products match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Read-only view. No writes to queues, publisher, PCIE2, Guardian, or analytics. Ranking derives from
        <code className="mx-1">v_pinterest_product_potential</code>.
      </p>
    </div>
  );
}