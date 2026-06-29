import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RunRow {
  id: string;
  ran_at: string;
  window_hours: number;
  sessions_total: number;
  pageviews_total: number;
  pdp_views: number;
  add_to_carts: number;
  begin_checkouts: number;
  purchases: number;
  revenue_usd: number;
  traffic_quality_score: number;
  mismatch_rate_pct: number;
  pdp_conversion_pct: number;
  checkout_start_pct: number;
}
interface ProductRow {
  id: string;
  product_id: string;
  pdp_views: number;
  add_to_carts: number;
  begin_checkouts: number;
  purchases: number;
  pdp_to_atc_pct: number;
  atc_to_checkout_pct: number;
  leak_step: string;
  leak_severity: number;
  recommended_fix: string;
  confidence: number;
}
interface SegmentRow {
  id: string;
  source: string; medium: string; device: string;
  sessions: number; pdp_views: number; add_to_carts: number; purchases: number;
  traffic_quality_score: number; conversion_pct: number;
}
interface Incident {
  id: string; category: string; severity: string; status: string;
  title: string; opened_at: string;
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const toneClass = tone === "good"
    ? "border-green-500/40 bg-green-500/5"
    : tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : tone === "bad"
        ? "border-red-500/40 bg-red-500/5"
        : "border-border";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function ConversionRealityPage() {
  const [run, setRun] = useState<RunRow | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [cci, setCci] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: runs } = await supabase
        .from("conversion_reality_runs")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(1);
      const latest = (runs?.[0] as RunRow | undefined) || null;
      setRun(latest);
      if (latest) {
        const [p, s] = await Promise.all([
          supabase.from("conversion_reality_products")
            .select("*")
            .eq("run_id", latest.id)
            .order("leak_severity", { ascending: false })
            .limit(15),
          supabase.from("conversion_reality_segments")
            .select("*")
            .eq("run_id", latest.id)
            .order("sessions", { ascending: false })
            .limit(15),
        ]);
        setProducts((p.data as ProductRow[]) || []);
        setSegments((s.data as SegmentRow[]) || []);
      }
      const { data: inc } = await supabase
        .from("cie_incidents")
        .select("id, category, severity, status, title, opened_at")
        .in("category", ["conversion_reality", "traffic_quality", "attribution"])
        .order("opened_at", { ascending: false })
        .limit(10);
      setIncidents((inc as unknown as Incident[]) || []);
      try {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: ev } = await supabase
          .from('cci_events')
          .select('event_name')
          .gte('created_at', since)
          .limit(5000);
        const counts: Record<string, number> = {};
        (ev || []).forEach((r: { event_name: string }) => {
          counts[r.event_name] = (counts[r.event_name] || 0) + 1;
        });
        setCci(counts);
      } catch { /* table newly created; ignore */ }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("conversion-reality-analyzer", { body: {} });
      if (error) throw error;
      toast.success(`Analyzer ran. Sessions=${data?.metrics?.sessions ?? "?"}`);
      await load();
    } catch (e) {
      toast.error(`Run failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const trafficTone: "good" | "warn" | "bad" = run
    ? run.traffic_quality_score >= 60 ? "good" : run.traffic_quality_score >= 30 ? "warn" : "bad"
    : "neutral" as never;
  const checkoutTone: "good" | "warn" | "bad" = run
    ? run.checkout_start_pct >= 40 ? "good" : run.checkout_start_pct >= 15 ? "warn" : "bad"
    : "neutral" as never;

  return (
    <>
      <Helmet><title>Conversion Reality | Admin</title></Helmet>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Conversion Reality</h1>
            <p className="text-sm text-muted-foreground">
              Real funnel, traffic quality, top leaking products. Auto-incidents fire when leaks cross the playbook thresholds.
            </p>
          </div>
          <Button onClick={runNow} disabled={running}>{running ? "Running…" : "Run analyzer"}</Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !run ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            No runs yet. Click <strong>Run analyzer</strong> to generate the first snapshot.
          </CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Sessions" value={String(run.sessions_total)} sub={`${run.pageviews_total} pageviews`} />
              <Kpi label="Traffic quality" value={`${run.traffic_quality_score}%`} sub="≥10s + ≥2 PV, not bot" tone={trafficTone} />
              <Kpi label="PDP → ATC" value={`${run.pdp_conversion_pct}%`} sub={`${run.pdp_views} PDP / ${run.add_to_carts} ATC`} />
              <Kpi label="Checkout start" value={`${run.checkout_start_pct}%`} sub={`${run.begin_checkouts} of ${run.add_to_carts}`} tone={checkoutTone} />
              <Kpi label="Paid orders" value={String(run.purchases)} sub={`$${run.revenue_usd.toFixed(2)} revenue`} tone={run.purchases > 0 ? "good" : "bad"} />
            </div>

            <Card>
              <CardHeader><CardTitle>Funnel waterfall</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Sessions", v: run.sessions_total },
                  { label: "PDP views", v: run.pdp_views },
                  { label: "Add to cart", v: run.add_to_carts },
                  { label: "Begin checkout", v: run.begin_checkouts },
                  { label: "Purchases", v: run.purchases },
                ].map((step, i, arr) => {
                  const max = arr[0].v || 1;
                  const pct = Math.max(2, Math.round((step.v / max) * 100));
                  const prev = i > 0 ? arr[i - 1].v : null;
                  const drop = prev ? Math.round(((prev - step.v) / Math.max(prev, 1)) * 100) : null;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{step.label}</span>
                        <span className="font-mono">
                          {step.v}
                          {drop != null && <span className="text-muted-foreground ml-2">−{drop}%</span>}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded">
                        <div className="h-2 bg-primary rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top leaking products</CardTitle></CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No product-level signal in this window.</div>
                ) : (
                  <div className="space-y-3">
                    {products.map(p => (
                      <div key={p.id} className="border rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-xs">{p.product_id.slice(0, 12)}…</div>
                          <Badge variant={p.leak_step === "healthy" ? "secondary" : "destructive"}>{p.leak_step}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          PDP {p.pdp_views} · ATC {p.add_to_carts} · Begin checkout {p.begin_checkouts} · Purchases {p.purchases} · conf {p.confidence}
                        </div>
                        <div className="text-sm mt-2">{p.recommended_fix}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top segments (source × device)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Medium</th><th className="py-1 pr-3">Device</th><th className="py-1 pr-3 text-right">Sessions</th><th className="py-1 pr-3 text-right">Quality</th><th className="py-1 pr-3 text-right">Conv%</th></tr>
                    </thead>
                    <tbody>
                      {segments.map(s => (
                        <tr key={s.id} className="border-t border-border/40">
                          <td className="py-1 pr-3">{s.source}</td>
                          <td className="py-1 pr-3">{s.medium}</td>
                          <td className="py-1 pr-3">{s.device}</td>
                          <td className="py-1 pr-3 text-right">{s.sessions}</td>
                          <td className="py-1 pr-3 text-right">{s.traffic_quality_score}%</td>
                          <td className="py-1 pr-3 text-right">{s.conversion_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Auto-incidents</CardTitle></CardHeader>
              <CardContent>
                {incidents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No incidents — all leak thresholds within tolerance.</div>
                ) : (
                  <div className="space-y-2">
                    {incidents.map(i => (
                      <div key={i.id} className="border rounded p-2 text-sm flex items-center justify-between">
                        <span>{i.title}</span>
                        <Badge variant={i.severity === "high" ? "destructive" : "secondary"}>{i.severity}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="text-xs text-muted-foreground">
              Last run: {new Date(run.ran_at).toLocaleString()} · window {run.window_hours}h · mismatch rate {run.mismatch_rate_pct}%
            </div>
          </>
        )}
        <Card>
          <CardHeader><CardTitle>CCI deep funnel events (last 24h)</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(cci).length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No CCI events yet. Storefront emits them via <code>trackCci()</code> on ATC click/success/error,
                cart open, and checkout load.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(cci).sort((a,b) => b[1]-a[1]).map(([k,v]) => (
                  <div key={k} className="border rounded p-2 text-sm flex items-center justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}