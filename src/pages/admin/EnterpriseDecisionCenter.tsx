import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, TrendingUp, Target, Activity, Loader2, CheckCircle2, XCircle } from "lucide-react";

type ActionType =
  | "publish_new"
  | "resurrect"
  | "continue_experiment"
  | "stop_experiment"
  | "increase_cadence"
  | "decrease_cadence"
  | "strengthen_boards"
  | "diversify_categories"
  | "wait_significance";

type Candidate = {
  action_type: ActionType;
  title: string;
  rationale: string;
  expected_traffic_uplift_pct: number;
  expected_revenue_uplift_usd: number;
  confidence: number;
  effort: "low" | "medium" | "high";
  evidence: Record<string, unknown>;
  affected_products: Array<{ product_id: string; name: string }>;
  affected_boards: Array<{ board_id: string; name: string }>;
  roi: number;
  reject_reason?: string;
};

type DecisionRow = Candidate & {
  id: string;
  decision_date: string;
  rank: number;
  status: string;
  actual_traffic_uplift_pct: number | null;
  actual_revenue_uplift_usd: number | null;
};

const MIN_CONFIDENCE = 0.55;
const MIN_EVIDENCE_KEYS = 2;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

async function computeCandidates(): Promise<{
  candidates: Candidate[];
  bottlenecks: string[];
  health: any;
}> {
  const [health, wave, dist, pxe] = await Promise.all([
    supabase.from("v_pcie2_distribution_health" as any).select("*").maybeSingle(),
    supabase.from("v_pinterest_wave_opportunity" as any).select("*").order("wave_rank", { ascending: true }).limit(50),
    supabase.from("v_pcie2_pin_distribution" as any).select("*").limit(500),
    supabase.from("v_pxe_dashboard" as any).select("*").limit(200),
  ]);

  const H: any = health.data ?? {};
  const W: any[] = (wave.data as any[]) ?? [];
  const D: any[] = (dist.data as any[]) ?? [];
  const P: any[] = (pxe.data as any[]) ?? [];

  const totals = {
    pins_total: Number(H.pins_total ?? D.length),
    dormant_pct: H.pins_total ? Number(H.pins_dormant ?? 0) / Number(H.pins_total) : 0,
    stalled_pct: H.pins_total ? Number(H.pins_stalled ?? 0) / Number(H.pins_total) : 0,
    growing_pct: H.pins_total ? (Number(H.pins_growing ?? 0) + Number(H.pins_viral ?? 0)) / Number(H.pins_total) : 0,
    health_score: Number(H.enterprise_health_score ?? 0),
    published_7d: Number(H.published_7d ?? 0),
    median_ctr: Number(H.median_ctr_7d_pct ?? 0),
    account_avg_ctr: Number(H.account_avg_ctr_pct ?? 0),
  };

  const bottlenecks: string[] = [];
  if (totals.dormant_pct > 0.2) bottlenecks.push(`${(totals.dormant_pct * 100).toFixed(0)}% dormant pins`);
  if (totals.stalled_pct > 0.15) bottlenecks.push(`${(totals.stalled_pct * 100).toFixed(0)}% stalled pins`);
  if (totals.median_ctr && totals.account_avg_ctr && totals.median_ctr < totals.account_avg_ctr * 0.8)
    bottlenecks.push(`Median CTR ${totals.median_ctr.toFixed(2)}% under account avg`);
  if (totals.published_7d < 7) bottlenecks.push(`Only ${totals.published_7d} pins published in last 7d`);
  if (totals.growing_pct < 0.15) bottlenecks.push(`Only ${(totals.growing_pct * 100).toFixed(0)}% pins growing`);

  const candidates: Candidate[] = [];

  // 1) Publish new — top wave opportunity untapped
  const untapped = W.filter((r) => !r.ever_published).slice(0, 6);
  if (untapped.length >= 3) {
    const avgScore = untapped.reduce((s, r) => s + Number(r.wave_score ?? 0), 0) / untapped.length;
    const avgMargin = untapped.reduce((s, r) => s + Number(r.margin ?? 0), 0) / untapped.length;
    const conf = clamp(avgScore / 100, 0, 0.95);
    const revenue = Math.round(untapped.length * avgMargin * 1.8); // ~1.8 sales/pin over 30d prior
    candidates.push({
      action_type: "publish_new",
      title: `Publish next ${untapped.length} untapped hero products`,
      rationale: `Top scored never-promoted products (avg wave score ${avgScore.toFixed(1)}, avg margin $${avgMargin.toFixed(0)}). Growth is capped by supply of new pins.`,
      expected_traffic_uplift_pct: Math.round(clamp(untapped.length * 3, 5, 45)),
      expected_revenue_uplift_usd: revenue,
      confidence: conf,
      effort: "low",
      evidence: { avg_wave_score: avgScore, avg_margin: avgMargin, published_7d: totals.published_7d, wave_bucket_top: untapped[0]?.wave_bucket },
      affected_products: untapped.map((r) => ({ product_id: r.product_id, name: r.product_name })),
      affected_boards: [],
      roi: revenue * conf,
    });
  }

  // 2) Resurrect dormant pins with strong products
  const dormant = D.filter((r) => r.distribution_status === "DORMANT" || r.distribution_status === "STALLED").slice(0, 12);
  if (dormant.length >= 5) {
    const conf = clamp(0.4 + Math.min(dormant.length, 20) / 40, 0, 0.8);
    const revenue = Math.round(dormant.length * 6);
    candidates.push({
      action_type: "resurrect",
      title: `Resurrect ${dormant.length} dormant/stalled pins`,
      rationale: `${dormant.length} pins have <10 impressions after 24h+. Refreshed metadata typically re-triggers Pinterest indexing.`,
      expected_traffic_uplift_pct: Math.round(clamp(dormant.length * 0.8, 3, 20)),
      expected_revenue_uplift_usd: revenue,
      confidence: conf,
      effort: "medium",
      evidence: { dormant_count: dormant.length, dormant_pct: totals.dormant_pct, stalled_pct: totals.stalled_pct },
      affected_products: Array.from(new Map(dormant.map((r) => [r.product_id, { product_id: r.product_id, name: r.product_name }])).values()),
      affected_boards: Array.from(new Map(dormant.map((r) => [r.board_id, { board_id: r.board_id, name: r.board_name }])).values()),
      roi: revenue * conf,
    });
  }

  // 3) Cadence
  if (totals.published_7d < 10 && untapped.length >= 5) {
    const conf = 0.7;
    const revenue = Math.round((10 - totals.published_7d) * 25);
    candidates.push({
      action_type: "increase_cadence",
      title: "Increase publishing cadence to 2/day",
      rationale: `Only ${totals.published_7d} pins in 7d. Backlog of ${W.length} scored candidates. Pinterest rewards steady cadence.`,
      expected_traffic_uplift_pct: 15,
      expected_revenue_uplift_usd: revenue,
      confidence: conf,
      effort: "low",
      evidence: { published_7d: totals.published_7d, backlog: W.length, growing_pct: totals.growing_pct },
      affected_products: [],
      affected_boards: [],
      roi: revenue * conf,
    });
  } else if (totals.published_7d > 20 && totals.growing_pct < 0.1) {
    const conf = 0.6;
    candidates.push({
      action_type: "decrease_cadence",
      title: "Reduce cadence — distribution not keeping up",
      rationale: `${totals.published_7d} pins/7d but only ${(totals.growing_pct * 100).toFixed(0)}% growing. Slow down to let Pinterest catch up.`,
      expected_traffic_uplift_pct: 5,
      expected_revenue_uplift_usd: 80,
      confidence: conf,
      effort: "low",
      evidence: { published_7d: totals.published_7d, growing_pct: totals.growing_pct, dormant_pct: totals.dormant_pct },
      affected_products: [],
      affected_boards: [],
      roi: 80 * conf,
    });
  }

  // 4) Experiments
  const running = P.filter((e) => e.status === "running");
  const stallExp = running.filter((e) => Number(e.pins ?? 0) < Number(e.sample_target ?? 200) * 0.25 && e.start_at && (Date.now() - new Date(e.start_at).getTime()) > 14 * 86400000);
  const readyExp = running.filter((e) => Number(e.pins ?? 0) >= Number(e.sample_target ?? 200));
  if (readyExp.length) {
    const conf = 0.75;
    candidates.push({
      action_type: "stop_experiment",
      title: `Conclude ${readyExp.length} experiment${readyExp.length > 1 ? "s" : ""} at target sample`,
      rationale: `Experiments hit sample target — lock in winner before variance regresses.`,
      expected_traffic_uplift_pct: 8,
      expected_revenue_uplift_usd: 120 * readyExp.length,
      confidence: conf,
      effort: "low",
      evidence: { ready_experiments: readyExp.map((e) => e.code) },
      affected_products: [],
      affected_boards: [],
      roi: 120 * readyExp.length * conf,
    });
  }
  if (stallExp.length) {
    candidates.push({
      action_type: "wait_significance",
      title: `Extend ${stallExp.length} experiment${stallExp.length > 1 ? "s" : ""} — insufficient sample`,
      rationale: `Running >14d but <25% of sample target. Wait or reallocate traffic.`,
      expected_traffic_uplift_pct: 3,
      expected_revenue_uplift_usd: 40,
      confidence: 0.55,
      effort: "low",
      evidence: { stalled_experiments: stallExp.map((e) => e.code) },
      affected_products: [],
      affected_boards: [],
      roi: 40 * 0.55,
    });
  }

  // 5) Category diversification
  const catCounts: Record<string, number> = {};
  D.forEach((r) => { const c = r.category || "unknown"; catCounts[c] = (catCounts[c] || 0) + 1; });
  const catEntries = Object.entries(catCounts);
  const total = D.length || 1;
  const dominant = catEntries.sort((a, b) => b[1] - a[1])[0];
  if (dominant && dominant[1] / total > 0.45 && catEntries.length >= 3) {
    const conf = 0.6;
    candidates.push({
      action_type: "diversify_categories",
      title: `Diversify — ${dominant[0]} is ${(dominant[1] / total * 100).toFixed(0)}% of pins`,
      rationale: `Over-concentration limits reach across audiences. Rotate next wave into secondary categories.`,
      expected_traffic_uplift_pct: 10,
      expected_revenue_uplift_usd: 150,
      confidence: conf,
      effort: "medium",
      evidence: { dominant_category: dominant[0], dominant_share: dominant[1] / total, unique_categories: catEntries.length },
      affected_products: [],
      affected_boards: [],
      roi: 150 * conf,
    });
  }

  // 6) Strengthen boards — find board with best CTR but low pin count
  const boardStats: Record<string, { name: string; pins: number; imps: number; clicks: number }> = {};
  D.forEach((r) => {
    if (!r.board_id) return;
    const b = (boardStats[r.board_id] ||= { name: r.board_name, pins: 0, imps: 0, clicks: 0 });
    b.pins += 1;
    b.imps += Number(r.impressions_7d ?? 0);
    b.clicks += Number(r.pin_clicks_7d ?? 0);
  });
  const strong = Object.entries(boardStats)
    .filter(([, b]) => b.pins >= 2 && b.pins < 10 && b.imps > 100 && b.clicks / Math.max(b.imps, 1) > 0.01)
    .sort((a, b) => (b[1].clicks / Math.max(b[1].imps, 1)) - (a[1].clicks / Math.max(a[1].imps, 1)))[0];
  if (strong) {
    const conf = 0.65;
    candidates.push({
      action_type: "strengthen_boards",
      title: `Feed board "${strong[1].name}" — high CTR, low volume`,
      rationale: `${(strong[1].clicks / strong[1].imps * 100).toFixed(2)}% CTR with only ${strong[1].pins} pins. Adding pins here compounds fastest.`,
      expected_traffic_uplift_pct: 12,
      expected_revenue_uplift_usd: 180,
      confidence: conf,
      effort: "low",
      evidence: { board: strong[1].name, ctr_pct: (strong[1].clicks / strong[1].imps) * 100, pins: strong[1].pins },
      affected_products: [],
      affected_boards: [{ board_id: strong[0], name: strong[1].name }],
      roi: 180 * conf,
    });
  }

  // Reject insufficient evidence
  for (const c of candidates) {
    if (c.confidence < MIN_CONFIDENCE) c.reject_reason = "confidence below threshold";
    else if (Object.keys(c.evidence).length < MIN_EVIDENCE_KEYS) c.reject_reason = "insufficient evidence";
  }

  return { candidates: candidates.sort((a, b) => b.roi - a.roi), bottlenecks, health: totals };
}

const ACTION_LABELS: Record<ActionType, string> = {
  publish_new: "Publish New",
  resurrect: "Resurrect",
  continue_experiment: "Continue Experiment",
  stop_experiment: "Stop Experiment",
  increase_cadence: "Increase Cadence",
  decrease_cadence: "Decrease Cadence",
  strengthen_boards: "Strengthen Boards",
  diversify_categories: "Diversify Categories",
  wait_significance: "Wait for Significance",
};

export default function EnterpriseDecisionCenter() {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [bottlenecks, setBottlenecks] = useState<string[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [history, setHistory] = useState<DecisionRow[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [gen, hist] = await Promise.all([
        computeCandidates(),
        supabase.from("enterprise_decisions" as any).select("*").order("decision_date", { ascending: false }).order("rank", { ascending: true }).limit(60),
      ]);
      setCandidates(gen.candidates);
      setBottlenecks(gen.bottlenecks);
      setHealth(gen.health);
      setHistory(((hist.data as any[]) ?? []) as DecisionRow[]);
    } catch (e: any) {
      toast.error("Failed to compute decisions", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  const top3 = useMemo(() => candidates.filter((c) => !c.reject_reason).slice(0, 3), [candidates]);
  const rejected = useMemo(() => candidates.filter((c) => c.reject_reason), [candidates]);

  const traffic7d = top3.reduce((s, c) => s + c.expected_traffic_uplift_pct * c.confidence, 0);
  const revenue30d = top3.reduce((s, c) => s + c.expected_revenue_uplift_usd * c.confidence, 0);
  const growthConfidence = top3.length ? top3.reduce((s, c) => s + c.confidence, 0) / top3.length : 0;

  const accuracy = useMemo(() => {
    const graded = history.filter((h) => h.status === "validated" || h.status === "missed");
    if (!graded.length) return null;
    const correct = graded.filter((h) => h.status === "validated").length;
    return { correct, total: graded.length, pct: correct / graded.length };
  }, [history]);

  async function saveTop3() {
    if (!top3.length) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("enterprise_decisions" as any).delete().eq("decision_date", today).eq("status", "proposed");
      const rows = top3.map((c, i) => ({
        decision_date: today,
        rank: i + 1,
        action_type: c.action_type,
        title: c.title,
        rationale: c.rationale,
        expected_traffic_uplift_pct: c.expected_traffic_uplift_pct,
        expected_revenue_uplift_usd: c.expected_revenue_uplift_usd,
        confidence: c.confidence,
        effort: c.effort,
        evidence: c.evidence,
        affected_products: c.affected_products,
        affected_boards: c.affected_boards,
      }));
      const { error } = await supabase.from("enterprise_decisions" as any).insert(rows);
      if (error) throw error;
      toast.success("Today's decisions recorded");
      await loadAll();
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("enterprise_decisions" as any).update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(`Marked ${status}`); await loadAll(); }
  }

  return (
    <div className="p-6 space-y-6">
      <Helmet>
        <title>Enterprise Decision Center | Pinterest Intelligence</title>
        <meta name="description" content="Daily ranked Pinterest growth actions by expected ROI." />
      </Helmet>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Decision Center</h1>
          <p className="text-sm text-muted-foreground">The single best next action, ranked by expected ROI. Recommendations only — no production changes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAll} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recompute"}</Button>
          <Button onClick={saveTop3} disabled={saving || !top3.length}>Record Today's Top 3</Button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi icon={<Target className="h-4 w-4" />} label="Top Priority" value={top3[0]?.title.slice(0, 40) ?? "—"} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Traffic Forecast (weighted)" value={`+${traffic7d.toFixed(0)}%`} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Revenue Forecast / 30d" value={`$${revenue30d.toFixed(0)}`} />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Growth Confidence" value={`${(growthConfidence * 100).toFixed(0)}%`} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Enterprise Health" value={`${(health?.health_score ?? 0).toFixed(0)}/100`} />
      </div>

      {/* Top 3 */}
      <Card>
        <CardHeader><CardTitle>Top 3 Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Computing…</div>
          ) : top3.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidate action met the evidence threshold. Wait for more signal.</p>
          ) : top3.map((c, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge>#{i + 1}</Badge>
                    <Badge variant="secondary">{ACTION_LABELS[c.action_type]}</Badge>
                    <Badge variant="outline">effort: {c.effort}</Badge>
                  </div>
                  <h3 className="font-semibold mt-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{c.rationale}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">confidence</div>
                  <div className="font-mono text-sm">{(c.confidence * 100).toFixed(0)}%</div>
                  <Progress value={c.confidence * 100} className="w-24 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="Traffic uplift" value={`+${c.expected_traffic_uplift_pct}%`} />
                <Stat label="Revenue / 30d" value={`$${c.expected_revenue_uplift_usd}`} />
                <Stat label="Affected products" value={String(c.affected_products.length)} />
                <Stat label="Affected boards" value={String(c.affected_boards.length)} />
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Evidence</summary>
                <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(c.evidence, null, 2)}</pre>
              </details>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Current Bottlenecks</CardTitle></CardHeader>
          <CardContent>
            {bottlenecks.length === 0 ? <p className="text-sm text-muted-foreground">No structural bottlenecks detected.</p> : (
              <ul className="space-y-2 text-sm">
                {bottlenecks.map((b, i) => (
                  <li key={i} className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" /><span>{b}</span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Risk Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rejected.length === 0 ? <p className="text-muted-foreground">All candidates passed evidence gates.</p> : rejected.map((c, i) => (
              <div key={i} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">Rejected: {c.reject_reason}</div>
                </div>
                <Badge variant="outline">conf {(c.confidence * 100).toFixed(0)}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Decision History</CardTitle>
          {accuracy && (
            <Badge variant="secondary">Accuracy: {(accuracy.pct * 100).toFixed(0)}% ({accuracy.correct}/{accuracy.total})</Badge>
          )}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">No recorded decisions yet.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">{h.decision_date}</TableCell>
                    <TableCell>{h.rank}</TableCell>
                    <TableCell className="max-w-[380px]">
                      <div className="font-medium truncate">{h.title}</div>
                      <div className="text-xs text-muted-foreground">{ACTION_LABELS[h.action_type as ActionType] ?? h.action_type}</div>
                    </TableCell>
                    <TableCell>{(Number(h.confidence) * 100).toFixed(0)}%</TableCell>
                    <TableCell><Badge variant={h.status === "validated" ? "default" : h.status === "missed" ? "destructive" : "secondary"}>{h.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {h.status === "proposed" || h.status === "accepted" || h.status === "executed" ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => updateStatus(h.id, "validated")}><CheckCircle2 className="h-4 w-4 text-emerald-500" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => updateStatus(h.id, "missed")}><XCircle className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
        <div className="mt-1 text-lg font-semibold truncate">{value}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}