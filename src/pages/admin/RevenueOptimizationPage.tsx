import { useEffect, useState } from "react";
import { ROE } from "@/lib/roe/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function RevenueOptimizationPage() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState<string|null>(null);

  const [sim, setSim] = useState({ scenario: "", intervention: "{}" });
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<any>(null);

  function refresh() { ROE.stats().then(setStats).catch((e:any) => setErr(e?.message ?? String(e))); }
  useEffect(refresh, []);

  async function run<T>(label: string, fn: () => Promise<T>, after?: (v:T) => void) {
    setBusy(label); setErr(null);
    try { const r = await fn(); after?.(r); refresh(); }
    catch (e:any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(null); }
  }

  const sc = stats?.scorecard;
  const ue = stats?.unit_economics;
  const latestSnap = stats?.snapshots?.[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Revenue Optimization Engine</h1>
        <p className="text-muted-foreground">
          Commercial optimizer. Profit-first. Revenue tree, bottlenecks, marginal value, portfolio ranking, capital allocation, simulations, forecasts. Recommendations only.
        </p>
      </div>

      {err && <Card><CardContent className="p-4 text-destructive">{err}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Business value</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{sc?.business_value_score != null ? (Number(sc.business_value_score)*100).toFixed(0) + "%" : "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">LTV : CAC</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{ue?.ltv_cac_ratio != null ? Number(ue.ltv_cac_ratio).toFixed(2) : "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Gross margin</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{ue?.gross_margin_pct != null ? (Number(ue.gross_margin_pct)*100).toFixed(1) + "%" : "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open bottlenecks</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.bottlenecks?.length ?? 0}</CardContent></Card>
      </div>

      <Tabs defaultValue="tree">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="tree">Revenue tree</TabsTrigger>
          <TabsTrigger value="bottlenecks">Bottlenecks</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="capital">Capital</TabsTrigger>
          <TabsTrigger value="simulate">Simulate</TabsTrigger>
          <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="scaling">Scaling</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>

        <TabsContent value="tree">
          <Card>
            <CardHeader><CardTitle>Revenue tree (latest snapshot)</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => run("tree", () => ROE.recomputeRevenueTree())} disabled={busy==="tree"}>{busy==="tree" ? "Recomputing…" : "Recompute"}</Button>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b"><th className="text-left p-1">Node</th><th className="text-right">Value</th><th className="text-right">∂Revenue</th><th className="text-right">∂Profit</th></tr></thead>
                <tbody>{(stats?.revenue_tree ?? []).map((n: any) => (
                  <tr key={n.id} className="border-b">
                    <td className="p-1">{n.node}</td>
                    <td className="text-right">{Number(n.value ?? 0).toLocaleString()}</td>
                    <td className="text-right">{Number(n.sensitivity_revenue ?? 0).toFixed(2)}</td>
                    <td className="text-right">{Number(n.sensitivity_profit ?? 0).toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {latestSnap && <div className="text-xs text-muted-foreground">Latest snapshot {latestSnap.snapshot_date} · revenue ${Number(latestSnap.revenue ?? 0).toLocaleString()} · orders {latestSnap.orders ?? 0}</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bottlenecks">
          <Card>
            <CardHeader><CardTitle>Bottleneck explorer</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Button size="sm" onClick={() => run("bot", () => ROE.findBottleneck(14))} disabled={busy==="bot"}>{busy==="bot" ? "Analyzing…" : "Detect (last 14 days)"}</Button>
              {(stats?.bottlenecks ?? []).map((b: any) => (
                <div key={b.id} className="border rounded p-2">
                  <div className="flex justify-between"><div className="font-medium">{b.description}</div><Badge variant="outline">{b.area}</Badge></div>
                  <div className="text-xs text-muted-foreground">unlock ${Number(b.expected_unlock_usd ?? 0).toFixed(0)} · severity {(Number(b.severity)*100).toFixed(0)}% · conf {(Number(b.confidence)*100).toFixed(0)}%</div>
                  {b.recommended_action && <div className="text-xs">→ {b.recommended_action}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card>
            <CardHeader><CardTitle>Product portfolio ranking</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(stats?.portfolio ?? []).map((p: any) => (
                <div key={p.id} className="flex justify-between border-b py-1">
                  <div>
                    <div className="font-medium">{p.product_label ?? p.product_id}</div>
                    <div className="text-xs text-muted-foreground">rev30d ${Number(p.revenue_30d ?? 0).toFixed(0)} · profit ${Number(p.profit_30d ?? 0).toFixed(0)} · margin {((Number(p.margin_pct ?? 0))*100).toFixed(0)}%</div>
                  </div>
                  <div className="flex flex-col items-end text-xs">
                    <Badge>{p.recommended_action ?? "—"}</Badge>
                    <span className="text-muted-foreground">score {Number(p.composite_score ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {(stats?.portfolio ?? []).length === 0 && <div className="text-muted-foreground">Call <code>ROE.rankPortfolio(products)</code> to populate.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capital">
          <Card>
            <CardHeader><CardTitle>Capital allocation</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Button size="sm" onClick={() => run("inv", () => ROE.recommendInvestment())} disabled={busy==="inv"}>{busy==="inv" ? "Computing…" : "Recommend today"}</Button>
              {(stats?.capital ?? []).map((a: any) => (
                <div key={a.id} className="flex justify-between border-b py-1">
                  <div><div className="font-medium">{a.resource}</div><div className="text-xs text-muted-foreground">{a.rationale}</div></div>
                  <div className="flex flex-col items-end text-xs">
                    <Badge>{Number(a.recommended_share_pct).toFixed(0)}%</Badge>
                    <span>${Number(a.expected_return_usd ?? 0).toFixed(0)} · conf {(Number(a.confidence)*100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulate">
          <Card>
            <CardHeader><CardTitle>Profit simulation</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Input placeholder="Scenario (e.g. raise cat-tree price 7%)" value={sim.scenario} onChange={(e) => setSim({...sim, scenario: e.target.value})} />
              <Textarea rows={3} placeholder='Intervention JSON (e.g. {"price_delta_pct":7})' value={sim.intervention} onChange={(e) => setSim({...sim, intervention: e.target.value})} />
              <Button onClick={() => {
                let parsed = {};
                try { parsed = JSON.parse(sim.intervention || "{}"); } catch { /* ignore */ }
                run("sim", () => ROE.simulate(sim.scenario, parsed));
              }} disabled={!sim.scenario || busy==="sim"}>{busy==="sim" ? "Simulating…" : "Simulate"}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecasts">
          <Card>
            <CardHeader><CardTitle>Forecasts</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => run("fc", () => ROE.predictRevenue("daily", 14))} disabled={busy==="fc"}>14-day daily</Button>
                <Button size="sm" variant="outline" onClick={() => run("fcw", () => ROE.predictRevenue("weekly", 8))} disabled={busy==="fcw"}>8-week weekly</Button>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b"><th className="text-left p-1">Date</th><th>Metric</th><th className="text-right">Forecast</th><th className="text-right">95% CI</th></tr></thead>
                <tbody>{(stats?.forecasts ?? []).slice(0, 30).map((f: any) => (
                  <tr key={f.id} className="border-b">
                    <td className="p-1">{f.target_date}</td><td>{f.metric}</td>
                    <td className="text-right">${Number(f.forecast ?? 0).toFixed(0)}</td>
                    <td className="text-right">${Number(f.ci_low ?? 0).toFixed(0)} – ${Number(f.ci_high ?? 0).toFixed(0)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardHeader><CardTitle>Pricing recommendations (approval required)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(stats?.pricing ?? []).map((p: any) => (
                <div key={p.id} className="border rounded p-2">
                  <div className="flex justify-between">
                    <div className="font-medium">{p.product_id}: ${p.current_price ?? "?"} → ${p.recommended_price}</div>
                    <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"}>{p.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.rationale}</div>
                  {p.status === "pending_approval" && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => run("apr", () => ROE.approvePricing(p.id, "human", "approved"))}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => run("rej", () => ROE.approvePricing(p.id, "human", "rejected"))}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scaling">
          <Card>
            <CardHeader><CardTitle>Scaling opportunities</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(stats?.scaling ?? []).map((s: any) => (
                <div key={s.id} className="border-b py-1 flex justify-between">
                  <div><div className="font-medium">{s.channel} · {s.target}</div><div className="text-xs text-muted-foreground">{s.rationale}</div></div>
                  <div className="flex flex-col items-end text-xs">
                    <Badge variant="outline">+${Number(s.expected_profit_usd ?? 0).toFixed(0)} profit</Badge>
                    <span>marg.return {Number(s.expected_marginal_return ?? 0).toFixed(2)}x</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader><CardTitle>Revenue knowledge search</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="e.g. cat tree, checkout, bundle" />
                <Button onClick={() => run("se", () => ROE.searchRevenueKnowledge(searchQ), setSearchRes)} disabled={!searchQ}>Search</Button>
              </div>
              {searchRes && <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(searchRes, null, 2)}</pre>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}