import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Row = Record<string, any>;

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Table({ rows, cols }: { rows: Row[]; cols: Array<{ key: string; label: string; fmt?: (v: any, r: Row) => React.ReactNode }> }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">{cols.map((c) => <th key={c.key} className="py-2 px-2 text-left font-medium text-muted-foreground">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => <td key={c.key} className="py-2 px-2">{c.fmt ? c.fmt(r[c.key], r) : String(r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AutonomousCommercePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [settings, setSettings] = useState<Row | null>(null);
  const [runs, setRuns] = useState<Row[]>([]);
  const [opportunities, setOpportunities] = useState<Row[]>([]);
  const [recs, setRecs] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [approvals, setApprovals] = useState<Row[]>([]);
  const [signals, setSignals] = useState<Row[]>([]);
  const [competitors, setCompetitors] = useState<Row[]>([]);
  const [forecasts, setForecasts] = useState<Row[]>([]);
  const [budget, setBudget] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [s, r, o, rc, tk, ap, mg, cg, fc, bd, al] = await Promise.all([
      supabase.from("aci_settings").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("aci_runs").select("*").order("started_at", { ascending: false }).limit(15),
      supabase.from("aci_product_opportunity_v2").select("*").order("computed_at", { ascending: false }).order("rank").limit(50),
      supabase.from("aci_recommendations").select("*").order("created_at", { ascending: false }).limit(40),
      supabase.from("aci_tasks").select("*").order("created_at", { ascending: false }).limit(40),
      supabase.from("aci_approvals").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("aci_market_signals").select("*").order("captured_at", { ascending: false }).limit(40),
      supabase.from("aci_competitor_gaps").select("*").order("captured_at", { ascending: false }).limit(30),
      supabase.from("aci_forecasts").select("*").order("generated_at", { ascending: false }).limit(40),
      supabase.from("aci_budget_ledger").select("*").eq("day", today),
      supabase.from("aci_audit_log").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setSettings(s.data); setRuns(r.data ?? []);
    setOpportunities(o.data ?? []); setRecs(rc.data ?? []); setTasks(tk.data ?? []); setApprovals(ap.data ?? []);
    setSignals(mg.data ?? []); setCompetitors(cg.data ?? []); setForecasts(fc.data ?? []);
    setBudget(bd.data ?? []); setAudit(al.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const trigger = async (only?: string) => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("aci-orchestrator", { body: only ? { only } : {} });
    setRunning(false);
    if (error) toast({ title: "Orchestrator failed", description: error.message, variant: "destructive" });
    else toast({ title: "Orchestrator run complete", description: `Mode: ${(data as any)?.mode}` });
    load();
  };

  const updateSetting = async (patch: Partial<Row>) => {
    if (!settings?.id) return;
    const { error } = await supabase.from("aci_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", settings.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    load();
  };

  const totals = budget.reduce((a, r) => ({ ai: a.ai + Number(r.ai_cost_usd || 0), cloud: a.cloud + Number(r.cloud_cost_usd || 0) }), { ai: 0, cloud: 0 });
  const exec = opportunities[0]?.overall_score ? Math.round(opportunities.reduce((a, r) => a + Number(r.overall_score || 0), 0) / opportunities.length) : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet><title>Autonomous Commerce · GetPawsy</title></Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autonomous Commerce Intelligence</h1>
          <p className="text-sm text-muted-foreground">Wave 5X — commercial brain sitting above AGP.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => trigger()} disabled={running}>{running ? "Running…" : "Run orchestrator"}</Button>
          <Button variant="outline" onClick={load}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Mode</div><div className="text-lg font-semibold capitalize">{settings?.mode ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Kill switch</div><div className="text-lg font-semibold">{settings?.kill_switch ? "ON" : "OFF"}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Executive score</div><div className="text-lg font-semibold">{exec}/100</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">AI today</div><div className="text-lg font-semibold">${totals.ai.toFixed(3)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Cloud today</div><div className="text-lg font-semibold">${totals.cloud.toFixed(3)}</div></CardContent></Card>
      </div>

      <Section title="Operator controls">
        <div className="flex flex-wrap gap-2">
          {["simulation","dry_run","approval","auto"].map(m => (
            <Button key={m} variant={settings?.mode === m ? "default" : "outline"} size="sm" onClick={() => updateSetting({ mode: m })}>{m}</Button>
          ))}
          <Button variant={settings?.kill_switch ? "destructive" : "outline"} size="sm" onClick={() => updateSetting({ kill_switch: !settings?.kill_switch })}>
            {settings?.kill_switch ? "Disable kill switch" : "Activate kill switch"}
          </Button>
        </div>
      </Section>

      {loading ? <Skeleton className="h-64 w-full" /> : (
        <Tabs defaultValue="opportunities">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="recs">Recommendations</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="signals">Market signals</TabsTrigger>
            <TabsTrigger value="competitors">Competitors</TabsTrigger>
            <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities"><Section title="Top product opportunities">
            <Table rows={opportunities} cols={[
              { key: "rank", label: "#" },
              { key: "product_id", label: "Product" },
              { key: "overall_score", label: "Score", fmt: (v) => Math.round(Number(v || 0)) },
              { key: "investment_priority", label: "Priority", fmt: (v) => <Badge>{v}</Badge> },
              { key: "expected_revenue_increase_cents", label: "Δ Revenue (USD)", fmt: (v) => `$${(Number(v || 0) / 100).toFixed(2)}` },
              { key: "expected_roi", label: "ROI" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="recs"><Section title="Recommendations">
            <Table rows={recs} cols={[
              { key: "title", label: "Title" },
              { key: "recommendation_type", label: "Type" },
              { key: "priority", label: "Priority", fmt: (v) => <Badge>{v}</Badge> },
              { key: "expected_revenue_cents", label: "Expected (USD)", fmt: (v) => `$${(Number(v || 0) / 100).toFixed(2)}` },
              { key: "confidence", label: "Confidence" },
              { key: "status", label: "Status" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="tasks"><Section title="Generated tasks">
            <Table rows={tasks} cols={[
              { key: "task_type", label: "Type" },
              { key: "entity_type", label: "Entity" },
              { key: "status", label: "Status", fmt: (v) => <Badge>{v}</Badge> },
              { key: "requires_approval", label: "Approval?" },
              { key: "created_at", label: "Created" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="approvals"><Section title="Pending approvals">
            <Table rows={approvals} cols={[
              { key: "title", label: "Title" },
              { key: "risk", label: "Risk" },
              { key: "expected_revenue_cents", label: "Expected (USD)", fmt: (v) => `$${(Number(v || 0) / 100).toFixed(2)}` },
              { key: "status", label: "Status" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="signals"><Section title="Market signals (last 7d)">
            <Table rows={signals} cols={[
              { key: "source", label: "Source" },
              { key: "signal_type", label: "Type" },
              { key: "entity", label: "Entity" },
              { key: "score", label: "Score", fmt: (v) => Math.round(Number(v || 0)) },
              { key: "velocity", label: "Velocity" },
              { key: "confidence", label: "Confidence" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="competitors"><Section title="Competitor gaps">
            <Table rows={competitors} cols={[
              { key: "competitor_id", label: "Competitor" },
              { key: "overall_threat", label: "Threat", fmt: (v) => Math.round(Number(v || 0)) },
              { key: "price_gap", label: "Price gap" },
              { key: "media_gap", label: "Media gap" },
              { key: "seo_gap", label: "SEO gap" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="forecasts"><Section title="Forecasts">
            <Table rows={forecasts} cols={[
              { key: "metric", label: "Metric" },
              { key: "horizon_days", label: "Horizon" },
              { key: "predicted", label: "Predicted", fmt: (v) => Number(v || 0).toFixed(0) },
              { key: "low", label: "Low", fmt: (v) => Number(v || 0).toFixed(0) },
              { key: "high", label: "High", fmt: (v) => Number(v || 0).toFixed(0) },
              { key: "confidence", label: "Confidence" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="runs"><Section title="Recent runs">
            <Table rows={runs} cols={[
              { key: "engine", label: "Engine" },
              { key: "mode", label: "Mode" },
              { key: "status", label: "Status", fmt: (v) => <Badge>{v}</Badge> },
              { key: "started_at", label: "Started" },
              { key: "finished_at", label: "Finished" },
            ]} />
          </Section></TabsContent>

          <TabsContent value="audit"><Section title="Audit log">
            <Table rows={audit} cols={[
              { key: "engine", label: "Engine" },
              { key: "action", label: "Action" },
              { key: "actor", label: "Actor" },
              { key: "created_at", label: "When" },
            ]} />
          </Section></TabsContent>
        </Tabs>
      )}
    </div>
  );
}