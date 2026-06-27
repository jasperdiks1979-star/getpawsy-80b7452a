import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, History, BarChart3, CheckCircle2, XCircle, RotateCcw, Clock } from "lucide-react";

/**
 * PHASE 7 — Controlled Execution Engine
 * READ-ONLY toward Pinterest. Operator approval state stored locally (no schema changes).
 * Pulls recommendations from existing tables produced by Phase 6 engines.
 */

type RecStatus = "pending" | "approved" | "rejected" | "postponed" | "executed" | "rolled_back" | "regenerate";

interface UnifiedRec {
  id: string;
  source: string;
  title: string;
  category: string;
  evidence: any;
  confidence: number;
  expectedImpact: string;
  effort: "low" | "medium" | "high";
  estTrafficGain: number;
  estRevenueGain: number;
  risk: "low" | "medium" | "high";
  createdAt: string;
  payload: any;
  recType: string;
}

interface LocalState {
  status: RecStatus;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  planVersion: number;
  history: Array<{ at: string; action: string; note?: string }>;
  predicted?: Record<string, number>;
  actual?: Record<string, number>;
}

const STORAGE_KEY = "execution_center_state_v1";

function loadState(): Record<string, LocalState> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveState(s: Record<string, LocalState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const RECOMMENDATION_TYPES = [
  "create_replacement_pin", "rewrite_title", "rewrite_description", "generate_ai_creative",
  "move_board", "retarget_keywords", "reschedule_publish", "archive_variant",
  "split_board", "merge_board", "improve_cta", "improve_image", "improve_metadata",
];

function inferRecType(source: string, action: string, payload: any): string {
  const a = (action || "").toLowerCase();
  if (a.includes("archive")) return "archive_variant";
  if (a.includes("title")) return "rewrite_title";
  if (a.includes("description") || a.includes("desc")) return "rewrite_description";
  if (a.includes("board") && a.includes("move")) return "move_board";
  if (a.includes("keyword")) return "retarget_keywords";
  if (a.includes("schedule") || a.includes("time")) return "reschedule_publish";
  if (a.includes("cta")) return "improve_cta";
  if (a.includes("image") || a.includes("creative")) return "generate_ai_creative";
  if (a.includes("meta")) return "improve_metadata";
  if (a.includes("split")) return "split_board";
  if (a.includes("merge")) return "merge_board";
  if (a.includes("replace") || a.includes("regenerate")) return "create_replacement_pin";
  if (a.includes("improve")) return "improve_image";
  return source;
}

function riskFromConfidence(c: number): "low" | "medium" | "high" {
  if (c >= 0.85) return "low";
  if (c >= 0.65) return "medium";
  return "high";
}

function effortFromType(t: string): "low" | "medium" | "high" {
  if (["archive_variant", "reschedule_publish", "move_board"].includes(t)) return "low";
  if (["split_board", "merge_board", "generate_ai_creative"].includes(t)) return "high";
  return "medium";
}

function impactBand(c: number, traffic: number): string {
  if (c >= 0.85 && traffic > 500) return "high";
  if (c >= 0.65) return "medium";
  return "low";
}

const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function ExecutionCenterPage() {
  const [loading, setLoading] = useState(true);
  const [recs, setRecs] = useState<UnifiedRec[]>([]);
  const [state, setState] = useState<Record<string, LocalState>>(() => loadState());
  const [selected, setSelected] = useState<UnifiedRec | null>(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [growth, commander, peAi] = await Promise.all([
        supabase.from("pinterest_growth_actions")
          .select("id, action_type, product_slug, reason, payload, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("commander_recommendations")
          .select("id, title, reason, affected_engine, confidence_score, estimated_roi_usd, risk_level, suggested_action, payload, status, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("pe_ai_recommendations")
          .select("id, optimizer, recommendation, evidence, confidence, expected_impact, required_action, status, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      const out: UnifiedRec[] = [];

      (growth.data || []).forEach((r: any) => {
        const confidence = Number(r.payload?.confidence ?? 0.7);
        const trafficGain = Number(r.payload?.estimated_traffic_gain ?? r.payload?.expected_impressions ?? 250);
        const revenueGain = Number(r.payload?.estimated_revenue_gain ?? r.payload?.expected_revenue ?? 0);
        const recType = inferRecType("pinterest_growth", r.action_type, r.payload);
        out.push({
          id: `g_${r.id}`,
          source: "Pinterest Growth Engine",
          title: `${r.action_type}: ${r.product_slug ?? "(global)"}`,
          category: r.payload?.category ?? "Pinterest",
          evidence: r.payload?.evidence ?? r.reason,
          confidence,
          expectedImpact: impactBand(confidence, trafficGain),
          effort: effortFromType(recType),
          estTrafficGain: trafficGain,
          estRevenueGain: revenueGain,
          risk: riskFromConfidence(confidence),
          createdAt: r.created_at,
          payload: r.payload,
          recType,
        });
      });

      (commander.data || []).forEach((r: any) => {
        const confidence = Number(r.confidence_score ?? 0.7);
        const revenueGain = Number(r.estimated_roi_usd ?? 0);
        const recType = inferRecType("commander", r.suggested_action ?? r.title, r.payload);
        out.push({
          id: `c_${r.id}`,
          source: r.affected_engine ?? "Commander",
          title: r.title,
          category: r.affected_engine ?? "Strategy",
          evidence: r.reason,
          confidence,
          expectedImpact: impactBand(confidence, revenueGain / 2),
          effort: effortFromType(recType),
          estTrafficGain: Number(r.payload?.estimated_traffic_gain ?? 0),
          estRevenueGain: revenueGain,
          risk: (r.risk_level as any) ?? riskFromConfidence(confidence),
          createdAt: r.created_at,
          payload: r.payload,
          recType,
        });
      });

      (peAi.data || []).forEach((r: any) => {
        const confidence = Number(r.confidence ?? 0.7);
        const recType = inferRecType("pe_ai", r.required_action ?? r.recommendation, r.evidence);
        out.push({
          id: `p_${r.id}`,
          source: r.optimizer ?? "PE AI",
          title: r.recommendation?.slice(0, 80) ?? "Recommendation",
          category: r.optimizer ?? "Pinterest Ads",
          evidence: r.evidence,
          confidence,
          expectedImpact: r.expected_impact ?? impactBand(confidence, 0),
          effort: effortFromType(recType),
          estTrafficGain: 0,
          estRevenueGain: 0,
          risk: riskFromConfidence(confidence),
          createdAt: r.created_at,
          payload: r.evidence,
          recType,
        });
      });

      if (!cancelled) {
        setRecs(out);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const decide = (id: string, status: RecStatus, note?: string) => {
    setState(prev => {
      const cur = prev[id] ?? { status: "pending", planVersion: 1, history: [] };
      return {
        ...prev,
        [id]: {
          ...cur,
          status,
          decidedAt: new Date().toISOString(),
          decidedBy: "operator",
          note: note ?? cur.note,
          planVersion: status === "regenerate" ? cur.planVersion + 1 : cur.planVersion,
          history: [...cur.history, { at: new Date().toISOString(), action: status, note }],
        },
      };
    });
    toast.success(`Marked ${status.replace("_", " ")}`);
  };

  const bulkDecide = (status: RecStatus, filter: (r: UnifiedRec) => boolean) => {
    const targets = recs.filter(filter).filter(r => (state[r.id]?.status ?? "pending") === "pending");
    if (!targets.length) { toast.info("No matching pending items"); return; }
    setState(prev => {
      const next = { ...prev };
      const now = new Date().toISOString();
      targets.forEach(r => {
        const cur = next[r.id] ?? { status: "pending", planVersion: 1, history: [] };
        next[r.id] = { ...cur, status, decidedAt: now, decidedBy: "operator-bulk",
          history: [...cur.history, { at: now, action: `bulk_${status}` }] };
      });
      return next;
    });
    toast.success(`Bulk ${status} applied to ${targets.length}`);
  };

  const recsWithState = useMemo(() => recs.map(r => ({ rec: r, s: state[r.id] ?? { status: "pending" as RecStatus, planVersion: 1, history: [] as any[] } })), [recs, state]);

  const summary = useMemo(() => {
    const buckets: Record<RecStatus, number> = { pending: 0, approved: 0, rejected: 0, postponed: 0, executed: 0, rolled_back: 0, regenerate: 0 };
    let confSum = 0;
    let trafficGain = 0;
    let revenueGain = 0;
    recsWithState.forEach(({ rec, s }) => {
      buckets[s.status] = (buckets[s.status] || 0) + 1;
      confSum += rec.confidence;
      if (s.status === "executed") { trafficGain += rec.estTrafficGain; revenueGain += rec.estRevenueGain; }
    });
    return { buckets, avgConfidence: recs.length ? confSum / recs.length : 0, trafficGain, revenueGain, total: recs.length };
  }, [recsWithState, recs.length]);

  const accuracy = useMemo(() => {
    const items = recsWithState.filter(x => x.s.status === "executed" && x.s.predicted && x.s.actual);
    if (!items.length) return null;
    const errs: number[] = [];
    items.forEach(({ s }) => {
      const keys = Object.keys(s.predicted || {});
      keys.forEach(k => {
        const p = s.predicted![k]; const a = s.actual![k];
        if (p > 0) errs.push(Math.abs(a - p) / p);
      });
    });
    const mape = errs.length ? errs.reduce((x, y) => x + y, 0) / errs.length : 0;
    return { mape, sampleSize: items.length };
  }, [recsWithState]);

  const riskBadge = (r: string) => {
    const cls = r === "low" ? "bg-emerald-100 text-emerald-800" : r === "medium" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800";
    return <Badge variant="secondary" className={cls}>{r}</Badge>;
  };
  const statusBadge = (s: RecStatus) => {
    const map: Record<RecStatus, string> = {
      pending: "bg-slate-100 text-slate-800",
      approved: "bg-blue-100 text-blue-800",
      rejected: "bg-rose-100 text-rose-800",
      postponed: "bg-amber-100 text-amber-800",
      executed: "bg-emerald-100 text-emerald-800",
      rolled_back: "bg-purple-100 text-purple-800",
      regenerate: "bg-cyan-100 text-cyan-800",
    };
    return <Badge variant="secondary" className={map[s]}>{s.replace("_", " ")}</Badge>;
  };

  return (
    <>
      <Helmet><title>Execution Center · Phase 7</title></Helmet>
      <div className="container mx-auto p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Execution Center</h1>
            <p className="text-sm text-muted-foreground">Phase 7 — Controlled execution. Read-only to Pinterest. Operator approval required for every action.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="border-emerald-500 text-emerald-700"><ShieldCheck className="h-3 w-3 mr-1" /> SAFE MODE</Badge>
            <Badge variant="outline">No auto-publish</Badge>
            <Badge variant="outline">No auto-delete</Badge>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="approval">Approval</TabsTrigger>
            <TabsTrigger value="impact">Impact</TabsTrigger>
            <TabsTrigger value="rollback">Rollback</TabsTrigger>
            <TabsTrigger value="learning">Learning</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          {/* MODULE 8 — Executive Overview */}
          <TabsContent value="overview" className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Waiting", value: summary.buckets.pending },
                { label: "Approved", value: summary.buckets.approved },
                { label: "Executed", value: summary.buckets.executed },
                { label: "Rejected", value: summary.buckets.rejected },
                { label: "Avg confidence", value: `${Math.round(summary.avgConfidence * 100)}%` },
                { label: "Prediction MAPE", value: accuracy ? `${Math.round(accuracy.mape * 100)}%` : "—" },
                { label: "Traffic gained", value: fmtNum(summary.trafficGain) },
                { label: "Revenue gained", value: fmtUsd(summary.trafficGain ? summary.revenueGain : summary.revenueGain) },
              ].map((k, i) => (
                <Card key={i}><CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                  <div className="text-2xl font-bold mt-1">{k.value}</div>
                </CardContent></Card>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Best / worst executed</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {recsWithState.filter(x => x.s.status === "executed").length === 0
                  ? "No executed recommendations yet."
                  : "Performance comparison appears here after execution and observation."}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 1 — Queue */}
          <TabsContent value="queue">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recommendation Queue</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => bulkDecide("approved", r => r.risk === "low" && r.confidence >= 0.85)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Bulk approve high-confidence
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkDecide("rejected", r => r.risk === "high")}>
                    <XCircle className="h-4 w-4 mr-1" /> Bulk reject high-risk
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Title</TableHead><TableHead>Source</TableHead><TableHead>Type</TableHead>
                      <TableHead>Conf</TableHead><TableHead>Impact</TableHead><TableHead>Effort</TableHead>
                      <TableHead>Traffic+</TableHead><TableHead>Revenue+</TableHead>
                      <TableHead>Risk</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {recsWithState.slice(0, 200).map(({ rec, s }) => (
                        <TableRow key={rec.id}>
                          <TableCell className="max-w-xs truncate" title={rec.title}>{rec.title}</TableCell>
                          <TableCell className="text-xs">{rec.source}</TableCell>
                          <TableCell className="text-xs">{rec.recType}</TableCell>
                          <TableCell>{Math.round(rec.confidence * 100)}%</TableCell>
                          <TableCell>{rec.expectedImpact}</TableCell>
                          <TableCell>{rec.effort}</TableCell>
                          <TableCell>{fmtNum(rec.estTrafficGain)}</TableCell>
                          <TableCell>{fmtUsd(rec.estRevenueGain)}</TableCell>
                          <TableCell>{riskBadge(rec.risk)}</TableCell>
                          <TableCell>{statusBadge(s.status)}</TableCell>
                          <TableCell className="text-xs">{new Date(rec.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell><Button size="sm" variant="ghost" onClick={() => setSelected(rec)}>Open</Button></TableCell>
                        </TableRow>
                      ))}
                      {recs.length === 0 && (
                        <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">No recommendations yet — run the Pinterest Growth Engine.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 2 — Plans */}
          <TabsContent value="plans">
            <Card>
              <CardHeader><CardTitle className="text-base">Supported Execution Plans</CardTitle></CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {RECOMMENDATION_TYPES.map(t => (
                    <div key={t} className="border rounded p-2 flex items-center justify-between">
                      <span>{t.replace(/_/g, " ")}</span>
                      <Badge variant="outline">{recs.filter(r => r.recType === t).length}</Badge>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Each plan is versioned per recommendation and increments on "Request regeneration".</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 3 — Approval */}
          <TabsContent value="approval">
            <Card>
              <CardHeader><CardTitle className="text-base">Pending Approvals</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Conf</TableHead><TableHead>Risk</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {recsWithState.filter(x => x.s.status === "pending").slice(0, 100).map(({ rec }) => (
                      <TableRow key={rec.id}>
                        <TableCell className="max-w-md truncate">{rec.title}</TableCell>
                        <TableCell>{Math.round(rec.confidence * 100)}%</TableCell>
                        <TableCell>{riskBadge(rec.risk)}</TableCell>
                        <TableCell className="flex gap-1 flex-wrap">
                          <Button size="sm" onClick={() => decide(rec.id, "approved")}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => decide(rec.id, "rejected")}>Reject</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide(rec.id, "postponed")}><Clock className="h-3 w-3 mr-1" />Postpone</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide(rec.id, "regenerate")}>Regenerate</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 4 — Impact Simulation */}
          <TabsContent value="impact">
            <Card>
              <CardHeader><CardTitle className="text-base">Impact Simulation (Approved)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Title</TableHead><TableHead>Impr</TableHead><TableHead>Clicks</TableHead><TableHead>Saves</TableHead>
                    <TableHead>CTR</TableHead><TableHead>Views</TableHead><TableHead>ATC</TableHead><TableHead>Purch</TableHead>
                    <TableHead>Revenue</TableHead><TableHead>CI</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {recsWithState.filter(x => ["approved", "executed"].includes(x.s.status)).slice(0, 100).map(({ rec }) => {
                      const impr = rec.estTrafficGain || 250;
                      const ctr = 0.012 + rec.confidence * 0.02;
                      const clicks = impr * ctr;
                      const saves = impr * 0.018;
                      const views = clicks * 0.6;
                      const atc = views * 0.05;
                      const purch = atc * 0.18;
                      const rev = rec.estRevenueGain || purch * 32;
                      const ciHalf = (1 - rec.confidence) * 0.5;
                      return (
                        <TableRow key={rec.id}>
                          <TableCell className="max-w-xs truncate">{rec.title}</TableCell>
                          <TableCell>{fmtNum(impr)}</TableCell>
                          <TableCell>{fmtNum(clicks)}</TableCell>
                          <TableCell>{fmtNum(saves)}</TableCell>
                          <TableCell>{(ctr * 100).toFixed(2)}%</TableCell>
                          <TableCell>{fmtNum(views)}</TableCell>
                          <TableCell>{fmtNum(atc)}</TableCell>
                          <TableCell>{fmtNum(purch)}</TableCell>
                          <TableCell>{fmtUsd(rev)}</TableCell>
                          <TableCell className="text-xs">±{Math.round(ciHalf * 100)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 5 — Rollback */}
          <TabsContent value="rollback">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Executed & Rollback</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Plan v</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {recsWithState.filter(x => ["executed", "rolled_back"].includes(x.s.status)).map(({ rec, s }) => (
                      <TableRow key={rec.id}>
                        <TableCell className="max-w-md truncate">{rec.title}</TableCell>
                        <TableCell>v{s.planVersion}</TableCell>
                        <TableCell>{statusBadge(s.status)}</TableCell>
                        <TableCell>
                          {s.status === "executed"
                            ? <Button size="sm" variant="outline" onClick={() => decide(rec.id, "rolled_back", "operator rollback")}>Rollback</Button>
                            : <Button size="sm" variant="ghost" onClick={() => decide(rec.id, "executed")}>Restore</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {recsWithState.filter(x => ["executed", "rolled_back"].includes(x.s.status)).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nothing executed yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 6 — Learning */}
          <TabsContent value="learning">
            <Card>
              <CardHeader><CardTitle className="text-base">Prediction vs Reality</CardTitle></CardHeader>
              <CardContent>
                {accuracy ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Sample size</div><div className="text-xl font-bold">{accuracy.sampleSize}</div></div>
                    <div className="border rounded p-3"><div className="text-xs text-muted-foreground">MAPE</div><div className="text-xl font-bold">{Math.round(accuracy.mape * 100)}%</div></div>
                    <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Calibration</div><div className="text-xl font-bold">{accuracy.mape < 0.2 ? "Good" : accuracy.mape < 0.4 ? "Fair" : "Poor"}</div></div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Learning loop activates after executed recommendations have observed outcomes.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MODULE 7 — Audit */}
          <TabsContent value="audit">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Change History</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Recommendation</TableHead><TableHead>Action</TableHead><TableHead>By</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {recsWithState.flatMap(({ rec, s }) =>
                      (s.history || []).map((h, i) => ({ rec, h, i }))
                    ).sort((a, b) => b.h.at.localeCompare(a.h.at)).slice(0, 200).map(({ rec, h, i }) => (
                      <TableRow key={`${rec.id}_${i}`}>
                        <TableCell className="text-xs">{new Date(h.at).toLocaleString()}</TableCell>
                        <TableCell className="max-w-md truncate">{rec.title}</TableCell>
                        <TableCell>{h.action}</TableCell>
                        <TableCell className="text-xs">operator</TableCell>
                        <TableCell className="text-xs">{h.note ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected?.title}</DialogTitle>
              <DialogDescription>{selected?.source} · {selected?.recType}</DialogDescription>
            </DialogHeader>
            {selected && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>Confidence:</strong> {Math.round(selected.confidence * 100)}%</div>
                  <div><strong>Risk:</strong> {selected.risk}</div>
                  <div><strong>Impact:</strong> {selected.expectedImpact}</div>
                  <div><strong>Effort:</strong> {selected.effort}</div>
                  <div><strong>Traffic gain:</strong> {fmtNum(selected.estTrafficGain)}</div>
                  <div><strong>Revenue gain:</strong> {fmtUsd(selected.estRevenueGain)}</div>
                </div>
                <div>
                  <div className="font-semibold mb-1">Evidence</div>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-48">{JSON.stringify(selected.evidence, null, 2)}</pre>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => { decide(selected.id, "approved"); setSelected(null); }}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => { decide(selected.id, "rejected"); setSelected(null); }}>Reject</Button>
                  <Button size="sm" variant="ghost" onClick={() => { decide(selected.id, "postponed"); setSelected(null); }}>Postpone</Button>
                  <Button size="sm" variant="ghost" onClick={() => { decide(selected.id, "regenerate"); setSelected(null); }}>Regenerate</Button>
                  {state[selected.id]?.status === "approved" && (
                    <Button size="sm" variant="secondary" onClick={() => { decide(selected.id, "executed", "marked executed by operator"); setSelected(null); }}>Mark executed</Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Safe mode: this never publishes to Pinterest. Use the relevant engine page to perform the actual change after approval.</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}