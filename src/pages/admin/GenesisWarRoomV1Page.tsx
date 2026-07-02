// GENESIS WAR ROOM V1 — First 100 Organic Sales
// Evidence-first read-only report. No mutations, no auto-repair.
// All numbers below were captured from production tables at deploy time
// (canonical_events, canonical_sessions, checkout_funnel_events, orders,
// abandoned_carts). Rebuild by re-running the diagnostic SQL in the
// operator log — no client fetch is required to view this report.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

type Severity = "critical" | "high" | "medium" | "info" | "unknown";

const sevBadge = (s: Severity) => {
  const map: Record<Severity, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-600 text-white",
    medium: "bg-amber-500 text-black",
    info: "bg-blue-600 text-white",
    unknown: "bg-muted text-muted-foreground",
  };
  return <Badge className={map[s]}>{s.toUpperCase()}</Badge>;
};

const funnel14d = [
  { stage: "Sessions (canonical)", value: 126, note: "desktop 106 · mobile 10 · tablet 3 · unknown 7" },
  { stage: "CANONICAL_PAGE_VIEW", value: 0, note: "⚠ Emitter missing — top of funnel invisible" },
  { stage: "CANONICAL_PRODUCT_VIEW", value: 134, note: "PDP telemetry OK" },
  { stage: "CANONICAL_ADD_TO_CART", value: 23, note: "17.1% of product views" },
  { stage: "CANONICAL_CART", value: 7, note: "30.4% of ATC" },
  { stage: "CANONICAL_CHECKOUT", value: 18, note: "Divergence vs checkout_funnel (4)" },
  { stage: "CANONICAL_PURCHASE", value: 0, note: "❌ Zero canonical purchases in 14d" },
];

const orders30d = [
  { day: "2026-07-01", paid: 0, pending: 1, expired: 0 },
  { day: "2026-06-28", paid: 0, pending: 0, expired: 3 },
  { day: "2026-06-16", paid: 1, pending: 1, expired: 12 },
];

const findings: Array<{
  id: string;
  phase: string;
  title: string;
  severity: Severity;
  evidence: string;
  hypothesis: string;
  auto_repair_safe: boolean;
  proposed_fix: string;
  est_revenue_impact: string;
  confidence: string;
}> = [
  {
    id: "F1",
    phase: "Phase 6 · ATC Forensics",
    title: "Telemetry divergence: canonical ATC=23, checkout_funnel ATC=0",
    severity: "critical",
    evidence:
      "checkout_funnel_events (14d) contains only klarna_message_shown (199), begin_checkout (4), checkout_click (4). No rows with step='add_to_cart'. Canonical layer sees 23 ATC events in the same window.",
    hypothesis:
      "Two client trackers write to different sinks. The checkout_funnel emitter never fires the add_to_cart step name — either the wrong constant is used, or the ATC handler no longer calls it.",
    auto_repair_safe: false,
    proposed_fix:
      "Audit useCartActions / AddToCartButton → confirm a checkout_funnel_events insert with step='add_to_cart' on every successful cart add. Add regression test.",
    est_revenue_impact: "Unblocks recovery attribution → indirect. High.",
    confidence: "High (production counts)",
  },
  {
    id: "F2",
    phase: "Phase 1 · Funnel Reconstruction",
    title: "CANONICAL_PAGE_VIEW never emitted",
    severity: "critical",
    evidence: "0 rows with canonical_name='CANONICAL_PAGE_VIEW' in the last 14 days.",
    hypothesis:
      "canonical-ingest maps product_view / ATC / checkout / cart from source systems but has no rule that maps generic page_view. Top-of-funnel bounce and 3-second-problem cannot be measured because the entry event does not exist.",
    auto_repair_safe: false,
    proposed_fix:
      "Extend canonical-ingest to map every visitor_activity page_view (and every GA4 page_view via measurement protocol) to CANONICAL_PAGE_VIEW with the same session_id/visitor_id normalisation used for product_view.",
    est_revenue_impact: "Enables the 3-second problem investigation.",
    confidence: "High",
  },
  {
    id: "F3",
    phase: "Phase 8 · Checkout Forensics",
    title: "100% checkout failure in the last 14 days (0 paid / 4 expired-or-pending)",
    severity: "critical",
    evidence:
      "orders 14d: expired=3, pending=1, paid=0. On 2026-06-16 alone: 12 expired / 1 paid / 1 pending — cluster pattern points to a checkout session lifecycle bug that day.",
    hypothesis:
      "Sessions expired on the Stripe side without a purchase event. Combined with checkout_funnel showing only begin_checkout=4 and no ATC step, the buyers reach checkout but never receive/interact with the payment sheet as expected (or expire before completing).",
    auto_repair_safe: false,
    proposed_fix:
      "1) Pull Stripe Checkout Sessions for the 15 expired orders and log payment_status, payment_method_types shown, expires_at → created_at delta. 2) Confirm Klarna eligibility for USD sessions. 3) Confirm redirect back to /order/success is not blocked.",
    est_revenue_impact: "Direct — reopens the primary revenue path. Est. lost 14d ≈ $250 (4 sessions × ~$62 AOV).",
    confidence: "High evidence, unknown root cause",
  },
  {
    id: "F4",
    phase: "Phase 9 · Abandoned Cart Recovery",
    title: "195 open abandoned carts / 86 with email / 0 actual recoveries logged",
    severity: "high",
    evidence:
      "abandoned_carts: 195 not-recovered, 86 have customer_email, 8 still without reminder_sent_at. Remainder marked reminder_sent_at but no recovered_at flip — no proof recovery emails were ever delivered.",
    hypothesis:
      "Recovery cron marks reminder_sent_at but the email transport is disconnected or muted. Need to inspect the sender edge function's logs and Resend/SES delivery receipts.",
    auto_repair_safe: false,
    proposed_fix:
      "Validate the abandoned-cart edge function's most recent invocations, verify sender secret is present, run a single manual send to a founder inbox before enabling batch send.",
    est_revenue_impact: "86 recoverable × ~10% typical recovery rate × ~$50 AOV ≈ $430.",
    confidence: "High (data), Medium (root cause)",
  },
  {
    id: "F5",
    phase: "Phase 1 · Attribution",
    title: "Geo + UTM enrichment missing on 90% of sessions",
    severity: "high",
    evidence:
      "canonical_sessions 14d: 123/126 rows have NULL country, 113/126 have NULL utm_source. Only 3 country='NL' and 5 utm_source='pinterest' were captured.",
    hypothesis:
      "Session ingester writes early (before geo/UTM edge middleware runs) or the enrichment step throws silently on rows where landing_page has no query string. Sessions from Pinterest that carry pin_id/utm_source in the URL are the only ones populated (5 sessions match).",
    auto_repair_safe: false,
    proposed_fix:
      "Backfill country from IP (already available via Cloudflare header on canonical-ingest) and re-normalise utm_source from landing_page query. Add an integration test.",
    est_revenue_impact: "Unblocks channel ROI — indirect. High.",
    confidence: "High",
  },
  {
    id: "F6",
    phase: "Phase 7 · Mobile",
    title: "Mobile share = 8.4% (10 / 119 identified) — far below organic pet-retail baseline",
    severity: "high",
    evidence:
      "canonical_sessions device breakdown 14d: desktop 106 (89%), mobile 10 (8%), tablet 3 (3%). 7 additional sessions have NULL device. Pinterest audiences skew 80%+ mobile industry-wide.",
    hypothesis:
      "Mobile clients either fail to write the session row (hydration race with the tracker's beforeunload) or user_agent parsing sets device=NULL on mobile Safari/Chrome UA-CH strings.",
    auto_repair_safe: false,
    proposed_fix:
      "1) Verify SafeGlobalVisitorTracker fires on 'pagehide' as well as 'unload' (iOS Safari). 2) Fix device parser to read UA Client Hints (sec-ch-ua-mobile). 3) Add a mobile beacon health probe.",
    est_revenue_impact: "If real mobile traffic ≈ 50%, we're blind to ~4× the current session base. Very high.",
    confidence: "High (data). Medium (root cause).",
  },
  {
    id: "F7",
    phase: "Phase 2 · The 3-Second Problem",
    title: "Cannot be measured yet — depends on F2 (page_view emitter)",
    severity: "unknown",
    evidence:
      "No CANONICAL_PAGE_VIEW rows means we cannot compute time-on-page for bounces. The 88.3% number cited in the directive is not currently reproducible from canonical_events.",
    hypothesis:
      "The 3-second problem is real but our own instrumentation cannot presently prove or refute it. Genesis rules require the metric to be verifiable in canonical before acting.",
    auto_repair_safe: false,
    proposed_fix: "Blocked until F2 is fixed.",
    est_revenue_impact: "Unknown until measurable.",
    confidence: "Unknown (per directive: unknown stays UNKNOWN)",
  },
  {
    id: "F8",
    phase: "Phase 10-11 · Psychology / Competitor Gap",
    title: "Not backed by production evidence in this repo",
    severity: "unknown",
    evidence:
      "No captured session replays (rrweb), no competitor scrape rows joined to visited sessions. Any conclusions here would be opinion.",
    hypothesis: "N/A — refuse to hallucinate.",
    auto_repair_safe: false,
    proposed_fix:
      "Stand up session-replay ingest before opining. Competitor gap already partially covered by competitor_products / mi_competitors — schedule a scoped review post-F1..F6.",
    est_revenue_impact: "Unknown.",
    confidence: "Unknown",
  },
];

const executiveVerdict = [
  "Telemetry is NOT trustworthy. The funnel is only partially observable.",
  "No zero-risk repair can be safely deployed without human review — every finding either (a) writes new tracking code, (b) sends real customer emails, or (c) changes checkout behaviour.",
  "Per the Revenue Constitution and the mission rule 'Unknown must remain UNKNOWN', no auto-repair was executed. All eight findings are staged with a proposed, human-reviewable fix.",
  "If bankruptcy loomed today, priority order would be: F3 (checkout) → F4 (recover 86 carts with email) → F1+F2 (fix telemetry) → F6 (mobile beacon).",
];

export default function GenesisWarRoomV1Page() {
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">GENESIS WAR ROOM V1</h1>
          <Badge variant="destructive">FIRST 100 ORGANIC SALES</Badge>
        </div>
        <p className="text-muted-foreground">
          Evidence-first forensic report. Mode: <span className="font-mono">EXECUTE IF SAFE</span>. Auto-repairs
          executed: <span className="font-mono">0</span> (no finding met the reversible-and-safe bar). Every number
          below was pulled from production tables during the war-room session.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Executive verdict
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-2 text-sm">
            {executiveVerdict.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canonical funnel — last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {funnel14d.map((s) => (
              <div key={s.stage} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-mono text-sm">{s.stage}</div>
                  <div className="text-xs text-muted-foreground">{s.note}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="text-sm">
            <div className="font-semibold mb-1">Orders (last 30 days)</div>
            <table className="text-sm w-full">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Day</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Pending</th>
                  <th className="text-right">Expired</th>
                </tr>
              </thead>
              <tbody>
                {orders30d.map((o) => (
                  <tr key={o.day} className="border-t">
                    <td className="py-1 font-mono">{o.day}</td>
                    <td className="text-right tabular-nums">{o.paid}</td>
                    <td className="text-right tabular-nums">{o.pending}</td>
                    <td className="text-right tabular-nums text-red-600">{o.expired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Findings ({findings.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {findings.map((f) => (
            <div key={f.id} className="border rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{f.id}</span>
                  {sevBadge(f.severity)}
                  <span className="font-semibold truncate">{f.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {f.auto_repair_safe ? (
                    <span className="flex items-center gap-1 text-green-700 text-xs">
                      <CheckCircle2 className="h-4 w-4" /> auto-repair safe
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      <XCircle className="h-4 w-4" /> requires human review
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{f.phase}</div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="font-semibold text-xs uppercase text-muted-foreground">Evidence</div>
                  <p>{f.evidence}</p>
                </div>
                <div>
                  <div className="font-semibold text-xs uppercase text-muted-foreground">Hypothesis</div>
                  <p>{f.hypothesis}</p>
                </div>
                <div>
                  <div className="font-semibold text-xs uppercase text-muted-foreground">Proposed fix</div>
                  <p>{f.proposed_fix}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-semibold text-xs uppercase text-muted-foreground">Est. revenue</div>
                    <p>{f.est_revenue_impact}</p>
                  </div>
                  <div>
                    <div className="font-semibold text-xs uppercase text-muted-foreground">Confidence</div>
                    <p>{f.confidence}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" /> Remaining unknowns (per Genesis rule)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>· 3-second bounce reason — blocked on F2.</p>
          <p>· True mobile share — blocked on F6.</p>
          <p>· Real customer psychology — no session-replay corpus available in this repo.</p>
          <p>· Competitor gap deltas — needs a fresh scrape joined to visited sessions.</p>
        </CardContent>
      </Card>
    </div>
  );
}