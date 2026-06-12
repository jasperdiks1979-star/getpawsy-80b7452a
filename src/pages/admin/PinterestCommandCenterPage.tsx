import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Download, ExternalLink, AlertTriangle } from "lucide-react";
import { downloadCsv } from "@/lib/lpFunnelExport";

type RangeKey = "today" | "7d" | "30d" | "custom";

type Drill = {
  key: string;
  impressions: number;
  clicks: number;
  saves: number;
  pins: number;
  ctr: number;
  saveRate: number;
  revenue: number;
};

type Metrics = any;

/* ---------- helpers ---------- */
const fmtInt = (n: number) => Number(n ?? 0).toLocaleString();
const fmtPct = (n: number) => `${(Number(n ?? 0)).toFixed(2)}%`;
const fmtUsd = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function exportCsv(name: string, rows: Record<string, unknown>[]) {
  const csv = rowsToCsv(rows);
  const today = new Date().toISOString().slice(0, 10);
  downloadCsv(csv, `${name}_${today}.csv`);
}

/* ---------- KPI strip ---------- */
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DrilldownTable({
  rows,
  keyLabel,
  linkBase,
  exportName,
}: {
  rows: Drill[];
  keyLabel: string;
  linkBase?: (key: string) => string | null;
  exportName: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
          <div className="font-semibold">{keyLabel}</div>
          <Button size="sm" variant="outline" onClick={() => exportCsv(exportName, rows as any)}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="p-2">#</th>
                <th className="p-2">{keyLabel}</th>
                <th className="p-2 text-right">Pins</th>
                <th className="p-2 text-right">Impr</th>
                <th className="p-2 text-right">Clicks</th>
                <th className="p-2 text-right">Saves</th>
                <th className="p-2 text-right">CTR</th>
                <th className="p-2 text-right">Save %</th>
                <th className="p-2 text-right">Est. Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No data in range.</td></tr>
              ) : rows.map((r, i) => {
                const href = linkBase?.(r.key) || null;
                return (
                  <tr key={r.key} className="border-t">
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2 max-w-[280px] truncate">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                          {r.key} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : r.key}
                    </td>
                    <td className="p-2 text-right">{fmtInt(r.pins)}</td>
                    <td className="p-2 text-right">{fmtInt(r.impressions)}</td>
                    <td className="p-2 text-right">{fmtInt(r.clicks)}</td>
                    <td className="p-2 text-right">{fmtInt(r.saves)}</td>
                    <td className="p-2 text-right">{fmtPct(r.ctr)}</td>
                    <td className="p-2 text-right">{fmtPct(r.saveRate)}</td>
                    <td className="p-2 text-right">{fmtUsd(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Main page ---------- */
export default function PinterestCommandCenterPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params: Record<string, string> = { range };
      if (range === "custom") {
        if (from) params.from = from;
        if (to) params.to = to;
      }
      const qs = new URLSearchParams(params).toString();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-ops-dashboard?${qs}`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      setData(json.metrics);
      setLastFetch(new Date());
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000); // 5 min refresh
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to]);

  const dd = data?.drilldowns;
  const products: Drill[] = dd?.products ?? [];
  const boards: Drill[] = dd?.boards ?? [];
  const categories: Drill[] = dd?.categories ?? [];
  const headlines: Drill[] = dd?.headlines ?? [];
  const overlays: Drill[] = dd?.overlays ?? [];
  const ctas: Drill[] = dd?.ctas ?? [];
  const combos: Drill[] = dd?.combos ?? [];
  const gov = data?.governor ?? {};
  const cov = data?.coverage ?? {};
  const opp = data?.opportunities ?? {};
  const alerts: any[] = data?.alerts ?? [];

  const topProduct = products[0]?.key ?? "—";
  const topBoard = boards[0]?.key ?? "—";
  const topCreative = headlines[0]?.key ?? "—";

  const productLink = (slug: string) => `/products/${slug}`;

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Pinterest Revenue Command Center — Admin</title></Helmet>

      {/* Header + range picker */}
      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Revenue Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Drilldowns, opportunity finder, governor analytics. Auto-refreshes every 5 minutes.
            {lastFetch && <span> Last: {lastFetch.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {(["today", "7d", "30d", "custom"] as RangeKey[]).map((r) => (
            <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>
              {r === "today" ? "Today" : r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "Custom"}
            </Button>
          ))}
          {range === "custom" && (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </>
          )}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {err && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>
      )}

      {/* Attribution mode warning — Pinterest hasn't granted pin_edit access. */}
      <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium">Attribution mode: hybrid.</span>{" "}
          Historical pins use <strong>slug-based attribution</strong> (utm_content → most-recent posted pin)
          because Pinterest has not granted <code>pin_edit</code> access. New pins use the real{" "}
          <code>pin_id</code> when carried on the destination URL. Board / creative joins resolve via{" "}
          <code>pinterest_pin_queue</code> in both paths.
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`rounded border p-3 text-sm flex items-center gap-2 ${a.level === "red" ? "border-destructive/40 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10"}`}>
              <AlertTriangle className="h-4 w-4" /> <span className="font-medium">{a.code}</span> — {a.message}
            </div>
          ))}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Kpi label="Pinterest Revenue" value={fmtUsd(data?.performance?.estimatedRevenue ?? 0)} sub={`@ $${data?.range?.revenuePerClick ?? 0}/click`} />
        <Kpi label="Pinterest Clicks" value={fmtInt(data?.performance?.outboundClicks ?? 0)} />
        <Kpi label="Pinterest CTR" value={fmtPct(data?.performance?.ctr ?? 0)} />
        <Kpi label="Impressions" value={fmtInt(data?.performance?.impressions ?? 0)} />
        <Kpi label="Top Product" value={topProduct.length > 18 ? topProduct.slice(0, 18) + "…" : topProduct} sub={`${fmtInt(products[0]?.clicks ?? 0)} clicks`} />
        <Kpi label="Top Board" value={topBoard.length > 18 ? topBoard.slice(0, 18) + "…" : topBoard} sub={`${fmtInt(boards[0]?.clicks ?? 0)} clicks`} />
        <Kpi label="Top Creative" value={topCreative.length > 18 ? topCreative.slice(0, 18) + "…" : topCreative} sub={`${fmtInt(headlines[0]?.clicks ?? 0)} clicks`} />
        <Kpi label="Governor Blocks (24h)" value={fmtInt(data?.publishing?.governorBlocked ?? 0)} sub={`Products w/o pins: ${fmtInt(cov.zero ?? 0)}`} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="boards">Boards</TabsTrigger>
          <TabsTrigger value="creatives">Creatives</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="governor">Governor</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <DrilldownTable
            rows={products}
            keyLabel="Product slug"
            linkBase={productLink}
            exportName="pinterest_product_performance"
          />
        </TabsContent>

        <TabsContent value="boards" className="space-y-4">
          <DrilldownTable rows={boards} keyLabel="Board ID" exportName="pinterest_board_performance" />
          <Card>
            <CardContent className="p-4 text-xs text-muted-foreground">
              Per-board top products & headlines are derived per pin via dimensions — open a board in Pinterest for full detail.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="creatives" className="space-y-4">
          <DrilldownTable rows={headlines} keyLabel="Headline / hook" exportName="pinterest_headline_ranking" />
          <DrilldownTable rows={overlays} keyLabel="Overlay" exportName="pinterest_overlay_ranking" />
          <DrilldownTable rows={ctas} keyLabel="CTA" exportName="pinterest_cta_ranking" />
          <DrilldownTable rows={combos} keyLabel="Winning combination (hook | overlay | cta)" exportName="pinterest_winning_combinations" />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Kpi label="Estimated Revenue" value={fmtUsd(data?.performance?.estimatedRevenue ?? 0)} />
            <Kpi label="Revenue / Pin" value={fmtUsd(data?.performance?.revenuePerPin ?? 0)} />
            <Kpi label="Revenue / Click rate" value={fmtUsd(data?.range?.revenuePerClick ?? 0)} sub="Configurable via PINTEREST_REVENUE_PER_CLICK" />
          </div>
          <DrilldownTable rows={products} keyLabel="Revenue by product" linkBase={productLink} exportName="pinterest_revenue_by_product" />
          <DrilldownTable rows={boards} keyLabel="Revenue by board" exportName="pinterest_revenue_by_board" />
          <DrilldownTable rows={categories} keyLabel="Revenue by category" exportName="pinterest_revenue_by_category" />
        </TabsContent>

        <TabsContent value="coverage" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="0 pins" value={fmtInt(cov.zero)} />
            <Kpi label="1-2 pins" value={fmtInt(cov.low)} />
            <Kpi label="3-8 pins (healthy)" value={fmtInt(cov.healthy)} />
            <Kpi label=">8 pins (above cap)" value={fmtInt(cov.aboveCap)} />
            <Kpi label="Products w/ revenue" value={fmtInt(cov.productsWithRevenue)} sub={`${fmtInt(cov.productsWithClicks)} with clicks`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["zero", "low", "aboveCap"] as const).map((bucket) => {
              const list: string[] = cov.detail?.[bucket] ?? [];
              const label = bucket === "zero" ? "Products with 0 pins" : bucket === "low" ? "Products with 1-2 pins" : "Products above cap (>8)";
              return (
                <Card key={bucket}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
                      <div className="font-semibold text-sm">{label} <Badge variant="secondary" className="ml-2">{list.length}</Badge></div>
                      <Button size="sm" variant="outline" onClick={() => exportCsv(`coverage_${bucket}`, list.map((slug) => ({ slug })))}>
                        <Download className="h-3.5 w-3.5 mr-1" /> CSV
                      </Button>
                    </div>
                    <div className="max-h-72 overflow-auto text-xs font-mono p-3 space-y-1">
                      {list.slice(0, 200).map((s) => (
                        <a key={s} href={productLink(s)} target="_blank" rel="noreferrer" className="block hover:underline">{s}</a>
                      ))}
                      {list.length > 200 && <div className="text-muted-foreground">+{list.length - 200} more — export CSV</div>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="governor" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Slug cap" value={fmtInt(gov.slug_cap)} />
            <Kpi label="Board cap" value={fmtInt(gov.board_cap)} />
            <Kpi label="Duplicate headline" value={fmtInt(gov.duplicate_headline)} />
            <Kpi label="Duplicate overlay" value={fmtInt(gov.duplicate_overlay)} />
            <Kpi label="Duplicate CTA" value={fmtInt(gov.duplicate_cta)} />
            <Kpi label="Duplicate image" value={fmtInt(gov.duplicate_image)} />
            <Kpi label="Banned phrase" value={fmtInt(gov.banned_phrase)} />
            <Kpi label="Category mismatch" value={fmtInt(gov.category_mismatch)} />
          </div>
          <Card>
            <CardContent className="p-4 text-xs text-muted-foreground">
              Window: rolling 24 hours. "Other" bucket: {fmtInt(gov.other)}.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-4">
          <DrilldownTable rows={opp.highCtrLowPins ?? []} keyLabel="High CTR + ≤2 pins (scale up)" linkBase={productLink} exportName="opp_high_ctr_low_pins" />
          <DrilldownTable rows={opp.highSavesLowImpressions ?? []} keyLabel="High saves + low impressions (boost)" linkBase={productLink} exportName="opp_high_saves_low_impr" />
          <DrilldownTable rows={opp.clicksNoExpansion ?? []} keyLabel="Clicks but no expansion (<4 pins)" linkBase={productLink} exportName="opp_clicks_no_expansion" />
          <DrilldownTable rows={opp.revenueLimitedCoverage ?? []} keyLabel="Revenue + limited coverage (<6 pins)" linkBase={productLink} exportName="opp_revenue_limited_coverage" />
        </TabsContent>
      </Tabs>
    </div>
  );
}