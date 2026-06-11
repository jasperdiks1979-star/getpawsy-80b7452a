/**
 * Per-pin attribution dashboard with auto-rank, pause bottom 20%,
 * boost top 20%, and clone winners.
 * Backed by edge function `pinterest-pin-attribution`.
 */
import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Zap, Pause, TrendingUp, Copy } from "lucide-react";
import { toast } from "sonner";

type Row = {
  pin_id: string;
  board_name: string | null;
  product_url: string | null;
  impressions: number;
  outbound_clicks: number;
  sessions: number;
  pageviews: number;
  add_to_carts: number;
  purchases: number;
  saves: number;
  score: number;
  rank: number;
  tier: "winner" | "loser" | "neutral";
  status: string | null;
};

type Totals = {
  impressions: number;
  outbound_clicks: number;
  sessions: number;
  pageviews: number;
  add_to_carts: number;
  purchases: number;
};

function fmt(n: number) {
  return (n ?? 0).toLocaleString();
}

export default function PinterestPinAttributionPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-pin-attribution", {
        body: { action: "dashboard", days },
      });
      if (error) throw error;
      setRows((data?.rows ?? []) as Row[]);
      setTotals((data?.totals ?? null) as Totals | null);
    } catch (e) {
      toast.error(`Load failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runAutoRank() {
    if (!confirm("Pause bottom 20% of pins, boost top 20%, and clone winners?")) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-pin-attribution", {
        body: { action: "auto_rank", days },
      });
      if (error) throw error;
      toast.success(
        `Auto-rank done · paused ${data?.paused ?? 0} · boosted ${data?.boosted ?? 0} · clone ${data?.cloneOk ? "ok" : "skipped"}`,
      );
      await load();
    } catch (e) {
      toast.error(`Auto-rank failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows.slice(0, 500);
    return rows
      .filter(
        (r) =>
          r.pin_id.includes(t) ||
          (r.board_name ?? "").toLowerCase().includes(t) ||
          (r.product_url ?? "").toLowerCase().includes(t),
      )
      .slice(0, 500);
  }, [rows, q]);

  const winners = rows.filter((r) => r.tier === "winner").length;
  const losers = rows.filter((r) => r.tier === "loser").length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pinterest Pin Attribution — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pinterest Pin Attribution</h1>
          <p className="text-muted-foreground">
            Per-pin ranking: impressions, outbound clicks, sessions, pageviews, ATC, purchases. Auto-pause losers,
            boost winners, clone top performers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={runAutoRank} disabled={running || loading || rows.length === 0}>
            <Zap className={`h-4 w-4 mr-2 ${running ? "animate-pulse" : ""}`} />
            Run auto-rank
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KPI label="Pins" value={fmt(rows.length)} sub={`${winners} winners · ${losers} losers`} />
        <KPI label="Impressions" value={fmt(totals?.impressions ?? 0)} />
        <KPI label="Outbound clicks" value={fmt(totals?.outbound_clicks ?? 0)} />
        <KPI label="Sessions" value={fmt(totals?.sessions ?? 0)} />
        <KPI label="Add to carts" value={fmt(totals?.add_to_carts ?? 0)} />
        <KPI label="Purchases" value={fmt(totals?.purchases ?? 0)} />
      </div>

      <Input
        placeholder="Search pin ID, board, product…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Ranked pins (top 500)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No pins with performance data yet. Once <code>pinterest_pin_performance</code> has data the dashboard
              fills automatically.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Pin</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead className="text-right">Impr</TableHead>
                  <TableHead className="text-right">Outbound</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">PV</TableHead>
                  <TableHead className="text-right">ATC</TableHead>
                  <TableHead className="text-right">Buys</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.pin_id}>
                    <TableCell className="text-muted-foreground">{r.rank}</TableCell>
                    <TableCell>
                      <a
                        href={`https://pinterest.com/pin/${r.pin_id}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline font-mono text-xs"
                      >
                        {r.pin_id}
                      </a>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.board_name ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(r.impressions)}</TableCell>
                    <TableCell className="text-right">{fmt(r.outbound_clicks)}</TableCell>
                    <TableCell className="text-right">{fmt(r.sessions)}</TableCell>
                    <TableCell className="text-right">{fmt(r.pageviews)}</TableCell>
                    <TableCell className="text-right">{fmt(r.add_to_carts)}</TableCell>
                    <TableCell className="text-right">{fmt(r.purchases)}</TableCell>
                    <TableCell className="text-right font-medium">{r.score.toFixed(1)}</TableCell>
                    <TableCell>
                      {r.tier === "winner" && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          <Copy className="h-3 w-3 mr-1" /> winner
                        </Badge>
                      )}
                      {r.tier === "loser" && (
                        <Badge variant="destructive">
                          <Pause className="h-3 w-3 mr-1" /> loser
                        </Badge>
                      )}
                      {r.tier === "neutral" && <Badge variant="secondary">neutral</Badge>}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{r.status ?? "—"}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}