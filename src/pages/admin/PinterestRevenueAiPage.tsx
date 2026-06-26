import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Snap = {
  id: string;
  captured_at: string;
  revenue_score: number;
  growth_score: number;
  seo_score: number;
  creative_score: number;
  automation_score: number;
  health_score: number;
  ai_confidence: number;
  bottleneck: string | null;
  top_action: string | null;
  why_not_grow: string | null;
};

type Prediction = {
  product_id: string;
  product_slug: string | null;
  expected_outbound_clicks: number;
  expected_purchases: number;
  expected_revenue_cents: number;
  expected_monthly_revenue_cents: number;
  expected_annual_revenue_cents: number;
  confidence: number;
};

type Event = {
  id: string;
  occurred_at: string;
  kind: string;
  severity: string;
  title: string;
  detail: string | null;
};

const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString()}`;
const fmtScore = (n: number) => Math.round(n);

export default function PinterestRevenueAiPage() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: snaps }, { data: pred }, { data: evs }] = await Promise.all([
      supabase.from("prie_brain_snapshots").select("*").order("captured_at", { ascending: false }).limit(1),
      supabase.from("prie_revenue_predictions").select("*").order("expected_revenue_cents", { ascending: false }).limit(50),
      supabase.from("prie_timeline_events").select("*").order("occurred_at", { ascending: false }).limit(25),
    ]);
    setSnap((snaps?.[0] as Snap) ?? null);
    setPredictions((pred ?? []) as Prediction[]);
    setEvents((evs ?? []) as Event[]);
  }

  useEffect(() => {
    load();
    (async () => {
      const { data } = await supabase
        .from("prie_brain_snapshots")
        .select("captured_at")
        .order("captured_at", { ascending: false })
        .limit(1);
      const last = data?.[0]?.captured_at ? new Date(data[0].captured_at).getTime() : 0;
      if (Date.now() - last > 30 * 60_000) {
        supabase.functions
          .invoke("prie-auto-orchestrator", { body: { trigger: "page_open" } })
          .then(() => load())
          .catch(() => {});
      }
    })();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  async function invoke(fn: "prie-brain-sync" | "prie-revenue-predictor" | "prie-auto-orchestrator") {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(`${fn}: ${JSON.stringify(data).slice(0, 80)}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const scores = snap
    ? [
        { k: "Revenue", v: snap.revenue_score },
        { k: "Growth", v: snap.growth_score },
        { k: "SEO", v: snap.seo_score },
        { k: "Creative", v: snap.creative_score },
        { k: "Automation", v: snap.automation_score },
        { k: "Health", v: snap.health_score },
        { k: "AI Confidence", v: snap.ai_confidence },
      ]
    : [];

  const totalMonthly = predictions.reduce((s, p) => s + (p.expected_monthly_revenue_cents ?? 0), 0);
  const totalAnnual = predictions.reduce((s, p) => s + (p.expected_annual_revenue_cents ?? 0), 0);

  return (
    <>
      <Helmet>
        <title>Pinterest Revenue AI | GetPawsy Admin</title>
      </Helmet>
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Pinterest Revenue Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Self-improving Pinterest commerce brain. Wave 1: AI Brain + Revenue Prediction + Timeline.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={() => invoke("prie-revenue-predictor")}>
              Recompute predictions
            </Button>
            <Button disabled={busy} onClick={() => invoke("prie-brain-sync")}>
              Run brain sync
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Global AI Brain</CardTitle>
          </CardHeader>
          <CardContent>
            {!snap ? (
              <p className="text-sm text-muted-foreground">No snapshot yet. Click "Run brain sync".</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {scores.map((s) => (
                    <div key={s.k} className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">{s.k}</div>
                      <div className="text-2xl font-bold">{fmtScore(s.v)}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-border p-4 space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Bottleneck:</span>{" "}
                    <Badge variant="destructive">{snap.bottleneck}</Badge>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Top action:</span> {snap.top_action}
                  </div>
                  <div className="text-xs text-muted-foreground">{snap.why_not_grow}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Revenue Predictions — Monthly {fmtUsd(totalMonthly)} · Annual {fmtUsd(totalAnnual)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {predictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No predictions yet. Click "Recompute predictions".</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">#</th>
                      <th>Product</th>
                      <th>Clicks/mo</th>
                      <th>Purchases/mo</th>
                      <th>Revenue/mo</th>
                      <th>Revenue/yr</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictions.slice(0, 50).map((p, i) => (
                      <tr key={p.product_id} className="border-t border-border">
                        <td className="py-2">{i + 1}</td>
                        <td className="font-mono">{p.product_slug ?? p.product_id.slice(0, 8)}</td>
                        <td>{p.expected_outbound_clicks}</td>
                        <td>{p.expected_purchases}</td>
                        <td>{fmtUsd(p.expected_monthly_revenue_cents)}</td>
                        <td>{fmtUsd(p.expected_annual_revenue_cents)}</td>
                        <td>{Math.round(p.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="border border-border rounded-md p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{e.title}</div>
                      <Badge variant="outline">{e.kind}</Badge>
                    </div>
                    {e.detail && <div className="text-xs text-muted-foreground mt-1">{e.detail}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(e.occurred_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}