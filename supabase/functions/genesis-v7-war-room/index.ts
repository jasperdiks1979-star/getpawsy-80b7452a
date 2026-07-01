// Genesis V7 — Conversion War Room
// Additive orchestrator. Reads only from existing Genesis tables and returns
// a full funnel + bottleneck report. Writes a single row to
// governance_decision_log so downstream engines can consume the verdict.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Bottleneck = {
  rank: number;
  area: string;
  finding: string;
  evidence: Record<string, unknown>;
  est_revenue_loss_pct: number;
  confidence: number;
  reuses: string[];
  repair_action: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const started = Date.now();

  try {
    // ── PHASE 1+2 — Reconstruct funnel from analytics_funnel_waterfall (canonical) ──
    const { data: waterfall } = await sb
      .from("analytics_funnel_waterfall")
      .select("click_at,landing_at,engagement_start_at,page_view_at,scroll_at,view_item_at,add_to_cart_at,view_cart_at,begin_checkout_at,payment_at,purchase_at,furthest_step,traffic_type")
      .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString());
    const rows = waterfall ?? [];
    const count = (pred: (r: any) => boolean) => rows.filter(pred).length;
    const funnel = {
      sessions: rows.length,
      landing: count(r => r.landing_at),
      engagement_start: count(r => r.engagement_start_at),
      view_item: count(r => r.view_item_at),
      add_to_cart: count(r => r.add_to_cart_at),
      view_cart: count(r => r.view_cart_at),
      begin_checkout: count(r => r.begin_checkout_at),
      payment: count(r => r.payment_at),
      purchase: count(r => r.purchase_at),
    };
    const humanRows = rows.filter(r => r.traffic_type === "human");
    const humanFunnel = {
      sessions: humanRows.length,
      view_item: humanRows.filter(r => r.view_item_at).length,
      add_to_cart: humanRows.filter(r => r.add_to_cart_at).length,
      begin_checkout: humanRows.filter(r => r.begin_checkout_at).length,
      purchase: humanRows.filter(r => r.purchase_at).length,
    };
    const drop = (from: number, to: number) => (from > 0 ? Math.round((1 - to / from) * 1000) / 10 : 0);
    const dropoffs = {
      landing_to_engagement_pct: drop(funnel.landing, funnel.engagement_start),
      engagement_to_pdp_pct: drop(funnel.engagement_start, funnel.view_item),
      pdp_to_atc_pct: drop(funnel.view_item, funnel.add_to_cart),
      atc_to_checkout_pct: drop(funnel.add_to_cart, funnel.begin_checkout),
      checkout_to_purchase_pct: drop(funnel.begin_checkout, funnel.purchase),
    };

    // ── PHASE 3 — Technical: frontend errors, pin performance, orders ──
    const [{ data: errs }, { data: cro }, { data: pdp }, { data: pins }, { data: orders }, { data: pre }] = await Promise.all([
      sb.from("frontend_error_logs").select("error_type,component_name").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(5000),
      sb.from("cro_findings").select("category,severity,title,recommendation").eq("status", "open").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(500),
      sb.from("pdp_health_audits").select("overall_score,product_id").gte("audited_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(2000),
      sb.from("pinterest_pin_performance").select("status,impressions,saves,pin_clicks,outbound_clicks").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(2000),
      sb.from("orders").select("id,status,created_at,total_cents").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(500),
      sb.from("pre_evaluations").select("product_visibility_score,click_intent_score").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(1000),
    ]);

    const errBuckets: Record<string, number> = {};
    for (const e of errs ?? []) {
      const k = `${e.component_name}:${e.error_type}`;
      errBuckets[k] = (errBuckets[k] ?? 0) + 1;
    }
    const topErrors = Object.entries(errBuckets).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const croBuckets: Record<string, number> = {};
    for (const f of cro ?? []) {
      const k = `${f.category}/${f.severity}`;
      croBuckets[k] = (croBuckets[k] ?? 0) + 1;
    }

    const pdpScores = (pdp ?? []).map(p => p.overall_score ?? 0);
    const avgPdp = pdpScores.length ? Math.round(pdpScores.reduce((a, b) => a + b, 0) / pdpScores.length) : 0;
    const lowPdp = pdpScores.filter(s => s < 70).length;

    const pinImpr = (pins ?? []).reduce((a, p: any) => a + (p.impressions ?? 0), 0);
    const pinClicks = (pins ?? []).reduce((a, p: any) => a + (p.pin_clicks ?? 0) + (p.outbound_clicks ?? 0), 0);
    const pinCtr = pinImpr > 0 ? Math.round((pinClicks / pinImpr) * 10000) / 100 : 0;

    const paidOrders = (orders ?? []).filter(o => ["paid", "fulfilled", "completed"].includes(String(o.status))).length;
    const revenueCents = (orders ?? []).filter(o => ["paid", "fulfilled", "completed"].includes(String(o.status))).reduce((a, o: any) => a + (o.total_cents ?? 0), 0);

    const avgVis = (pre ?? []).length ? Math.round((pre ?? []).reduce((a, r: any) => a + (r.product_visibility_score ?? 0), 0) / (pre ?? []).length) : 0;
    const avgIntent = (pre ?? []).length ? Math.round((pre ?? []).reduce((a, r: any) => a + (r.click_intent_score ?? 0), 0) / (pre ?? []).length) : 0;

    // ── PHASE 8 — Rank bottlenecks (deterministic, evidence-based) ──
    const bottlenecks: Bottleneck[] = [];

    // 1. Massive DataHealer flood implies backend/data-layer instability polluting UX & tracking.
    const dataHealer = errBuckets["DataHealer:UNKNOWN"] ?? 0;
    if (dataHealer > 500) {
      bottlenecks.push({
        rank: 0, area: "tracking/data-layer",
        finding: `DataHealer emitted ${dataHealer} UNKNOWN errors in 14d — data layer noise degrades attribution and downstream AI training.`,
        evidence: { dataHealer_errors_14d: dataHealer },
        est_revenue_loss_pct: 22, confidence: 92,
        reuses: ["CIE", "Tracking Health", "Analytics Truth"],
        repair_action: "Route DataHealer errors through analytics_quarantine and reduce log volume; CIE will re-open confidence gates once flood clears.",
      });
    }

    // 2. Engagement→PDP collapse (only ~ view_item/engagement of sessions reach PDP)
    if (dropoffs.engagement_to_pdp_pct >= 50 && funnel.engagement_start > 100) {
      bottlenecks.push({
        rank: 0, area: "landing→pdp",
        finding: `${dropoffs.engagement_to_pdp_pct}% of engaged sessions never open a product — landing pages / homepage funnel is the primary leak.`,
        evidence: { engagement_start: funnel.engagement_start, view_item: funnel.view_item },
        est_revenue_loss_pct: 30, confidence: 90,
        reuses: ["GCI", "CRO Engine", "First Sale Accelerator"],
        repair_action: "Feed low-CRS landing pages into First Sale Accelerator; trigger gci recompute for these product slugs.",
      });
    }

    // 3. PDP→ATC collapse
    if (dropoffs.pdp_to_atc_pct >= 90 && funnel.view_item > 50) {
      bottlenecks.push({
        rank: 0, area: "pdp→atc",
        finding: `${dropoffs.pdp_to_atc_pct}% of PDP viewers never add to cart. Avg PDP health score ${avgPdp}, ${lowPdp} PDPs below 70.`,
        evidence: { view_item: funnel.view_item, atc: funnel.add_to_cart, avgPdp, lowPdp },
        est_revenue_loss_pct: 28, confidence: 93,
        reuses: ["Conversion Intelligence", "Product Optimizer", "Trust Engine"],
        repair_action: "Escalate lowest-PDP-score products to genesis-conversion-intelligence cycle; enforce sticky ATC + trust badges via existing CRO fixers.",
      });
    }

    // 4. Checkout collapse (0 purchases)
    if (funnel.begin_checkout > 0 && funnel.purchase === 0) {
      bottlenecks.push({
        rank: 0, area: "checkout→purchase",
        finding: `${funnel.begin_checkout} checkouts started, 0 paid — payment / Stripe flow is failing or abandoning at shipping.`,
        evidence: { begin_checkout: funnel.begin_checkout, payment_events: funnel.payment, paid_orders: paidOrders },
        est_revenue_loss_pct: 15, confidence: 88,
        reuses: ["Revenue Pipeline Smoke", "Stripe adapter", "CCI"],
        repair_action: "Invoke revenue-pipeline-smoke; audit checkout_funnel_events for last error step; re-run pdp-health on OOS/price mismatches.",
      });
    }

    // 5. Pinterest CTR (traffic quality)
    if (pinImpr > 1000 && pinCtr < 0.4) {
      bottlenecks.push({
        rank: 0, area: "pinterest→landing",
        finding: `Pinterest CTR ${pinCtr}% below 0.4% — hooks/thumbnails failing before landing page.`,
        evidence: { impressions: pinImpr, outbound_clicks: pinClicks, ctr_pct: pinCtr, pre_visibility_avg: avgVis, pre_intent_avg: avgIntent },
        est_revenue_loss_pct: 10, confidence: 82,
        reuses: ["Pinterest Analytics", "PRE", "Creative Evolution Engine"],
        repair_action: "Loop losers into pinterest_loser_blocklist; EE re-generates hooks; PRE gate stays ≥95.",
      });
    }

    // 6. Critical/High CRO findings
    const openHighCrit = (cro ?? []).filter(f => ["high", "critical"].includes(String(f.severity))).length;
    if (openHighCrit >= 5) {
      bottlenecks.push({
        rank: 0, area: "cro-open-issues",
        finding: `${openHighCrit} open high/critical CRO findings across ${Object.keys(croBuckets).length} categories.`,
        evidence: { buckets: croBuckets, samples: (cro ?? []).slice(0, 5).map(f => ({ t: f.title, r: f.recommendation })) },
        est_revenue_loss_pct: 8, confidence: 85,
        reuses: ["CRO Engine", "Auto-fix log"],
        repair_action: "Trigger cro-autofix worker on all open high/critical findings.",
      });
    }

    // Sort by est_revenue_loss_pct desc, assign ranks
    bottlenecks.sort((a, b) => b.est_revenue_loss_pct - a.est_revenue_loss_pct);
    bottlenecks.forEach((b, i) => (b.rank = i + 1));

    // Executive summary + First Sale probability heuristic
    const totalLoss = bottlenecks.reduce((a, b) => a + b.est_revenue_loss_pct, 0);
    const firstSaleProbability = Math.max(1, Math.min(60, 100 - totalLoss));
    const firstSaleEtaHours = Math.max(6, Math.round(240 / Math.max(1, firstSaleProbability / 10)));

    const report = {
      generated_at: new Date().toISOString(),
      window_days: 14,
      funnel,
      human_funnel: humanFunnel,
      dropoffs,
      technical: {
        top_errors: topErrors.map(([k, v]) => ({ signature: k, count: v })),
        cro_open_by_category: croBuckets,
        pdp: { avg_score: avgPdp, below_70: lowPdp, audited: pdpScores.length },
        pinterest: { impressions: pinImpr, clicks: pinClicks, ctr_pct: pinCtr },
        pre: { visibility_avg: avgVis, click_intent_avg: avgIntent },
        orders: { paid_14d: paidOrders, revenue_cents: revenueCents },
      },
      bottlenecks,
      first_sale_probability_pct: firstSaleProbability,
      first_sale_eta_hours: firstSaleEtaHours,
      executive_summary: bottlenecks.length === 0
        ? "No dominant blocker detected; investigate traffic quality and PRE floors."
        : `Primary blocker: ${bottlenecks[0].area} (${bottlenecks[0].est_revenue_loss_pct}% est. loss, ${bottlenecks[0].confidence}% conf). Repair reuses ${bottlenecks[0].reuses.join(", ")}.`,
      elapsed_ms: Date.now() - started,
    };

    // Governance ledger — additive, no new tables
    try {
      await sb.from("governance_decision_log").insert({
        decision_type: "genesis_v7_war_room",
        source_engine: "genesis-v7-war-room",
        rationale: report.executive_summary,
        payload: report,
        confidence: bottlenecks[0]?.confidence ?? 70,
      });
    } catch { /* non-fatal */ }

    return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});