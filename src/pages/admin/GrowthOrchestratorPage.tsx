import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, ArrowRight, BarChart3, Brain, CheckCircle2, Compass,
  Loader2, PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, Sparkles,
  TrendingUp, XCircle, FlaskConical, Workflow, AlertTriangle,
} from "lucide-react";

/**
 * Phase 8 — Autonomous Growth Orchestrator (executive command).
 *
 * Single executive screen above all existing dashboards. Reads orchestration
 * state produced by the `growth-orchestrator` edge function. Does NOT mutate
 * Pinterest or analytics; recording outcomes only updates the learning loop.
 */

type Rec = {
  id: string;
  run_id: string;
  dedup_key: string;
  source: string;
  source_id: string | null;
  title: string;
  category: string | null;
  evidence: Record<string, unknown>;
  confidence: number;
  expected_impact: "high" | "medium" | "low" | null;
  effort: "low" | "medium" | "high" | null;
  risk: "low" | "medium" | "high" | null;
  est_traffic_gain: number;
  est_revenue_gain: number;
  est_time_to_value_hours: number;
  historical_success: number;
  score: number;
  rank: number | null;
  plan_id: string | null;
  obsolete: boolean;
  conflicts_with: string[] | null;
};

type Plan = {
  id: string;
  run_id: string;
  title: string;
  category: string | null;
  rec_ids: string[];
  depends_on: string[];
  score: number;
  status: string;
};

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  collected_count: number;
  deduped_count: number;
  plans_count: number;
  growth_score: number | null;
  health_score: number | null;
  validation_score: number | null;
};

type Snapshot = {
  ok: boolean;
  run: Run | null;
  recommendations: Rec[];
  plans: Plan[];
  outcomes_total: number;
};

type Simulation = {
  id: string;
  estimated_traffic_uplift: number;
  estimated_revenue_uplift: number;
  estimated_conversion_uplift: number;
  risks: Array<{ rec_id: string; title: string; risk: string; why?: string | null }>;
  affected_dashboards: string[];
  affected_analytics: string[];
  affected_pinterest_metrics: string[];
  rollback_complexity: string;
  estimated_impl_minutes: number;
};

// ── helpers ────────────────────────────────────────────────────────────

const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function scorePill(score: number | null) {
  if (score == null) return { tone: "muted", label: "—" } as const;
  if (score >= 75) return { tone: "green", label: `${Math.round(score)}` } as const;
  if (score >= 50) return { tone: "yellow", label: `${Math.round(score)}` } as const;
  return { tone: "red", label: `${Math.round(score)}` } as const;
}

const TONE_BADGE: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-700",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-700",
  red: "bg-rose-500/15 text-rose-300 border-rose-700",
  muted: "bg-muted text-muted-foreground border-border",
};

function impactTone(impact: string | null): "green" | "yellow" | "red" | "muted" {
  if (impact === "high") return "green";
  if (impact === "medium") return "yellow";
  if (impact === "low") return "red";
  return "muted";
}
function riskTone(risk: string | null): "green" | "yellow" | "red" | "muted" {
  if (risk === "low") return "green";
  if (risk === "medium") return "yellow";
  if (risk === "high") return "red";
  return "muted";
}

// ── UI bits ────────────────────────────────────────────────────────────

function ScoreCard({
  title, score, icon: Icon, href,
}: { title: string; score: number | null; icon: React.ComponentType<{ className?: string }>; href?: string }) {
  const p = scorePill(score);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" /> {title}
          </CardTitle>
          <Badge variant="outline" className={TONE_BADGE[p.tone]}>{p.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold leading-tight">{score == null ? "—" : Math.round(score)}<span className="text-base text-muted-foreground">/100</span></div>
        {href && (
          <Button asChild size="sm" variant="ghost" className="px-0 h-auto text-xs mt-1">
            <Link to={href}>Details <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function GrowthOrchestratorPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [simulating, setSimulating] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<Simulation | null>(null);
  const [simRecTitle, setSimRecTitle] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("growth-orchestrator", {
      body: { action: "snapshot" },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSnapshot(data as Snapshot);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime hooks so the executive screen updates as cycles finish.
  useEffect(() => {
    const ch = supabase
      .channel("growth-orchestrator")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "growth_orchestrator_runs" },
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const runCycle = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("growth-orchestrator", {
      body: { action: "run", trigger: "operator_ui" },
    });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Orchestrator cycle complete: ${(data as any)?.deduped ?? 0} recommendations across ${(data as any)?.plans ?? 0} plans.`);
    await load();
  };

  const simulate = async (rec: Rec) => {
    setSimulating(rec.id);
    setSimRecTitle(rec.title);
    const { data, error } = await supabase.functions.invoke("growth-orchestrator", {
      body: { action: "simulate", rec_id: rec.id, plan_id: rec.plan_id },
    });
    setSimulating(null);
    if (error) { toast.error(error.message); return; }
    const payload = data as { ok: boolean; simulation?: Simulation; error?: string };
    if (!payload.ok || !payload.simulation) { toast.error(payload.error || "Simulation failed"); return; }
    setSimResult(payload.simulation);
  };

  const recordOutcome = async (rec: Rec, outcome: "accepted" | "rejected") => {
    const { error } = await supabase.functions.invoke("growth-orchestrator", {
      body: { action: "record_outcome", rec_id: rec.id, dedup_key: rec.dedup_key, source: rec.source, outcome },
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Outcome recorded (${outcome}). Learning loop updated.`);
    void load();
  };

  const run = snapshot?.run ?? null;
  const recs = snapshot?.recommendations ?? [];
  const plans = snapshot?.plans ?? [];

  const top10 = useMemo(() => recs.slice(0, 10), [recs]);
  const topAction = recs[0] ?? null;
  const topImpact = useMemo(
    () => [...recs].sort((a, b) => b.est_revenue_gain - a.est_revenue_gain)[0] ?? null,
    [recs],
  );
  const topRisk = useMemo(
    () => recs.find(r => r.risk === "high" && (r.expected_impact === "high" || r.expected_impact === "medium")) ?? null,
    [recs],
  );
  const totalTrafficOpp = useMemo(() => recs.reduce((s, r) => s + r.est_traffic_gain, 0), [recs]);
  const totalRevenueOpp = useMemo(() => recs.reduce((s, r) => s + r.est_revenue_gain, 0), [recs]);
  const conflicts = useMemo(() => recs.filter(r => (r.conflicts_with?.length ?? 0) > 0), [recs]);

  const productionReadiness = useMemo(() => {
    if (!run) return null;
    const v = run.validation_score ?? 0;
    const h = run.health_score ?? 0;
    const g = run.growth_score ?? 0;
    return 0.5 * v + 0.3 * h + 0.2 * g;
  }, [run]);

  return (
    <>
      <Helmet>
        <title>Growth Orchestrator | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 md:h-7 md:w-7 text-primary shrink-0" />
              Autonomous Growth Orchestrator
            </h1>
            <p className="text-sm text-muted-foreground">
              Executive command. Aggregates recommendations from every existing system — Growth Commander,
              Execution Center, Pinterest Growth Engine, Distribution Audit, Funnel Health, Production Validation,
              Live Events — then dedupes, ranks, plans, and learns. No direct mutations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <Button size="sm" onClick={runCycle} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run orchestration cycle
            </Button>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Executive score strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ScoreCard title="Growth Score" score={run?.growth_score ?? null} icon={TrendingUp} />
          <ScoreCard title="Health Score" score={run?.health_score ?? null} icon={Activity} href="/admin/analytics-health" />
          <ScoreCard title="Validation Score" score={run?.validation_score ?? null} icon={ShieldCheck} href="/admin/production-validation" />
          <ScoreCard title="Production Readiness" score={productionReadiness} icon={Compass} href="/admin/growth-commander" />
        </section>

        {/* Pipeline summary */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Collected</CardTitle></CardHeader>
            <CardContent>{loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{fmtInt(run?.collected_count ?? 0)}</div>}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Deduped</CardTitle></CardHeader>
            <CardContent>{loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{fmtInt(run?.deduped_count ?? 0)}</div>}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Execution Plans</CardTitle></CardHeader>
            <CardContent>{loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{fmtInt(run?.plans_count ?? 0)}</div>}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Learning Events</CardTitle></CardHeader>
            <CardContent>{loading ? <Skeleton className="h-6 w-16" /> : <div className="text-2xl font-semibold">{fmtInt(snapshot?.outcomes_total ?? 0)}</div>}</CardContent>
          </Card>
        </section>

        {/* Opportunity strip */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <OpportunityCard
            title="Highest priority action"
            icon={Sparkles}
            rec={topAction}
            onSimulate={simulate}
            simulating={simulating}
          />
          <OpportunityCard
            title="Highest revenue opportunity"
            icon={TrendingUp}
            rec={topImpact}
            onSimulate={simulate}
            simulating={simulating}
          />
          <OpportunityCard
            title="Highest risk issue"
            icon={ShieldAlert}
            rec={topRisk}
            onSimulate={simulate}
            simulating={simulating}
            tone="red"
          />
        </section>

        {/* Estimated opportunity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Estimated opportunity (this cycle)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider">Traffic gain</div>
              <div className="text-xl font-semibold">{fmtInt(totalTrafficOpp)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider">Revenue gain</div>
              <div className="text-xl font-semibold">{fmtUsd(totalRevenueOpp)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider">Conflicts detected</div>
              <div className="text-xl font-semibold">{conflicts.length}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider">Last cycle</div>
              <div className="text-xl font-semibold">
                {run?.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top 10 actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Workflow className="h-4 w-4" /> Top 10 recommended actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : top10.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No cycle yet — click <em>Run orchestration cycle</em> to aggregate live recommendations.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {top10.map(r => (
                  <div key={r.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">#{r.rank}</Badge>
                        <Badge variant="outline" className={TONE_BADGE[impactTone(r.expected_impact)]}>
                          impact: {r.expected_impact ?? "—"}
                        </Badge>
                        <Badge variant="outline" className={TONE_BADGE[riskTone(r.risk)]}>
                          risk: {r.risk ?? "—"}
                        </Badge>
                        <Badge variant="outline">conf: {fmtPct(r.confidence)}</Badge>
                        <Badge variant="outline">{r.source}</Badge>
                        {(r.conflicts_with?.length ?? 0) > 0 && (
                          <Badge variant="outline" className={TONE_BADGE.red}>
                            conflicts {r.conflicts_with?.length}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium mt-1 truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        +{fmtInt(r.est_traffic_gain)} sessions · {fmtUsd(r.est_revenue_gain)} · {Math.round(r.est_time_to_value_hours)}h to value · score {r.score.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => simulate(r)} disabled={simulating === r.id}>
                        {simulating === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FlaskConical className="h-3 w-3 mr-1" />}
                        Simulate
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => recordOutcome(r, "accepted")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Accept
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => recordOutcome(r, "rejected")}>
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plans */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Workflow className="h-4 w-4" /> Execution plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <div className="text-sm text-muted-foreground">No plans for the current cycle.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {plans.map(p => (
                  <div key={p.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{p.title}</div>
                      <Badge variant="outline">{p.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.rec_ids.length} actions · score {p.score.toFixed(2)} · category {p.category ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deep links to existing dashboards (no duplication) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orchestrated systems</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[
              ["/admin/growth-commander", "Growth Commander"],
              ["/admin/execution-center", "Execution Center"],
              ["/admin/pinterest-growth", "Pinterest Growth"],
              ["/admin/pinterest-distribution", "Distribution Audit"],
              ["/admin/funnel-health", "Funnel Health"],
              ["/admin/production-validation", "Production Validation"],
              ["/admin/live-events", "Live Events"],
              ["/admin/analytics-health", "Analytics Health"],
              ["/admin/attribution-compare", "Attribution Compare"],
              ["/admin/visitor-world-map", "World Map"],
            ].map(([href, label]) => (
              <Button key={href} asChild size="sm" variant="outline">
                <Link to={href}>{label} <ArrowRight className="h-3 w-3 ml-1" /></Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!simResult} onOpenChange={(o) => !o && setSimResult(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" /> Simulation: {simRecTitle}
            </DialogTitle>
          </DialogHeader>
          {simResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KV label="Traffic uplift" value={fmtInt(simResult.estimated_traffic_uplift)} />
                <KV label="Revenue uplift" value={fmtUsd(simResult.estimated_revenue_uplift)} />
                <KV label="Avg confidence" value={fmtPct(simResult.estimated_conversion_uplift)} />
                <KV label="Rollback" value={simResult.rollback_complexity} />
                <KV label="Impl. minutes" value={fmtInt(simResult.estimated_impl_minutes)} />
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Affected dashboards</div>
                <div className="flex flex-wrap gap-1">
                  {simResult.affected_dashboards.map(d => (
                    <Badge key={d} variant="outline">{d}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Affected analytics</div>
                <div className="flex flex-wrap gap-1">
                  {simResult.affected_analytics.map(d => (
                    <Badge key={d} variant="outline">{d}</Badge>
                  ))}
                </div>
              </div>
              {simResult.affected_pinterest_metrics.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Pinterest metrics</div>
                  <div className="flex flex-wrap gap-1">
                    {simResult.affected_pinterest_metrics.map(d => (
                      <Badge key={d} variant="outline">{d}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {simResult.risks.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Risks</div>
                  <ul className="space-y-1 text-xs">
                    {simResult.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Badge variant="outline" className={TONE_BADGE[r.risk === "high" ? "red" : "yellow"]}>{r.risk}</Badge>
                        <span className="min-w-0">{r.title}{r.why ? ` — ${r.why}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function OpportunityCard({
  title, icon: Icon, rec, onSimulate, simulating, tone,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rec: Rec | null;
  onSimulate: (r: Rec) => void;
  simulating: string | null;
  tone?: "red";
}) {
  return (
    <Card className={tone === "red" ? "border-rose-700/60" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!rec ? (
          <div className="text-sm text-muted-foreground">No matching recommendation.</div>
        ) : (
          <>
            <div className="text-sm font-medium line-clamp-2">{rec.title}</div>
            <div className="flex flex-wrap gap-1 text-xs">
              <Badge variant="outline">{rec.source}</Badge>
              <Badge variant="outline" className={TONE_BADGE[impactTone(rec.expected_impact)]}>
                impact: {rec.expected_impact ?? "—"}
              </Badge>
              <Badge variant="outline" className={TONE_BADGE[riskTone(rec.risk)]}>
                risk: {rec.risk ?? "—"}
              </Badge>
              <Badge variant="outline">conf: {fmtPct(rec.confidence)}</Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => onSimulate(rec)} disabled={simulating === rec.id}>
              {simulating === rec.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FlaskConical className="h-3 w-3 mr-1" />}
              Simulate
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}