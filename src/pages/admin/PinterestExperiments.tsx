import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FlaskConical, PlayCircle, StopCircle, Trophy, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

type ExpStatus = "template" | "queued" | "running" | "stopped" | "completed" | "archived";

type Experiment = {
  id: string;
  code: string;
  hypothesis: string;
  dimension: string;
  metric: string;
  status: ExpStatus;
  allocation_pct: number;
  sample_target: number;
  confidence_target: number;
  start_at: string | null;
  end_at: string | null;
  result_summary: string | null;
  winner_variant: string | null;
};

type DashboardRow = {
  experiment_id: string;
  code: string;
  hypothesis: string;
  dimension: string;
  metric: string;
  status: ExpStatus;
  allocation_pct: number;
  sample_target: number;
  confidence_target: number;
  start_at: string | null;
  end_at: string | null;
  winner_variant: string | null;
  variant_id: string | null;
  variant_label: string | null;
  is_control: boolean | null;
  assigned_pins: number;
  pins: number;
  impressions: number;
  clicks: number;
  saves: number;
  sessions: number;
  revenue_cents: number;
  ctr_pct: number;
  save_rate_pct: number;
};

type Result = {
  id: string;
  experiment_id: string;
  winner_variant: string | null;
  loser_variant: string | null;
  lift_pct: number | null;
  p_value: number | null;
  confidence: number | null;
  decision: string;
  business_impact: string | null;
  expected_traffic_uplift_pct: number | null;
  expected_revenue_uplift_cents: number | null;
};

const statusStyle: Record<ExpStatus, string> = {
  template:  "bg-slate-500/15 text-slate-300 border-slate-500/30",
  queued:    "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  running:   "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  stopped:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  archived:  "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function StatusPill({ s }: { s: ExpStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${statusStyle[s]}`}>
      {s}
    </span>
  );
}

function fmtInt(n: number) {
  return (n ?? 0).toLocaleString();
}
function fmtMoney(cents: number) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

/**
 * Two-proportion z-test for CTR-style rates.
 * Returns { z, p (two-sided), confidence, liftPct } — client-side only, purely informational.
 */
function proportionsTest(x1: number, n1: number, x2: number, n2: number) {
  if (!n1 || !n2) return { z: 0, p: 1, confidence: 0, liftPct: 0 };
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = se === 0 ? 0 : (p2 - p1) / se;
  // Abramowitz & Stegun 26.2.17 tail approximation for Φ
  const a = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989423 * Math.exp(-a * a / 2);
  const pTail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const pTwo = 2 * pTail;
  const confidence = 1 - pTwo;
  const liftPct = p1 === 0 ? 0 : ((p2 - p1) / p1) * 100;
  return { z, p: pTwo, confidence, liftPct };
}

export default function PinterestExperiments() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "running" | "completed" | "templates">("all");

  async function load() {
    setLoading(true); setErr(null);
    const [{ data: dash, error: dashErr }, { data: res, error: resErr }] = await Promise.all([
      supabase.from("v_pxe_dashboard" as any).select("*").order("code").limit(2000),
      supabase.from("pxe_results" as any).select("*").order("computed_at", { ascending: false }).limit(500),
    ]);
    if (dashErr || resErr) {
      setErr(dashErr?.message ?? resErr?.message ?? "Failed to load");
      setRows([]); setResults([]);
    } else {
      setRows((dash ?? []) as unknown as DashboardRow[]);
      setResults((res ?? []) as unknown as Result[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Group variants under each experiment
  const experiments = useMemo(() => {
    const map = new Map<string, { exp: Experiment; variants: DashboardRow[] }>();
    for (const r of rows) {
      if (!map.has(r.experiment_id)) {
        map.set(r.experiment_id, {
          exp: {
            id: r.experiment_id, code: r.code, hypothesis: r.hypothesis,
            dimension: r.dimension, metric: r.metric, status: r.status,
            allocation_pct: r.allocation_pct, sample_target: r.sample_target,
            confidence_target: r.confidence_target, start_at: r.start_at,
            end_at: r.end_at, result_summary: null, winner_variant: r.winner_variant,
          },
          variants: [],
        });
      }
      if (r.variant_id) map.get(r.experiment_id)!.variants.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  const filtered = useMemo(() => {
    if (tab === "all") return experiments;
    if (tab === "running") return experiments.filter((e) => e.exp.status === "running");
    if (tab === "completed") return experiments.filter((e) => ["completed","stopped"].includes(e.exp.status));
    if (tab === "templates") return experiments.filter((e) => e.exp.status === "template");
    return experiments;
  }, [experiments, tab]);

  const kpis = useMemo(() => {
    const running = experiments.filter((e) => e.exp.status === "running").length;
    const completed = experiments.filter((e) => e.exp.status === "completed").length;
    const templates = experiments.filter((e) => e.exp.status === "template").length;
    const winners = results.filter((r) => r.decision === "winner").length;
    const losers = results.filter((r) => r.decision === "loser" || r.decision === "stopped").length;
    const revenueUplift = results
      .filter((r) => r.decision === "winner")
      .reduce((s, r) => s + (r.expected_revenue_uplift_cents ?? 0), 0);
    return { running, completed, templates, winners, losers, revenueUplift };
  }, [experiments, results]);

  async function setStatus(id: string, status: ExpStatus) {
    setBusy(id);
    const patch: Partial<Experiment> = { status };
    if (status === "running")  patch.start_at = new Date().toISOString() as any;
    if (status === "stopped" || status === "completed") patch.end_at = new Date().toISOString() as any;
    const { error } = await supabase.from("pxe_experiments" as any).update(patch).eq("id", id);
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success(`Experiment ${status}`); load(); }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Helmet>
        <title>Pinterest Experiment Engine</title>
        <meta name="description" content="Enterprise A/B experiment registry for Pinterest growth science." />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Pinterest Experiment Engine V1
          </h1>
          <p className="text-sm text-muted-foreground">
            Additive read/write registry. No changes to PCIE2, Guardian, Recovery, Distribution Monitor,
            Analytics or Queues. Publishers may opt-in later by writing assignments to <code>pxe_assignments</code>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </header>

      {err && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 text-sm text-red-300">{err}</CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Templates", value: kpis.templates },
          { label: "Running", value: kpis.running },
          { label: "Completed", value: kpis.completed },
          { label: "Winners", value: kpis.winners },
          { label: "Losers / stopped", value: kpis.losers },
          { label: "Est. revenue uplift", value: fmtMoney(kpis.revenueUplift) },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="text-lg font-semibold tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60">
        {(["all","running","completed","templates"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Experiments */}
      <div className="space-y-3">
        {loading && (
          <div className="p-6 text-center text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading experiments…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-muted-foreground text-sm">No experiments in this tab.</div>
        )}
        {!loading && filtered.map(({ exp, variants }) => {
          const control = variants.find((v) => v.is_control) ?? variants[0];
          const challenger = variants.find((v) => v.variant_id !== control?.variant_id);
          // Use clicks/impressions for a canonical two-proportion CTR test.
          const stat = control && challenger
            ? proportionsTest(control.clicks, control.impressions, challenger.clicks, challenger.impressions)
            : null;
          const readyN = Math.min(...variants.map((v) => v.pins));
          const hitSample = variants.length >= 2 && readyN >= exp.sample_target;
          const hitConfidence = (stat?.confidence ?? 0) >= exp.confidence_target;
          const result = results.find((r) => r.experiment_id === exp.id);

          return (
            <Card key={exp.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {exp.code}
                      <StatusPill s={exp.status} />
                      <Badge variant="outline" className="text-[10px]">{exp.dimension}</Badge>
                      <Badge variant="outline" className="text-[10px]">metric: {exp.metric}</Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{exp.hypothesis}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {exp.status === "template" && (
                      <Button size="sm" variant="outline" disabled={busy === exp.id}
                        onClick={() => setStatus(exp.id, "queued")}>
                        Queue
                      </Button>
                    )}
                    {(exp.status === "template" || exp.status === "queued") && (
                      <Button size="sm" disabled={busy === exp.id}
                        onClick={() => setStatus(exp.id, "running")}>
                        <PlayCircle className="h-4 w-4 mr-1" />Start
                      </Button>
                    )}
                    {exp.status === "running" && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy === exp.id}
                          onClick={() => setStatus(exp.id, "stopped")}>
                          <StopCircle className="h-4 w-4 mr-1" />Stop
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy === exp.id || !hitSample || !hitConfidence}
                          onClick={() => setStatus(exp.id, "completed")}>
                          <Trophy className="h-4 w-4 mr-1" />Complete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Variant</th>
                        <th className="text-right px-3 py-2">Assigned</th>
                        <th className="text-right px-3 py-2">Pins</th>
                        <th className="text-right px-3 py-2">Impr</th>
                        <th className="text-right px-3 py-2">Clicks</th>
                        <th className="text-right px-3 py-2">Saves</th>
                        <th className="text-right px-3 py-2">Sessions</th>
                        <th className="text-right px-3 py-2">Revenue</th>
                        <th className="text-right px-3 py-2">CTR%</th>
                        <th className="text-right px-3 py-2">Save%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v) => (
                        <tr key={v.variant_id ?? v.variant_label ?? Math.random()} className="border-t border-border/60">
                          <td className="px-3 py-2">
                            {v.variant_label}
                            {v.is_control && <Badge variant="outline" className="ml-2 text-[9px]">control</Badge>}
                            {exp.winner_variant && v.variant_id === exp.winner_variant && (
                              <Badge className="ml-2 text-[9px] bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30">
                                winner
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(v.assigned_pins)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(v.pins)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(v.impressions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(v.clicks)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(v.saves)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(v.sessions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(v.revenue_cents)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{v.ctr_pct}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{v.save_rate_pct}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs border-t border-border/60 text-muted-foreground">
                  <span>Allocation: <strong className="text-foreground">{exp.allocation_pct}%</strong> of wave</span>
                  <span>Sample target: <strong className="text-foreground">{exp.sample_target}</strong> pins/variant</span>
                  <span>Confidence target: <strong className="text-foreground">{Math.round(exp.confidence_target * 100)}%</strong></span>
                  {stat && (
                    <>
                      <span>Observed lift: <strong className={stat.liftPct >= 0 ? "text-emerald-300" : "text-red-300"}>
                        {stat.liftPct.toFixed(1)}%
                      </strong></span>
                      <span>p-value: <strong className="text-foreground">{stat.p.toFixed(3)}</strong></span>
                      <span>confidence: <strong className="text-foreground">{(stat.confidence * 100).toFixed(1)}%</strong></span>
                    </>
                  )}
                  {hitSample ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300">sample ✓</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">need more pins</Badge>
                  )}
                  {hitConfidence ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300">confident ✓</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">below confidence</Badge>
                  )}
                </div>

                {result && (
                  <div className="px-3 py-2 text-xs border-t border-border/60 bg-muted/20">
                    <div className="flex flex-wrap gap-3">
                      <span>Decision: <strong className="text-foreground">{result.decision}</strong></span>
                      {result.lift_pct != null && <span>Lift: {Number(result.lift_pct).toFixed(1)}%</span>}
                      {result.confidence != null && <span>Confidence: {(Number(result.confidence) * 100).toFixed(1)}%</span>}
                      {result.expected_traffic_uplift_pct != null && (
                        <span>Est. traffic uplift: +{Number(result.expected_traffic_uplift_pct).toFixed(1)}%</span>
                      )}
                      {result.expected_revenue_uplift_cents != null && (
                        <span>Est. revenue uplift: {fmtMoney(Number(result.expected_revenue_uplift_cents))}</span>
                      )}
                    </div>
                    {result.business_impact && (
                      <p className="mt-1 text-muted-foreground">{result.business_impact}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Winners and losers appear only when a two-proportion z-test on CTR crosses the experiment&apos;s confidence
        target AND both variants have ≥ sample_target pins. No experiment mutates production content or queues.
      </p>
    </div>
  );
}