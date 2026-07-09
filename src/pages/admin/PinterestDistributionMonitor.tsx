import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, Activity } from "lucide-react";

type PinRow = {
  queue_id: string;
  pin_id: string;
  product_id: string;
  product_slug: string | null;
  product_name: string | null;
  product_category: string | null;
  board_id: string | null;
  board_name: string | null;
  category: string | null;
  headline: string | null;
  image_url: string | null;
  published_at: string;
  age_hours: number;
  impressions_total: number;
  saves_total: number;
  outbound_total: number;
  pin_clicks_total: number;
  ctr_latest: number;
  impressions_24h: number;
  impressions_72h: number;
  impressions_7d: number;
  saves_24h: number;
  saves_7d: number;
  outbound_24h: number;
  outbound_7d: number;
  pin_clicks_7d: number;
  ctr_7d_pct: number;
  save_rate_7d_pct: number;
  impression_velocity_hr: number;
  save_velocity_hr: number;
  click_velocity_hr: number;
  engagement_score: number;
  distribution_status:
    | "NEW"
    | "INDEXING"
    | "DISTRIBUTING"
    | "GROWING"
    | "VIRAL"
    | "STALLED"
    | "DORMANT";
  flags: string[] | null;
};

type Health = {
  pins_total: number;
  pins_new: number;
  pins_indexing: number;
  pins_distributing: number;
  pins_growing: number;
  pins_viral: number;
  pins_stalled: number;
  pins_dormant: number;
  mature_pins: number;
  mature_with_imps: number;
  median_ctr_7d_pct: number | null;
  account_avg_ctr_pct: number | null;
  published_7d: number;
  enterprise_health_score: number;
};

type Rollup = {
  pins: number;
  impressions_7d: number;
  saves_7d: number;
  outbound_7d: number;
  avg_ctr_7d_pct: number | null;
  avg_engagement_score: number | null;
  underperforming_pins: number;
  winning_pins: number;
};
type BoardRollup = Rollup & { board_id: string | null; board_name: string | null };
type ProductRollup = Rollup & {
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
};
type CategoryRollup = Rollup & { category: string };

const statusStyles: Record<PinRow["distribution_status"], string> = {
  NEW: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  INDEXING: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  DISTRIBUTING: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  GROWING: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  VIRAL: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  STALLED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  DORMANT: "bg-red-500/15 text-red-300 border-red-500/30",
};

function StatusPill({ s }: { s: PinRow["distribution_status"] }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${statusStyles[s]}`}>{s}</span>;
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

export default function PinterestDistributionMonitor() {
  const [pins, setPins] = useState<PinRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [boards, setBoards] = useState<BoardRollup[]>([]);
  const [products, setProducts] = useState<ProductRollup[]>([]);
  const [categories, setCategories] = useState<CategoryRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, h, b, pr, c] = await Promise.all([
        supabase.from("v_pcie2_pin_distribution").select("*").order("published_at", { ascending: false }).limit(500),
        supabase.from("v_pcie2_distribution_health").select("*").single(),
        supabase.from("v_pcie2_distribution_board_rollup").select("*").order("impressions_7d", { ascending: false }).limit(50),
        supabase.from("v_pcie2_distribution_product_rollup").select("*").order("impressions_7d", { ascending: false }).limit(50),
        supabase.from("v_pcie2_distribution_category_rollup").select("*").order("impressions_7d", { ascending: false }).limit(50),
      ]);
      if (p.error) throw p.error;
      setPins((p.data ?? []) as PinRow[]);
      if (!h.error && h.data) setHealth(h.data as Health);
      setBoards((b.data ?? []) as BoardRollup[]);
      setProducts((pr.data ?? []) as ProductRollup[]);
      setCategories((c.data ?? []) as CategoryRollup[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of pins) c[r.distribution_status] = (c[r.distribution_status] ?? 0) + 1;
    return c;
  }, [pins]);

  const flagIndex = useMemo(() => {
    const idx: Record<string, PinRow[]> = {};
    for (const r of pins) for (const f of r.flags ?? []) (idx[f] ??= []).push(r);
    return idx;
  }, [pins]);

  const winners = useMemo(
    () =>
      [...pins]
        .filter((p) => ["VIRAL", "GROWING"].includes(p.distribution_status) || (p.flags ?? []).includes("imps_accelerating"))
        .sort((a, b) => b.engagement_score - a.engagement_score)
        .slice(0, 20),
    [pins]
  );

  const worst = useMemo(
    () =>
      [...pins]
        .filter((p) => ["DORMANT", "STALLED"].includes(p.distribution_status))
        .sort((a, b) => b.age_hours - a.age_hours)
        .slice(0, 20),
    [pins]
  );

  const cadence = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const p of pins) {
      const d = new Date(p.published_at).toISOString().slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + 1;
    }
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
  }, [pins]);
  const cadenceMax = Math.max(1, ...cadence.map(([, n]) => n));

  const score = health?.enterprise_health_score ?? 0;
  const scoreColor = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-cyan-400" : score >= 25 ? "text-amber-400" : "text-red-400";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Helmet>
        <title>Pinterest Distribution Monitor — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Pinterest Distribution Monitor
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only measurement of PCIE2 published pin distribution. No pipelines modified.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </header>

      {error && (
        <div className="text-sm text-red-400 border border-red-500/30 rounded p-3 bg-red-500/10">
          Error loading views: {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Enterprise Health Score</div>
            <div className={`text-4xl font-bold mt-1 ${scoreColor}`}>{score.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1">0–100 blended</div>
          </CardContent>
        </Card>
        <Stat label="Pins tracked" value={String(health?.pins_total ?? pins.length)} sub={`${health?.published_7d ?? 0} in last 7d`} />
        <Stat
          label="% Distributing+"
          value={
            health && health.pins_total
              ? `${Math.round(((health.pins_distributing + health.pins_growing + health.pins_viral) / health.pins_total) * 100)}%`
              : "—"
          }
          sub={`Growing ${health?.pins_growing ?? 0} · Viral ${health?.pins_viral ?? 0}`}
        />
        <Stat
          label="% Dormant/Stalled"
          value={
            health && health.pins_total
              ? `${Math.round(((health.pins_stalled + health.pins_dormant) / health.pins_total) * 100)}%`
              : "—"
          }
          sub={`Stalled ${health?.pins_stalled ?? 0} · Dormant ${health?.pins_dormant ?? 0}`}
        />
        <Stat
          label="Median CTR vs account"
          value={
            health?.median_ctr_7d_pct != null
              ? `${health.median_ctr_7d_pct.toFixed(2)}%`
              : "—"
          }
          sub={
            health?.account_avg_ctr_pct != null
              ? `Account avg ${health.account_avg_ctr_pct.toFixed(2)}%`
              : "no benchmark yet"
          }
        />
      </div>

      {/* Status distribution + cadence */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Distribution status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(["NEW", "INDEXING", "DISTRIBUTING", "GROWING", "VIRAL", "STALLED", "DORMANT"] as const).map((s) => {
              const n = statusCounts[s] ?? 0;
              const pct = pins.length ? (n / pins.length) * 100 : 0;
              return (
                <div key={s}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2">
                      <StatusPill s={s} />
                      <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                    </span>
                    <span className="tabular-nums">{n}</span>
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
          <CardHeader>
            <CardTitle>Daily publishing cadence</CardTitle>
          </CardHeader>
          <CardContent>
            {cadence.length === 0 ? (
              <div className="text-sm text-muted-foreground">No published pins yet.</div>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {cadence.map(([d, n]) => (
                  <div key={d} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <div className="text-[10px] tabular-nums text-muted-foreground">{n}</div>
                    <div
                      className="w-full bg-primary/70 rounded-sm"
                      style={{ height: `${(n / cadenceMax) * 100}%` }}
                      title={`${d}: ${n} pins`}
                    />
                    <div className="text-[9px] text-muted-foreground rotate-45 origin-left w-4">{d.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Editorial winners */}
      <Card>
        <CardHeader>
          <CardTitle>Editorial winners</CardTitle>
        </CardHeader>
        <CardContent>
          {winners.length === 0 ? (
            <div className="text-sm text-muted-foreground">No winners detected yet — pins need age and impressions.</div>
          ) : (
            <PinTable rows={winners} />
          )}
        </CardContent>
      </Card>

      {/* Worst */}
      <Card>
        <CardHeader>
          <CardTitle>Worst performing pins</CardTitle>
        </CardHeader>
        <CardContent>
          {worst.length === 0 ? (
            <div className="text-sm text-muted-foreground">No stalled or dormant pins.</div>
          ) : (
            <PinTable rows={worst} />
          )}
        </CardContent>
      </Card>

      {/* Rollups */}
      <div className="grid md:grid-cols-3 gap-4">
        <RollupCard
          title="Top boards"
          rows={boards.map((b) => ({
            id: b.board_id ?? "—",
            label: b.board_name ?? b.board_id ?? "unknown",
            pins: b.pins,
            imps: b.impressions_7d,
            ctr: b.avg_ctr_7d_pct,
            win: b.winning_pins,
            bad: b.underperforming_pins,
          }))}
        />
        <RollupCard
          title="Top products"
          rows={products.map((p) => ({
            id: p.product_id,
            label: p.product_name ?? p.product_slug ?? p.product_id,
            pins: p.pins,
            imps: p.impressions_7d,
            ctr: p.avg_ctr_7d_pct,
            win: p.winning_pins,
            bad: p.underperforming_pins,
          }))}
        />
        <RollupCard
          title="Top categories"
          rows={categories.map((c) => ({
            id: c.category,
            label: c.category,
            pins: c.pins,
            imps: c.impressions_7d,
            ctr: c.avg_ctr_7d_pct,
            win: c.winning_pins,
            bad: c.underperforming_pins,
          }))}
        />
      </div>

      {/* Flag inbox */}
      <Card>
        <CardHeader>
          <CardTitle>Flag inbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.keys(flagIndex).length === 0 ? (
            <div className="text-sm text-muted-foreground">No flags raised.</div>
          ) : (
            Object.entries(flagIndex).map(([flag, rows]) => (
              <div key={flag} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-sm">{flag}</div>
                  <Badge variant="outline">{rows.length}</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-auto">
                  {rows.slice(0, 10).map((r) => (
                    <div key={r.queue_id} className="flex justify-between gap-2">
                      <span className="truncate">{r.headline ?? r.pin_id}</span>
                      <span className="tabular-nums">{Math.round(r.age_hours)}h</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Full pin table */}
      <Card>
        <CardHeader>
          <CardTitle>All published pins ({pins.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <PinTable rows={pins} />
        </CardContent>
      </Card>
    </div>
  );
}

function PinTable({ rows }: { rows: PinRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-2 pr-2">Status</th>
          <th className="py-2 pr-2">Headline / Product</th>
          <th className="py-2 pr-2">Board</th>
          <th className="py-2 pr-2 text-right">Age</th>
          <th className="py-2 pr-2 text-right">Imps 24h/7d</th>
          <th className="py-2 pr-2 text-right">Saves 7d</th>
          <th className="py-2 pr-2 text-right">Clicks 7d</th>
          <th className="py-2 pr-2 text-right">CTR 7d</th>
          <th className="py-2 pr-2 text-right">Vel/hr</th>
          <th className="py-2 pr-2 text-right">Score</th>
          <th className="py-2 pr-2">Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.queue_id} className="border-t">
            <td className="py-1.5 pr-2"><StatusPill s={r.distribution_status} /></td>
            <td className="py-1.5 pr-2 max-w-[260px]">
              <div className="truncate font-medium">{r.headline ?? "—"}</div>
              <div className="truncate text-muted-foreground">{r.product_name ?? r.product_slug ?? r.product_id}</div>
            </td>
            <td className="py-1.5 pr-2 max-w-[140px] truncate">{r.board_name ?? r.board_id ?? "—"}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{Math.round(r.age_hours)}h</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{r.impressions_24h}/{r.impressions_7d}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{r.saves_7d}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{r.outbound_7d}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{r.ctr_7d_pct.toFixed(2)}%</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{r.impression_velocity_hr.toFixed(1)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{r.engagement_score.toFixed(0)}</td>
            <td className="py-1.5 pr-2">
              <div className="flex flex-wrap gap-1">
                {(r.flags ?? []).map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px] py-0">{f}</Badge>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type RollupItem = {
  id: string;
  label: string;
  pins: number;
  imps: number;
  ctr: number | null;
  win: number;
  bad: number;
};

function RollupCard({ title, rows }: { title: string; rows: RollupItem[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2 text-right">Pins</th>
                <th className="py-1 pr-2 text-right">Imps 7d</th>
                <th className="py-1 pr-2 text-right">CTR</th>
                <th className="py-1 pr-2 text-right">Win/Bad</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1 pr-2 max-w-[160px] truncate">{r.label}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.pins}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.imps.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{r.ctr != null ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    <span className="text-emerald-400">{r.win}</span>/<span className="text-amber-400">{r.bad}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}