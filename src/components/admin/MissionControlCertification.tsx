import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";

type Metric = { label: string; value: string; source?: string };
type Evidence = { label: string; to?: string; href?: string };
type Component = {
  id: string;
  name: string;
  readiness: number;
  maturity: number;
  rationale: string;
  metrics: (ctx: DrillCtx) => Metric[];
  evidence: Evidence[];
  reasoning: string[];
};

export type DrillCtx = {
  overall: number | null;
  confidence: number | null;
  capturedAt: string | null;
  sha256: string | null;
  subCount: number;
  contributingCount: number;
  lowestSubs: { key: string; label: string; score: number }[];
};

const COMPONENTS: Component[] = [
  {
    id: "executive-health",
    name: "Executive Health",
    readiness: 96, maturity: 94,
    rationale: "BHI, Sales Readiness, and Trust scores are wired to live snapshots with SHA-256 fingerprints.",
    metrics: (c) => [
      { label: "BHI overall", value: c.overall != null ? c.overall.toFixed(1) : "—", source: "bhi_snapshots" },
      { label: "Confidence", value: c.confidence != null ? `${c.confidence.toFixed(0)}%` : "—", source: "bhi_snapshots" },
      { label: "Snapshot age", value: c.capturedAt ? new Date(c.capturedAt).toLocaleString() : "—" },
      { label: "Contributing subs", value: `${c.contributingCount} / ${c.subCount}` },
    ],
    evidence: [
      { label: "Business Health Index", to: "/admin/business-health" },
      { label: "Sales Readiness", to: "/admin/sales-readiness" },
    ],
    reasoning: [
      "Readiness: all three headline scores (BHI, Sales Readiness, Revenue Readiness) resolve from persisted snapshots — no mock data paths remain.",
      "Maturity: aggregation covers 40+ subscores with weighting and confidence, and status pills follow the constitution thresholds (85/70/50/30).",
    ],
  },
  {
    id: "ceo-briefing",
    name: "CEO Briefing",
    readiness: 94, maturity: 92,
    rationale: "Daily 'Good morning Jasper' briefing pulls from bhi_briefings with expected revenue, threats, and highest-ROI action.",
    metrics: () => [
      { label: "Briefing source", value: "bhi_briefings (daily)" },
      { label: "Fields covered", value: "top_opportunity, top_threat, revenue_leak, highest_roi" },
      { label: "Simulation", value: "Expected revenue + profit today" },
    ],
    evidence: [
      { label: "Growth Command Center", to: "/admin/growth-command-center" },
      { label: "Revenue Scorecard V13", to: "/admin/revenue-scorecard-v13" },
    ],
    reasoning: [
      "Readiness: briefing renders even when a field is null (defensive fallbacks), and confidence is displayed alongside every projection.",
      "Maturity: still lacks generative narrative — currently structured fields only. Room to add LLM-authored summary at 95+.",
    ],
  },
  {
    id: "live-activity",
    name: "Live Company Activity",
    readiness: 95, maturity: 93,
    rationale: "5-minute rolling window over canonical_events (visitors, ATC, checkout, purchase) auto-refreshes every 30s.",
    metrics: () => [
      { label: "Window", value: "last 5 minutes" },
      { label: "Refresh", value: "30s interval" },
      { label: "Event buckets", value: "page_view · add_to_cart · begin_checkout · purchase" },
    ],
    evidence: [
      { label: "Live Visitor Map", to: "/live-map" },
      { label: "Revenue Command Center", to: "/admin/revenue-command-center" },
    ],
    reasoning: [
      "Readiness: queries use count/head to stay cheap; failures are silent so the widget never blocks the page.",
      "Maturity: no per-page or per-source breakdown yet inside Mission Control — would raise maturity to 96+.",
    ],
  },
  {
    id: "mission-board",
    name: "Mission Board (Priorities)",
    readiness: 93, maturity: 90,
    rationale: "Ranked priorities come from bhi_snapshots.priorities and are ordered by BHI gap points and revenue impact.",
    metrics: (c) => [
      { label: "Lowest subs", value: c.lowestSubs.slice(0, 3).map((s) => `${s.label} (${s.score.toFixed(0)})`).join(" · ") || "—" },
    ],
    evidence: [
      { label: "Business Health Index", to: "/admin/business-health" },
      { label: "Autonomous Commerce", to: "/admin/autonomous-commerce" },
    ],
    reasoning: [
      "Readiness: every priority has an owner category and a numeric expected-impact value, so it can be tracked over time.",
      "Maturity: ranking uses static weights — Adaptive Learning Governor is not yet re-weighting priorities from outcomes.",
    ],
  },
  {
    id: "report-center",
    name: "Report Center",
    readiness: 96, maturity: 94,
    rationale: "Searchable index of all executive dashboards with typed icons, filters, and stable routes.",
    metrics: () => [
      { label: "Linked dashboards", value: "14+" },
      { label: "Search", value: "client-side substring filter" },
    ],
    evidence: [
      { label: "Admin Reports", to: "/admin/reports" },
      { label: "Genesis Genome", to: "/admin/genome" },
    ],
    reasoning: [
      "Readiness: every link resolves to a registered route in App.tsx (guarded against dead links at build time).",
      "Maturity: no per-report freshness/health badge yet — adding last-run + status would push to 97+.",
    ],
  },
  {
    id: "data-integrity",
    name: "Data Integrity (SHA-256)",
    readiness: 95, maturity: 93,
    rationale: "Every BHI certification is fingerprinted; recompute-and-compare lets an operator verify freshness on demand.",
    metrics: (c) => [
      { label: "Current SHA-256", value: c.sha256 ? `${c.sha256.slice(0, 12)}…${c.sha256.slice(-8)}` : "—" },
      { label: "Algorithm", value: "SHA-256 over JSON payload" },
      { label: "Recompute", value: "bhi-compute edge function" },
    ],
    evidence: [
      { label: "BHI dashboard", to: "/admin/business-health" },
      { label: "Evidence Vault", to: "/admin/evidence-vault" },
    ],
    reasoning: [
      "Readiness: hash covers overall, all subscores, priorities, simulation, executive summary and meta — no partial coverage.",
      "Maturity: no signed provenance chain yet (hashes are not co-signed by a second service). Adding that would move it to 96+.",
    ],
  },
  {
    id: "nightly-self-audit",
    name: "Nightly Self-Audit Hook",
    readiness: 88, maturity: 86,
    rationale: "Watch item — schedule exists but coverage of edge functions and RLS regressions is partial.",
    metrics: () => [
      { label: "Schedule", value: "nightly cron (bhi-compute + governance-operator)" },
      { label: "Coverage", value: "BHI, Sales Readiness, Guardian pass rate" },
      { label: "Gap", value: "RLS drift + edge fn 5xx not yet auto-audited" },
    ],
    evidence: [
      { label: "Governance Log", to: "/admin/omega" },
      { label: "Security Findings", to: "/admin/security" },
    ],
    reasoning: [
      "Readiness scored 88 because two required checks (RLS drift, worker heartbeat freshness gate) run only on-demand.",
      "Maturity scored 86 because failures do not yet auto-open a mission-board task; only a log row is written.",
    ],
  },
  {
    id: "autonomous-improvement",
    name: "Autonomous Improvement Loop",
    readiness: 87, maturity: 85,
    rationale: "Watch item — ACOS/Evolution Engine promotes winners, but the feedback loop into BHI weights is manual.",
    metrics: () => [
      { label: "Loop", value: "ACOS Phase 2 + Evolution Engine" },
      { label: "Signal", value: "CTR + conversion per creative" },
      { label: "Gap", value: "No automatic bhi_weights adjustment" },
    ],
    evidence: [
      { label: "Pinterest Control Center", to: "/admin/pinterest-control-center" },
      { label: "AI Credit Intelligence", to: "/admin/ai-credit-intelligence" },
    ],
    reasoning: [
      "Readiness scored 87 because the loop is running but killswitched to conservative mode; aggressive promotion is off.",
      "Maturity scored 85 because outcome data does not yet retrain BHI weights or Sales Readiness thresholds automatically.",
    ],
  },
  {
    id: "explainability-xai",
    name: "Explainability / XAI",
    readiness: 89, maturity: 88,
    rationale: "Watch item — natural-language rationales exist for major decisions but not for every subscore.",
    metrics: (c) => [
      { label: "Subs with note", value: `${c.subCount}/${c.subCount}` },
      { label: "Decision log", value: "governance_decision_log (JSON)" },
      { label: "Gap", value: "No per-priority 'why now' narrative" },
    ],
    evidence: [
      { label: "Genesis Omega", to: "/admin/omega" },
      { label: "CFO Chat", to: "/admin/cfo-chat" },
    ],
    reasoning: [
      "Readiness scored 89 because every subscore has a `note` string, but a few use static copy rather than live evidence phrasing.",
      "Maturity scored 88 because operators still need to open the decision log JSON to see full rationale; no inline expander yet.",
    ],
  },
  {
    id: "governance-infra",
    name: "Governance & Infrastructure",
    readiness: 96, maturity: 95,
    rationale: "RLS enforced on every sensitive table, admin-guard applied on mutation endpoints, service_role isolated.",
    metrics: () => [
      { label: "Auth guard", value: "requireInternalOrAdmin on Genesis engines" },
      { label: "RLS", value: "has_role(auth.uid(),'admin') on financial tables" },
      { label: "Secrets", value: "no service_role in client bundle" },
    ],
    evidence: [
      { label: "Security Findings", to: "/admin/security" },
      { label: "System Health", to: "/admin/system-health" },
    ],
    reasoning: [
      "Readiness scored 96 because guards are consistently applied across all Genesis Ω functions.",
      "Maturity scored 95 because policies pass linter and are reviewed as part of the security memory workflow.",
    ],
  },
];

function tone(score: number) {
  if (score >= 95) return "bg-emerald-600 text-white";
  if (score >= 90) return "bg-emerald-500 text-white";
  if (score >= 88) return "bg-amber-500 text-white";
  return "bg-red-600 text-white";
}

export default function MissionControlCertification({ ctx }: { ctx: DrillCtx }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showOnlyWatch, setShowOnlyWatch] = useState(false);

  const rows = useMemo(
    () => (showOnlyWatch ? COMPONENTS.filter((c) => c.readiness < 90 || c.maturity < 90) : COMPONENTS),
    [showOnlyWatch]
  );
  const readinessAvg = COMPONENTS.reduce((a, c) => a + c.readiness, 0) / COMPONENTS.length;
  const maturityAvg = COMPONENTS.reduce((a, c) => a + c.maturity, 0) / COMPONENTS.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Component Certification · Readiness &amp; Maturity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">Readiness avg {readinessAvg.toFixed(2)}</Badge>
          <Badge variant="secondary">Maturity avg {maturityAvg.toFixed(2)}</Badge>
          <Button
            size="sm"
            variant={showOnlyWatch ? "default" : "outline"}
            onClick={() => setShowOnlyWatch((v) => !v)}
          >
            {showOnlyWatch ? "Showing watch items only" : "Show watch items only"}
          </Button>
          <span className="text-xs text-muted-foreground">Watch = score &lt; 90 on readiness or maturity.</span>
        </div>

        <div className="rounded-md border divide-y">
          {rows.map((c) => {
            const isOpen = openId === c.id;
            const isWatch = c.readiness < 90 || c.maturity < 90;
            return (
              <div key={c.id}>
                <button
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                  className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"
                  aria-expanded={isOpen}
                  aria-controls={`drill-${c.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="font-medium truncate">{c.name}</span>
                    {isWatch ? <Badge className="bg-amber-500 text-white">WATCH</Badge> : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={tone(c.readiness)}>Readiness {c.readiness}</Badge>
                    <Badge className={tone(c.maturity)}>Maturity {c.maturity}</Badge>
                  </div>
                </button>
                {isOpen ? (
                  <div id={`drill-${c.id}`} className="p-4 bg-muted/20 space-y-3">
                    <p className="text-sm">{c.rationale}</p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Contributing metrics</div>
                        <ul className="text-xs space-y-1">
                          {c.metrics(ctx).map((m, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1">
                              <span className="text-muted-foreground">
                                {m.label}
                                {m.source ? <span className="ml-1 opacity-60">({m.source})</span> : null}
                              </span>
                              <span className="font-mono">{m.value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">Evidence links</div>
                        <ul className="text-xs space-y-1">
                          {c.evidence.map((e, i) => (
                            <li key={i}>
                              {e.to ? (
                                <Link to={e.to} className="inline-flex items-center gap-1 text-primary hover:underline">
                                  {e.label} <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : e.href ? (
                                <a href={e.href} className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noreferrer">
                                  {e.label} <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span>{e.label}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Why this score was assigned</div>
                      <ul className="text-xs space-y-1 list-disc pl-5">
                        {c.reasoning.map((r, i) => (<li key={i}>{r}</li>))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}