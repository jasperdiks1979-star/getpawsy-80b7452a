import { useEffect, useState } from "react";
import { AEE } from "@/lib/aee/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const AREAS = ["pinterest","creative","headline","cta","image","video","typography","badge","hook","board","publish_time","publish_freq","seasonality","keyword","seo","landing","pdp","product_order","bundle","pricing","discount","shipping","trust","review","email","push"];

export default function ExperimentationPage() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState<string|null>(null);
  const [selected, setSelected] = useState<any>(null);

  const [hyp, setHyp] = useState({ area: "pinterest", statement: "", business_rationale: "", expected_profit_usd: "", risk: "0.4", confidence: "0.5" });
  const [exp, setExp] = useState({ area: "pinterest", name: "", objective: "", primary_metric: "ctr", business_metric: "profit", rollout_pct: "5", risk_level: "medium" });

  function refresh() { AEE.stats().then(setStats).catch((e:any) => setErr(e?.message ?? String(e))); }
  useEffect(refresh, []);

  async function run<T>(label: string, fn: () => Promise<T>, after?: (v:T) => void) {
    setBusy(label); setErr(null);
    try { const r = await fn(); after?.(r); refresh(); }
    catch (e:any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(null); }
  }

  async function open(id: string) {
    try { setSelected(await AEE.getExperiment(id)); } catch (e:any) { setErr(e?.message ?? String(e)); }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Autonomous Experimentation Engine</h1>
        <p className="text-muted-foreground">
          Scientific lab. Every assumption becomes testable. Progressive rollout, statistical + business evaluation, automatic safety, permanent learning.
        </p>
      </div>

      {err && <Card><CardContent className="p-4 text-destructive">{err}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Live experiments</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.live_count ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Total experiments</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.total_count ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open hypotheses</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.open_hypotheses ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Active playbooks</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.playbooks?.length ?? 0}</CardContent></Card>
      </div>

      <Tabs defaultValue="live">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="detail">Detail</TabsTrigger>
          <TabsTrigger value="winners">Winners</TabsTrigger>
          <TabsTrigger value="failures">Failures</TabsTrigger>
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <Card>
            <CardHeader><CardTitle>Recent experiments</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(stats?.recent_experiments ?? []).map((e: any) => (
                <div key={e.id} className="border-b py-2 flex justify-between">
                  <div>
                    <button className="font-medium underline-offset-2 hover:underline" onClick={() => open(e.id)}>{e.name}</button>
                    <div className="text-xs text-muted-foreground">{e.area} · rollout {e.rollout_pct}%</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge>{e.status}</Badge>
                    {e.status === "approved" && <Button size="sm" onClick={() => run("launch", () => AEE.launchExperiment(e.id))}>Launch</Button>}
                    {e.status === "running" && <Button size="sm" variant="outline" onClick={() => run("evaluate", () => AEE.evaluateExperiment(e.id), () => open(e.id))}>Evaluate</Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>1. Hypothesis</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <select className="border rounded px-2 py-1 bg-background w-full" value={hyp.area} onChange={(e) => setHyp({...hyp, area: e.target.value})}>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <Textarea rows={3} placeholder="Hypothesis statement" value={hyp.statement} onChange={(e) => setHyp({...hyp, statement: e.target.value})} />
                <Textarea rows={2} placeholder="Business rationale" value={hyp.business_rationale} onChange={(e) => setHyp({...hyp, business_rationale: e.target.value})} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="exp profit $" value={hyp.expected_profit_usd} onChange={(e) => setHyp({...hyp, expected_profit_usd: e.target.value})} />
                  <Input placeholder="risk 0..1" value={hyp.risk} onChange={(e) => setHyp({...hyp, risk: e.target.value})} />
                  <Input placeholder="confidence 0..1" value={hyp.confidence} onChange={(e) => setHyp({...hyp, confidence: e.target.value})} />
                </div>
                <Button disabled={!hyp.statement || busy==="hyp"} onClick={() => run("hyp", () => AEE.createHypothesis({ ...hyp, expected_profit_usd: hyp.expected_profit_usd ? Number(hyp.expected_profit_usd) : null, risk: Number(hyp.risk), confidence: Number(hyp.confidence) }))}>
                  {busy === "hyp" ? "Saving…" : "Save hypothesis"}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>2. Experiment (A/B)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <select className="border rounded px-2 py-1 bg-background w-full" value={exp.area} onChange={(e) => setExp({...exp, area: e.target.value})}>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <Input placeholder="Name" value={exp.name} onChange={(e) => setExp({...exp, name: e.target.value})} />
                <Textarea rows={2} placeholder="Objective" value={exp.objective} onChange={(e) => setExp({...exp, objective: e.target.value})} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="primary metric (ctr/cvr/...)" value={exp.primary_metric} onChange={(e) => setExp({...exp, primary_metric: e.target.value})} />
                  <select className="border rounded px-2 py-1 bg-background" value={exp.business_metric} onChange={(e) => setExp({...exp, business_metric: e.target.value})}>
                    {["profit","revenue","cvr","ltv"].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="border rounded px-2 py-1 bg-background" value={exp.rollout_pct} onChange={(e) => setExp({...exp, rollout_pct: e.target.value})}>
                    {["1","5","10","25","50","100"].map((p) => <option key={p} value={p}>{p}%</option>)}
                  </select>
                  <select className="border rounded px-2 py-1 bg-background" value={exp.risk_level} onChange={(e) => setExp({...exp, risk_level: e.target.value})}>
                    {["low","medium","high","critical"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <Button disabled={!exp.name || !exp.objective || busy==="exp"} onClick={() => run("exp", () => AEE.createExperiment({ ...exp, rollout_pct: Number(exp.rollout_pct) }), (e: any) => open(e.id))}>
                  {busy === "exp" ? "Creating…" : "Create experiment"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="detail">
          <Card>
            <CardHeader><CardTitle>Experiment Detail</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!selected?.experiment && <div className="text-muted-foreground">Open an experiment from the Live tab.</div>}
              {selected?.experiment && (
                <>
                  <div>
                    <div className="font-semibold text-base">{selected.experiment.name}</div>
                    <div className="text-xs text-muted-foreground">{selected.experiment.area} · {selected.experiment.design} · status {selected.experiment.status} · rollout {selected.experiment.rollout_pct}%</div>
                  </div>
                  <div>{selected.experiment.objective}</div>
                  <div className="flex gap-2 flex-wrap">
                    {selected.experiment.status === "draft" && <Button size="sm" onClick={() => run("approve", () => AEE.approveExperiment(selected.experiment.id), () => open(selected.experiment.id))}>Approve</Button>}
                    {selected.experiment.status === "approved" && <Button size="sm" onClick={() => run("launch", () => AEE.launchExperiment(selected.experiment.id), () => open(selected.experiment.id))}>Launch</Button>}
                    {selected.experiment.status === "running" && <Button size="sm" variant="outline" onClick={() => run("pause", () => AEE.pauseExperiment(selected.experiment.id, "manual"), () => open(selected.experiment.id))}>Pause</Button>}
                    {(selected.experiment.status === "running" || selected.experiment.status === "paused") && <Button size="sm" variant="destructive" onClick={() => run("stop", () => AEE.stopExperiment(selected.experiment.id, "manual"), () => open(selected.experiment.id))}>Stop</Button>}
                    <Button size="sm" variant="outline" onClick={() => run("eval", () => AEE.evaluateExperiment(selected.experiment.id), () => open(selected.experiment.id))}>Evaluate</Button>
                    <Button size="sm" onClick={() => run("winner", () => AEE.declareWinner(selected.experiment.id), () => open(selected.experiment.id))}>Declare winner</Button>
                    <Button size="sm" variant="outline" onClick={() => run("learn", () => AEE.generateLearning(selected.experiment.id))}>Generate learning</Button>
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Variants</div>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b"><th className="text-left p-1">Variant</th><th>Control</th><th>Exposure</th><th>Successes</th><th>CR</th><th>Profit</th></tr></thead>
                      <tbody>{(selected.variants ?? []).map((v: any) => (
                        <tr key={v.id} className="border-b">
                          <td className="p-1">{v.label}</td><td className="text-center">{v.is_control ? "✓" : ""}</td>
                          <td className="text-right">{v.exposure}</td><td className="text-right">{v.successes}</td>
                          <td className="text-right">{v.exposure > 0 ? ((v.successes/v.exposure)*100).toFixed(2) : "0"}%</td>
                          <td className="text-right">${Number(v.profit_sum ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <details><summary className="cursor-pointer font-semibold">Latest results</summary>
                    <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.results, null, 2)}</pre>
                  </details>
                  {selected.winner && <details open><summary className="cursor-pointer font-semibold">Winner</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.winner, null, 2)}</pre></details>}
                  {selected.failure && <details open><summary className="cursor-pointer font-semibold">Failure</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.failure, null, 2)}</pre></details>}
                  {(selected.safety ?? []).length > 0 && <details><summary className="cursor-pointer font-semibold">Safety log</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.safety, null, 2)}</pre></details>}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="winners">
          <Card><CardHeader><CardTitle>Winning experiments</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">{(stats?.winners ?? []).map((w: any) => (
              <div key={w.id} className="border-b py-2 flex justify-between">
                <div><button className="font-medium underline-offset-2 hover:underline" onClick={() => open(w.experiment_id)}>{w.experiment_id.slice(0,8)}</button>
                  <div className="text-xs text-muted-foreground">lift {(Number(w.business_lift_pct)*100).toFixed(1)}% · profit Δ ${Number(w.profit_lift_usd ?? 0).toFixed(2)}</div></div>
                <Badge>conf {(Number(w.confidence)*100).toFixed(0)}%</Badge>
              </div>
            ))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failures">
          <Card><CardHeader><CardTitle>Failure intelligence</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">{(stats?.failures ?? []).map((f: any) => (
              <div key={f.id} className="border-b py-2"><div className="font-medium">{f.why_failed}</div>{f.lessons && <div className="text-xs text-muted-foreground">{f.lessons}</div>}</div>
            ))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="playbooks">
          <Card><CardHeader><CardTitle>Reusable playbooks</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">{(stats?.playbooks ?? []).map((p: any) => (
              <div key={p.id} className="border-b py-2">
                <div className="flex justify-between"><div className="font-medium">{p.name}</div><Badge variant="outline">{p.area}</Badge></div>
                <div className="text-xs text-muted-foreground">lift ${Number(p.business_lift_usd ?? 0).toFixed(2)} · reused {p.reuse_count}×</div>
              </div>
            ))}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ideas">
          <Card><CardHeader><CardTitle>Recommended next experiments</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Button onClick={() => run("rec", () => AEE.recommendExperiment(5))} disabled={busy === "rec"}>
                {busy === "rec" ? "Generating…" : "Generate today's recommendations"}
              </Button>
              {(stats?.recommendations ?? []).map((r: any) => (
                <div key={r.id} className="border rounded p-2">
                  <div className="flex justify-between"><div className="font-medium">{r.title}</div><Badge variant="outline">{r.recommendation_type}</Badge></div>
                  <div className="text-xs text-muted-foreground">{r.rationale}</div>
                  <div className="text-xs">value ${Number(r.expected_value_usd ?? 0).toFixed(0)} · conf {(Number(r.confidence)*100).toFixed(0)}%</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}