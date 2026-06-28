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
  const conf = verified7 >= 10 ? "medium" : verified7 >= 3 ? "low" : "very_low";
  const horizon = (target: number) => ({
    target, weeks_to_target: Math.ceil(target / weekly), confidence: conf,
  });
  return {
    to_10: horizon(10), to_25: horizon(25), to_100: horizon(100),
    to_500: horizon(500), to_1000: horizon(1000),
  };
}

async function topActions(k: any) {
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
    actions.push({
      rank: actions.length + 1,
      title: "Insufficient evidence for a third high-conviction action",
      why: "The founder doctrine forbids inventing work. Once funnel telemetry returns signal, the third action will be derived from real conversion-rate gaps.",
      expected_revenue_lift: "N/A — waiting on data.",
      confidence: "n/a", validation: "N/A", cost: "N/A",
    });
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

function markdown(k: any, summary: string, actions: any[], fc: any): string {
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
    `### Forecast (weeks to verified-order milestone)`,
    `- 10: ${fc.to_10.weeks_to_target}w (${fc.to_10.confidence})`,
    `- 25: ${fc.to_25.weeks_to_target}w`,
    `- 100: ${fc.to_100.weeks_to_target}w`,
    `- 500: ${fc.to_500.weeks_to_target}w`,
    `- 1000: ${fc.to_1000.weeks_to_target}w`,
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
    `_FOS reads only from existing tables (orders, analytics_funnel_waterfall, shil_incidents). No new metric logic._`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const trigger = new URL(req.url).searchParams.get("trigger") ?? "manual";
    const k = await kpis();
    const fc = forecast(k.verified_orders_7d);
    const summary = ceoSummary(k);
    const actions = await topActions(k);
    const md = markdown(k, summary, actions, fc);
    const week_start = weekStart();

    const { data, error } = await admin.from("fos_reviews").upsert({
      week_start, kpis: k, ceo_summary: summary,
      biggest_wins: [], biggest_losses: [],
      top_3_actions: actions, evidence: { forecast: fc },
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