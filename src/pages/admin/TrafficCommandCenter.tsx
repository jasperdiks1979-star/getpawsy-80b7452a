import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download, RefreshCw, Activity } from "lucide-react";

type Row = Record<string, any>;

const TrafficCommandCenter = () => {
  const { isAdmin, isLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<Row[]>([]);
  const [sources, setSources] = useState<Row[]>([]);
  const [pinDaily, setPinDaily] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [credit, setCredit] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString();

    const [{ data: ev }, { data: va }, { data: pq }, { data: ord }, { data: cs }] = await Promise.all([
      supabase.from("lp_funnel_events").select("event_name").gte("created_at", since).eq("qa", false),
      supabase.from("visitor_activity").select("referrer_category, session_id").gte("created_at", since7),
      supabase.from("pinterest_pin_queue").select("status, created_at").gte("created_at", since7),
      supabase.from("orders").select("status, total_amount, created_at").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("pinterest_credit_state").select("*").eq("id", 1).maybeSingle(),
    ]);

    const counts: Record<string, number> = {};
    (ev || []).forEach((r: any) => (counts[r.event_name] = (counts[r.event_name] || 0) + 1));
    setFunnel(
      ["lp_view", "view_item", "pdp_view", "sticky_atc_visible", "add_to_cart", "begin_checkout", "payment_success"].map(
        (k) => ({ stage: k, count: counts[k] || 0 })
      )
    );

    const bySrc: Record<string, Set<string>> = {};
    (va || []).forEach((r: any) => {
      const k = r.referrer_category || "unknown";
      (bySrc[k] ||= new Set()).add(r.session_id);
    });
    setSources(
      Object.entries(bySrc)
        .map(([k, v]) => ({ source: k, sessions: v.size }))
        .sort((a, b) => b.sessions - a.sessions)
    );

    const byDay: Record<string, Record<string, number>> = {};
    (pq || []).forEach((r: any) => {
      const d = (r.created_at || "").slice(0, 10);
      byDay[d] ||= {};
      byDay[d][r.status] = (byDay[d][r.status] || 0) + 1;
    });
    setPinDaily(
      Object.entries(byDay)
        .map(([d, s]) => ({ date: d, ...s }))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
    );

    setOrders((ord || []).slice(0, 10));
    setCredit(cs || null);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const atc = funnel.find((f) => f.stage === "add_to_cart")?.count || 0;
  const view = funnel.find((f) => f.stage === "view_item")?.count || 0;
  const atcRate = view ? ((atc / view) * 100).toFixed(2) : "0.00";
  const paid = orders.filter((o) => o.status === "paid").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" /> Traffic Command Center
            </h1>
            <p className="text-sm text-muted-foreground">Live cross-channel growth & funnel health</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" asChild>
              <a href="/admin-reports/incident/2026-06-25-growth-incident-report.pdf" download>
                <Download className="h-4 w-4 mr-2" /> Incident PDF
              </a>
            </Button>
          </div>
        </div>

        {atcRate && Number(atcRate) < 4 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-destructive">P1 Funnel Alert</div>
                <div>PDP → ATC rate is {atcRate}% over 30d ({atc} ATC events / {view} PDP views). Paid orders: {paid}.</div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {funnel.map((f) => (
            <Card key={f.stage}>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-xs">{f.stage.replace(/_/g, " ")}</CardDescription>
                <CardTitle className="text-2xl">{f.count.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Traffic Sources (7d, unique sessions)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {sources.map((s) => (
                <div key={s.source} className="rounded border p-3">
                  <div className="text-xs uppercase text-muted-foreground">{s.source}</div>
                  <div className="text-xl font-semibold">{s.sessions}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pinterest Queue (last 7d)</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1">Date</th>
                    <th>Posted</th>
                    <th>Paused</th>
                    <th>Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {pinDaily.map((r) => (
                    <tr key={r.date} className="border-b last:border-0">
                      <td className="py-1">{r.date}</td>
                      <td>{r.posted || 0}</td>
                      <td>{r.paused || 0}</td>
                      <td>{r.rejected || 0}</td>
                    </tr>
                  ))}
                  {!pinDaily.length && (
                    <tr>
                      <td colSpan={4} className="py-3 text-muted-foreground text-center">No queue activity.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1">Date</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{(o.created_at || "").slice(0, 10)}</td>
                      <td>
                        <Badge variant={o.status === "paid" ? "default" : "secondary"}>{o.status}</Badge>
                      </td>
                      <td className="text-right">${Number(o.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {!orders.length && (
                    <tr>
                      <td colSpan={3} className="py-3 text-muted-foreground text-center">No orders.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {credit && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pinterest Credit State</CardTitle>
            </CardHeader>
            <CardContent className="text-sm grid md:grid-cols-3 gap-3">
              <div><span className="text-muted-foreground">Daily cap:</span> {credit.daily_image_credit_cap}</div>
              <div><span className="text-muted-foreground">Used today:</span> {credit.image_credits_used_today ?? "—"}</div>
              <div><span className="text-muted-foreground">Manual pause:</span> {credit.manual_pause ? "ON" : "OFF"}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TrafficCommandCenter;