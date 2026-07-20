/**
 * Governance Operator — Cycle Measurement Automation.
 *
 *   action=evaluate  → For every pending ledger row whose measurement
 *     window (default 14 days, override via proposal.measurement_window_days)
 *     has elapsed, compute the full funnel evidence from production data,
 *     close the row with outcome + ROI + calibration, write the evidence
 *     report into the same row (proposal.report), and — only if successful —
 *     queue ONE next-bottleneck recommendation row (learning_status='recommended',
 *     never auto-evaluated, never auto-implemented).
 *
 *   action=briefing → one-page evidence-only briefing from the ledger.
 *
 * Funnel measured per decision window:
 *   visitors, add_to_cart, begin_checkout, checkout_redirect (stripe_redirect),
 *   stripe_payments (complete_payment), paid_orders, conversion_rate, revenue,
 *   gross_profit, average_order_value.
 *
 * No new tables. No new edge functions. Reuses governance_decision_log only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { updateOutcome } from "../_shared/governanceLedger.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_GROSS_MARGIN = 0.30; // overridable per decision via proposal.gross_margin

/**
 * Static prioritized backlog from Cycle 1 forensic findings. Used ONLY to
 * surface the next recommendation when a decision succeeds — never to
 * implement anything. Per Execution Mode: recommend, do not build.
 */
const NEXT_BOTTLENECK_QUEUE: Array<Record<string, unknown>> = [
  {
    rank: 2,
    title: "Eliminate /checkout intermediate page leak",
    evidence: { drop_off_pct_begin_to_redirect: 0.58 },
    expected_revenue_increase_pct: 15,
    engineering_effort: "S (≤1 day)",
    confidence: 0.65,
    risk: "low",
    rollback: "Restore /checkout route as default redirect target (1 LOC)",
    expected_metric: "stripe_redirect_per_begin_checkout_ratio",
    expected_value: 0.75,
    measurement_window_days: 14,
  },
  {
    rank: 3,
    title: "Enable Apple Pay / Google Pay express wallets before Stripe",
    evidence: { mobile_share: 1.0, express_wallet_share: 0 },
    expected_revenue_increase_pct: 12,
    engineering_effort: "M (2–3 days)",
    confidence: 0.6,
    risk: "medium",
    rollback: "Disable wallet element in Stripe Checkout (config flag)",
    expected_metric: "stripe_paid_per_redirect_ratio",
    expected_value: 0.18,
    measurement_window_days: 14,
  },
  {
    rank: 4,
    title: "Fix cart-context hydration race (100% degraded checkout_click)",
    evidence: { degraded_checkout_click_pct: 1.0 },
    expected_revenue_increase_pct: 8,
    engineering_effort: "S (≤1 day)",
    confidence: 0.7,
    risk: "low",
    rollback: "Revert cart provider hydration order",
    expected_metric: "checkout_click_clean_share",
    expected_value: 0.9,
    measurement_window_days: 14,
  },
  {
    rank: 5,
    title: "Add abandoned-session recovery email (24h Stripe expiry)",
    evidence: { expired_usd_sessions_30d: 13, recovery_emails_sent: 0 },
    expected_revenue_increase_pct: 6,
    engineering_effort: "M (2–3 days)",
    confidence: 0.55,
    risk: "low",
    rollback: "Disable abandoned-cart cron",
    expected_metric: "recovered_paid_orders_per_expired_session",
    expected_value: 0.05,
    measurement_window_days: 14,
  },
];

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Funnel + revenue snapshot for [from, to). */
async function measureFunnel(sb: ReturnType<typeof svc>, from: string, to: string) {
  // Use cleaned events only (exclude bots/qa) when classification is present.
  const { data: events } = await sb
    .from("checkout_funnel_events")
    .select("step, session_id, value, currency, is_bot, qa, classification")
    .gte("created_at", from)
    .lt("created_at", to)
    .limit(50000);
  const isClean = (e: any) =>
    e.is_bot !== true && e.qa !== true &&
    (!e.classification || ["verified_user", "probable_user"].includes(e.classification));
  const cleanEvents = (events ?? []).filter(isClean);
  const stepCount = (s: string) => cleanEvents.filter((e) => e.step === s).length;
  const distinctSessions = new Set(cleanEvents.map((e) => e.session_id).filter(Boolean)).size;
  const add_to_cart = stepCount("add_to_cart") + stepCount("checkout_click");
  const begin_checkout = stepCount("begin_checkout");
  const checkout_redirect = stepCount("stripe_redirect") + stepCount("checkout_redirect_attempt");
  const stripe_payments = stepCount("complete_payment") + stepCount("klarna_purchase");

  const { data: paidOrders } = await sb
    .from("orders")
    .select("total_amount, currency, status, created_at")
    .gte("created_at", from)
    .lt("created_at", to)
    .in("status", ["paid", "completed", "fulfilled", "shipped"]);
  const paid_orders = (paidOrders ?? []).length;
  const revenue = (paidOrders ?? []).reduce((s, o: any) => s + Number(o.total_amount ?? 0), 0);
  const aov = paid_orders > 0 ? revenue / paid_orders : 0;

  // Visitors: distinct sessions table fallback to distinct funnel session_ids.
  let visitors = distinctSessions;
  try {
    const { count } = await sb
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", from)
      .lt("created_at", to);
    if (typeof count === "number" && count > 0) visitors = count;
  } catch (_) { /* sessions table optional */ }

  return {
    visitors,
    add_to_cart,
    begin_checkout,
    checkout_redirect,
    stripe_payments,
    paid_orders,
    revenue,
    average_order_value: aov,
    conversion_rate: visitors > 0 ? paid_orders / visitors : 0,
  };
}

function computeActualMetric(metric: string, funnel: Awaited<ReturnType<typeof measureFunnel>>): number {
  switch (metric) {
    case "stripe_paid_per_redirect_ratio":
      return funnel.checkout_redirect > 0 ? funnel.stripe_payments / funnel.checkout_redirect : 0;
    case "stripe_redirect_per_begin_checkout_ratio":
      return funnel.begin_checkout > 0 ? funnel.checkout_redirect / funnel.begin_checkout : 0;
    case "paid_orders":
      return funnel.paid_orders;
    case "revenue":
    case "revenue_cents":
      return funnel.revenue;
    case "conversion_rate":
      return funnel.conversion_rate;
    case "average_order_value":
      return funnel.average_order_value;
    default:
      return funnel.revenue;
  }
}

function classifyOutcome(actual: number, expected: number, baseline: number) {
  if (!Number.isFinite(expected) || expected === 0) return "neutral";
  if (actual >= expected * 0.95) return "success";
  if (baseline > 0 && actual >= baseline * 1.10) return "partial";
  if (actual < baseline) return "failure";
  return "partial";
}

/** Crude two-proportion z confidence vs baseline ratio (for ratio metrics). */
function statConfidence(actualRatio: number, baseline: number, n: number): number {
  if (!n || !Number.isFinite(actualRatio) || !Number.isFinite(baseline)) return 0;
  const p = (actualRatio + baseline) / 2;
  const se = Math.sqrt(2 * p * (1 - p) / Math.max(n, 1));
  if (se === 0) return 0;
  const z = (actualRatio - baseline) / se;
  // Map |z| to a 0..1 confidence (capped at 0.99).
  return Math.max(0, Math.min(0.99, 1 - Math.exp(-Math.abs(z))));
}

function buildReport(row: any, prevFunnel: any, postFunnel: any, actual: number, baseline: number, outcome: string, roi: number | null, calibration: number, statConf: number) {
  const proposal = row.proposal ?? {};
  const next = outcome === "success" ? NEXT_BOTTLENECK_QUEUE[0] : null;
  const md = `# Cycle Measurement Report — ${row.decision_type}

- decision_id: ${row.id}
- engine: ${row.source_engine}
- opened: ${row.timestamp}
- closed: ${new Date().toISOString()}
- expected_metric: ${row.expected_metric}
- expected_value: ${row.expected_value}
- baseline_value: ${baseline}
- actual_value: ${actual}
- delta_vs_expected: ${row.expected_value ? (actual - row.expected_value) : 'n/a'}
- actual_improvement_vs_baseline: ${baseline > 0 ? ((actual - baseline) / baseline).toFixed(3) : 'n/a'}
- roi: ${roi ?? 'n/a'}
- outcome: ${outcome}
- statistical_confidence: ${statConf.toFixed(3)}
- prior_confidence: ${row.confidence}
- confidence_calibration: ${calibration.toFixed(3)}
- rollback: ${proposal.rollback ?? proposal.proposal?.rollback ?? 'n/a'}

## Funnel (decision window)
\`\`\`json
${JSON.stringify(postFunnel, null, 2)}
\`\`\`

## Funnel (equal-length baseline window immediately before decision)
\`\`\`json
${JSON.stringify(prevFunnel, null, 2)}
\`\`\`

## Recommendation
${outcome === "success"
    ? `✅ Keep change. Unlock NEXT bottleneck (#${next?.rank}): **${next?.title}**. Do not implement automatically.`
    : outcome === "failure"
    ? `🔴 Rollback recommended. Evidence supports reverting: actual (${actual}) < baseline (${baseline}).`
    : `🟡 Inconclusive. Hold the change; extend observation or design a sharper test.`}
`;
  return { md, next };
}

async function evaluatePending() {
  const sb = svc();
  const now = Date.now();
  const { data: pending } = await sb
    .from("governance_decision_log")
    .select("id, source_engine, decision_type, expected_metric, expected_value, confidence, timestamp, proposal")
    .eq("learning_status", "pending")
    .order("timestamp", { ascending: true })
    .limit(200);
  let closed = 0;
  let skipped = 0;
  const closedIds: string[] = [];
  for (const row of (pending as any[]) ?? []) {
    const proposal = row.proposal ?? {};
    const windowDays = Number(proposal.measurement_window_days ?? DEFAULT_WINDOW_DAYS);
    const opened = new Date(row.timestamp).getTime();
    const windowEnd = opened + windowDays * 86400_000;
    if (now < windowEnd) { skipped++; continue; }

    const fromIso = new Date(opened).toISOString();
    const toIso = new Date(windowEnd).toISOString();
    const prevFromIso = new Date(opened - windowDays * 86400_000).toISOString();

    const [postFunnel, prevFunnel] = await Promise.all([
      measureFunnel(sb, fromIso, toIso),
      measureFunnel(sb, prevFromIso, fromIso),
    ]);

    const metric = row.expected_metric ?? "revenue";
    const actual = computeActualMetric(metric, postFunnel);
    const baseline =
      Number(proposal.baseline_value ?? proposal.evidence?.baseline_value ?? computeActualMetric(metric, prevFunnel));
    const expected = Number(row.expected_value ?? 0);
    const outcome = classifyOutcome(actual, expected, baseline);
    const roi = expected > 0 ? actual / expected : null;
    const grossMargin = Number(proposal.gross_margin ?? DEFAULT_GROSS_MARGIN);
    const grossProfit = postFunnel.revenue * grossMargin;
    const statConf = statConfidence(
      actual,
      baseline,
      Math.max(postFunnel.checkout_redirect, postFunnel.begin_checkout, postFunnel.visitors, 1),
    );
    const calibration = Number(row.confidence ?? 0) > 0
      ? 1 - Math.abs(Number(row.confidence) - (outcome === "success" ? 1 : outcome === "partial" ? 0.5 : 0))
      : 0;

    const { md, next } = buildReport(row, prevFunnel, { ...postFunnel, gross_profit: grossProfit }, actual, baseline, outcome, roi, calibration, statConf);

    await updateOutcome({
      id: row.id,
      actualMetric: metric,
      actualValue: actual,
      outcome,
      roi: roi ?? undefined,
      learningStatus: "evaluated",
    });

    // Persist the evidence report into the same row's proposal — no new tables.
    await sb.from("governance_decision_log").update({
      linked_report: `inline:report#${row.id}`,
      proposal: {
        ...proposal,
        report: {
          generated_at: new Date().toISOString(),
          markdown: md,
          funnel_window: postFunnel,
          baseline_window: prevFunnel,
          gross_profit: grossProfit,
          statistical_confidence: statConf,
          confidence_calibration: calibration,
          actual_improvement_vs_baseline: baseline > 0 ? (actual - baseline) / baseline : null,
        },
      },
    }).eq("id", row.id);

    // On success, log ONE next recommendation (status='recommended' so it is
    // never auto-evaluated nor auto-implemented). On failure, log a rollback
    // recommendation row. Both go through the same ledger.
    if (outcome === "success" && next) {
      await sb.from("governance_decision_log").insert({
        source_engine: "growth_cycle",
        decision_type: "next_bottleneck_recommendation",
        expected_metric: next.expected_metric,
        expected_value: next.expected_value,
        confidence: next.confidence,
        learning_status: "recommended",
        dedupe_key: `next_bottleneck:${row.id}`,
        proposal: { ...next, parent_decision_id: row.id, requires_founder_approval: true },
      });
    } else if (outcome === "failure") {
      await sb.from("governance_decision_log").insert({
        source_engine: "growth_cycle",
        decision_type: "rollback_recommendation",
        expected_metric: metric,
        expected_value: baseline,
        confidence: statConf,
        learning_status: "recommended",
        dedupe_key: `rollback:${row.id}`,
        proposal: {
          parent_decision_id: row.id,
          rollback: proposal.rollback ?? proposal.proposal?.rollback ?? null,
          evidence: { actual, baseline, expected, funnel: postFunnel },
          requires_founder_approval: true,
        },
      });
    }

    closed++;
    closedIds.push(row.id);
  }
  return { closed, skipped, scanned: (pending ?? []).length, closed_ids: closedIds };
}

async function briefing() {
  const sb = svc();
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: recent }, { data: evaluated }, { data: orders7d }] = await Promise.all([
    sb.from("governance_decision_log").select("source_engine, decision_type, expected_value, confidence, timestamp").gte("timestamp", since7d).order("timestamp", { ascending: false }).limit(50),
    sb.from("governance_decision_log").select("expected_value, actual_value, outcome, roi, source_engine").eq("learning_status", "evaluated").gte("timestamp", since30d),
    sb.from("orders").select("total_amount, created_at").gte("created_at", since7d),
  ]);
  const evals = (evaluated as any[]) ?? [];
  const successCount = evals.filter((r) => r.outcome === "success").length;
  const accuracy = evals.length ? successCount / evals.length : 0;
  const revenue7d = (orders7d ?? []).reduce((s: number, o: any) => s + Number(o.total_amount ?? 0), 0);
  const seatScores: Record<string, { n: number; success: number }> = {};
  for (const r of evals) {
    const k = r.source_engine ?? "unknown";
    seatScores[k] ??= { n: 0, success: 0 };
    seatScores[k].n++;
    if (r.outcome === "success") seatScores[k].success++;
  }
  return {
    generated_at: new Date().toISOString(),
    decisions_7d: (recent ?? []).length,
    decisions_evaluated_30d: evals.length,
    prediction_accuracy: accuracy,
    revenue_7d_cents: revenue7d,
    engine_calibration: Object.fromEntries(
      Object.entries(seatScores).map(([k, v]) => [k, { decisions: v.n, accuracy: v.n ? v.success / v.n : 0 }]),
    ),
    top_recent: (recent ?? []).slice(0, 10),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "evaluate";
    const result = action === "briefing" ? await briefing() : await evaluatePending();
    return new Response(JSON.stringify({ ok: true, action, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});