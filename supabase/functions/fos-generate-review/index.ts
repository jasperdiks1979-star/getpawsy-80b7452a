// Founder Operating Review generator. Reads ONLY from existing tables
// (orders, analytics_funnel_waterfall, products, shil_incidents, etc.).
// No new metric logic. Single source of truth for the executive doc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const url = Deno.env.get("SUPABASE_URL")!;
const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, srk);

function weekStart(d = new Date()): string {
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? 0 : -day; // anchor to most recent Sunday
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return s.toISOString().slice(0, 10);
}

async function kpis() {
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since14 = new Date(Date.now() - 14 * 864e5).toISOString();

  const { data: orders7 } = await admin.from("orders")
    .select("status,total_amount,customer_email,created_at").gte("created_at", since7);
  const { data: orders14 } = await admin.from("orders")
    .select("status,total_amount,created_at").gte("created_at", since14);

  const paid7 = (orders7 ?? []).filter(o => o.status === "paid");
  const paid14 = (orders14 ?? []).filter(o => o.status === "paid");
  const prevWeekPaid = paid14.filter(o => new Date(o.created_at) < new Date(since7));

  const revenue7 = paid7.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const revenuePrev = prevWeekPaid.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const aov7 = paid7.length ? revenue7 / paid7.length : 0;

  const expired7 = (orders7 ?? []).filter(o => o.status === "expired").length;
  const stripeAbandonRate = (paid7.length + expired7) > 0
    ? expired7 / (paid7.length + expired7) : null;

  // Funnel (sessions = rows in waterfall)
  const { data: f } = await admin.from("analytics_funnel_waterfall")
    .select("view_item_at,add_to_cart_at,begin_checkout_at,payment_at,purchase_at,session_id,utm_source")
    .gte("created_at", since7);
  const fn = f ?? [];
  const view = fn.filter(r => r.view_item_at).length;
  const atc = fn.filter(r => r.add_to_cart_at).length;
  const bc = fn.filter(r => r.begin_checkout_at).length;
  const pay = fn.filter(r => r.payment_at).length;
  const purch = fn.filter(r => r.purchase_at).length;
  const sessions = fn.length;
  const rpv = sessions > 0 ? revenue7 / sessions : 0;

  // Organic share (pinterest|google|direct)
  const organicSessions = fn.filter(r => {
    const s = (r.utm_source || "").toLowerCase();
    return !s || s === "pinterest" || s === "google" || s === "direct";
  }).length;

  // Repeat customers
  const emails = paid7.map(o => o.customer_email).filter(Boolean) as string[];
  const counts: Record<string, number> = {};
  for (const e of emails) counts[e] = (counts[e] || 0) + 1;
  const repeat = Object.values(counts).filter(c => c > 1).length;

  return {
    verified_orders_7d: paid7.length,
    verified_revenue_7d: Number(revenue7.toFixed(2)),
    verified_revenue_prev_7d: Number(revenuePrev.toFixed(2)),
    revenue_trend_pct: revenuePrev > 0
      ? Number((((revenue7 - revenuePrev) / revenuePrev) * 100).toFixed(1)) : null,
    aov_7d: Number(aov7.toFixed(2)),
    conversion_rate_7d: sessions > 0 ? Number(((purch / sessions) * 100).toFixed(3)) : 0,
    revenue_per_visitor_7d: Number(rpv.toFixed(3)),
    repeat_customers_7d: repeat,
    sessions_7d: sessions,
    organic_session_share: sessions > 0 ? Number(((organicSessions / sessions) * 100).toFixed(1)) : 0,
    funnel_7d: { view_item: view, add_to_cart: atc, begin_checkout: bc, payment: pay, purchase: purch },
    stripe_abandon_rate_7d: stripeAbandonRate !== null ? Number(stripeAbandonRate.toFixed(3)) : null,
    expired_orders_7d: expired7,
  };
}

function forecast(verified7: number) {
  // Honest extrapolation; explicit low confidence below 10 verified/wk.
  const weekly = Math.max(verified7, 0.5);
  const horizon = (target: number) => {
    const weeks = Math.ceil(target / weekly);
    // Confidence decays with horizon and with thin data.
    const base = verified7 >= 10 ? 0.7 : verified7 >= 3 ? 0.4 : 0.15;
    const decay = Math.max(0.05, base - Math.log10(Math.max(target, 1)) * 0.08);
    const conf = decay >= 0.6 ? "medium" : decay >= 0.3 ? "low" : "very_low";
    return { target, weeks_to_target: weeks, confidence: conf, confidence_score: Number(decay.toFixed(2)) };
  };
  return {
    to_10: horizon(10), to_25: horizon(25), to_100: horizon(100),
    to_500: horizon(500), to_1000: horizon(1000),
  };
}

// ---- Aggregations from existing tables (no new metric logic) ----

async function biggestWins() {
  // Pull recent positive deltas from existing growth/ai signals.
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const out: any[] = [];
  try {
    const { data } = await admin.from("agp_growth_scores")
      .select("product_id,growth_score,explanation,updated_at")
      .gte("updated_at", since).order("growth_score", { ascending: false }).limit(5);
    for (const r of data ?? []) {
      out.push({
        title: `Product ${r.product_id} — growth score ${r.growth_score}`,
        evidence: r.explanation ?? "agp_growth_scores",
        reason: "Highest recent organic momentum (AGP).",
        business_impact: "Concentrate Pinterest + SEO budget here next week.",
      });
    }
  } catch (_) { /* table optional */ }
  return out;
}

async function biggestLosses() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const out: any[] = [];
  try {
    const { data } = await admin.from("shil_incidents")
      .select("subsystem,severity,summary,detected_at,status")
      .gte("detected_at", since).order("detected_at", { ascending: false }).limit(5);
    for (const i of data ?? []) {
      out.push({
        title: `${i.subsystem}: ${i.summary ?? i.severity}`,
        lost_revenue_est: "Indirect — SHIL incident",
        confidence: "medium",
        root_cause: i.summary ?? "see shil_incidents",
        difficulty: i.severity ?? "unknown",
        time_to_fix: i.status === "recovered" ? "auto-healed" : "manual review",
        roi: "high if recurring",
      });
    }
  } catch (_) { /* optional */ }
  return out;
}

async function competitorIntel() {
  const out: any[] = [];
  try {
    const { data } = await admin.from("growth_competitor_insights")
      .select("*").order("created_at", { ascending: false }).limit(5);
    for (const c of data ?? []) {
      out.push({
        source: "growth_competitor_insights",
        observation: c.insight ?? c.summary ?? JSON.stringify(c).slice(0, 240),
        reverse_engineered_why: "Pattern extracted from organic competitor signal.",
      });
    }
  } catch (_) { /* optional */ }
  return out;
}

async function organicIntelligence() {
  const out: any[] = [];
  try {
    const { data } = await admin.from("oie_explanations")
      .select("product_id,explanation,confidence,evidence,created_at")
      .order("created_at", { ascending: false }).limit(5);
    for (const e of data ?? []) {
      out.push({
        product_id: e.product_id,
        why: e.explanation,
        confidence: e.confidence,
        evidence: e.evidence,
      });
    }
  } catch (_) { /* optional */ }
  return out;
}

async function topTenOpportunities() {
  const out: any[] = [];
  try {
    const { data } = await admin.from("agp_action_priorities")
      .select("*").order("priority_score", { ascending: false }).limit(10);
    for (const a of data ?? []) {
      out.push({
        title: a.title ?? a.action ?? `Priority ${a.id}`,
        expected_revenue: a.expected_revenue ?? a.expected_lift ?? "n/a",
        confidence: a.confidence ?? "medium",
        risk: a.risk ?? "low",
        difficulty: a.difficulty ?? "medium",
        implementation_time: a.implementation_time ?? a.eta ?? "n/a",
        dependencies: a.dependencies ?? [],
        evidence: a.evidence ?? a.reason ?? "agp_action_priorities",
        roi: a.roi ?? "n/a",
        why: a.explanation ?? a.reason ?? "Ranked by AGP priority engine.",
      });
    }
  } catch (_) { /* optional */ }
  if (out.length === 0) {
    // Fallback to ai_ceo_recommendations.
    try {
      const { data } = await admin.from("ai_ceo_recommendations")
        .select("*").order("created_at", { ascending: false }).limit(10);
      for (const a of data ?? []) {
        out.push({
          title: a.title ?? "AI CEO recommendation",
          expected_revenue: a.expected_revenue ?? "n/a",
          confidence: a.confidence ?? "medium",
          risk: "n/a", difficulty: "n/a",
          implementation_time: "n/a", dependencies: [],
          evidence: a.reasoning ?? "ai_ceo_recommendations",
          roi: "n/a", why: a.reasoning ?? "AI CEO loop.",
        });
      }
    } catch (_) { /* optional */ }
  }
  return out;
}

function executionPlan(actions: any[]) {
  // Auto-derive an owner/validation/rollback per top-3 action.
  return actions.map((a) => ({
    action: a.title,
    owner: "Founder",
    expected_kpi: a.expected_revenue_lift?.includes("orders") ? "verified_orders_7d"
                 : a.expected_revenue_lift?.includes("conversion") ? "conversion_rate_7d"
                 : "verified_revenue_7d",
    expected_revenue_lift: a.expected_revenue_lift,
    validation_method: a.validation,
    rollback_strategy: "Revert change; restore previous config from git history.",
    deadline: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    review_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
  }));
}

async function topActions(k: any, opportunities: any[]) {
  const actions: any[] = [];

  if ((k.funnel_7d.add_to_cart === 0 && k.verified_orders_7d > 0) ||
      (k.funnel_7d.purchase === 0 && k.verified_orders_7d > 0)) {
    actions.push({
      rank: 1,
      title: "Repair funnel instrumentation",
      why: `7-day waterfall reports ${k.funnel_7d.add_to_cart} add_to_cart and ${k.funnel_7d.purchase} purchase events, but ${k.verified_orders_7d} real paid order(s) exist. Every revenue decision is being made blind. Until this is fixed, no other action can be measured.`,
      expected_revenue_lift: "Unlocks measurement of every downstream lever (estimated indirect lift: 100% of all future experiments).",
      confidence: "high",
      validation: "Re-query analytics_funnel_waterfall in 24h; expect non-zero add_to_cart/begin_checkout/purchase rows.",
      cost: "low",
    });
  }

  if (k.stripe_abandon_rate_7d !== null && k.stripe_abandon_rate_7d > 0.5) {
    actions.push({
      rank: actions.length + 1,
      title: "Stripe Checkout abandonment autopsy",
      why: `${(k.stripe_abandon_rate_7d * 100).toFixed(0)}% of Stripe sessions expired without payment (${k.expired_orders_7d} of ${k.expired_orders_7d + k.verified_orders_7d}). The single largest documented revenue leak.`,
      expected_revenue_lift: `If abandonment drops to industry-typical 25%, est. +${Math.round(k.expired_orders_7d * 0.5)} verified orders/wk.`,
      confidence: "high",
      validation: "Run US-origin Playwright probe against a real Stripe Checkout URL; document exact friction point.",
      cost: "low",
    });
  }

  if (k.verified_orders_7d < 3) {
    actions.push({
      rank: actions.length + 1,
      title: "Concentrate traffic on top-converting PDPs",
      why: `Verified weekly orders (${k.verified_orders_7d}) are below the threshold where any optimization signal is statistically meaningful. Need 10+ orders/wk before any A/B claim is credible.`,
      expected_revenue_lift: "Indirect: enables every downstream learning loop to produce signal instead of noise.",
      confidence: "medium",
      validation: "Track verified_orders_7d weekly; goal = 10 within 4 weeks.",
      cost: "low",
    });
  }

  while (actions.length < 3) {
    const next = opportunities[actions.length];
    if (next) {
      actions.push({
        rank: actions.length + 1,
        title: next.title,
        why: next.why,
        expected_revenue_lift: String(next.expected_revenue),
        confidence: next.confidence,
        validation: "Re-measure expected_kpi next Sunday; promote if lift confirmed.",
        cost: next.difficulty ?? "n/a",
      });
    } else {
      actions.push({
        rank: actions.length + 1,
        title: "Insufficient evidence for a third high-conviction action",
        why: "The founder doctrine forbids inventing work. Once funnel telemetry returns signal, the third action will be derived from real conversion-rate gaps.",
        expected_revenue_lift: "N/A — waiting on data.",
        confidence: "n/a", validation: "N/A", cost: "N/A",
      });
    }
  }
  return actions.slice(0, 3);
}

function ceoSummary(k: any): string {
  const trend = k.revenue_trend_pct === null ? "no prior-week baseline"
    : k.revenue_trend_pct >= 0 ? `+${k.revenue_trend_pct}% vs prior week`
    : `${k.revenue_trend_pct}% vs prior week`;
  const blind = k.funnel_7d.purchase === 0 && k.verified_orders_7d > 0
    ? " Funnel telemetry is currently NOT firing — every downstream optimization is blind until this is fixed."
    : "";
  return `Verified revenue last 7 days: €${k.verified_revenue_7d} from ${k.verified_orders_7d} order(s) (${trend}). Conversion rate ${k.conversion_rate_7d}%, RPV €${k.revenue_per_visitor_7d}.${blind} The single largest revenue leak remains Stripe Checkout abandonment at ${k.stripe_abandon_rate_7d !== null ? (k.stripe_abandon_rate_7d * 100).toFixed(0) + "%" : "unknown"}.`;
}

function markdown(k: any, summary: string, actions: any[], fc: any,
                  wins: any[], losses: any[], comp: any[], oie: any[],
                  opps: any[], plan: any[]): string {
  return [
    `# Founder Operating Review`,
    `_Week of ${weekStart()} — generated ${new Date().toISOString()}_`,
    ``,
    `## CEO Summary`,
    summary,
    ``,
    `## Mission Status`,
    `- Verified orders (7d): **${k.verified_orders_7d}**`,
    `- Verified revenue (7d): **€${k.verified_revenue_7d}** (${k.revenue_trend_pct ?? "n/a"}% vs prior week)`,
    `- AOV: €${k.aov_7d}`,
    `- Conversion rate: ${k.conversion_rate_7d}%`,
    `- Revenue per visitor: €${k.revenue_per_visitor_7d}`,
    `- Repeat customers (7d): ${k.repeat_customers_7d}`,
    `- Sessions (7d): ${k.sessions_7d}`,
    `- Organic session share: ${k.organic_session_share}%`,
    `- Stripe abandonment: ${k.stripe_abandon_rate_7d !== null ? (k.stripe_abandon_rate_7d * 100).toFixed(0) + "%" : "n/a"}`,
    ``,
    `### Funnel (7d)`,
    `view_item ${k.funnel_7d.view_item} → add_to_cart ${k.funnel_7d.add_to_cart} → begin_checkout ${k.funnel_7d.begin_checkout} → payment ${k.funnel_7d.payment} → purchase ${k.funnel_7d.purchase}`,
    ``,
    `### Forecast (weeks to verified-order milestone — confidence)`,
    `- 10: ${fc.to_10.weeks_to_target}w (${fc.to_10.confidence})`,
    `- 25: ${fc.to_25.weeks_to_target}w (${fc.to_25.confidence})`,
    `- 100: ${fc.to_100.weeks_to_target}w (${fc.to_100.confidence})`,
    `- 500: ${fc.to_500.weeks_to_target}w (${fc.to_500.confidence})`,
    `- 1000: ${fc.to_1000.weeks_to_target}w (${fc.to_1000.confidence})`,
    ``,
    `## Biggest Wins`,
    wins.length ? wins.map(w => `- **${w.title}** — ${w.reason} _(${w.evidence})_. Impact: ${w.business_impact}`).join("\n") : `_No new wins recorded this week._`,
    ``,
    `## Biggest Losses`,
    losses.length ? losses.map(l => `- **${l.title}** — root cause: ${l.root_cause}. Difficulty ${l.difficulty} · time-to-fix ${l.time_to_fix} · ROI ${l.roi}`).join("\n") : `_No incidents recorded this week._`,
    ``,
    `## Competitor Intelligence`,
    comp.length ? comp.map(c => `- ${c.observation} — _why_: ${c.reverse_engineered_why}`).join("\n") : `_No new competitor signals captured this week._`,
    ``,
    `## Organic Intelligence — why products succeed`,
    oie.length ? oie.map(e => `- **${e.product_id}** — ${e.why} _(confidence: ${e.confidence})_`).join("\n") : `_No new OIE explanations this week._`,
    ``,
    `## Top 10 Revenue Opportunities`,
    opps.length ? opps.map((o, i) => `${i + 1}. **${o.title}** — expected ${o.expected_revenue}, confidence ${o.confidence}, risk ${o.risk}, difficulty ${o.difficulty}, ETA ${o.implementation_time}. _Why_: ${o.why}`).join("\n") : `_No opportunities ranked yet._`,
    ``,
    `## Execution Plan`,
    plan.length ? plan.map(p => `- **${p.action}** — owner: ${p.owner} · KPI: ${p.expected_kpi} · lift: ${p.expected_revenue_lift} · validation: ${p.validation_method} · rollback: ${p.rollback_strategy} · deadline: ${p.deadline}`).join("\n") : ``,
    ``,
    `## The Only Three Decisions`,
    ...actions.flatMap((a) => [
      `### ACTION #${a.rank} — ${a.title}`,
      `**Why:** ${a.why}`,
      `**Expected revenue lift:** ${a.expected_revenue_lift}`,
      `**Confidence:** ${a.confidence} · **Cost:** ${a.cost}`,
      `**Validation:** ${a.validation}`,
      ``,
    ]),
    `---`,
    `_FOS reads only from existing tables (orders, analytics_funnel_waterfall, shil_incidents, agp_*, oie_*, growth_competitor_insights, ai_ceo_recommendations). No new metric logic._`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const trigger = new URL(req.url).searchParams.get("trigger") ?? "manual";
    const k = await kpis();
    const fc = forecast(k.verified_orders_7d);
    const summary = ceoSummary(k);
    const [wins, losses, comp, oie, opps] = await Promise.all([
      biggestWins(), biggestLosses(), competitorIntel(),
      organicIntelligence(), topTenOpportunities(),
    ]);
    const actions = await topActions(k, opps);
    const plan = executionPlan(actions);
    const md = markdown(k, summary, actions, fc, wins, losses, comp, oie, opps, plan);
    const week_start = weekStart();

    const { data, error } = await admin.from("fos_reviews").upsert({
      week_start, kpis: k, ceo_summary: summary,
      biggest_wins: wins, biggest_losses: losses,
      top_3_actions: actions,
      evidence: { forecast: fc, competitor_intel: comp, organic_intelligence: oie,
                  top_10_opportunities: opps, execution_plan: plan },
      markdown: md, trigger, generated_at: new Date().toISOString(),
    }, { onConflict: "week_start" }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, review: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});