import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, AlertTriangle, RefreshCw, Wrench, Link2 } from "lucide-react";

type HealthRow = {
  id: string;
  report_at: string;
  pinterest_clicks: number;
  attributed_clicks: number;
  pinterest_sessions: number;
  attributed_sessions: number;
  product_views: number;
  attributed_product_views: number;
  add_to_carts: number;
  attributed_add_to_carts: number;
  purchases: number;
  attributed_purchases: number;
  coverage_pct: number;
  broken_chains: number;
  repaired: number;
  alert_level: string;
};

function Pct({ a, b }: { a: number; b: number }) {
  const v = b > 0 ? (a / b) * 100 : 0;
  return <span className="text-xs text-muted-foreground">({v.toFixed(0)}%)</span>;
}

function band(c: number) {
  if (c >= 80) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (c >= 50) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-rose-500/15 text-rose-700 border-rose-500/30";
}

export default function PinterestAttributionHealthPage() {
  const [latest, setLatest] = useState<HealthRow | null>(null);
  const [history, setHistory] = useState<HealthRow[]>([]);
  const [chain, setChain] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pinterest_attribution_health" as any)
      .select("*")
      .order("report_at", { ascending: false })
      .limit(48);
    const rows = (data ?? []) as unknown as HealthRow[];
    setHistory(rows);
    setLatest(rows[0] ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(action: string, label: string) {
    setBusy(label);
    try {
      const { data } = await supabase.functions.invoke("pinterest-attribution-accelerator", { body: { action } });
      if (action === "verify_chain") setChain(data);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const cov = latest?.coverage_pct ?? 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet><title>Attribution Health — Pinterest</title></Helmet>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Pinterest Attribution Health
          </h1>
          <p className="text-sm text-muted-foreground">
            15-min refresh · hourly health report · auto-repair broken mappings
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
          <Button size="sm" onClick={() => run("health", "health")} disabled={busy !== null}>
            {busy === "health" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Health now
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("repair", "repair")} disabled={busy !== null}>
            {busy === "repair" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Repair
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("backfill", "backfill")} disabled={busy !== null}>
            {busy === "backfill" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Backfill
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("verify_chain", "verify")} disabled={busy !== null}>
            {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Verify chain
          </Button>
        </div>
      </header>

      {latest && cov < 80 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              Coverage is <strong>{cov.toFixed(1)}%</strong> — below the 80% threshold. Auto-repair triggered on last tick ({latest.repaired} fixes).
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Coverage (24h)</CardTitle></CardHeader>
          <CardContent>
            <Badge variant="outline" className={band(cov)}>{cov.toFixed(1)}%</Badge>
            <div className="text-xs text-muted-foreground mt-1">target ≥ 80%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Clicks / Sessions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.attributed_sessions ?? 0}</div>
            <div className="text-xs text-muted-foreground">of {latest?.pinterest_sessions ?? 0} <Pct a={latest?.attributed_sessions ?? 0} b={latest?.pinterest_sessions ?? 0} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Product views</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.attributed_product_views ?? 0}</div>
            <div className="text-xs text-muted-foreground">of {latest?.product_views ?? 0} <Pct a={latest?.attributed_product_views ?? 0} b={latest?.product_views ?? 0} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Add to cart</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.attributed_add_to_carts ?? 0}</div>
            <div className="text-xs text-muted-foreground">of {latest?.add_to_carts ?? 0} <Pct a={latest?.attributed_add_to_carts ?? 0} b={latest?.add_to_carts ?? 0} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Purchases</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.attributed_purchases ?? 0}</div>
            <div className="text-xs text-muted-foreground">of {latest?.purchases ?? 0} <Pct a={latest?.attributed_purchases ?? 0} b={latest?.purchases ?? 0} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Broken chains</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.broken_chains ?? 0}</div>
            <div className="text-xs text-muted-foreground">events without pin_id</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Repaired (last tick)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.repaired ?? 0}</div>
            <div className="text-xs text-muted-foreground">sessions + events</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">Status</CardTitle></CardHeader>
          <CardContent>
            <Badge variant="outline" className={band(cov)}>{latest?.alert_level ?? "—"}</Badge>
            <div className="text-xs text-muted-foreground mt-1">{latest ? new Date(latest.report_at).toLocaleString() : "no data yet"}</div>
          </CardContent>
        </Card>
      </div>

      {chain && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Chain verification (24h)</CardTitle></CardHeader>
          <CardContent className="text-sm grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><div className="text-xs text-muted-foreground">Clicks</div><div className="font-bold">{chain.clicks}</div></div>
            <div><div className="text-xs text-muted-foreground">→ Landing</div><div className="font-bold">{chain.with_landing}</div></div>
            <div><div className="text-xs text-muted-foreground">→ Product view</div><div className="font-bold">{chain.with_view}</div></div>
            <div><div className="text-xs text-muted-foreground">→ Add to cart</div><div className="font-bold">{chain.with_atc}</div></div>
            <div><div className="text-xs text-muted-foreground">→ Purchase</div><div className="font-bold">{chain.with_purchase}</div></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Health history (last 48 reports)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2">When</th>
                  <th>Coverage</th>
                  <th>Sessions</th>
                  <th>Views</th>
                  <th>ATC</th>
                  <th>Purchase</th>
                  <th>Broken</th>
                  <th>Repaired</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1.5">{new Date(r.report_at).toLocaleString()}</td>
                    <td><Badge variant="outline" className={band(r.coverage_pct)}>{r.coverage_pct.toFixed(1)}%</Badge></td>
                    <td>{r.attributed_sessions}/{r.pinterest_sessions}</td>
                    <td>{r.attributed_product_views}/{r.product_views}</td>
                    <td>{r.attributed_add_to_carts}/{r.add_to_carts}</td>
                    <td>{r.attributed_purchases}/{r.purchases}</td>
                    <td>{r.broken_chains}</td>
                    <td>{r.repaired}</td>
                    <td>{r.alert_level}</td>
                  </tr>
                ))}
                {!history.length && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No health reports yet. Click "Health now".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}