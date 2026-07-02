import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Coverage = {
  window_days: number;
  total_sessions: number;
  attribution_completeness_pct: number;
  utm_coverage_pct: number;
  source_classification_accuracy_pct: number;
  revenue_traceability_pct: number;
  total_orders: number;
  attributed_orders: number;
};

type SourceRow = {
  channel: string; landing: number; product: number; atc: number;
  checkout: number; purchase: number; revenue_cents: number; conversion_pct: number;
};

type ProductRow = {
  product_id: string; product_views: number; add_to_carts: number; checkouts: number;
  purchases: number; revenue_cents: number; sessions: number;
  atc_rate_pct: number; purchase_rate_pct: number; abandonment_pct: number;
};

type LandingRow = {
  landing_page: string; sessions: number; unique_visitors: number;
  product_view_sessions: number; atc_sessions: number; purchases: number;
  revenue_cents: number; bounce_pct: number; conversion_pct: number;
};

async function callEngine<T = any>(action: string, days = 14): Promise<T> {
  const { data, error } = await supabase.functions.invoke("revenue-attribution", {
    method: "GET" as any,
    // supabase.functions.invoke doesn't support GET params; use body instead via POST
  });
  void data; void error;
  // Fallback via direct fetch to append query params:
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/revenue-attribution?action=${action}&days=${days}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token ?? ""}`,
      apikey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ?? "",
    },
  });
  const json = await res.json();
  if (!res.ok || json?.ok === false) throw new Error(json?.error ?? "engine_error");
  return json as T;
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RevenueAttributionCenterPage() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [landing, setLanding] = useState<LandingRow[]>([]);
  const [certifying, setCertifying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ov, prod, land] = await Promise.all([
        callEngine<{ sources: SourceRow[]; coverage: Coverage }>("overview", days),
        callEngine<{ products: ProductRow[] }>("products", days),
        callEngine<{ landing: LandingRow[] }>("landing", days),
      ]);
      setSources(ov.sources ?? []);
      setCoverage(ov.coverage ?? null);
      setProducts(prod.products ?? []);
      setLanding(land.landing ?? []);
    } catch (e) {
      toast.error(`Attribution load failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const totalRevenue = useMemo(() => sources.reduce((s, r) => s + r.revenue_cents, 0), [sources]);

  const runCertification = async () => {
    setCertifying(true);
    try {
      const res = await callEngine<{ hash: string }>("certify", days);
      toast.success(`Certification signed — ${res.hash.slice(0, 16)}…`);
    } catch (e) {
      toast.error(`Certify failed: ${(e as Error).message}`);
    } finally {
      setCertifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue Attribution Center</h1>
          <p className="text-sm text-muted-foreground">
            Every visitor · every session · every dollar — traceable to origin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7d</option>
            <option value={14}>Last 14d</option>
            <option value={30}>Last 30d</option>
            <option value={90}>Last 90d</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={runCertification} disabled={certifying}>
            {certifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Certify
          </Button>
        </div>
      </header>

      {/* Coverage KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KPI label="Attribution Completeness" value={coverage ? `${coverage.attribution_completeness_pct}%` : "—"} />
        <KPI label="UTM Coverage" value={coverage ? `${coverage.utm_coverage_pct}%` : "—"} />
        <KPI label="Source Accuracy (non-direct)" value={coverage ? `${coverage.source_classification_accuracy_pct}%` : "—"} />
        <KPI label="Revenue Traceability" value={coverage ? `${coverage.revenue_traceability_pct}%` : "—"} />
        <KPI label={`Revenue (${days}d)`} value={fmtMoney(totalRevenue)} highlight />
      </div>

      <Tabs defaultValue="sources">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="sources">Traffic Sources</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="landing">Landing Pages</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <Card>
            <CardHeader><CardTitle>Revenue by traffic source</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Channel</th>
                    <th className="text-right">Landing</th>
                    <th className="text-right">ATC</th>
                    <th className="text-right">Checkout</th>
                    <th className="text-right">Purchase</th>
                    <th className="text-right">Conv %</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((r) => (
                    <tr key={r.channel} className="border-t">
                      <td className="py-2"><Badge variant="secondary">{r.channel}</Badge></td>
                      <td className="text-right tabular-nums">{r.landing.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.atc.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.checkout.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.purchase.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.conversion_pct}%</td>
                      <td className="text-right tabular-nums font-medium">{fmtMoney(r.revenue_cents)}</td>
                    </tr>
                  ))}
                  {!sources.length && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No traffic data in window.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader><CardTitle>Top products by revenue</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Product</th>
                    <th className="text-right">Views</th>
                    <th className="text-right">ATC</th>
                    <th className="text-right">ATC %</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Abandon %</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((r) => (
                    <tr key={r.product_id} className="border-t">
                      <td className="py-2 max-w-[24rem] truncate font-mono text-xs">{r.product_id}</td>
                      <td className="text-right tabular-nums">{r.product_views.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.add_to_carts.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.atc_rate_pct}%</td>
                      <td className="text-right tabular-nums">{r.purchases.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.abandonment_pct}%</td>
                      <td className="text-right tabular-nums font-medium">{fmtMoney(r.revenue_cents)}</td>
                    </tr>
                  ))}
                  {!products.length && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No product events in window.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="landing">
          <Card>
            <CardHeader><CardTitle>Landing page intelligence</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Landing Page</th>
                    <th className="text-right">Sessions</th>
                    <th className="text-right">Uniques</th>
                    <th className="text-right">Bounce %</th>
                    <th className="text-right">ATC</th>
                    <th className="text-right">Purchases</th>
                    <th className="text-right">Conv %</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {landing.map((r) => (
                    <tr key={r.landing_page} className="border-t">
                      <td className="py-2 max-w-[22rem] truncate font-mono text-xs">{r.landing_page}</td>
                      <td className="text-right tabular-nums">{r.sessions.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.unique_visitors.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.bounce_pct}%</td>
                      <td className="text-right tabular-nums">{r.atc_sessions.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.purchases.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{r.conversion_pct}%</td>
                      <td className="text-right tabular-nums font-medium">{fmtMoney(r.revenue_cents)}</td>
                    </tr>
                  ))}
                  {!landing.length && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No landing data in window.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funnel">
          <Card>
            <CardHeader><CardTitle>Funnel by channel</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {sources.slice(0, 12).map((r) => {
                const max = Math.max(r.landing, 1);
                const bar = (n: number) => Math.max(2, Math.round((n / max) * 100));
                return (
                  <div key={r.channel} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <Badge variant="secondary">{r.channel}</Badge>
                      <span className="text-muted-foreground">{fmtMoney(r.revenue_cents)}</span>
                    </div>
                    <FunnelBar label="Landing" value={r.landing} pct={bar(r.landing)} />
                    <FunnelBar label="Product View" value={r.product} pct={bar(r.product)} />
                    <FunnelBar label="Add to Cart" value={r.atc} pct={bar(r.atc)} />
                    <FunnelBar label="Checkout" value={r.checkout} pct={bar(r.checkout)} />
                    <FunnelBar label="Purchase" value={r.purchase} pct={bar(r.purchase)} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/50" : undefined}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function FunnelBar({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="my-1 grid grid-cols-[7rem_1fr_5rem] items-center gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}