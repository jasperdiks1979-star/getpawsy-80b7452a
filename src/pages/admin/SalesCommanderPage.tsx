import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Sprout, Megaphone, Building2 } from "lucide-react";
import { ORGANIC_CONFIDENCE_LEVEL_LABELS, type OrganicConfidenceLevel } from "@/lib/organicConfidence";

type Block = {
  visitors: number; sessions: number; product_views: number;
  add_to_cart: number; checkout: number; purchases: number;
  revenue: number; returning_sessions: number;
  conversion_rate: number; revenue_per_visitor: number;
};
type ProductRow = {
  product_id: string; product_name: string; category: string;
  organic_visitors: number; organic_revenue: number; organic_purchases: number;
  organic_conversion: number; paid_share: number;
  confidence: number; level: OrganicConfidenceLevel; level_index: number;
};
type Confidence = {
  ok: boolean; generated_at: string; window_days: number;
  global: { organic: Block; paid: { visitors: number; sessions: number; revenue: number; purchases: number }; confidence: { score: number; level: OrganicConfidenceLevel; level_index: number } };
  products: ProductRow[];
  categories: { category: string; confidence: number; level: OrganicConfidenceLevel; level_index: number; organic_revenue: number; organic_visitors: number; paid_share: number }[];
  pins: { pin_id: string; product_id: string; impressions: number; saves: number; clicks: number; revenue: number; ctr: number; save_rate: number; confidence: number; level: string }[];
  counts: { products: number; categories: number; pins: number };
};
type Snap = {
  generated_at: string;
  mission: { goal: number; current: number; remaining: number; progress_pct: number };
  revenue: { all_time: number; today: number; week: number; month: number };
  sales: { all_time: number; today: number; week: number; month: number };
  kpis: { aov: number; conversion_rate: number; revenue_per_visitor: number; visitors_30d: number };
};

const eur = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(n || 0);
const pct = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;

const LEVEL_TONE: Record<OrganicConfidenceLevel, string> = {
  hypothesis: "bg-muted text-muted-foreground",
  emerging: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  validated: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  organic_winner: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  scale_candidate: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

export default function SalesCommanderPage() {
  const [conf, setConf] = useState<Confidence | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const [c, s] = await Promise.all([
      supabase.functions.invoke("organic-confidence", { body: {} }),
      supabase.functions.invoke("sales-commander", { body: {} }),
    ]);
    if (c.error) setErr(c.error.message);
    else setConf(c.data as Confidence);
    if (!s.error) setSnap(s.data as Snap);
    setLoading(false);
  };
  useEffect(() => { void load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, []);

  return (
    <>
      <Helmet><title>Sales Commander — Organic First | GetPawsy Admin</title></Helmet>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">🌱 Sales Commander · Organic First</h1>
            <p className="text-muted-foreground max-w-2xl">
              "What would still sell if we stopped all advertising today?" — the executive view defaults
              to Layer 1 (Organic Truth) and ranks products by Organic Confidence.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {err && <Card><CardContent className="pt-6 text-destructive">{err}</CardContent></Card>}

        {conf && (
          <Card className="ring-1 ring-emerald-500/40">
            <CardHeader>
              <CardTitle className="flex items-center justify-between flex-wrap gap-3">
                <span>Organic Confidence — Business Health</span>
                <Badge className={LEVEL_TONE[conf.global.confidence.level]}>
                  {ORGANIC_CONFIDENCE_LEVEL_LABELS[conf.global.confidence.level]} · {conf.global.confidence.score.toFixed(0)} / 100
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={conf.global.confidence.score} />
              <p className="text-xs text-muted-foreground">
                Evidence source: organic behaviour + market demand. Paid metrics contribute a penalty only — never a positive signal.
              </p>
            </CardContent>
          </Card>
        )}

        {snap && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Mission Progress · First 100 verified sales</span>
                <Badge variant={snap.mission.current >= 100 ? "default" : "secondary"}>
                  {snap.mission.current} / {snap.mission.goal}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent><Progress value={snap.mission.progress_pct} /></CardContent>
          </Card>
        )}

        <Tabs defaultValue="organic" className="w-full">
          <TabsList>
            <TabsTrigger value="organic"><Sprout className="h-4 w-4 mr-1" /> Organic Truth</TabsTrigger>
            <TabsTrigger value="paid"><Megaphone className="h-4 w-4 mr-1" /> Paid Performance</TabsTrigger>
            <TabsTrigger value="blended"><Building2 className="h-4 w-4 mr-1" /> Business Reality</TabsTrigger>
          </TabsList>

          <TabsContent value="organic" className="space-y-6 pt-4">
            {conf && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Organic visitors" value={conf.global.organic.visitors.toLocaleString()} />
                <Kpi label="Organic sessions" value={conf.global.organic.sessions.toLocaleString()} />
                <Kpi label="Organic product views" value={conf.global.organic.product_views.toLocaleString()} />
                <Kpi label="Organic add-to-cart" value={conf.global.organic.add_to_cart.toLocaleString()} />
                <Kpi label="Organic checkout" value={conf.global.organic.checkout.toLocaleString()} />
                <Kpi label="Organic purchases" value={conf.global.organic.purchases.toLocaleString()} />
                <Kpi label="Organic revenue" value={eur(conf.global.organic.revenue)} />
                <Kpi label="Organic conv. rate" value={pct(conf.global.organic.conversion_rate)} />
                <Kpi label="Organic RPV" value={eur(conf.global.organic.revenue_per_visitor)} />
                <Kpi label="Returning sessions" value={conf.global.organic.returning_sessions.toLocaleString()} />
              </div>
            )}

            {conf && (
              <Card>
                <CardHeader><CardTitle>Top Products by Organic Confidence</CardTitle></CardHeader>
                <CardContent className="space-y-2 max-h-[28rem] overflow-auto">
                  {conf.products.slice(0, 30).map((p) => (
                    <div key={p.product_id} className="flex flex-wrap items-center gap-3 border-b py-2 text-sm">
                      <div className="flex-1 min-w-[14rem]">
                        <div className="font-medium truncate">{p.product_name}</div>
                        <div className="text-xs text-muted-foreground">{p.category} · CVR {pct(p.organic_conversion)} · paid {Math.round(p.paid_share*100)}%</div>
                      </div>
                      <div className="text-xs text-right tabular-nums">
                        <div>{eur(p.organic_revenue)}</div>
                        <div className="text-muted-foreground">{p.organic_visitors} org. visitors</div>
                      </div>
                      <Badge className={LEVEL_TONE[p.level]}>{p.confidence.toFixed(0)} · {ORGANIC_CONFIDENCE_LEVEL_LABELS[p.level]}</Badge>
                    </div>
                  ))}
                  {!conf.products.length && <p className="text-sm text-muted-foreground">No organic product evidence yet.</p>}
                </CardContent>
              </Card>
            )}

            {conf && (
              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Categories — Organic Confidence</CardTitle></CardHeader>
                  <CardContent className="space-y-2 max-h-96 overflow-auto">
                    {conf.categories.map((c) => (
                      <div key={c.category} className="flex justify-between gap-2 text-sm border-b py-2">
                        <div className="flex-1">
                          <div className="font-medium truncate">{c.category}</div>
                          <div className="text-xs text-muted-foreground">{eur(c.organic_revenue)} · {c.organic_visitors} visitors</div>
                        </div>
                        <Badge className={LEVEL_TONE[c.level]}>{c.confidence.toFixed(0)}</Badge>
                      </div>
                    ))}
                    {!conf.categories.length && <p className="text-sm text-muted-foreground">No category data.</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Pinterest Pins — Organic Confidence</CardTitle></CardHeader>
                  <CardContent className="space-y-2 max-h-96 overflow-auto">
                    {conf.pins.slice(0, 30).map((p) => (
                      <div key={p.pin_id} className="flex justify-between gap-2 text-sm border-b py-2">
                        <div className="flex-1 truncate">
                          <div className="font-mono text-xs">{p.pin_id}</div>
                          <div className="text-xs text-muted-foreground">CTR {pct(p.ctr)} · saves {p.saves}</div>
                        </div>
                        <Badge variant="outline">{p.confidence.toFixed(0)}</Badge>
                      </div>
                    ))}
                    {!conf.pins.length && <p className="text-sm text-muted-foreground">No pin performance data.</p>}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="paid" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Paid Performance · Layer 2</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Paid metrics evaluate <strong>scaling efficiency only</strong> (ROAS / CPA). They are never
                mixed into AI ranking signals.
              </CardContent>
            </Card>
            {conf && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Paid visitors" value={conf.global.paid.visitors.toLocaleString()} />
                <Kpi label="Paid sessions" value={conf.global.paid.sessions.toLocaleString()} />
                <Kpi label="Paid purchases" value={conf.global.paid.purchases.toLocaleString()} />
                <Kpi label="Paid revenue" value={eur(conf.global.paid.revenue)} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="blended" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Business Reality · Layer 3 (financial reporting only)</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Blended numbers are useful for accounting only. Do not use this view to make optimisation decisions.
              </CardContent>
            </Card>
            {snap && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Revenue today" value={eur(snap.revenue.today)} />
                <Kpi label="Revenue 7d" value={eur(snap.revenue.week)} />
                <Kpi label="Revenue 30d" value={eur(snap.revenue.month)} />
                <Kpi label="Revenue all-time" value={eur(snap.revenue.all_time)} />
                <Kpi label="Sales today" value={String(snap.sales.today)} />
                <Kpi label="Sales 7d" value={String(snap.sales.week)} />
                <Kpi label="AOV" value={eur(snap.kpis.aov)} />
                <Kpi label="Blended CVR" value={pct(snap.kpis.conversion_rate)} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        {conf && (
          <p className="text-xs text-muted-foreground">
            Generated {new Date(conf.generated_at).toLocaleString()} · window {conf.window_days}d ·
            {" "}{conf.counts.products} products · {conf.counts.categories} categories · {conf.counts.pins} pins
          </p>
        )}
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
