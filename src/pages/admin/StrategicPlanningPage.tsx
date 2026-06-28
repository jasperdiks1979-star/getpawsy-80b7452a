import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SPE } from "@/lib/spe/client";

type S = {
  objectives: any[]; initiatives: any[]; roadmap: any[]; risks: any[];
  scenarios: any[]; briefings: any[]; investments: any[];
  capabilities: any[]; maturity: any[];
};

export default function StrategicPlanningPage() {
  const [s, setS] = useState<S | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<any | null>(null);

  const refresh = async () => {
    try { setS(await SPE.stats() as S); } catch (e: any) { toast.error(e.message ?? "load failed"); }
  };
  useEffect(() => { refresh(); }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try { await fn(); toast.success(`${label} ✓`); await refresh(); }
    catch (e: any) { toast.error(`${label}: ${e.message ?? "failed"}`); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Strategic Planning Engine</h1>
          <p className="text-sm text-muted-foreground">Long-horizon navigator — 24h to 3y. Recommendations only, evidence-grounded.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("prioritize", SPE.prioritizeInitiatives)}>Prioritize</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("propose initiatives", () => SPE.generateInitiatives(5))}>Propose Initiatives</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("plan quarter", SPE.planQuarter)}>Plan Quarter</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("plan year", SPE.planYear)}>Plan Year</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("scenarios", () => SPE.generateScenarios("90d"))}>Scenarios</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("risks", SPE.analyzeRisks)}>Risks</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("maturity", SPE.scoreMaturity)}>Maturity</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("capabilities", SPE.mapCapabilities)}>Capabilities</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("resources", () => SPE.planResources())}>Resources</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("investments", () => SPE.recommendInvestments(5000))}>Investments</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("forecast", () => SPE.forecastObjectives())}>Forecast</Button>
          <Button size="sm" disabled={!!busy} onClick={() => run("daily brief", () => SPE.generateExecutiveBrief("daily"))}>Daily Brief</Button>
        </div>
      </header>

      <div className="flex gap-2 items-center">
        <Input placeholder="Search strategy (objectives, initiatives, risks, scenarios)" value={q} onChange={e => setQ(e.target.value)} className="max-w-md" />
        <Button variant="outline" size="sm" onClick={async () => setSearch(await SPE.searchStrategy(q))}>Search</Button>
        {search && <Button variant="ghost" size="sm" onClick={() => setSearch(null)}>Clear</Button>}
      </div>
      {search && (
        <Card><CardHeader><CardTitle>Search Results</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
            {(["objectives","initiatives","risks","scenarios"] as const).map(k => (
              <div key={k}>
                <div className="font-semibold mb-1">{k}</div>
                <ul className="space-y-1">{(search[k] ?? []).map((r: any) => <li key={r.id} className="truncate">• {r.title ?? r.scenario}</li>)}</ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="objectives">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
          <TabsTrigger value="initiatives">Initiatives</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="risks">Risks</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="maturity">Maturity</TabsTrigger>
          <TabsTrigger value="investments">Investments</TabsTrigger>
          <TabsTrigger value="briefings">Briefings</TabsTrigger>
        </TabsList>

        <TabsContent value="objectives">
          <Card><CardHeader><CardTitle>Strategic Objectives ({s?.objectives.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(s?.objectives ?? []).map(o => (
                <div key={o.id} className="flex justify-between border-b border-border/40 pb-1 gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{o.title}</div>
                    <div className="text-xs text-muted-foreground">{o.horizon} · {o.level} · {o.metric ?? "—"}</div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Badge variant="secondary">P {Number(o.priority ?? 0).toFixed(2)}</Badge>
                    <Badge variant="outline">{o.status}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="initiatives">
          <Card><CardHeader><CardTitle>Initiative Queue ({s?.initiatives.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(s?.initiatives ?? []).map(i => (
                <div key={i.id} className="border-b border-border/40 pb-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{i.title}</span>
                    <div className="flex gap-2 shrink-0">
                      <Badge variant="secondary">P {Number(i.priority ?? 0).toFixed(2)}</Badge>
                      <Badge variant="outline">{i.status}</Badge>
                      <Badge>ROI {Number(i.roi ?? 0).toFixed(2)}</Badge>
                    </div>
                  </div>
                  {i.rationale && <p className="text-xs text-muted-foreground mt-1">{i.rationale}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roadmap">
          <Card><CardHeader><CardTitle>Roadmap</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3 text-sm">
              {(["current_quarter","next_quarter","future_backlog","deferred"] as const).map(b => (
                <div key={b}>
                  <div className="font-semibold capitalize mb-2">{b.replace("_"," ")}</div>
                  <div className="space-y-1">
                    {(s?.roadmap ?? []).filter(r => r.bucket === b).map(r => (
                      <div key={r.id} className="text-xs border border-border/50 rounded p-1">
                        <div className="truncate">{r.initiative?.title ?? r.initiative_id}</div>
                        {r.target_date && <div className="text-muted-foreground">→ {r.target_date}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risks">
          <Card><CardHeader><CardTitle>Risk Register ({s?.risks.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(s?.risks ?? []).map(r => (
                <div key={r.id} className="border-b border-border/40 pb-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{r.title}</span>
                    <div className="flex gap-2 shrink-0">
                      <Badge variant="destructive">Sev {Number(r.severity ?? 0).toFixed(2)}</Badge>
                      <Badge variant="outline">P {Number(r.probability ?? 0).toFixed(2)}</Badge>
                      {r.impact_usd ? <Badge>${Number(r.impact_usd).toLocaleString()}</Badge> : null}
                    </div>
                  </div>
                  {r.mitigation && <p className="text-xs text-muted-foreground mt-1">Mitigation: {r.mitigation}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scenarios">
          <Card><CardHeader><CardTitle>Scenario Explorer</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(s?.scenarios ?? []).map(sc => (
                <div key={sc.id} className="border-b border-border/40 pb-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">{sc.scenario.replace(/_/g," ")}</span>
                    <div className="flex gap-2 shrink-0">
                      <Badge variant="outline">{sc.horizon}</Badge>
                      <Badge>Rev ${Number(sc.expected_revenue_usd ?? 0).toLocaleString()}</Badge>
                      <Badge variant="secondary">Conf {Number(sc.confidence ?? 0).toFixed(2)}</Badge>
                    </div>
                  </div>
                  {sc.strategic_response && <p className="text-xs text-muted-foreground mt-1">→ {sc.strategic_response}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capabilities">
          <Card><CardHeader><CardTitle>Capability Map</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
              {(s?.capabilities ?? []).map(c => (
                <div key={c.id} className="flex justify-between border-b border-border/40 pb-1">
                  <span>{c.capability}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{c.domain ?? "—"}</Badge>
                    <Badge variant="secondary">{Number(c.current_level ?? 0).toFixed(2)} / {Number(c.target_level ?? 0).toFixed(2)}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maturity">
          <Card><CardHeader><CardTitle>Business Maturity</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
              {(s?.maturity ?? []).map(m => (
                <div key={m.id} className="flex justify-between border-b border-border/40 pb-1">
                  <span className="capitalize">{m.domain}</span>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{Number(m.score ?? 0).toFixed(2)}</Badge>
                    {m.weakest_area && <Badge variant="outline">{m.weakest_area}</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investments">
          <Card><CardHeader><CardTitle>Recommended Investments</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(s?.investments ?? []).map(inv => (
                <div key={inv.id} className="border-b border-border/40 pb-2 flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{inv.target}</div>
                    {inv.rationale && <p className="text-xs text-muted-foreground">{inv.rationale}</p>}
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Badge>${Number(inv.amount_usd ?? 0).toLocaleString()}</Badge>
                    <Badge variant="outline">{inv.status}</Badge>
                    {inv.status === "recommended" && (
                      <>
                        <Button size="sm" variant="ghost" disabled={!!busy}
                          onClick={() => run("approve", () => SPE.approveInvestment(inv.id, "human", "approved"))}>Approve</Button>
                        <Button size="sm" variant="ghost" disabled={!!busy}
                          onClick={() => run("reject", () => SPE.approveInvestment(inv.id, "human", "rejected"))}>Reject</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="briefings">
          <Card><CardHeader><CardTitle>Executive Briefings</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(s?.briefings ?? []).map(b => (
                <div key={b.id} className="border border-border/50 rounded-lg p-3">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold capitalize">{b.cadence} · {b.period_end}</span>
                    <Badge variant="secondary">Conf {Number(b.confidence ?? 0).toFixed(2)}</Badge>
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{b.summary}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}