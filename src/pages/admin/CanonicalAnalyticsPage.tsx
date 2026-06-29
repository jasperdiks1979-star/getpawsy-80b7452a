import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FunnelRow = { canonical_name: string; event_count: number };
type RevRow = { paid_at: string; total_amount: number; order_id: string };

const STAGES = [
  "CANONICAL_PAGE_VIEW",
  "CANONICAL_PRODUCT_VIEW",
  "CANONICAL_ADD_TO_CART",
  "CANONICAL_CART",
  "CANONICAL_CHECKOUT",
  "CANONICAL_PURCHASE",
];

export default function CanonicalAnalyticsPage() {
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState<{ events: number; sessions: number; revenue: number }>({
    events: 0, sessions: 0, revenue: 0,
  });
  const [recentRev, setRecentRev] = useState<RevRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: f }, { count: ev }, { count: ss }, { data: rev, count: rc }] = await Promise.all([
      supabase.from("mv_canonical_funnel_hourly").select("canonical_name, event_count"),
      supabase.from("canonical_events").select("*", { count: "exact", head: true }),
      supabase.from("canonical_sessions").select("*", { count: "exact", head: true }),
      supabase.from("canonical_revenue")
        .select("paid_at, total_amount, order_id", { count: "exact" })
        .order("paid_at", { ascending: false })
        .limit(10),
    ]);
    const agg: Record<string, number> = {};
    (f as FunnelRow[] | null)?.forEach((r) => {
      agg[r.canonical_name] = (agg[r.canonical_name] ?? 0) + Number(r.event_count);
    });
    setFunnel(agg);
    setCounts({ events: ev ?? 0, sessions: ss ?? 0, revenue: rc ?? 0 });
    setRecentRev((rev as RevRow[]) ?? []);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await supabase.rpc("canonical_ingest_recent", { hours: 2 });
    await supabase.rpc("canonical_refresh_all");
    await load();
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Canonical Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Genesis V2.5 — one canonical layer. Every dashboard reads from here.
          </p>
        </div>
        <Button onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Ingest + Refresh now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle>Canonical events</CardTitle></CardHeader>
          <CardContent className="text-3xl font-mono">{counts.events.toLocaleString()}</CardContent></Card>
        <Card><CardHeader><CardTitle>Canonical sessions</CardTitle></CardHeader>
          <CardContent className="text-3xl font-mono">{counts.sessions.toLocaleString()}</CardContent></Card>
        <Card><CardHeader><CardTitle>Verified paid revenue (rows)</CardTitle></CardHeader>
          <CardContent className="text-3xl font-mono">{counts.revenue.toLocaleString()}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Funnel (all-time, normalized)</CardTitle></CardHeader>
        <CardContent>
          {loading ? "Loading…" : (
            <div className="space-y-2">
              {STAGES.map((s) => {
                const v = funnel[s] ?? 0;
                const top = funnel["CANONICAL_PAGE_VIEW"] || funnel["CANONICAL_PRODUCT_VIEW"] || 1;
                const pct = Math.min(100, Math.round((v / top) * 100));
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-64 text-sm font-mono">{s}</div>
                    <div className="flex-1 h-3 bg-muted rounded">
                      <div className="h-3 bg-primary rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <Badge variant="outline">{v.toLocaleString()}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent verified Stripe revenue</CardTitle></CardHeader>
        <CardContent>
          {recentRev.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid orders in canonical_revenue.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1">Paid at</th><th>Order</th><th className="text-right">Amount</th>
              </tr></thead>
              <tbody>
                {recentRev.map((r) => (
                  <tr key={r.order_id} className="border-t">
                    <td className="py-1">{new Date(r.paid_at).toLocaleString()}</td>
                    <td className="font-mono text-xs">{r.order_id.slice(0, 8)}…</td>
                    <td className="text-right font-mono">€{Number(r.total_amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
