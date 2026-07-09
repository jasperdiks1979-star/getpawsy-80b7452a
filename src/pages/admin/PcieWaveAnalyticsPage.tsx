import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";

type PublishedPin = {
  pinterest_pin_id: string;
  product_slug: string | null;
  product_class: string | null;
  board_id: string | null;
  published_at: string;
  headline: string | null;
  ci_score: number | null;
};

type PerfRow = {
  pin_id: string;
  impressions: number | null;
  saves: number | null;
  outbound_clicks: number | null;
  closeups: number | null;
  ctr: number | null;
  measured_at: string | null;
};

type DailyRow = {
  pin_id: string;
  impressions: number | null;
  saves: number | null;
  outbound_clicks: number | null;
  pin_clicks: number | null;
  day: string;
};

type RowView = {
  pin_id: string;
  product_slug: string;
  board_id: string;
  published_at: string;
  headline: string;
  ci_score: number | null;
  impressions: number;
  clicks: number; // closeups + pin_clicks (engagement clicks)
  saves: number;
  outbound_clicks: number;
  measured_at: string | null;
  has_data: boolean;
};

const BOARD_NAMES: Record<string, string> = {
  "1117103951261719234": "Smart Pet Gadgets",
  "1117103951261719235": "Smart Self-Cleaning Cat Litter Box",
  "1117103951261719219": "Best Cat Trees 2026",
  "1117103951261719230": "Indoor Cat Setup",
  "1117103951261719222": "Cat Furniture",
  "1117103951261719228": "GetPawsy Products",
  "1117103951261719231": "Luxury Pet Beds",
  "1117103951261719232": "Pet Parent Hacks",
  "1117103951261719227": "Dog Walking Essentials",
  "1117103951261719226": "Dog Travel Accessories",
};

function boardName(id: string | null): string {
  if (!id) return "—";
  return BOARD_NAMES[id] ?? id;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export default function PcieWaveAnalyticsPage() {
  const [pins, setPins] = useState<PublishedPin[]>([]);
  const [perf, setPerf] = useState<Record<string, PerfRow>>({});
  const [daily, setDaily] = useState<Record<string, { impressions: number; saves: number; outbound: number; clicks: number }>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: pinRows, error: pinErr } = await supabase
        .from("pcie2_publish_queue")
        .select("pinterest_pin_id, product_slug, product_class, board_id, published_at, headline, ci_score")
        .not("pinterest_pin_id", "is", null)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false });
      if (pinErr) throw pinErr;
      const list = (pinRows ?? []) as PublishedPin[];
      setPins(list);

      const ids = list.map((p) => p.pinterest_pin_id);
      if (ids.length) {
        const { data: perfRows } = await supabase
          .from("pcie2_pin_performance")
          .select("pin_id, impressions, saves, outbound_clicks, closeups, ctr, measured_at")
          .in("pin_id", ids)
          .order("measured_at", { ascending: false });
        const latest: Record<string, PerfRow> = {};
        for (const r of (perfRows ?? []) as PerfRow[]) {
          if (!latest[r.pin_id]) latest[r.pin_id] = r;
        }
        setPerf(latest);

        const { data: dailyRows } = await supabase
          .from("pinterest_analytics_daily")
          .select("pin_id, impressions, saves, outbound_clicks, pin_clicks, day")
          .in("pin_id", ids);
        const agg: Record<string, { impressions: number; saves: number; outbound: number; clicks: number }> = {};
        for (const r of (dailyRows ?? []) as DailyRow[]) {
          const a = agg[r.pin_id] ?? { impressions: 0, saves: 0, outbound: 0, clicks: 0 };
          a.impressions += r.impressions ?? 0;
          a.saves += r.saves ?? 0;
          a.outbound += r.outbound_clicks ?? 0;
          a.clicks += r.pin_clicks ?? 0;
          agg[r.pin_id] = a;
        }
        setDaily(agg);
      }
      setRefreshedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await supabase.functions.invoke("pinterest-analytics-sync", { body: {} });
    } catch {
      /* swallow — refresh will show latest */
    } finally {
      await load();
      setSyncing(false);
    }
  }

  const rows: RowView[] = useMemo(() => {
    return pins.map((p) => {
      const perfRow = perf[p.pinterest_pin_id];
      const d = daily[p.pinterest_pin_id];
      const impressions = perfRow?.impressions ?? d?.impressions ?? 0;
      const saves = perfRow?.saves ?? d?.saves ?? 0;
      const outbound = perfRow?.outbound_clicks ?? d?.outbound ?? 0;
      const clicks = (perfRow?.closeups ?? 0) + (d?.clicks ?? 0);
      const has_data = Boolean(perfRow) || Boolean(d);
      return {
        pin_id: p.pinterest_pin_id,
        product_slug: p.product_slug ?? "—",
        board_id: p.board_id ?? "",
        published_at: p.published_at,
        headline: p.headline ?? "—",
        ci_score: p.ci_score,
        impressions,
        clicks,
        saves,
        outbound_clicks: outbound,
        measured_at: perfRow?.measured_at ?? null,
        has_data,
      };
    });
  }, [pins, perf, daily]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.clicks += r.clicks;
        acc.saves += r.saves;
        acc.outbound += r.outbound_clicks;
        if (r.has_data) acc.withData += 1;
        return acc;
      },
      { impressions: 0, clicks: 0, saves: 0, outbound: 0, withData: 0 },
    );
  }, [rows]);

  const boardsBreakdown = useMemo(() => {
    const m = new Map<string, { pins: number; impressions: number; saves: number; outbound: number }>();
    for (const r of rows) {
      const key = r.board_id || "unknown";
      const cur = m.get(key) ?? { pins: 0, impressions: 0, saves: 0, outbound: 0 };
      cur.pins += 1;
      cur.impressions += r.impressions;
      cur.saves += r.saves;
      cur.outbound += r.outbound_clicks;
      m.set(key, cur);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, name: boardName(id), ...v }))
      .sort((a, b) => b.impressions - a.impressions || b.pins - a.pins);
  }, [rows]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">PCIE2 Wave Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Impressions, engagement clicks, saves and outbound link clicks for every published PCIE2 pin.
          </p>
          {refreshedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Refreshed {refreshedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Reload
          </Button>
          <Button size="sm" onClick={() => void triggerSync()} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync from Pinterest"}
          </Button>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Published pins" value={fmt(rows.length)} sub={`${totals.withData} with data`} />
        <SummaryCard label="Impressions" value={fmt(totals.impressions)} />
        <SummaryCard label="Engagement clicks" value={fmt(totals.clicks)} sub="closeups + pin clicks" />
        <SummaryCard label="Saves" value={fmt(totals.saves)} />
        <SummaryCard label="Outbound clicks" value={fmt(totals.outbound)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Board distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Board</TableHead>
                <TableHead className="text-right">Pins</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Saves</TableHead>
                <TableHead className="text-right">Outbound</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardsBreakdown.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right">{b.pins}</TableCell>
                  <TableCell className="text-right">{fmt(b.impressions)}</TableCell>
                  <TableCell className="text-right">{fmt(b.saves)}</TableCell>
                  <TableCell className="text-right">{fmt(b.outbound)}</TableCell>
                </TableRow>
              ))}
              {!boardsBreakdown.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pins.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pins ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pin</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Saves</TableHead>
                  <TableHead className="text-right">Outbound</TableHead>
                  <TableHead className="text-right">CI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.pin_id}>
                    <TableCell className="font-mono text-xs">
                      <a
                        href={`https://www.pinterest.com/pin/${r.pin_id}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {r.pin_id.slice(-6)}
                      </a>
                      {!r.has_data && (
                        <Badge variant="outline" className="ml-2 text-[10px]">pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate" title={r.product_slug}>{r.product_slug}</TableCell>
                    <TableCell>{boardName(r.board_id)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.published_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.impressions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.saves)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.outbound_clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.ci_score != null ? Number(r.ci_score).toFixed(0) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && !loading && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No published pins yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {!loading && rows.length > 0 && totals.impressions === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Pinterest reports impressions with a 24–48h delay. Rows marked <em>pending</em> have no data yet — run "Sync from Pinterest" once data is expected.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}