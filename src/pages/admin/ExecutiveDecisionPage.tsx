import { useEffect, useState } from "react";
import { EDE } from "@/lib/ede/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const PROPOSAL_TYPES = ["pinterest","tiktok","creative","budget","pricing","bundle","discount","supplier","inventory","seo","publish_freq","experiment","expansion","retire","launch","feature","infrastructure"];

export default function ExecutiveDecisionPage() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState<string|null>(null);
  const [selected, setSelected] = useState<any>(null);

  const [form, setForm] = useState({ proposal_type: "pinterest", title: "", summary: "", risk_level: "medium", submitted_by: "ui", estimated_impact_usd: "" });

  function refresh() { EDE.stats().then(setStats).catch((e:any) => setErr(e?.message ?? String(e))); }
  useEffect(refresh, []);

  async function run<T>(label: string, fn: () => Promise<T>, after?: (v:T) => void) {
    setBusy(label); setErr(null);
    try { const r = await fn(); after?.(r); refresh(); }
    catch (e:any) { setErr(e?.message ?? String(e)); }
    finally { setBusy(null); }
  }

  async function submit() {
    if (!form.title || !form.summary) return;
    await run("submit", () => EDE.proposeDecision({
      ...form,
      estimated_impact_usd: form.estimated_impact_usd ? Number(form.estimated_impact_usd) : null,
    }), (p: any) => setSelected({ proposal: p }));
    setForm((f) => ({ ...f, title: "", summary: "" }));
  }

  async function evaluate(proposal_id: string) {
    await run("evaluate", () => EDE.evaluateProposal(proposal_id), async () => {
      const detail = await EDE.getProposal(proposal_id);
      setSelected(detail);
    });
  }

  async function openProposal(id: string) {
    setErr(null);
    try { setSelected(await EDE.getProposal(id)); } catch (e:any) { setErr(e?.message ?? String(e)); }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Executive Decision Engine</h1>
        <p className="text-muted-foreground">
          Permanent AI executive board. Every strategic decision evaluated via alternatives, scenarios, business-value scoring, and weighted consensus. Recommendations only.
        </p>
      </div>

      {err && <Card><CardContent className="p-4 text-destructive">{err}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Pending proposals</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.pending_count ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Total proposals</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.total_count ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Executives</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.executives?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Recent decisions</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats?.recent_decisions?.length ?? 0}</CardContent></Card>
      </div>

      <Tabs defaultValue="board">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="new">New proposal</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="detail">Decision detail</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <Card>
            <CardHeader><CardTitle>Executive Board &amp; Scorecards</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-3">
                {(stats?.executives ?? []).map((ex: any) => (
                  <div key={ex.id} className="border rounded p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold">{ex.title}</div>
                        <div className="text-xs text-muted-foreground">{ex.perspective}</div>
                      </div>
                      <Badge variant="outline">w {Number(ex.weight).toFixed(2)}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs mt-2">
                      <div>Pred {(Number(ex.prediction_accuracy)*100).toFixed(0)}%</div>
                      <div>Fin {(Number(ex.financial_accuracy)*100).toFixed(0)}%</div>
                      <div>Biz {(Number(ex.business_accuracy)*100).toFixed(0)}%</div>
                      <div>Trust {(Number(ex.trust_score)*100).toFixed(0)}%</div>
                      <div>Calib {(Number(ex.confidence_calibration)*100).toFixed(0)}%</div>
                      <div>Votes {ex.vote_count}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Button variant="outline" onClick={() => run("recalc", () => EDE.recalcWeights())} disabled={busy==="recalc"}>
                  {busy === "recalc" ? "Recalculating…" : "Recalculate weights"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardHeader><CardTitle>Submit Proposal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <select className="border rounded px-2 py-1 bg-background" value={form.proposal_type} onChange={(e) => setForm({...form, proposal_type: e.target.value})}>
                  {PROPOSAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="border rounded px-2 py-1 bg-background" value={form.risk_level} onChange={(e) => setForm({...form, risk_level: e.target.value})}>
                  {["low","medium","high","critical"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input className="w-40" placeholder="impact $ (opt)" value={form.estimated_impact_usd} onChange={(e) => setForm({...form, estimated_impact_usd: e.target.value})} />
              </div>
              <Input placeholder="Title" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} />
              <Textarea rows={4} placeholder="Summary — what, why, baseline vs intervention" value={form.summary} onChange={(e) => setForm({...form, summary: e.target.value})} />
              <div className="flex gap-2">
                <Button onClick={submit} disabled={busy==="submit" || !form.title || !form.summary}>{busy==="submit" ? "Submitting…" : "Submit proposal"}</Button>
                {selected?.proposal?.id && (
                  <Button variant="default" onClick={() => evaluate(selected.proposal.id)} disabled={busy==="evaluate"}>
                    {busy === "evaluate" ? "Evaluating…" : "Evaluate (alternatives + scenarios + vote)"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader><CardTitle>Decision Queue</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(stats?.recent_proposals ?? []).map((p: any) => (
                <div key={p.id} className="flex justify-between border-b py-2">
                  <div>
                    <button className="font-medium underline-offset-2 hover:underline" onClick={() => openProposal(p.id)}>{p.title}</button>
                    <div className="text-xs text-muted-foreground">{p.proposal_type} · risk {p.risk_level}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge>{p.status}</Badge>
                    {(p.status === "draft" || p.status === "voting") && (
                      <Button size="sm" variant="outline" onClick={() => evaluate(p.id)} disabled={busy === "evaluate"}>Evaluate</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail">
          <Card>
            <CardHeader><CardTitle>Decision Detail</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!selected?.proposal && <div className="text-muted-foreground">Select a proposal from the queue.</div>}
              {selected?.proposal && (
                <>
                  <div>
                    <div className="font-semibold text-base">{selected.proposal.title}</div>
                    <div className="text-xs text-muted-foreground">{selected.proposal.proposal_type} · risk {selected.proposal.risk_level} · status {selected.proposal.status}</div>
                  </div>
                  <div>{selected.proposal.summary}</div>
                  {selected.decision && (
                    <div className="border rounded p-3 bg-muted/40">
                      <div className="flex justify-between">
                        <div className="font-semibold">Outcome: {selected.decision.outcome}</div>
                        <Badge>conf {(Number(selected.decision.confidence)*100).toFixed(0)}%</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{selected.decision.rationale}</div>
                      {selected.decision.governance_required && <Badge variant="destructive" className="mr-1">Governance required</Badge>}
                      {selected.decision.human_required && <Badge variant="destructive">Human approval</Badge>}
                    </div>
                  )}
                  <details open><summary className="cursor-pointer font-semibold">Votes</summary>
                    <div className="space-y-1 mt-2">
                      {(selected.votes ?? []).map((v: any) => (
                        <div key={v.id} className="border rounded p-2">
                          <div className="flex justify-between">
                            <span className="font-medium">{v.ede_executives?.title ?? v.executive_id}</span>
                            <Badge variant={v.vote === "approve" ? "default" : v.vote === "reject" ? "destructive" : "outline"}>{v.vote} · {(Number(v.confidence)*100).toFixed(0)}%</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{v.reasoning}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                  <details><summary className="cursor-pointer font-semibold">Alternatives</summary>
                    <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.alternatives, null, 2)}</pre>
                  </details>
                  <details><summary className="cursor-pointer font-semibold">Scenarios</summary>
                    <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.scenarios, null, 2)}</pre>
                  </details>
                  <details><summary className="cursor-pointer font-semibold">Business value</summary>
                    <pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(selected.business_value, null, 2)}</pre>
                  </details>
                  {selected.decision?.outcome === "approved" && selected.proposal.status !== "executed" && (
                    <Button onClick={() => run("approve", () => EDE.approveDecision(selected.proposal.id, "human"), () => openProposal(selected.proposal.id))}>
                      Mark executed
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>Recent decisions</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(stats?.recent_decisions ?? []).map((d: any) => (
                <div key={d.proposal_id} className="border-b py-2 flex justify-between">
                  <div>
                    <button className="font-medium underline-offset-2 hover:underline" onClick={() => openProposal(d.proposal_id)}>{d.proposal_id.slice(0, 8)}</button>
                    <div className="text-xs text-muted-foreground">approval {(Number(d.approval_pct)*100).toFixed(0)}% · conf {(Number(d.confidence)*100).toFixed(0)}%</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {d.governance_required && <Badge variant="destructive">gov</Badge>}
                    {d.human_required && <Badge variant="destructive">human</Badge>}
                    <Badge>{d.outcome}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}