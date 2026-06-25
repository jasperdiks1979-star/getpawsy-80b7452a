import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Activity, ShieldCheck, AlertTriangle, Wallet, ListChecks, RefreshCcw } from "lucide-react";

type Run = {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  engines_scanned: number;
  alerts_raised: number;
  recommendations_created: number;
  executive_health_score: number | null;
  growth_score: number | null;
  summary: any;
};

type Health = {
  id: string;
  engine_key: string;
  engine_label: string;
  status: string;
  age_minutes: number | null;
  failures_24h: number;
  last_run_at: string | null;
  notes: string | null;
};

type Rec = {
  id: string;
  title: string;
  reason: string;
  affected_engine: string;
  estimated_cost_usd: number;
  estimated_roi_usd: number;
  risk_level: string;
  confidence_score: number;
  suggested_action: string;
  status: string;
  created_at: string;
};

type Alert = {
  id: string;
  severity: string;
  engine_key: string | null;
  title: string;
  detail: string | null;
  status: string;
  created_at: string;
};

type Budget = { day: string; channel: string; spend_usd: number; units: number };

const statusColor = (s: string) =>
  s === "healthy"
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    : s === "degraded"
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
      : s === "stale"
        ? "bg-orange-500/15 text-orange-700 border-orange-500/30"
        : s === "no_data"
          ? "bg-muted text-muted-foreground border-border"
          : "bg-rose-500/15 text-rose-700 border-rose-500/30";

export default function CommanderFoundationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [budget, setBudget] = useState<Budget[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [r, h, p, a, b] = await Promise.all([
      supabase.from("commander_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("commander_engine_health").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("commander_recommendations").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("commander_alerts").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50),
      supabase.from("commander_budget_ledger").select("*").eq("day", today),
    ]);
    setRuns((r.data ?? []) as any);
    // dedupe health to most recent per engine
    const latest = new Map<string, Health>();
    for (const row of (h.data ?? []) as Health[]) if (!latest.has(row.engine_key)) latest.set(row.engine_key, row);
    setHealth(Array.from(latest.values()));
    setRecs((p.data ?? []) as any);
    setAlerts((a.data ?? []) as any);
    setBudget((b.data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("commander-orchestrator", {
        body: { trigger: "manual" },
      });
      if (error) throw error;
      toast.success(`Commander run complete · health ${data?.executive_health_score ?? "?"}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Commander run failed");
    } finally {
      setRunning(false);
    }
  };

  const decide = async (rec: Rec, decision: "approved" | "dismissed") => {
    const { error } = await supabase
      .from("commander_recommendations")
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq("id", rec.id);
    if (error) return toast.error(error.message);
    await supabase.from("commander_decisions").insert({ recommendation_id: rec.id, decision });
    toast.success(`Recommendation ${decision}`);
    await load();
  };

  const latestRun = runs[0];
  const todaySpend = budget.reduce((a, b) => a + Number(b.spend_usd ?? 0), 0);
  const pendingRecs = recs.filter((r) => r.status === "pending");

  const tile = (label: string, value: string, sub?: string) => (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Commander Foundation · Wave 6A</title>
      </Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7" /> Autonomous Commander · Foundation
          </h1>
          <p className="text-muted-foreground mt-1">
            Observation-only executive layer. Reads every engine, scores health, raises alerts and queues
            recommendations. No destructive or paid action runs automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            Run Commander Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tile("Executive Health", `${latestRun?.executive_health_score ?? "—"}`, latestRun?.started_at?.slice(0, 16) ?? "no runs yet")}
        {tile("Growth Score", `${latestRun?.growth_score ?? "—"}`, "avg of recent AGP scores")}
        {tile("Spend Today", `$${todaySpend.toFixed(2)}`, `${budget.length} channels observed`)}
        {tile("Open Blockers", `${alerts.length}`, `${pendingRecs.length} pending recs`)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Engine Health</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engine</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Age (min)</TableHead>
                <TableHead>Failures 24h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.engine_label}</TableCell>
                  <TableCell><Badge variant="outline" className={statusColor(h.status)}>{h.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{h.last_run_at?.slice(0, 16) ?? "—"}</TableCell>
                  <TableCell>{h.age_minutes ?? "—"}</TableCell>
                  <TableCell>{h.failures_24h}</TableCell>
                </TableRow>
              ))}
              {!health.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No observations yet — click "Run Commander Now".</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Open Blockers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && <div className="text-sm text-muted-foreground">No open alerts.</div>}
            {alerts.map((a) => (
              <div key={a.id} className="border rounded p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.detail}</div>
                </div>
                <Badge variant="outline">{a.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Spend Snapshot (today)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Units</TableHead><TableHead>Spend</TableHead></TableRow></TableHeader>
              <TableBody>
                {budget.map((b) => (
                  <TableRow key={b.channel}>
                    <TableCell>{b.channel}</TableCell>
                    <TableCell>{b.units}</TableCell>
                    <TableCell>${Number(b.spend_usd).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {!budget.length && <TableRow><TableCell colSpan={3} className="text-muted-foreground">No budget data yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Pending Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingRecs.length === 0 && <div className="text-sm text-muted-foreground">Nothing pending — all clear.</div>}
          {pendingRecs.map((r) => (
            <div key={r.id} className="border rounded p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{r.reason}</div>
                  <div className="text-sm mt-2"><span className="font-semibold">Suggested:</span> {r.suggested_action}</div>
                  <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                    <Badge variant="outline">engine: {r.affected_engine}</Badge>
                    <Badge variant="outline">risk: {r.risk_level}</Badge>
                    <Badge variant="outline">conf: {Math.round(r.confidence_score * 100)}%</Badge>
                    <Badge variant="outline">est ROI: ${r.estimated_roi_usd}</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={() => decide(r, "approved")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, "dismissed")}>Dismiss</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Commander Runs</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Engines</TableHead>
                <TableHead>Alerts</TableHead>
                <TableHead>Recs</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.started_at?.slice(0, 19).replace("T", " ")}</TableCell>
                  <TableCell>{r.trigger}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell>{r.engines_scanned}</TableCell>
                  <TableCell>{r.alerts_raised}</TableCell>
                  <TableCell>{r.recommendations_created}</TableCell>
                  <TableCell>{r.executive_health_score ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}