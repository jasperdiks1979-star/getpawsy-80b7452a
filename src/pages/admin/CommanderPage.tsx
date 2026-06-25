import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Shield, AlertTriangle, Activity, Brain, Cpu, Wallet, ListChecks, Target, Database } from "lucide-react";

type Settings = {
  id?: string;
  kill_switch: boolean;
  mode: string;
  autonomy_level: number;
  default_model: string;
  daily_ai_budget_cents: number;
  daily_cloud_budget_cents: number;
  daily_pinterest_budget_cents: number;
  daily_ads_budget_cents: number;
};

const MODES = ["manual", "semi", "auto", "autonomous", "experimental", "dry_run", "emergency_stop", "simulation"];

export default function CommanderPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [steps, setSteps] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [plan, setPlan] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [health, setHealth] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [sims, setSims] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [s, r, d, p, g, mr, b, h, a, si, m] = await Promise.all([
      supabase.from("cmdr_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("cmdr_runs").select("*").order("started_at", { ascending: false }).limit(20),
      supabase.from("cmdr_decisions").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("cmdr_resource_plan").select("*").order("priority", { ascending: false }).limit(50),
      supabase.from("cmdr_goals").select("*").order("weight", { ascending: false }),
      supabase.from("cmdr_model_route_log").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("cmdr_budget_ledger").select("*").order("period_start", { ascending: false }).limit(40),
      supabase.from("cmdr_health_signals").select("*").order("observed_at", { ascending: false }).limit(60),
      supabase.from("cmdr_audit_log").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("cmdr_simulations").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("cmdr_memory").select("*").order("occurred_at", { ascending: false }).limit(30),
    ]);
    setSettings(s.data as any);
    setRuns(r.data ?? []);
    setDecisions(d.data ?? []);
    setPlan(p.data ?? []);
    setGoals(g.data ?? []);
    setRoutes(mr.data ?? []);
    setBudgets(b.data ?? []);
    setHealth(h.data ?? []);
    setAudit(a.data ?? []);
    setSims(si.data ?? []);
    setMemory(m.data ?? []);
    setLoading(false);

    // Latest run steps
    if (r.data?.[0]?.id) {
      const { data: st } = await supabase.from("cmdr_run_steps").select("*").eq("run_id", r.data[0].id).order("started_at");
      setSteps(st ?? []);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function updateSettings(patch: Partial<Settings>) {
    if (!settings?.id) return;
    const { error } = await supabase.from("cmdr_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", settings.id);
    if (error) return toast.error(error.message);
    setSettings({ ...settings, ...patch });
    toast.success("Commander settings updated");
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cmdr-orchestrator", { body: { trigger: "manual" } });
      if (error) throw error;
      toast.success(`Commander run complete (${(data as any)?.steps?.length ?? 0} steps)`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const healthByEngine = useMemo(() => {
    const m = new Map<string, any>();
    for (const h of health) if (!m.has(h.engine)) m.set(h.engine, h);
    return [...m.values()];
  }, [health]);

  const tiles = [
    { label: "Mode", value: settings?.mode ?? "—", icon: Brain, tone: settings?.mode === "simulation" ? "default" : "secondary" },
    { label: "Autonomy", value: `L${settings?.autonomy_level ?? 0}`, icon: Cpu },
    { label: "Kill switch", value: settings?.kill_switch ? "ARMED" : "off", icon: Shield, tone: settings?.kill_switch ? "destructive" : "default" },
    { label: "Latest run", value: runs[0]?.status ?? "—", icon: Activity },
    { label: "Pending decisions", value: decisions.filter(d => d.status === "pending").length, icon: ListChecks },
    { label: "Active goals", value: goals.filter(g => g.status === "active").length, icon: Target },
    { label: "Engines tracked", value: healthByEngine.length, icon: Database },
    { label: "Today AI budget", value: `$${((settings?.daily_ai_budget_cents ?? 0) / 100).toFixed(2)}`, icon: Wallet },
  ];

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Commander…</div>;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet><title>Commander AI — Executive War Room</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Autonomous Commander AI</h1>
          <p className="text-muted-foreground text-sm">Wave 6 · Stage 6A foundations · supervises all AGP / ACI / Pinterest / CPE engines.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={runNow} disabled={running}>{running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Run Commander now</Button>
        </div>
      </div>

      {settings?.kill_switch && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Kill switch is ARMED. Commander will not run.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {tiles.map(t => (
          <Card key={t.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><t.icon className="h-3 w-3" />{t.label}</div>
              <div className="text-lg font-semibold">{String(t.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Operator controls</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Mode</div>
            <Select value={settings?.mode ?? "simulation"} onValueChange={(v) => updateSettings({ mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Autonomy level (0–5)</div>
            <Select value={String(settings?.autonomy_level ?? 1)} onValueChange={(v) => updateSettings({ autonomy_level: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[0,1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>L{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <div className="text-xs text-muted-foreground">Kill switch</div>
              <div className="text-sm font-medium">{settings?.kill_switch ? "ARMED" : "off"}</div>
            </div>
            <Switch checked={!!settings?.kill_switch} onCheckedChange={(v) => updateSettings({ kill_switch: v })} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="health">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="plan">Resource plan</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="routing">Model routing</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="simulations">Simulations</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Engine</th><th>Status</th><th>Last run</th><th>Lag</th></tr></thead>
              <tbody>{healthByEngine.map(h => (
                <tr key={h.engine} className="border-t">
                  <td className="py-2">{h.engine}</td>
                  <td><Badge variant={h.status === "ok" ? "default" : h.status === "lagging" ? "secondary" : "destructive"}>{h.status}</Badge></td>
                  <td>{h.last_run_at ? new Date(h.last_run_at).toLocaleString() : "—"}</td>
                  <td>{h.lag_seconds ? `${Math.round(h.lag_seconds / 60)}m` : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card><CardContent className="p-4 space-y-3">
            {runs.map(r => (
              <div key={r.id} className="border rounded-md p-3 text-sm">
                <div className="flex justify-between"><div><Badge>{r.status}</Badge> <span className="ml-2 text-muted-foreground">{r.mode}</span> · {r.trigger}</div><div className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</div></div>
                {r.summary && <pre className="text-xs mt-2 text-muted-foreground">{JSON.stringify(r.summary)}</pre>}
              </div>
            ))}
            <div className="text-xs text-muted-foreground">Latest run steps:</div>
            <ul className="text-xs space-y-1">{steps.map(s => <li key={s.id}>· {s.step} — <Badge variant="outline">{s.status}</Badge> {s.output ? <span className="text-muted-foreground">{JSON.stringify(s.output)}</span> : null}</li>)}</ul>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="decisions">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Engine</th><th>Action</th><th>Status</th><th>Priority</th><th>ROI</th><th>Cost ¢</th><th>Reasoning</th></tr></thead>
              <tbody>{decisions.map(d => (
                <tr key={d.id} className="border-t">
                  <td className="py-2">{d.target_engine}</td><td>{d.action}</td>
                  <td><Badge variant={d.status === "approved" ? "default" : d.status === "pending" ? "secondary" : "outline"}>{d.status}</Badge></td>
                  <td>{d.priority}</td><td>{Number(d.expected_roi ?? 0).toFixed(2)}</td><td>{d.estimated_cost_cents}</td>
                  <td className="max-w-md truncate">{d.reasoning}</td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="plan">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Engine</th><th>Scheduled</th><th>Calls</th><th>Cost ¢</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>{plan.map(p => (
                <tr key={p.id} className="border-t"><td className="py-2">{p.engine}</td><td>{p.scheduled_for ? new Date(p.scheduled_for).toLocaleTimeString() : "—"}</td><td>{p.expected_calls}</td><td>{p.expected_cost_cents}</td><td>{p.priority}</td><td>{p.status}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="goals">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Name</th><th>Metric</th><th>Target</th><th>Horizon</th><th>Weight</th><th>Status</th></tr></thead>
              <tbody>{goals.map(g => (
                <tr key={g.id} className="border-t"><td className="py-2">{g.name}</td><td>{g.metric}</td><td>{g.target_value}</td><td>{g.horizon}</td><td>{g.weight}</td><td>{g.status}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="routing">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Task</th><th>Chosen</th><th>Candidates</th><th>Reason</th></tr></thead>
              <tbody>{routes.map(r => (
                <tr key={r.id} className="border-t"><td className="py-2">{r.task}</td><td>{r.chosen_model}</td><td className="text-xs text-muted-foreground">{(r.candidates ?? []).join(", ")}</td><td className="text-xs">{r.reason}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="budgets">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Period</th><th>Start</th><th>Category</th><th>Budget ¢</th><th>Spent ¢</th><th>Remaining ¢</th><th>Breached</th></tr></thead>
              <tbody>{budgets.map(b => (
                <tr key={b.id} className="border-t"><td className="py-2">{b.period}</td><td>{new Date(b.period_start).toLocaleDateString()}</td><td>{b.category}</td><td>{b.budget_cents}</td><td>{b.spent_cents}</td><td>{b.remaining_cents}</td><td>{b.breached ? "yes" : "no"}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="simulations">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Decision</th><th>Expected ROI</th><th>Threshold</th><th>Passed</th><th>Rationale</th></tr></thead>
              <tbody>{sims.map(s => (
                <tr key={s.id} className="border-t"><td className="py-2 text-xs">{s.decision_id?.slice(0,8)}</td><td>{Number(s.expected_roi).toFixed(2)}</td><td>{Number(s.threshold).toFixed(2)}</td><td>{s.passed ? "✓" : "✗"}</td><td className="text-xs">{s.rationale}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="memory">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Type</th><th>Key</th><th>Outcome</th><th>Score</th><th>When</th></tr></thead>
              <tbody>{memory.map(m => (
                <tr key={m.id} className="border-t"><td className="py-2">{m.entity_type}</td><td>{m.entity_key}</td><td>{m.outcome}</td><td>{m.score}</td><td>{new Date(m.occurred_at).toLocaleString()}</td></tr>
              ))}{memory.length === 0 && <tr><td colSpan={5} className="py-4 text-muted-foreground text-center">Memory will accumulate from Wave 6D onward.</td></tr>}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Action</th><th>Target</th><th>Reasoning</th><th>Confidence</th><th>When</th></tr></thead>
              <tbody>{audit.map(a => (
                <tr key={a.id} className="border-t"><td className="py-2">{a.action}</td><td className="text-xs">{a.target ?? "—"}</td><td className="text-xs">{a.reasoning ?? "—"}</td><td>{a.confidence ?? "—"}</td><td>{new Date(a.created_at).toLocaleString()}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}