import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Loader2, RefreshCw, TrendingUp, Activity, Shield,
  Layers, Package, DollarSign,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type Metrics = {
  generated_at: string;
  publishing: { queued: number; publishing: number; postedToday: number; posted7d: number; governorBlocked: number; failed: number };
  performance: { impressions: number; outboundClicks: number; saves: number; ctr: number; saveRate: number };
  diversity: { boardDiversity: number; topBoardShare: number; top3BoardShare: number; duplicateDensity: number; totalActivePins: number; uniqueBoards: number; slugsAboveCap: number };
  governor: Record<string, number>;
  coverage: { zero: number; low: number; healthy: number; aboveCap: number; totalProducts: number };
  revenue: { topProducts: { key: string; clicks: number }[]; topBoards: { key: string; clicks: number }[]; topHeadlines: { key: string; clicks: number }[]; topOverlays: { key: string; clicks: number }[] };
  nextQueue: { id: string; product_slug: string | null; board_id: string | null; scheduled_at: string | null; status: string }[];
  alerts: { level: "red" | "amber"; code: string; message: string }[];
  trend: { date: string; posted: number; impressions: number; clicks: number; ctr: number; boardDiversity: number; duplicateDensity: number }[];
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
    </div>
  );
}

function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtNum(n: number) { return new Intl.NumberFormat().format(n); }

export default function PinterestOpsDashboardPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = async () => {
    try {
      setErr(null);
      const { data: res, error } = await supabase.functions.invoke("pinterest-ops-dashboard");
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Failed");
      setData(res.metrics as Metrics);
      setLastFetch(new Date());
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Pinterest Ops…
      </div>
    );
  }

  if (err && !data) {
    return <div className="p-6 text-sm text-destructive">Error: {err}</div>;
  }

  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Pinterest Ops Dashboard — Admin</title></Helmet>

      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" /> Pinterest Operations
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-refreshes every 5 minutes. {lastFetch ? `Last update ${lastFetch.toLocaleTimeString()}` : ""}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a) => (
            <div
              key={a.code}
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-medium">{a.message}</span>
              <Badge variant="destructive" className="ml-auto">{a.code}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Publishing */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Publishing</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Queued" value={fmtNum(data.publishing.queued)} />
          <Stat label="Publishing" value={fmtNum(data.publishing.publishing)} />
          <Stat label="Posted today" value={fmtNum(data.publishing.postedToday)} />
          <Stat label="Posted 7d" value={fmtNum(data.publishing.posted7d)} />
          <Stat label="Governor blocked (24h)" value={fmtNum(data.publishing.governorBlocked)} />
          <Stat label="Failed" value={fmtNum(data.publishing.failed)} />
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Performance (7d)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Impressions" value={fmtNum(data.performance.impressions)} />
          <Stat label="Outbound clicks" value={fmtNum(data.performance.outboundClicks)} />
          <Stat label="Saves" value={fmtNum(data.performance.saves)} />
          <Stat label="CTR" value={fmtPct(data.performance.ctr)} />
          <Stat label="Save rate" value={fmtPct(data.performance.saveRate)} />
        </CardContent>
      </Card>

      {/* Diversity */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Diversity</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Board diversity" value={fmtPct(data.diversity.boardDiversity)} sub={`${data.diversity.uniqueBoards} boards`} />
          <Stat label="Top board share" value={fmtPct(data.diversity.topBoardShare)} sub={`Top-3 ${fmtPct(data.diversity.top3BoardShare)}`} />
          <Stat label="Active pins" value={fmtNum(data.diversity.totalActivePins)} sub="last 30d" />
          <Stat label="Duplicate density" value={fmtPct(data.diversity.duplicateDensity)} sub={`${data.diversity.slugsAboveCap} slugs > 8`} />
        </CardContent>
      </Card>

      {/* Governor */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Governor (last 24h)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Stat label="Banned phrase" value={data.governor.banned_phrase ?? 0} />
          <Stat label="Dup headline" value={data.governor.duplicate_headline ?? 0} />
          <Stat label="Dup overlay" value={data.governor.duplicate_overlay ?? 0} />
          <Stat label="Dup CTA" value={data.governor.duplicate_cta ?? 0} />
          <Stat label="Dup image" value={data.governor.duplicate_image ?? 0} />
          <Stat label="Board cap" value={data.governor.board_cap ?? 0} />
          <Stat label="Slug cap" value={data.governor.slug_cap ?? 0} />
          <Stat label="Mismatch / other" value={(data.governor.category_mismatch ?? 0) + (data.governor.other ?? 0)} />
        </CardContent>
      </Card>

      {/* Coverage */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Product coverage</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="0 pins" value={fmtNum(data.coverage.zero)} sub="needs seeding" />
          <Stat label="1–2 pins" value={fmtNum(data.coverage.low)} sub="under-served" />
          <Stat label="3–8 pins" value={fmtNum(data.coverage.healthy)} sub="healthy" />
          <Stat label="Above cap (>8)" value={fmtNum(data.coverage.aboveCap)} sub="cleanup target" />
        </CardContent>
      </Card>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">7-day trend</CardTitle></CardHeader>
        <CardContent>
          {data.trend.length === 0 ? (
            <div className="text-sm text-muted-foreground">Snapshots will appear after the first daily run (06:15 UTC).</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="posted" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="boardDiversity" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="duplicateDensity" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue / top performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueList title="Top products by clicks" icon={<DollarSign className="h-4 w-4" />} rows={data.revenue.topProducts} />
        <RevenueList title="Top boards by clicks" rows={data.revenue.topBoards} />
        <RevenueList title="Top headlines (hook)" rows={data.revenue.topHeadlines} />
        <RevenueList title="Top overlays (copy)" rows={data.revenue.topOverlays} />
      </div>

      {/* Next 20 queue */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Next 20 in queue</CardTitle></CardHeader>
        <CardContent>
          {data.nextQueue.length === 0 ? (
            <div className="text-sm text-muted-foreground">Queue is empty.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Scheduled</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Board</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.nextQueue.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.product_slug || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.board_id?.slice(0, 12) || "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.status === "publishing" ? "default" : "secondary"}>{r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueList({ title, rows, icon }: { title: string; rows: { key: string; clicks: number }[]; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-mono text-xs">{r.key}</span>
                <span className="text-muted-foreground tabular-nums">{fmtNum(r.clicks)} clicks</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}