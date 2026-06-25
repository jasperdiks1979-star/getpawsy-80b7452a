import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Snapshot = {
  id: string;
  snapshot_date: string;
  window_days: number;
  revenue_cents: number;
  sessions: number;
  organic_reach: number;
  paid_reach: number;
  ctr: number;
  outbound_clicks: number;
  add_to_cart: number;
  purchases: number;
  roas: number;
  conversion_rate: number;
  growth_score: number;
  trending_products: Array<{ slug: string; revenue_cents: number }>;
  losing_products: Array<{ slug: string; delta: number }>;
  ai_opportunities: Array<{ title: string; impact: string }>;
  source_breakdown: Record<string, unknown>;
  created_at: string;
};

type TimelineRow = {
  id: string;
  event_type: string;
  category: string;
  severity: string;
  summary: string;
  created_at: string;
};

const fmtUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
const fmtPct = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;
const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(n || 0);

export default function PinterestGrowthAIPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    const [snapRes, tlRes] = await Promise.all([
      supabase
        .from("pga_executive_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("pga_timeline_events")
        .select("id,event_type,category,severity,summary,created_at")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    setSnap((snapRes.data as Snapshot | null) ?? null);
    setTimeline((tlRes.data as TimelineRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function runSync() {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("pga-overview-sync", { body: { window_days: 7 } });
      if (error) throw error;
      toast.success("Executive snapshot refreshed");
      await load();
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Pinterest Growth AI | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="container mx-auto max-w-[1400px] py-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" /> Pinterest Growth AI
            </h1>
            <p className="text-muted-foreground mt-1">
              Autonomous, additive growth engine on top of the existing Pinterest stack. Read-only until Wave 5
              approval gate.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Wave A · Foundation</Badge>
            <Button onClick={runSync} disabled={running} size="sm">
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh snapshot
            </Button>
          </div>
        </header>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">1 · Executive</TabsTrigger>
            <TabsTrigger value="creative" disabled>2 · Creative</TabsTrigger>
            <TabsTrigger value="seo" disabled>3 · SEO</TabsTrigger>
            <TabsTrigger value="ab" disabled>4 · A/B</TabsTrigger>
            <TabsTrigger value="publishing" disabled>5 · Publishing</TabsTrigger>
            <TabsTrigger value="boards" disabled>6 · Boards</TabsTrigger>
            <TabsTrigger value="products" disabled>7 · Products</TabsTrigger>
            <TabsTrigger value="competitor" disabled>8 · Competitor</TabsTrigger>
            <TabsTrigger value="trends" disabled>9 · Trends</TabsTrigger>
            <TabsTrigger value="opportunities" disabled>10 · Opportunities</TabsTrigger>
            <TabsTrigger value="revenue" disabled>11 · Revenue</TabsTrigger>
            <TabsTrigger value="timeline">12 · Timeline</TabsTrigger>
            <TabsTrigger value="learning" disabled>13 · Learning</TabsTrigger>
            <TabsTrigger value="daily" disabled>14 · Daily</TabsTrigger>
            <TabsTrigger value="operator" disabled>15 · Operator</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading executive snapshot…
              </div>
            ) : !snap ? (
              <Card>
                <CardHeader>
                  <CardTitle>No snapshot yet</CardTitle>
                  <CardDescription>Click "Refresh snapshot" to compute the first run.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <Metric label="Growth Score" value={`${snap.growth_score}/100`} tone="primary" />
                  <Metric label={`Revenue (${snap.window_days}d)`} value={fmtUsd(snap.revenue_cents)} />
                  <Metric label="Sessions" value={fmtInt(snap.sessions)} />
                  <Metric label="Organic Reach" value={fmtInt(snap.organic_reach)} />
                  <Metric label="Paid Reach" value={fmtInt(snap.paid_reach)} />
                  <Metric label="Outbound Clicks" value={fmtInt(snap.outbound_clicks)} />
                  <Metric label="CTR" value={fmtPct(snap.ctr)} />
                  <Metric label="Conv Rate" value={fmtPct(snap.conversion_rate)} />
                  <Metric label="ATC" value={fmtInt(snap.add_to_cart)} />
                  <Metric label="Purchases" value={fmtInt(snap.purchases)} />
                  <Metric label="ROAS" value={`${(snap.roas || 0).toFixed(2)}×`} />
                  <Metric label="Snapshot" value={new Date(snap.created_at).toLocaleString()} small />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <ListCard
                    title="Trending products"
                    description="Highest Pinterest-attributed revenue, last 7d"
                    items={(snap.trending_products || []).map((p) => ({
                      label: p.slug,
                      value: fmtUsd(p.revenue_cents),
                    }))}
                  />
                  <ListCard
                    title="Losing momentum"
                    description="Largest WoW revenue drops"
                    items={(snap.losing_products || []).map((p) => ({
                      label: p.slug,
                      value: `${(p.delta * 100).toFixed(0)}%`,
                    }))}
                  />
                  <ListCard
                    title="AI opportunities"
                    description="From pga-opportunity-scanner (Wave D)"
                    items={(snap.ai_opportunities || []).map((o) => ({ label: o.title, value: o.impact }))}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle>Growth timeline</CardTitle>
                <CardDescription>Every Growth AI action, recommendation and approval — newest first.</CardDescription>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events yet.</p>
                ) : (
                  <ul className="divide-y">
                    {timeline.map((t) => (
                      <li key={t.id} className="py-2 flex items-start gap-3 text-sm">
                        <Badge
                          variant={
                            t.severity === "critical"
                              ? "destructive"
                              : t.severity === "warning"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {t.category}
                        </Badge>
                        <div className="flex-1">
                          <div className="font-medium">{t.summary}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.event_type} · {new Date(t.created_at).toLocaleString()}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "primary";
  small?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`font-semibold ${small ? "text-sm" : "text-2xl"} ${tone === "primary" ? "text-primary" : ""}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {items.slice(0, 8).map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="truncate">{i.label}</span>
                <span className="font-medium tabular-nums">{i.value}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}