import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Run = {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  bottleneck: string | null;
  hypotheses_generated: number | null;
  opportunities_added: number | null;
  growth_score: number | null;
  summary: Record<string, unknown> | null;
};
type Opportunity = {
  id: string;
  title: string;
  category: string;
  business_value_score: number;
  expected_revenue_cents: number | null;
  confidence: number | null;
  bottleneck: string | null;
  status: string;
  created_at: string;
};
type Decision = {
  id: string;
  decided_at: string;
  decision_type: string;
  subject: string | null;
  rationale: string;
  confidence: number;
  business_value_score: number | null;
  status: string;
};
type Briefing = {
  briefing_date: string;
  revenue_yesterday_cents: number | null;
  predicted_revenue_cents: number | null;
  growth_score: number | null;
  bullets: string[];
  top_opportunities: Array<{ title: string; business_value_score: number; expected_revenue_cents?: number }>;
};

export default function GrowthDirectorPage() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("agd-growth-director", {
        body: { action: "snapshot" },
      });
      if (error) throw error;
      setRuns((data?.runs ?? []) as Run[]);
      setOpps((data?.opportunities ?? []) as Opportunity[]);
      setDecisions((data?.decisions ?? []) as Decision[]);
      setBriefing((data?.briefing ?? null) as Briefing | null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load AGD state");
    } finally {
      setLoading(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("agd-growth-director", {
        body: { action: "run", trigger: "manual" },
      });
      if (error) throw error;
      toast.success(`AGD loop completed — bottleneck: ${data?.bottleneck ?? "n/a"}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AGD run failed");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const lastRun = runs[0];

  return (
    <>
      <Helmet>
        <title>Autonomous Growth Director | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Autonomous Growth Director</h1>
            <p className="text-sm text-muted-foreground">
              AI CEO layer above PCIE-V2, PPE, PEI, ARIE, Pinterest, TikTok, GA4 — reasons, prioritizes, never destructs.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
            <Button size="sm" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span className="ml-2">Run Loop Now</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Growth Score</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{briefing?.growth_score ?? lastRun?.growth_score ?? "—"}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Current Bottleneck</CardTitle></CardHeader>
            <CardContent><Badge variant="secondary" className="text-base">{lastRun?.bottleneck ?? "n/a"}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Revenue (24h)</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">${((briefing?.revenue_yesterday_cents ?? 0) / 100).toFixed(2)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Opportunities</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{opps.length}</div></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="briefing">
          <TabsList>
            <TabsTrigger value="briefing">Executive Briefing</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="decisions">Decisions</TabsTrigger>
            <TabsTrigger value="runs">Loop Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="briefing">
            <Card>
              <CardHeader><CardTitle>Today's Briefing</CardTitle></CardHeader>
              <CardContent>
                {!briefing ? (
                  <p className="text-sm text-muted-foreground">No briefing yet — run the loop.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {briefing.bullets?.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="opportunities">
            <Card>
              <CardHeader><CardTitle>Prioritized Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {opps.length === 0 && <p className="text-sm text-muted-foreground">No open opportunities.</p>}
                {opps.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded border p-3">
                    <div>
                      <div className="font-medium">{o.title}</div>
                      <div className="text-xs text-muted-foreground">{o.category} · bottleneck: {o.bottleneck ?? "—"} · confidence {(Number(o.confidence ?? 0) * 100).toFixed(0)}%</div>
                    </div>
                    <div className="text-right">
                      <Badge>Value {o.business_value_score}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">~${((o.expected_revenue_cents ?? 0) / 100).toFixed(0)}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="decisions">
            <Card>
              <CardHeader><CardTitle>Recent Decisions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {decisions.length === 0 && <p className="text-sm text-muted-foreground">No decisions logged yet.</p>}
                {decisions.map((d) => (
                  <div key={d.id} className="rounded border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{d.decision_type} {d.subject ? `— ${d.subject}` : ""}</div>
                      <Badge variant="outline">{d.status}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{d.rationale}</div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(d.decided_at).toLocaleString()} · confidence {(d.confidence * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runs">
            <Card>
              <CardHeader><CardTitle>Loop Runs</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {runs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <div className="font-medium">{new Date(r.started_at).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">bottleneck: {r.bottleneck ?? "—"} · hyp: {r.hypotheses_generated ?? 0} · opp: {r.opportunities_added ?? 0}</div>
                    </div>
                    <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}