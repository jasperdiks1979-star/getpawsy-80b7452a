/**
 * GENESIS Ω∞ V7 — Autonomous Recovery Center (G.A.R.E.)
 * Live dashboard for the autonomous detect → diagnose → repair → certify loop.
 * All numbers come from `gare_*` tables — no fabrication. UNKNOWN is shown as
 * UNKNOWN, never smoothed away.
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Play, ShieldCheck, ShieldAlert, Activity, TrendingUp, Brain } from "lucide-react";

type ScoreRow = {
  captured_at: string;
  problems_detected: number;
  problems_repaired: number;
  problems_pending_approval: number;
  repair_success_pct: number | null;
  regression_pct: number | null;
  rollback_pct: number | null;
  avg_recovery_seconds: number | null;
  revenue_recovered_24h: number | null;
  bhi_gained_24h: number | null;
  self_heal_score: number | null;
  confidence: number | null;
};

type Detection = {
  id: string;
  detected_at: string;
  subsystem: string;
  metric: string;
  severity: "low" | "critical" | "unknown" | "emergency";
  status: string;
  observed_value: unknown;
  first_sales_impact: boolean;
};

type Plan = {
  id: string;
  detection_id: string;
  risk_level: string;
  auto_safe: boolean;
  approval_required: boolean;
  expected_revenue_gain: number | null;
  expected_bhi_gain: number | null;
  confidence: number | null;
  status: string;
  created_at: string;
  plan: { action?: string; root_cause?: string };
};

type Learning = {
  id: string;
  problem_signature: string;
  subsystem: string;
  success_count: number;
  failure_count: number;
  last_applied_at: string | null;
};

const severityStyle: Record<Detection["severity"], string> = {
  low: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  emergency: "bg-destructive text-destructive-foreground border-destructive",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default function RecoveryCenterPage() {
  const [score, setScore] = useState<ScoreRow | null>(null);
  const [recent, setRecent] = useState<Detection[]>([]);
  const [pending, setPending] = useState<Plan[]>([]);
  const [learning, setLearning] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<null | "cycle" | "detect">(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("gare-orchestrator", { body: { action: "status" } });
    const r = (data as { result?: { recent: Detection[]; pending: Plan[]; score: ScoreRow | null; learning: Learning[] } })?.result;
    if (r) {
      setScore(r.score);
      setRecent(r.recent ?? []);
      setPending(r.pending ?? []);
      setLearning(r.learning ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runCycle = async (action: "cycle" | "detect") => {
    setRunning(action);
    await supabase.functions.invoke("gare-orchestrator", { body: { action } });
    await load();
    setRunning(null);
  };

  const approve = async (planId: string) => {
    await supabase.functions.invoke("gare-orchestrator", { body: { action: "approve", plan_id: planId } });
    await load();
  };

  const shs = score?.self_heal_score;
  const shsBand = shs === null || shs === undefined ? "UNKNOWN" : shs >= 80 ? "HEALTHY" : shs >= 50 ? "DEGRADED" : "CRITICAL";

  return (
    <>
      <Helmet>
        <title>Recovery Center — GENESIS V7 | Admin</title>
        <meta name="description" content="Autonomous Recovery Engine (GARE) — live detect, diagnose, repair, certify loop for GetPawsy." />
      </Helmet>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-bold">Recovery Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              GENESIS Ω∞ V7 — Autonomous Recovery Engine. Evidence-only. UNKNOWN over false certainty.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
            <Button size="sm" onClick={() => runCycle("detect")} disabled={running !== null}>
              {running === "detect" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
              Detect only
            </Button>
            <Button size="sm" onClick={() => runCycle("cycle")} disabled={running !== null}>
              {running === "cycle" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Run full cycle
            </Button>
          </div>
        </header>

        {/* Self-Heal Score strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Self-Heal Score</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{shs ?? "—"}</div>
              <Badge className="mt-1" variant={shsBand === "HEALTHY" ? "default" : "destructive"}>{shsBand}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Detected (24h)</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{score?.problems_detected ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">Repaired: {score?.problems_repaired ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pending Approval</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{score?.problems_pending_approval ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Regression: {score?.regression_pct ?? 0}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Revenue Recovered 24h</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${Number(score?.revenue_recovered_24h ?? 0).toFixed(0)}</div>
              <div className="text-xs text-muted-foreground mt-1">BHI Δ: +{Number(score?.bhi_gained_24h ?? 0).toFixed(1)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Pending approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> Pending Approval ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting on approval. Autonomous playbooks are handling detections.</p>}
            {pending.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 p-3 border rounded bg-card">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{p.plan?.action ?? "Recovery plan"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Root cause: {p.plan?.root_cause ?? "unknown"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Risk: <b>{p.risk_level}</b> · Confidence: {p.confidence ?? "?"}% · Est. revenue: ${p.expected_revenue_gain ?? 0} · BHI Δ: {p.expected_bhi_gain ?? 0}
                  </div>
                </div>
                <Button size="sm" onClick={() => approve(p.id)}>
                  <ShieldCheck className="w-4 h-4 mr-1" /> Approve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent detections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4" /> Recent Detections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && <p className="text-sm text-muted-foreground">No detections recorded yet. Click <b>Run full cycle</b> to sweep now.</p>}
            {recent.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-2 border rounded">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className={severityStyle[d.severity]}>{d.severity.toUpperCase()}</Badge>
                  <code className="text-xs truncate">{d.subsystem} · {d.metric}</code>
                  {d.first_sales_impact && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" aria-label="First-sales impact" />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <span>obs: {JSON.stringify(d.observed_value)}</span>
                  <Badge variant="secondary">{d.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Learning ledger */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Brain className="w-4 h-4" /> Learning Ledger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {learning.length === 0 && <p className="text-sm text-muted-foreground">No permanent knowledge yet. Every successful repair is stored here.</p>}
            {learning.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 p-2 border rounded text-sm">
                <code className="text-xs">{l.problem_signature}</code>
                <div className="text-xs text-muted-foreground">
                  ✅ {l.success_count} · ❌ {l.failure_count} · last: {l.last_applied_at ? new Date(l.last_applied_at).toLocaleString() : "—"}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}