import { useEffect, useState } from "react";
import { GKG } from "@/lib/gkg/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function KnowledgeGraphPage() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<any>(null);

  const [reasonQ, setReasonQ] = useState("");
  const [reasonRes, setReasonRes] = useState<any>(null);

  const [rcSymptom, setRcSymptom] = useState("");
  const [rcRes, setRcRes] = useState<any>(null);

  const [briefTopic, setBriefTopic] = useState("");
  const [briefTarget, setBriefTarget] = useState("executive_board");
  const [briefRes, setBriefRes] = useState<any>(null);

  function refresh() {
    GKG.stats().then(setStats).catch((e) => setErr(e?.message ?? String(e)));
  }
  useEffect(refresh, []);

  async function run<T>(label: string, fn: () => Promise<T>, set: (v: T) => void) {
    setBusy(label); setErr(null);
    try { set(await fn()); refresh(); } catch (e: any) { setErr(e?.message ?? String(e)); } finally { setBusy(null); }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Knowledge Graph &amp; Reasoning Engine</h1>
        <p className="text-muted-foreground">
          Cognitive brain. Connects every DNA, generates hypotheses, traces root causes, prepares decision briefs. Recommendations only.
        </p>
      </div>

      {err && <Card><CardContent className="p-4 text-destructive">{err}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Nodes</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.node_count ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Active edges</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.active_edge_count ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Memories</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.memory_count ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open contradictions</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.contradictions?.length ?? 0}</CardContent></Card>
      </div>

      <Tabs defaultValue="reason">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="reason">Reason</TabsTrigger>
          <TabsTrigger value="hypotheses">Hypotheses</TabsTrigger>
          <TabsTrigger value="rootcause">Root cause</TabsTrigger>
          <TabsTrigger value="briefs">Decision briefs</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
        </TabsList>

        <TabsContent value="reason">
          <Card>
            <CardHeader><CardTitle>Reasoning Explorer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={3} value={reasonQ} onChange={(e) => setReasonQ(e.target.value)} placeholder="e.g. Why did cat-tree CTR drop in the US over the last 14 days?" />
              <div className="flex gap-2">
                <Button disabled={!reasonQ || busy === "reason"} onClick={() => run("reason", () => GKG.reason(reasonQ), setReasonRes)}>
                  {busy === "reason" ? "Reasoning…" : "Reason"}
                </Button>
              </div>
              {reasonRes && (
                <div className="space-y-2 text-sm">
                  <div><span className="font-semibold">Conclusion:</span> {reasonRes.conclusion} <Badge className="ml-2">conf {(reasonRes.confidence*100).toFixed(0)}%</Badge></div>
                  <div><span className="font-semibold">Consulted DNA:</span> {(reasonRes.consulted_dna ?? []).join(", ")}</div>
                  <details><summary className="cursor-pointer">Reasoning chain</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(reasonRes.reasoning_chain, null, 2)}</pre></details>
                  <details><summary className="cursor-pointer">Alternatives</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(reasonRes.alternatives, null, 2)}</pre></details>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hypotheses">
          <Card>
            <CardHeader><CardTitle>Hypothesis Library</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={2} value={reasonQ} onChange={(e) => setReasonQ(e.target.value)} placeholder="Ask a question to generate 5 hypotheses…" />
              <Button disabled={!reasonQ || busy === "hyp"} onClick={() => run("hyp", () => GKG.generateHypotheses(reasonQ, 5), setReasonRes)}>
                {busy === "hyp" ? "Generating…" : "Generate hypotheses"}
              </Button>
              <div className="space-y-2 text-sm">
                {(stats?.hot_hypotheses ?? []).map((h: any) => (
                  <div key={h.id} className="border rounded p-2">
                    <div className="flex justify-between"><div className="font-medium">{h.hypothesis}</div><Badge>{(h.confidence*100).toFixed(0)}%</Badge></div>
                    <div className="text-xs text-muted-foreground">{h.question}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rootcause">
          <Card>
            <CardHeader><CardTitle>Root Cause Explorer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={2} value={rcSymptom} onChange={(e) => setRcSymptom(e.target.value)} placeholder="Describe the symptom (e.g. mobile checkout conversion dropped 30% on Safari)" />
              <Button disabled={!rcSymptom || busy === "rc"} onClick={() => run("rc", () => GKG.findRootCause(rcSymptom), setRcRes)}>
                {busy === "rc" ? "Analyzing…" : "Find root cause"}
              </Button>
              {rcRes && (
                <div className="text-sm space-y-2">
                  <div><span className="font-semibold">Root cause:</span> {rcRes.root_cause} <Badge className="ml-2">conf {(rcRes.confidence*100).toFixed(0)}%</Badge></div>
                  <details open><summary className="cursor-pointer">Causal chain</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify(rcRes.cause_chain, null, 2)}</pre></details>
                </div>
              )}
              <div className="space-y-2 text-sm">
                {(stats?.recent_root_causes ?? []).map((r: any) => (
                  <div key={r.id} className="border rounded p-2">
                    <div className="font-medium">{r.symptom}</div>
                    <div className="text-xs text-muted-foreground">→ {r.root_cause} · conf {(r.confidence*100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="briefs">
          <Card>
            <CardHeader><CardTitle>Decision Briefs</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={briefTopic} onChange={(e) => setBriefTopic(e.target.value)} placeholder="Decision topic (e.g. should we increase cat-tree price by 5%?)" />
              <div className="flex gap-2 items-center">
                <select className="border rounded px-2 py-1 bg-background" value={briefTarget} onChange={(e) => setBriefTarget(e.target.value)}>
                  <option value="growth_director">Growth Director</option>
                  <option value="executive_board">Executive Board</option>
                  <option value="revenue_ai">Revenue AI</option>
                  <option value="creative_ai">Creative AI</option>
                  <option value="pricing_ai">Pricing AI</option>
                  <option value="governance">Governance</option>
                </select>
                <Button disabled={!briefTopic || busy === "brief"} onClick={() => run("brief", () => GKG.buildDecisionBrief(briefTopic, briefTarget), setBriefRes)}>
                  {busy === "brief" ? "Building…" : "Build brief"}
                </Button>
              </div>
              {briefRes && (
                <div className="text-sm space-y-2">
                  <div><span className="font-semibold">Recommendation:</span> {briefRes.recommendation}</div>
                  <div className="text-muted-foreground">{briefRes.summary}</div>
                  <details><summary className="cursor-pointer">Evidence / Risks / Alternatives</summary><pre className="whitespace-pre-wrap bg-muted p-2 rounded text-xs">{JSON.stringify({ evidence: briefRes.evidence, risks: briefRes.risks, alternatives: briefRes.alternatives }, null, 2)}</pre></details>
                </div>
              )}
              <div className="space-y-2 text-sm">
                {(stats?.briefs ?? []).map((b: any) => (
                  <div key={b.id} className="border rounded p-2">
                    <div className="flex justify-between"><div className="font-medium">{b.decision_topic}</div><Badge variant="outline">{b.target_consumer}</Badge></div>
                    <div className="text-xs text-muted-foreground">{b.recommendation}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader><CardTitle>Knowledge Search</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="e.g. cat tree, refund risk, BFCM, dog owners" />
                <Button onClick={() => run("search", () => GKG.searchKnowledge(searchQ), setSearchRes)}>Search</Button>
              </div>
              {searchRes && (
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div><div className="font-semibold mb-1">Nodes</div>
                    <ul className="space-y-1">{(searchRes.nodes ?? []).map((n: any) => (
                      <li key={n.id} className="border-b py-1"><Badge variant="outline" className="mr-2">{n.node_type}</Badge>{n.label}</li>
                    ))}</ul></div>
                  <div><div className="font-semibold mb-1">Memories</div>
                    <ul className="space-y-1">{(searchRes.memories ?? []).map((m: any) => (
                      <li key={m.id} className="border-b py-1"><Badge className="mr-2">{m.memory_type}</Badge>{m.title}</li>
                    ))}</ul></div>
                  <div><div className="font-semibold mb-1">Hypotheses</div>
                    <ul className="space-y-1">{(searchRes.hypotheses ?? []).map((h: any) => (
                      <li key={h.id} className="border-b py-1">{h.hypothesis}</li>
                    ))}</ul></div>
                  <div><div className="font-semibold mb-1">Traces</div>
                    <ul className="space-y-1">{(searchRes.traces ?? []).map((t: any) => (
                      <li key={t.id} className="border-b py-1">{t.question} → <span className="text-muted-foreground">{t.conclusion}</span></li>
                    ))}</ul></div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graph">
          <Card>
            <CardHeader><CardTitle>Top nodes &amp; recent reasoning</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold mb-1">Top nodes by importance</div>
                <ul className="space-y-1">{(stats?.top_nodes ?? []).map((n: any) => (
                  <li key={n.id} className="flex justify-between border-b py-1">
                    <span><Badge variant="outline" className="mr-2">{n.node_type}</Badge>{n.label}</span>
                    <span className="text-muted-foreground text-xs">imp {(Number(n.importance)*100).toFixed(0)}% · conf {(Number(n.confidence)*100).toFixed(0)}%</span>
                  </li>
                ))}</ul>
              </div>
              <div>
                <div className="font-semibold mb-1">Recent reasoning traces</div>
                <ul className="space-y-1">{(stats?.recent_traces ?? []).map((t: any) => (
                  <li key={t.id} className="border-b py-1">
                    <div className="font-medium">{t.question}</div>
                    <div className="text-xs text-muted-foreground">{t.conclusion} · {(Number(t.confidence)*100).toFixed(0)}% · {t.source_engine}</div>
                  </li>
                ))}</ul>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button variant="outline" onClick={() => run("evolve", () => GKG.evolve(), () => {})}>Run nightly evolution</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}