import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Brain, TrendingUp, ShieldAlert, Check, X, Info, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ---- Types (loose, matches MissionControlPage) ----
type Sub = {
  subscore_key: string; category: string; label: string;
  score: number | null; weight: number; confidence: number | null;
  evidence?: any; note?: string | null;
};
type Snap = {
  id?: string;
  overall_score: number; confidence: number; captured_at: string;
  priorities: any[] | null; simulation?: any; sha256?: string | null;
};
type Briefing = {
  top_threat: string | null; top_opportunity: string | null;
  top_revenue_leak: string | null; top_revenue_opportunity: string | null;
  highest_roi: string | null; confidence: number | null;
  expected_revenue_today: number | null; expected_profit_today: number | null;
};

export type IntelligenceProps = {
  snap: Snap | null;
  subs: Sub[];
  briefing: Briefing | null;
  loading: boolean;
};

// ---- Helpers ----
function confBand(c: number | null | undefined): { label: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"; cls: string } {
  if (c == null || Number.isNaN(Number(c))) return { label: "UNKNOWN", cls: "bg-muted text-foreground" };
  const n = Number(c);
  if (n >= 80) return { label: "HIGH", cls: "bg-emerald-600 text-white" };
  if (n >= 55) return { label: "MEDIUM", cls: "bg-amber-500 text-white" };
  return { label: "LOW", cls: "bg-red-600 text-white" };
}

function scoreDisplay(s: number | null | undefined, conf: number | null | undefined): { text: string; unknown: boolean } {
  // "Unknown ≠ Bad" — if we have no confidence AND no meaningful score, show UNKNOWN
  if (s == null && (conf == null || Number(conf) === 0)) return { text: "UNKNOWN", unknown: true };
  if (s == null) return { text: "UNKNOWN", unknown: true };
  return { text: Number(s).toFixed(0), unknown: false };
}

function difficultyFor(gap: number): { label: string; minutes: number } {
  if (gap >= 60) return { label: "HIGH", minutes: 240 };
  if (gap >= 30) return { label: "MEDIUM", minutes: 90 };
  if (gap >= 10) return { label: "LOW", minutes: 25 };
  return { label: "TRIVIAL", minutes: 10 };
}

function fmt$(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function suggestFix(key: string, label: string): string {
  const k = (key + " " + label).toLowerCase();
  if (k.includes("track") || k.includes("ga4") || k.includes("attribut")) return "Repair tracking: verify GA4 event coverage and session stitching";
  if (k.includes("revenue") || k.includes("checkout") || k.includes("stripe")) return "Enable Express Checkout + abandoned-cart recovery";
  if (k.includes("pin")) return "Rerun Pinterest quality gate; retire failing creatives";
  if (k.includes("trust") || k.includes("review")) return "Add verified reviews and trust badges above the fold";
  if (k.includes("ai") || k.includes("credit")) return "Tighten AI credit budgets and prune unused generations";
  if (k.includes("infra") || k.includes("perf")) return "Investigate slow queries and route timeouts";
  if (k.includes("seo") || k.includes("indexab")) return "Fix indexability blockers and thin-content pages";
  return "Investigate contributing evidence and repair lowest sub-indices";
}

function rollbackFor(key: string): string {
  const k = key.toLowerCase();
  if (k.includes("revenue") || k.includes("checkout")) return "Feature-flag rollback available";
  if (k.includes("pin")) return "Pin archival is reversible";
  return "Config-level rollback";
}

// ---- Recommendation engine (client-side, from BHI priorities + subs) ----
function buildRecommendations(snap: Snap | null, subs: Sub[]) {
  const priorities = (snap?.priorities ?? []) as any[];
  const seen = new Set<string>();
  const recs: Array<{
    key: string; label: string; category: string;
    score: number | null; confidence: number | null;
    gap: number; revenueImpact: number;
    difficulty: string; minutes: number;
    autoFix: boolean; rollback: string; suggestion: string;
    unknown: boolean;
    rankScore: number;
  }> = [];

  for (const p of priorities) {
    const key = String(p.key ?? p.subscore_key ?? p.label ?? crypto.randomUUID());
    if (seen.has(key)) continue;
    seen.add(key);
    const score = p.score == null ? null : Number(p.score);
    const confidence = p.confidence == null ? null : Number(p.confidence);
    const gap = Number(p.gap_points ?? (score == null ? 0 : Math.max(0, 100 - score)));
    const rev = Number(p.revenue_impact_est ?? 0);
    const d = difficultyFor(gap);
    const unknown = score == null || (confidence != null && confidence < 30);
    const auto = !unknown && rev >= 0 && d.label !== "HIGH" && (p.auto_fix === true || /pin|seo|copy|meta/i.test(String(p.label ?? key)));
    recs.push({
      key, label: String(p.label ?? key), category: String(p.category ?? "general"),
      score, confidence, gap, revenueImpact: rev,
      difficulty: d.label, minutes: d.minutes,
      autoFix: auto, rollback: rollbackFor(key), suggestion: suggestFix(key, String(p.label ?? "")),
      unknown,
      rankScore: (rev || gap * 10) * ((confidence ?? 50) / 100),
    });
  }

  // Augment with weakest subs not already in priorities
  const weakSubs = [...subs]
    .filter((s) => s.score != null && Number(s.score) < 60)
    .sort((a, b) => Number(a.score) - Number(b.score))
    .slice(0, 15);
  for (const s of weakSubs) {
    if (seen.has(s.subscore_key)) continue;
    seen.add(s.subscore_key);
    const score = Number(s.score);
    const gap = Math.max(0, 100 - score);
    const rev = Math.round(gap * (Number(s.weight) || 1) * 6); // heuristic
    const d = difficultyFor(gap);
    const unknown = s.confidence == null || Number(s.confidence) < 30;
    recs.push({
      key: s.subscore_key, label: s.label, category: s.category,
      score, confidence: s.confidence == null ? null : Number(s.confidence),
      gap, revenueImpact: rev,
      difficulty: d.label, minutes: d.minutes,
      autoFix: !unknown && d.label !== "HIGH",
      rollback: rollbackFor(s.subscore_key),
      suggestion: suggestFix(s.subscore_key, s.label),
      unknown,
      rankScore: rev * ((s.confidence ?? 50) / 100),
    });
  }

  return recs.sort((a, b) => b.rankScore - a.rankScore).slice(0, 10);
}

// ---- Component ----
export default function MissionIntelligencePanel({ snap, subs, briefing, loading }: IntelligenceProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const recs = useMemo(() => buildRecommendations(snap, subs), [snap, subs]);
  const top = recs[0];
  const totalLeak = useMemo(() => recs.reduce((a, r) => a + (r.revenueImpact || 0), 0), [recs]);

  const toggle = (k: string) => {
    const n = new Set(expanded);
    n.has(k) ? n.delete(k) : n.add(k);
    setExpanded(n);
  };

  const record = useCallback(async (rec: (typeof recs)[number], decision: "approved" | "rejected") => {
    setBusy(rec.key + decision);
    try {
      const { error } = await supabase.from("governance_decision_log").insert({
        source_engine: "mission_control_intelligence",
        decision_type: decision === "approved" ? "fix_approved" : "fix_rejected",
        proposal: {
          key: rec.key, label: rec.label, category: rec.category,
          suggestion: rec.suggestion, difficulty: rec.difficulty,
          minutes: rec.minutes, auto_fix: rec.autoFix, rollback: rec.rollback,
        },
        expected_metric: "monthly_revenue_recovery_usd",
        expected_value: rec.revenueImpact || 0,
        confidence: rec.confidence == null ? null : Number(rec.confidence),
        linked_report: "/admin/mission-control",
        dedupe_key: `mc:${rec.key}:${decision}:${new Date().toISOString().slice(0, 10)}`,
        learning_status: "pending",
      } as any);
      if (error) throw error;
      toast.success(decision === "approved" ? "Fix approved — logged for execution" : "Rejected — logged for learning loop");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to record decision");
    } finally {
      setBusy(null);
    }
  }, []);

  if (loading && !snap) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading intelligence…
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* CEO Morning Brief with UNKNOWN semantics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" /> Executive Intelligence — CEO Mode
            <Badge className={confBand(briefing?.confidence ?? snap?.confidence ?? null).cls}>
              Confidence {confBand(briefing?.confidence ?? snap?.confidence ?? null).label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1.5">
            <div><span className="text-muted-foreground">Top Threat:</span> <span className="font-medium">{briefing?.top_threat || <em className="text-muted-foreground">UNKNOWN — insufficient signal</em>}</span></div>
            <div><span className="text-muted-foreground">Top Opportunity:</span> <span className="font-medium">{briefing?.top_opportunity || <em className="text-muted-foreground">UNKNOWN</em>}</span></div>
            <div><span className="text-muted-foreground">Top Revenue Leak:</span> <span className="font-medium">{briefing?.top_revenue_leak || <em className="text-muted-foreground">UNKNOWN</em>}</span></div>
            <div><span className="text-muted-foreground">Highest ROI Fix:</span> <span className="font-medium">{briefing?.highest_roi || top?.label || <em className="text-muted-foreground">UNKNOWN</em>}</span></div>
          </div>
          <div className="space-y-1.5">
            <div><span className="text-muted-foreground">Est. leak across Top 10:</span> <span className="font-medium text-red-600">{fmt$(totalLeak)}/mo</span></div>
            <div><span className="text-muted-foreground">Expected revenue today:</span> <span className="font-medium">{briefing?.expected_revenue_today != null ? fmt$(Number(briefing.expected_revenue_today)) : "UNKNOWN"}</span></div>
            <div><span className="text-muted-foreground">Expected profit today:</span> <span className="font-medium">{briefing?.expected_profit_today != null ? fmt$(Number(briefing.expected_profit_today)) : "UNKNOWN"}</span></div>
            <div className="text-xs text-muted-foreground pt-1">Snapshot: {snap?.captured_at ? new Date(snap.captured_at).toLocaleString() : "—"}</div>
          </div>
        </CardContent>
      </Card>

      {/* Today's #1 Fix */}
      {top ? (
        <Card className="border-emerald-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-600" /> Today's #1 Fix
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold">{top.label}</div>
              <Badge className={confBand(top.confidence).cls}>Conf {confBand(top.confidence).label}</Badge>
              {top.unknown ? <Badge variant="outline">UNKNOWN score</Badge> : null}
              {top.autoFix ? <Badge className="bg-blue-600 text-white">Auto-fix eligible</Badge> : <Badge variant="outline">Requires approval</Badge>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="border rounded p-2"><div className="text-muted-foreground">Est. gain</div><div className="font-semibold text-emerald-600">{fmt$(top.revenueImpact)}/mo</div></div>
              <div className="border rounded p-2"><div className="text-muted-foreground">Difficulty</div><div className="font-semibold">{top.difficulty}</div></div>
              <div className="border rounded p-2"><div className="text-muted-foreground">Est. time</div><div className="font-semibold">{top.minutes}m</div></div>
              <div className="border rounded p-2"><div className="text-muted-foreground">Rollback</div><div className="font-semibold">{top.rollback}</div></div>
            </div>
            <div className="text-sm"><span className="text-muted-foreground">Suggested:</span> {top.suggestion}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => record(top, "approved")} disabled={busy === top.key + "approved"}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => record(top, "rejected")} disabled={busy === top.key + "rejected"}>
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(top.key)}>
                <Info className="h-4 w-4 mr-1" /> Explain
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Top 10 recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Top 10 Recommendations — ranked by ROI × confidence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No evidence-backed recommendations yet. Compute a fresh BHI snapshot to generate ranked fixes.</div>
          ) : (
            <div className="divide-y">
              {recs.map((r, i) => {
                const cb = confBand(r.confidence);
                const sd = scoreDisplay(r.score, r.confidence);
                const isOpen = expanded.has(r.key);
                return (
                  <div key={r.key} className="py-2.5">
                    <button className="w-full flex items-center justify-between gap-3 text-left" onClick={() => toggle(r.key)}>
                      <div className="min-w-0 flex items-start gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">#{i + 1} · {r.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.category} · {r.suggestion}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <span className={sd.unknown ? "text-muted-foreground italic" : "font-medium"}>{sd.text}</span>
                        <Badge className={cb.cls}>{cb.label}</Badge>
                        <span className="text-emerald-600 font-medium">{fmt$(r.revenueImpact)}</span>
                      </div>
                    </button>
                    {isOpen ? (
                      <div className="mt-2 ml-6 rounded border bg-muted/30 p-3 space-y-2 text-xs">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div><div className="text-muted-foreground">Score</div><div className="font-semibold">{sd.unknown ? "UNKNOWN" : sd.text + " / 100"}</div></div>
                          <div><div className="text-muted-foreground">Gap to healthy</div><div className="font-semibold">{r.gap.toFixed(0)} pts</div></div>
                          <div><div className="text-muted-foreground">Difficulty</div><div className="font-semibold">{r.difficulty} · {r.minutes}m</div></div>
                          <div><div className="text-muted-foreground">Auto-fix</div><div className="font-semibold">{r.autoFix ? "Eligible" : "Approval required"}</div></div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-2">
                          <div>
                            <div className="text-muted-foreground">Root cause (heuristic)</div>
                            <div>Lowest sub-index in <b>{r.category}</b> · {r.unknown ? "insufficient telemetry (UNKNOWN)" : `gap ${r.gap.toFixed(0)} pts below healthy`}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Business impact</div>
                            <div>Estimated <b className="text-red-600">{fmt$(r.revenueImpact)}/mo</b> loss · rollback: {r.rollback}</div>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => record(r, "approved")} disabled={busy === r.key + "approved"}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => record(r, "rejected")} disabled={busy === r.key + "rejected"}>
                            <X className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                          {!r.autoFix ? (
                            <span className="inline-flex items-center text-[11px] text-muted-foreground gap-1"><ShieldAlert className="h-3 w-3" /> Human approval required per execution safety rule</span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-index explainer grid — every score expandable */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" /> Score Explainer — every sub-index is auditable
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sub-index evidence yet. UNKNOWN scores are not penalized.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-2">
              {[...subs].sort((a, b) => Number(a.score ?? 999) - Number(b.score ?? 999)).slice(0, 12).map((s) => {
                const cb = confBand(s.confidence);
                const sd = scoreDisplay(s.score, s.confidence);
                const isOpen = expanded.has("sub:" + s.subscore_key);
                return (
                  <div key={s.subscore_key} className="border rounded p-2.5">
                    <button className="w-full flex items-center justify-between" onClick={() => toggle("sub:" + s.subscore_key)}>
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-medium truncate">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{s.category} · weight {Number(s.weight || 0).toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={sd.unknown ? "text-muted-foreground italic" : "font-semibold"}>{sd.text}</span>
                        <Badge className={cb.cls}>{cb.label}</Badge>
                      </div>
                    </button>
                    {isOpen ? (
                      <div className="mt-2 pt-2 border-t space-y-1.5 text-xs">
                        {sd.unknown ? (
                          <div className="rounded bg-muted p-2">
                            <b>UNKNOWN.</b> No confident evidence — Genesis will not penalize this score. Wire telemetry to unlock.
                          </div>
                        ) : null}
                        {s.note ? <div><span className="text-muted-foreground">Note:</span> {s.note}</div> : null}
                        {s.evidence ? (
                          <details>
                            <summary className="cursor-pointer text-muted-foreground">Evidence payload</summary>
                            <pre className="text-[10px] whitespace-pre-wrap break-words bg-muted/40 p-2 rounded mt-1">{JSON.stringify(s.evidence, null, 2)}</pre>
                          </details>
                        ) : (
                          <div className="text-muted-foreground">No structured evidence payload attached.</div>
                        )}
                        <div><span className="text-muted-foreground">Suggested:</span> {suggestFix(s.subscore_key, s.label)}</div>
                        <div><span className="text-muted-foreground">Rollback:</span> {rollbackFor(s.subscore_key)}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
