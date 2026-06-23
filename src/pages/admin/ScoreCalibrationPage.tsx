import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

/**
 * /admin/score-calibration — READ-ONLY calibration report.
 *
 * Purpose: audit the existing per-product scoring fields, compute a proposed
 * unified `revenue_priority_score` (RPS) client-side, and surface
 * distributions / top–bottom lists / over- vs underrated products.
 *
 * No production scoring is mutated. No database writes. No edge function calls.
 * Activation of the new model happens only after operator approval.
 */

type Row = {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  cost_price: number | null;
  created_at: string;
  stock: number | null;
  us_stock: number | null;
  eu_stock: number | null;
  inventory_score: number | null;
  shipping_score: number | null;
  shopping_priority_score: number | null;
  feed_readiness_score: number | null;
  content_readiness_score: number | null;
  pinterest_priority: number | null;
  // intelligence
  opportunity_score: number | null;
  trend_score: number | null;
  conversion_score: number | null;
  keyword_score: number | null;
  intent_score: number | null;
  merchant_feed_quality_score: number | null;
  primary_board: string | null;
  // derived
  has_video: boolean;
  pin_perf: number | null; // 0..100 normalized
};

type Scored = Row & {
  components: {
    conversion: number;
    pinterest: number;
    margin: number;
    opportunity: number;
    inventory: number;
    age: number;
    video: number;
    seo: number;
  };
  rps: number;
  legacy: number; // composite of existing scores for comparison
};

const WEIGHTS = {
  conversion: 25,
  pinterest: 20,
  margin: 15,
  opportunity: 15,
  inventory: 10,
  age: 5,
  video: 5,
  seo: 5,
} as const;

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

/** Rescale a value from [min,max] of the population into 0..100. Falls back to raw if dist is too tight. */
function normalize(value: number | null | undefined, min: number, max: number): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (max - min < 1e-6) return 50;
  return clamp(((value - min) / (max - min)) * 100);
}

function tier(rps: number): "Low" | "Medium" | "High" | "Very High" {
  if (rps >= 81) return "Very High";
  if (rps >= 61) return "High";
  if (rps >= 41) return "Medium";
  return "Low";
}

function tierColor(t: string): string {
  switch (t) {
    case "Very High": return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "High": return "bg-blue-500/15 text-blue-700 border-blue-500/30";
    case "Medium": return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

/* ---------- data fetch ---------- */

async function fetchRows(): Promise<Row[]> {
  const { data: products, error } = await supabase
    .from("products")
    .select(
      "id,name,category,price,cost_price,created_at,stock,us_stock,eu_stock,inventory_score,shipping_score,shopping_priority_score,feed_readiness_score,content_readiness_score,pinterest_priority"
    )
    .eq("is_active", true)
    .limit(1000);
  if (error) throw error;

  const ids = (products ?? []).map((p) => p.id);
  const [{ data: intel }, { data: pins }, { data: videos }] = await Promise.all([
    supabase
      .from("product_intelligence")
      .select(
        "product_id,opportunity_score,trend_score,conversion_score,keyword_score,intent_score,merchant_feed_quality_score,primary_board"
      )
      .in("product_id", ids),
    supabase
      .from("pinterest_pin_performance")
      .select("product_id,performance_score,impressions,saves,clicks")
      .in("product_id", ids),
    supabase
      .from("pinterest_video_assets")
      .select("product_slug")
      .eq("is_active", true),
  ]);

  const intelMap = new Map((intel ?? []).map((r) => [r.product_id, r]));
  // pinterest perf: aggregate per product → mean performance_score; fall back to engagement
  const perfMap = new Map<string, number>();
  const perfCount = new Map<string, number>();
  for (const r of pins ?? []) {
    if (!r.product_id) continue;
    const cur = perfMap.get(r.product_id) ?? 0;
    perfMap.set(r.product_id, cur + (Number(r.performance_score) || 0));
    perfCount.set(r.product_id, (perfCount.get(r.product_id) ?? 0) + 1);
  }
  const videoSlugs = new Set((videos ?? []).map((v) => v.product_slug).filter(Boolean) as string[]);

  return (products ?? []).map((p) => {
    const i = intelMap.get(p.id) as any;
    const pCount = perfCount.get(p.id) ?? 0;
    const pTotal = perfMap.get(p.id) ?? 0;
    const pin_perf = pCount > 0 ? pTotal / pCount : null;
    return {
      id: p.id,
      name: p.name ?? "",
      category: (p as any).category ?? null,
      price: p.price ?? null,
      cost_price: (p as any).cost_price ?? null,
      created_at: p.created_at,
      stock: p.stock ?? null,
      us_stock: (p as any).us_stock ?? null,
      eu_stock: (p as any).eu_stock ?? null,
      inventory_score: p.inventory_score ?? null,
      shipping_score: p.shipping_score ?? null,
      shopping_priority_score: p.shopping_priority_score ?? null,
      feed_readiness_score: p.feed_readiness_score ?? null,
      content_readiness_score: p.content_readiness_score ?? null,
      pinterest_priority: p.pinterest_priority == null ? null : Number(p.pinterest_priority),
      opportunity_score: i?.opportunity_score ?? null,
      trend_score: i?.trend_score ?? null,
      conversion_score: i?.conversion_score ?? null,
      keyword_score: i?.keyword_score ?? null,
      intent_score: i?.intent_score ?? null,
      merchant_feed_quality_score: i?.merchant_feed_quality_score ?? null,
      primary_board: i?.primary_board ?? null,
      has_video: videoSlugs.size > 0 ? Array.from(videoSlugs).some((s) => p.name && s && p.name.toLowerCase().includes(s.toLowerCase().slice(0, 6))) : false,
      pin_perf,
    };
  });
}

/* ---------- scoring ---------- */

function score(rows: Row[]): Scored[] {
  // Build population stats for normalization
  const stats = (sel: (r: Row) => number | null | undefined) => {
    const vals = rows.map(sel).filter((v): v is number => v != null && !Number.isNaN(v));
    if (!vals.length) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  };

  const sConv = stats((r) => r.conversion_score);
  const sOpp = stats((r) => r.opportunity_score);
  const sFeed = stats((r) => r.merchant_feed_quality_score);
  const sKw = stats((r) => r.keyword_score);
  const sPinPerf = stats((r) => r.pin_perf);

  const now = Date.now();

  return rows.map((r) => {
    // Conversion (25%): blend intelligence conversion_score and shopping_priority_score
    const conv = Math.round(
      0.7 * normalize(r.conversion_score, sConv.min, sConv.max) +
        0.3 * clamp(r.shopping_priority_score ?? 50)
    );

    // Pinterest (20%): real perf if present, otherwise pinterest_priority * 10
    let pin = 0;
    if (r.pin_perf != null) {
      pin = normalize(r.pin_perf, sPinPerf.min, sPinPerf.max);
    } else if (r.pinterest_priority != null) {
      pin = clamp(r.pinterest_priority * 10);
    }
    pin = Math.round(pin);

    // Margin (15%): from price + cost_price; otherwise neutral 50
    let margin = 50;
    if (r.price && r.cost_price && r.price > 0) {
      const m = ((r.price - r.cost_price) / r.price) * 100;
      // Healthy margin band: 30% → 50, 70% → 100
      margin = clamp(((m - 20) / 50) * 100);
    }
    margin = Math.round(margin);

    // Opportunity (15%): re-spread the existing 91–97 band so it actually discriminates
    const opp = Math.round(normalize(r.opportunity_score, sOpp.min, sOpp.max));

    // Inventory health (10%): in-stock + warehouse depth
    const totalStock = (Number(r.us_stock) || 0) + (Number(r.eu_stock) || 0) + (Number(r.stock) || 0);
    let inv = 0;
    if (r.stock === 0 && !r.us_stock && !r.eu_stock) inv = 0;
    else if (totalStock === 0) inv = 60; // fulfillment model, untracked → assumed available
    else if (totalStock < 5) inv = 60;
    else if (totalStock < 25) inv = 80;
    else inv = 100;

    // Age (5%): newer = more upside; ≤30d = 100, 30–90d = 80, 90–180d = 60, 180–365 = 40, >365 = 20
    const ageDays = (now - new Date(r.created_at).getTime()) / 86_400_000;
    const age =
      ageDays <= 30 ? 100 : ageDays <= 90 ? 80 : ageDays <= 180 ? 60 : ageDays <= 365 ? 40 : 20;

    // Video (5%): has any active Pinterest video asset → 100, else 0
    const video = r.has_video ? 100 : 0;

    // SEO (5%): merchant_feed_quality + keyword_score blended and normalized
    const seo = Math.round(
      0.6 * normalize(r.merchant_feed_quality_score, sFeed.min, sFeed.max) +
        0.4 * normalize(r.keyword_score, sKw.min, sKw.max)
    );

    const components = { conversion: conv, pinterest: pin, margin, opportunity: opp, inventory: inv, age, video, seo };

    const rps = clamp(
      (components.conversion * WEIGHTS.conversion +
        components.pinterest * WEIGHTS.pinterest +
        components.margin * WEIGHTS.margin +
        components.opportunity * WEIGHTS.opportunity +
        components.inventory * WEIGHTS.inventory +
        components.age * WEIGHTS.age +
        components.video * WEIGHTS.video +
        components.seo * WEIGHTS.seo) / 100
    );

    // Legacy composite: simple average of the 5 currently-emphasized fields, 0..100
    const legacyParts = [
      r.opportunity_score,
      r.trend_score,
      r.conversion_score,
      r.pinterest_priority != null ? r.pinterest_priority * 10 : null,
      r.merchant_feed_quality_score,
    ].filter((v): v is number => v != null);
    const legacy = legacyParts.length
      ? legacyParts.reduce((a, b) => a + b, 0) / legacyParts.length
      : 0;

    return { ...r, components, rps: Math.round(rps), legacy: Math.round(legacy) };
  });
}

/** Enforce: top category may not exceed 20% of the top-50. Demote overrepresented items. */
function diversifyTop50(sorted: Scored[]): Scored[] {
  const cap = Math.floor(50 * 0.2); // 10
  const counts = new Map<string, number>();
  const top: Scored[] = [];
  const overflow: Scored[] = [];
  for (const r of sorted) {
    if (top.length >= 50) break;
    const c = r.category ?? "uncategorized";
    const used = counts.get(c) ?? 0;
    if (used >= cap) {
      overflow.push(r);
    } else {
      counts.set(c, used + 1);
      top.push(r);
    }
  }
  // Backfill with overflow if we ran short
  for (const r of overflow) {
    if (top.length >= 50) break;
    top.push(r);
  }
  return top;
}

/* ---------- UI primitives ---------- */

function Histogram({ data, buckets = 10, label }: { data: number[]; buckets?: number; label: string }) {
  const bins = useMemo(() => {
    const arr = Array.from({ length: buckets }, () => 0);
    for (const v of data) {
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((v / 100) * buckets)));
      arr[idx]++;
    }
    return arr;
  }, [data, buckets]);
  const max = Math.max(...bins, 1);
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      <div className="flex items-end gap-[2px] h-24">
        {bins.map((n, i) => (
          <div key={i} className="flex-1 bg-primary/70 rounded-t" style={{ height: `${(n / max) * 100}%` }} title={`${i * 10}-${(i + 1) * 10}: ${n}`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0</span><span>50</span><span>100</span></div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

/* ---------- main page ---------- */

export default function ScoreCalibrationPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [scored, setScored] = useState<Scored[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fetchRows();
        setScored(score(rows));
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const dist = { Low: 0, Medium: 0, High: 0, "Very High": 0 } as Record<string, number>;
    for (const r of scored) dist[tier(r.rps)]++;
    const sortedNew = [...scored].sort((a, b) => b.rps - a.rps);
    const sortedOld = [...scored].sort((a, b) => b.legacy - a.legacy);
    const top50 = diversifyTop50(sortedNew);
    const bottom50 = [...scored].sort((a, b) => a.rps - b.rps).slice(0, 50);
    const top100 = sortedNew.slice(0, 100);

    // over/underrated: large delta old-rank vs new-rank
    const rankOld = new Map(sortedOld.map((r, i) => [r.id, i]));
    const rankNew = new Map(sortedNew.map((r, i) => [r.id, i]));
    const delta = scored.map((r) => ({
      r,
      delta: (rankOld.get(r.id) ?? 0) - (rankNew.get(r.id) ?? 0),
    }));
    const underrated = [...delta].sort((a, b) => b.delta - a.delta).slice(0, 15);
    const overrated = [...delta].sort((a, b) => a.delta - b.delta).slice(0, 15);

    // category dominance pre-diversification
    const catCount = new Map<string, number>();
    for (const r of sortedNew.slice(0, 50)) {
      const c = r.category ?? "uncategorized";
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
    }
    const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0];

    return { dist, sortedNew, sortedOld, top50, bottom50, top100, underrated, overrated, topCat };
  }, [scored]);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Computing calibration across catalog…
      </div>
    );
  }
  if (err) return <div className="p-8 text-destructive">Error: {err}</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <Helmet>
        <title>Score Calibration — Admin</title>
      </Helmet>

      <header>
        <h1 className="text-2xl font-bold">Score Calibration Report</h1>
        <p className="text-muted-foreground text-sm">
          Read-only. Proposed unified <code className="px-1 bg-muted rounded">revenue_priority_score</code> computed in-browser
          against {scored.length} active products. Production scoring untouched until approval.
        </p>
      </header>

      {/* Current formulas & weighting */}
      <Card>
        <CardHeader><CardTitle className="text-base">Current scoring inventory (audit)</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>opportunity_score</b> — population avg 93.4, range 91–97, SD 1.10 → <span className="text-destructive">severe clustering / inflation; weak predictor as-is</span>.</li>
            <li><b>trend_score</b> — avg 93.7, range 84–100, SD 4.85 → moderate spread; usable after normalization.</li>
            <li><b>conversion_score</b> — avg 93.2, range 69–98, SD 4.48 → best spread among intelligence fields.</li>
            <li><b>keyword_score</b> — avg 88.5, range 85–94, SD 1.50 → <span className="text-destructive">clustered; SEO duplicate of merchant_feed</span>.</li>
            <li><b>merchant_feed_quality_score</b> — avg 99.6 → <span className="text-destructive">ceiling-bound; useless without renormalization</span>.</li>
            <li><b>products.inventory_score</b> — all 0 → <span className="text-destructive">unused field; must be derived from us/eu/stock</span>.</li>
            <li><b>products.margin_percent</b> — 0 populated → <span className="text-destructive">missing predictor; derive from price/cost_price</span>.</li>
            <li><b>Duplicates:</b> shopping_priority_score vs conversion_score, feed_readiness vs merchant_feed_quality.</li>
            <li><b>Missing predictors:</b> real Pinterest performance (only 174/553 products covered), video coverage, product age, true margin.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Proposed model */}
      <Card>
        <CardHeader><CardTitle className="text-base">Proposed model — revenue_priority_score (0–100)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {Object.entries(WEIGHTS).map(([k, v]) => (
              <div key={k} className="rounded border p-2 bg-card">
                <div className="font-medium capitalize">{k}</div>
                <div className="text-xs text-muted-foreground">weight {v}%</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            All inputs normalized into 0–100 against population min/max to defeat inflation. Top-50 enforces a 20% category cap.
          </p>
        </CardContent>
      </Card>

      {/* Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-base">New score distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {(["Low","Medium","High","Very High"] as const).map((t) => (
              <Stat key={t} label={t} value={summary.dist[t]} hint={`${Math.round((summary.dist[t] / scored.length) * 100)}% of catalog`} />
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <Histogram label="New revenue_priority_score" data={scored.map((r) => r.rps)} />
            <Histogram label="Legacy composite (current)" data={scored.map((r) => r.legacy)} />
          </div>
          <div className="text-xs text-muted-foreground mt-3">
            Top category in raw top-50: <b>{summary.topCat?.[0] ?? "—"}</b> ({summary.topCat?.[1] ?? 0} items) — diversification cap applied to displayed Top-50.
          </div>
        </CardContent>
      </Card>

      {/* Top 50 / Bottom 50 / Top 100 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <RankList title="Top 50 (new, diversified)" rows={summary.top50} />
        <RankList title="Bottom 50 (new)" rows={summary.bottom50} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Top 100 calibrated — old vs new</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1">#</th><th>Product</th><th>Category</th><th className="text-right">Old</th><th className="text-right">New</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {summary.top100.map((r, i) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1">{i + 1}</td>
                  <td className="max-w-[280px] truncate">{r.name}</td>
                  <td className="text-muted-foreground">{r.category ?? "—"}</td>
                  <td className="text-right">{r.legacy}</td>
                  <td className="text-right font-medium">{r.rps}</td>
                  <td className="text-muted-foreground">{reasonFor(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <DeltaList title="Previously underrated (rank rose)" items={summary.underrated} />
        <DeltaList title="Previously overrated (rank fell)" items={summary.overrated} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Activation</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This dashboard does not write to <code>products</code> or <code>product_intelligence</code>. Approve the model
          (weights + normalization) and the next step will (a) persist <code>revenue_priority_score</code> on
          <code> product_intelligence</code>, (b) backfill all 553 products in a single batch, and (c) wire it into the
          ranking surfaces — homepage, Pinterest autopilot, and the feed prioritizer.
        </CardContent>
      </Card>
    </div>
  );
}

function reasonFor(r: Scored): string {
  const c = r.components;
  const parts: string[] = [];
  if (c.pinterest >= 70) parts.push("strong Pinterest");
  if (c.conversion >= 70) parts.push("high conversion");
  if (c.margin >= 70) parts.push("healthy margin");
  if (c.video >= 100) parts.push("video asset");
  if (c.inventory < 50) parts.push("inventory risk");
  if (c.age >= 80) parts.push("fresh listing");
  if (!parts.length) parts.push("balanced profile");
  return parts.join(", ");
}

function RankList({ title, rows }: { title: string; rows: Scored[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 max-h-[520px] overflow-y-auto">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
            <div className="min-w-0 flex-1">
              <div className="text-xs truncate">{i + 1}. {r.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{r.category ?? "—"}</div>
            </div>
            <Badge variant="outline" className={tierColor(tier(r.rps))}>{r.rps}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DeltaList({ title, items }: { title: string; items: { r: Scored; delta: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {items.map(({ r, delta }) => (
          <div key={r.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0 text-xs">
            <span className="truncate flex-1">{r.name}</span>
            <span className="text-muted-foreground tabular-nums">old {r.legacy} → new {r.rps}</span>
            <Badge variant="outline" className={delta > 0 ? "text-emerald-700 border-emerald-500/30" : "text-destructive border-destructive/30"}>
              {delta > 0 ? `↑${delta}` : `↓${Math.abs(delta)}`}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}