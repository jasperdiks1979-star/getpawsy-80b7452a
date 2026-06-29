import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  runCie,
  syncGa4,
  fetchHealthSnapshots,
  fetchConfidence,
  fetchFunnelSnapshots,
  fetchIncidents,
  fetchRevenueTruth,
  fetchAttributionIncidents,
  fetchSyntheticRuns,
} from "@/lib/cie/client";

type Row = Record<string, any>;

function scoreColor(n: number) {
  if (n >= 90) return "text-emerald-600";
  if (n >= 70) return "text-amber-600";
  return "text-rose-600";
}

export default function ConversionIntegrityPage() {
  const [busy, setBusy] = useState(false);
  const [ga4Busy, setGa4Busy] = useState(false);
  const [health, setHealth] = useState<Row | null>(null);
  const [confidence, setConfidence] = useState<Row[]>([]);
  const [funnel, setFunnel] = useState<Row[]>([]);
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [attribution, setAttribution] = useState<Row[]>([]);
  const [revenue, setRevenue] = useState<Row[]>([]);
  const [synthetic, setSynthetic] = useState<Row[]>([]);

  async function refresh() {
    const [h, c, f, i, a, r, s] = await Promise.all([
      fetchHealthSnapshots(1),
      fetchConfidence(),
      fetchFunnelSnapshots(12),
      fetchIncidents(20),
      fetchAttributionIncidents(20),
      fetchRevenueTruth(8),
      fetchSyntheticRuns(10),
    ]);
    setHealth(h[0] ?? null);
    setConfidence(c);
    setFunnel(f);
    setIncidents(i);
    setAttribution(a);
    setRevenue(r);
    setSynthetic(s);
  }

  useEffect(() => { refresh().catch((e) => toast.error(e.message)); }, []);

  async function runCycle() {
    setBusy(true);
    try {
      await runCie("cycle", { hours: 24 });
      toast.success("CIE cycle complete");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  async function syncGa4Now() {
    setGa4Busy(true);
    try {
      const res: any = await syncGa4(1);
      if (res?.ok === false) throw new Error(res.message ?? "GA4 sync failed");
      const c = res?.counts ?? {};
      toast.success(`GA4 synced — page_view ${c.page_view?.count ?? 0}, session_start ${c.session_start?.count ?? 0}, purchase ${c.purchase?.count ?? 0}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setGa4Busy(false); }
  }

  const overall = Number(health?.overall ?? 0);

  return (
    <>
      <Helmet><title>Conversion Integrity Engine | GetPawsy Admin</title></Helmet>
      <div className="container mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Conversion Integrity Engine</h1>
            <p className="text-sm text-muted-foreground">Genesis V2 — single source of truth for tracking, attribution, funnel and revenue</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={syncGa4Now} disabled={ga4Busy}>
              {ga4Busy ? "Syncing GA4…" : "Sync GA4"}
            </Button>
            <Button onClick={runCycle} disabled={busy}>{busy ? "Running…" : "Run CIE Cycle"}</Button>
          </div>
        </header>

        <Card>
          <CardHeader><CardTitle>Overall Integrity</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-6xl font-bold ${scoreColor(overall)}`}>{overall}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {health ? `Captured ${new Date(health.captured_at).toLocaleString()}` : "No snapshot yet — click Run CIE Cycle."}
            </p>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Per-Metric Confidence</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {confidence.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
              {confidence.map((c) => (
                <div key={`${c.metric}-${c.scope}`} className="flex justify-between text-sm">
                  <span className="font-medium">{c.metric}</span>
                  <span className="flex items-center gap-2">
                    <span className={scoreColor(Number(c.confidence))}>{Number(c.confidence).toFixed(0)}</span>
                    {c.gating_ok ? <Badge variant="secondary">AI-OK</Badge> : <Badge variant="destructive">Blocked</Badge>}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Revenue Truth (last windows)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {revenue.length === 0 && <p className="text-muted-foreground">No reconciliations yet.</p>}
              {revenue.map((r) => (
                <div key={r.id} className="flex justify-between">
                  <span>{new Date(r.window_start).toLocaleString()}</span>
                  <span>
                    orders ${ (Number(r.orders_cents)/100).toFixed(2) } · div {Number(r.max_divergence_pct ?? 0).toFixed(2)}% ·{" "}
                    <Badge variant={r.status === "ok" ? "secondary" : r.status === "diverged" ? "destructive" : "outline"}>{r.status}</Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Funnel Snapshots (24h)</CardTitle></CardHeader>
          <CardContent>
            {funnel.length === 0 && <p className="text-sm text-muted-foreground">No snapshots yet.</p>}
            {funnel.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1">Channel</th><th>Sessions</th><th>Views</th><th>ATC</th><th>Checkout</th><th>Purchase</th><th>CVR</th><th>Anomalies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.map((f) => (
                      <tr key={f.id} className="border-t">
                        <td className="py-1">{f.channel}</td>
                        <td>{f.sessions}</td><td>{f.product_views}</td><td>{f.add_to_cart}</td>
                        <td>{f.checkout}</td><td>{f.purchase}</td>
                        <td>{(Number(f.cvr ?? 0)*100).toFixed(2)}%</td>
                        <td>{Array.isArray(f.anomalies) && f.anomalies.length ? <Badge variant="destructive">{f.anomalies.length}</Badge> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Open Incidents</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {incidents.length === 0 && <p className="text-muted-foreground">No incidents.</p>}
              {incidents.map((i) => (
                <div key={i.id} className="border-b pb-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{i.title}</span>
                    <Badge variant={i.severity === "high" ? "destructive" : "outline"}>{i.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{i.category} · {i.status}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Attribution Incidents</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {attribution.length === 0 && <p className="text-muted-foreground">No attribution mismatches detected.</p>}
              {attribution.map((a) => (
                <div key={a.id} className="border-b pb-1">
                  <div className="flex justify-between">
                    <span>{a.expected_source ?? "?"} → {a.actual_source ?? "?"}</span>
                    <Badge variant="destructive">{a.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Synthetic Runs</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {synthetic.length === 0 && <p className="text-muted-foreground">No nightly synthetic runs yet.</p>}
            {synthetic.map((s) => (
              <div key={s.id} className="flex justify-between">
                <span>{s.scenario}</span>
                <span>
                  {s.duration_ms ? `${s.duration_ms}ms · ` : ""}
                  <Badge variant={s.passed ? "secondary" : "destructive"}>{s.passed ? "pass" : "fail"}</Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}