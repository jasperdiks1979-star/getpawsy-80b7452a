import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GVCAE } from "@/lib/gvcae/client";

type Row = Record<string, any>;

export default function ArchitecturePage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [modules, setModules] = useState<Row[]>([]);
  const [health, setHealth] = useState<Row[]>([]);
  const [deps, setDeps] = useState<Row[]>([]);
  const [dupes, setDupes] = useState<Row[]>([]);
  const [value, setValue] = useState<Row[]>([]);
  const [proposals, setProposals] = useState<Row[]>([]);
  const [debt, setDebt] = useState<Row[]>([]);
  const [scorecards, setScorecards] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [impactTitle, setImpactTitle] = useState("");
  const [impactModules, setImpactModules] = useState("");

  const refresh = async () => {
    const [m, h, d, du, v, p, td, sc, rv, r] = await Promise.all([
      supabase.from("gvcae_modules").select("*").order("key"),
      supabase.from("gvcae_health_scores").select("*").order("captured_at", { ascending: false }).limit(200),
      supabase.from("gvcae_dependencies").select("*"),
      supabase.from("gvcae_duplicates").select("*").order("detected_at", { ascending: false }).limit(100),
      supabase.from("gvcae_value_analysis").select("*").order("captured_at", { ascending: false }).limit(200),
      supabase.from("gvcae_simplification_proposals").select("*").order("proposed_at", { ascending: false }).limit(100),
      supabase.from("gvcae_tech_debt").select("*").order("priority_score", { ascending: false }).limit(100),
      supabase.from("gvcae_scorecards").select("*").order("captured_at", { ascending: false }).limit(12),
      supabase.from("gvcae_reviews").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("gvcae_audit_runs").select("*").order("started_at", { ascending: false }).limit(20),
    ]);
    setModules(m.data ?? []);
    setHealth(h.data ?? []);
    setDeps(d.data ?? []);
    setDupes(du.data ?? []);
    setValue(v.data ?? []);
    setProposals(p.data ?? []);
    setDebt(td.data ?? []);
    setScorecards(sc.data ?? []);
    setReviews(rv.data ?? []);
    setRuns(r.data ?? []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try {
      await fn();
      toast.success(`${label} complete`);
      await refresh();
    } catch (e: any) {
      toast.error(`${label} failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const latestHealthByModule = useMemo(() => {
    const map = new Map<string, Row>();
    for (const h of health) if (!map.has(h.module_key)) map.set(h.module_key, h);
    return map;
  }, [health]);

  const filteredModules = modules.filter((m) =>
    !search ? true : `${m.key} ${m.name} ${m.domain}`.toLowerCase().includes(search.toLowerCase()),
  );

  const latestScorecard = scorecards[0];

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Architecture · GVCAE</h1>
          <p className="text-muted-foreground text-sm">
            Continuous architecture verification, simplification, and value governance.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button disabled={!!busy} onClick={() => run("Full audit", () => GVCAE.runFullAudit())}>
            {busy === "Full audit" ? "Running…" : "Run full audit"}
          </Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => run("Seed", () => GVCAE.seed())}>
            Seed modules
          </Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => run("Score", () => GVCAE.scoreHealth())}>
            Re-score health
          </Button>
        </div>
      </header>

      {latestScorecard && (
        <Card>
          <CardHeader>
            <CardTitle>Architecture scorecard — {latestScorecard.period}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            {[
              ["Overall", latestScorecard.overall_score],
              ["Maintainability", latestScorecard.maintainability],
              ["Reliability", latestScorecard.reliability],
              ["Performance", latestScorecard.performance],
              ["Security", latestScorecard.security],
              ["Modularity", latestScorecard.modularity],
              ["Observability", latestScorecard.observability],
              ["Testability", latestScorecard.testability],
              ["Documentation", latestScorecard.documentation],
              ["Knowledge reuse", latestScorecard.knowledge_reuse],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded border p-3">
                <div className="text-muted-foreground text-xs">{k}</div>
                <div className="text-2xl font-semibold">{v ?? "—"}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="modules" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          <TabsTrigger value="value">Value</TabsTrigger>
          <TabsTrigger value="simplification">Simplification</TabsTrigger>
          <TabsTrigger value="debt">Tech debt</TabsTrigger>
          <TabsTrigger value="reviews">Monthly reviews</TabsTrigger>
          <TabsTrigger value="impact">Change impact</TabsTrigger>
          <TabsTrigger value="runs">Audit runs</TabsTrigger>
        </TabsList>

        <TabsContent value="modules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Module registry ({filteredModules.length})</CardTitle>
              <Input
                placeholder="Search modules…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Key</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Kind</th>
                    <th className="p-2">Domain</th>
                    <th className="p-2">Health</th>
                    <th className="p-2">Complexity</th>
                    <th className="p-2">Coupling</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((m) => {
                    const h = latestHealthByModule.get(m.key);
                    return (
                      <tr key={m.id} className="border-t">
                        <td className="p-2 font-mono">{m.key}</td>
                        <td className="p-2">{m.name}</td>
                        <td className="p-2">{m.kind}</td>
                        <td className="p-2">{m.domain}</td>
                        <td className="p-2">{h?.overall ?? "—"}</td>
                        <td className="p-2">{h?.complexity ?? "—"}</td>
                        <td className="p-2">{h?.coupling ?? "—"}</td>
                        <td className="p-2">
                          <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dependencies">
          <Card>
            <CardHeader>
              <CardTitle>Dependency graph ({deps.length} edges)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">From</th>
                    <th className="p-2">→</th>
                    <th className="p-2">To</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Criticality</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-2 font-mono">{d.from_module}</td>
                      <td className="p-2">→</td>
                      <td className="p-2 font-mono">{d.to_module}</td>
                      <td className="p-2">{d.dep_type}</td>
                      <td className="p-2">{d.criticality}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicates">
          <Card>
            <CardHeader>
              <CardTitle>Detected duplication ({dupes.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {dupes.map((d) => (
                <div key={d.id} className="border rounded p-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{d.category}</span>
                    <Badge variant="outline">similarity {Math.round((d.similarity ?? 0) * 100)}%</Badge>
                  </div>
                  <div className="text-muted-foreground">{(d.members ?? []).join(" · ")}</div>
                  <div className="mt-1">{d.recommendation}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="value">
          <Card>
            <CardHeader>
              <CardTitle>Value analysis</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Module</th>
                    <th className="p-2">Business</th>
                    <th className="p-2">Revenue</th>
                    <th className="p-2">Cost</th>
                    <th className="p-2">Net</th>
                    <th className="p-2">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {value.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="p-2 font-mono">{v.module_key}</td>
                      <td className="p-2">{v.business_value}</td>
                      <td className="p-2">{v.revenue_contribution}</td>
                      <td className="p-2">
                        {(
                          (v.dev_cost ?? 0) * 0.1 +
                          (v.maintenance_cost ?? 0) +
                          (v.operational_cost ?? 0) +
                          (v.ai_credit_cost ?? 0) +
                          (v.infra_cost ?? 0)
                        ).toFixed(1)}
                      </td>
                      <td className="p-2">{v.net_value}</td>
                      <td className="p-2">
                        <Badge
                          variant={
                            v.verdict === "retire_candidate" ? "destructive" : v.verdict === "watch" ? "secondary" : "default"
                          }
                        >
                          {v.verdict}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simplification">
          <Card>
            <CardHeader>
              <CardTitle>Simplification proposals ({proposals.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {proposals.map((p) => (
                <div key={p.id} className="border rounded p-3">
                  <div className="flex justify-between gap-2">
                    <Badge>{p.proposal_type}</Badge>
                    <span className="text-muted-foreground">{p.status}</span>
                  </div>
                  <div className="font-medium mt-1">{p.summary}</div>
                  <div className="text-muted-foreground text-xs mt-1">
                    targets: {(p.targets ?? []).join(" · ")} · effort {p.effort} · risk {p.risk}
                  </div>
                  {p.expected_benefit && <div className="mt-1">{p.expected_benefit}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debt">
          <Card>
            <CardHeader>
              <CardTitle>Technical debt backlog ({debt.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Module</th>
                    <th className="p-2">Title</th>
                    <th className="p-2">Severity</th>
                    <th className="p-2">Priority</th>
                    <th className="p-2">ROI</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {debt.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-2 font-mono">{d.module_key}</td>
                      <td className="p-2">{d.title}</td>
                      <td className="p-2">
                        <Badge variant={d.severity === "high" ? "destructive" : "secondary"}>{d.severity}</Badge>
                      </td>
                      <td className="p-2">{d.priority_score}</td>
                      <td className="p-2">{d.expected_roi}</td>
                      <td className="p-2">{d.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card>
            <CardHeader>
              <CardTitle>Monthly architect reviews</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {reviews.map((r) => (
                <div key={r.id} className="border rounded p-3">
                  <div className="font-semibold">{r.period}</div>
                  <div className="text-muted-foreground mt-1">{r.summary}</div>
                  <div className="grid md:grid-cols-3 gap-3 mt-2">
                    <div>
                      <div className="text-xs font-semibold">To merge</div>
                      <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(r.to_merge, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="text-xs font-semibold">To remove</div>
                      <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(r.to_remove, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="text-xs font-semibold">To rewrite</div>
                      <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(r.to_rewrite, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact">
          <Card>
            <CardHeader>
              <CardTitle>Change impact analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid md:grid-cols-2 gap-2">
                <Input placeholder="Change title" value={impactTitle} onChange={(e) => setImpactTitle(e.target.value)} />
                <Input
                  placeholder="Modules affected (comma separated keys)"
                  value={impactModules}
                  onChange={(e) => setImpactModules(e.target.value)}
                />
              </div>
              <Button
                disabled={!!busy || !impactTitle}
                onClick={() =>
                  run("Impact", () =>
                    GVCAE.changeImpact(
                      impactTitle,
                      impactModules.split(",").map((s) => s.trim()).filter(Boolean),
                    ),
                  )
                }
              >
                Analyze impact
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Recent audit runs</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Kind</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Started</th>
                    <th className="p-2">Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.kind}</td>
                      <td className="p-2">
                        <Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-2">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="p-2">{r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}