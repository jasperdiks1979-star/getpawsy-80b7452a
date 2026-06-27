import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type Snap = {
  generated_at: string;
  mission: { goal: number; current: number; remaining: number; progress_pct: number };
  revenue: { all_time: number; today: number; week: number; month: number };
  sales: { all_time: number; today: number; week: number; month: number };
  kpis: { aov: number; conversion_rate: number; revenue_per_visitor: number; revenue_per_pin_click: number; visitors_30d: number; pin_clicks_30d: number };
  forecast: { daily_rate: number; days_to_100: number | null; projected_completion: string | null; confidence: number };
  opportunities: { top_recommendations: any[]; top_products: any[]; top_pins: any[] };
  recent_orders: { id: string; total: number; currency: string; created_at: string }[];
};

const eur = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(n || 0);
const pct = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;

export default function SalesCommanderPage() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("sales-commander", { body: {} });
    if (error) setErr(error.message); else setSnap(data as Snap);
    setLoading(false);
  };

  useEffect(() => { void load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, []);

  return (
    <>
      <Helmet><title>Sales Commander — Mission Zero | GetPawsy Admin</title></Helmet>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">🚀 Sales Commander</h1>
            <p className="text-muted-foreground">Mission Zero — First 100 verified sales</p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        {err && <Card><CardContent className="pt-6 text-destructive">{err}</CardContent></Card>}
        {snap && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Mission Progress</span>
                  <Badge variant={snap.mission.current >= 100 ? "default" : "secondary"}>
                    {snap.mission.current} / {snap.mission.goal}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={snap.mission.progress_pct} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Kpi label="Remaining" value={String(snap.mission.remaining)} />
                  <Kpi label="Daily rate" value={snap.forecast.daily_rate.toFixed(2)} />
                  <Kpi label="Days to 100" value={snap.forecast.days_to_100?.toString() ?? "—"} />
                  <Kpi label="Projected" value={snap.forecast.projected_completion ? new Date(snap.forecast.projected_completion).toLocaleDateString() : "—"} />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Revenue today" value={eur(snap.revenue.today)} />
              <Kpi label="Revenue 7d" value={eur(snap.revenue.week)} />
              <Kpi label="Revenue 30d" value={eur(snap.revenue.month)} />
              <Kpi label="Revenue all-time" value={eur(snap.revenue.all_time)} />
              <Kpi label="Sales today" value={String(snap.sales.today)} />
              <Kpi label="Sales 7d" value={String(snap.sales.week)} />
              <Kpi label="AOV" value={eur(snap.kpis.aov)} />
              <Kpi label="Conv. rate" value={pct(snap.kpis.conversion_rate)} />
              <Kpi label="RPV" value={eur(snap.kpis.revenue_per_visitor)} />
              <Kpi label="Rev / Pin click" value={eur(snap.kpis.revenue_per_pin_click)} />
              <Kpi label="Visitors 30d" value={snap.kpis.visitors_30d.toLocaleString()} />
              <Kpi label="Pin clicks 30d" value={snap.kpis.pin_clicks_30d.toLocaleString()} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Top Revenue Opportunities</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-auto">
                  {snap.opportunities.top_recommendations.slice(0, 25).map((r, i) => (
                    <div key={r.id ?? i} className="flex justify-between gap-2 text-sm border-b pb-2">
                      <div className="flex-1">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.category} · conf {Math.round((r.confidence || 0) * 100)}%</div>
                      </div>
                      <Badge variant="outline">{eur(Number(r.est_revenue_gain || 0))}</Badge>
                    </div>
                  ))}
                  {!snap.opportunities.top_recommendations.length && <p className="text-sm text-muted-foreground">No recommendations yet.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Top Products to Promote</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-auto">
                  {snap.opportunities.top_products.slice(0, 25).map((p, i) => (
                    <div key={p.product_id ?? i} className="flex justify-between gap-2 text-sm border-b pb-2">
                      <div className="flex-1 truncate">{p.product_slug ?? p.product_id}</div>
                      <Badge>{Math.round(Number(p.opportunity_score || 0))}</Badge>
                    </div>
                  ))}
                  {!snap.opportunities.top_products.length && <p className="text-sm text-muted-foreground">No product signals yet.</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Recent Verified Orders</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {snap.recent_orders.map((o) => (
                  <div key={o.id} className="flex justify-between border-b py-1">
                    <span>{new Date(o.created_at).toLocaleString()}</span>
                    <span className="font-medium">{eur(o.total)}</span>
                  </div>
                ))}
                {!snap.recent_orders.length && <p className="text-muted-foreground">No verified orders yet.</p>}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">Snapshot · {new Date(snap.generated_at).toLocaleString()} · auto-refresh 60s</p>
          </>
        )}
        {!snap && !err && <p className="text-muted-foreground">Loading…</p>}
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}