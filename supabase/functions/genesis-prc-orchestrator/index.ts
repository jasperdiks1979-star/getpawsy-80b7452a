// Genesis Production Recovery Cycle (GPRC v1)
// Additive orchestrator. Invokes existing Genesis engines and returns a single
// executive report per the GPRC v1 spec. Creates no new tables, no new engines,
// no synthetic data. Writes one row to governance_decision_log.
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
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

type SubsystemStatus = "healthy" | "warning" | "critical" | "unknown";
type Subsystem = {
  name: string;
  status: SubsystemStatus;
  evidence: Record<string, unknown>;
  blocks: string[];
  reuses: string;
};

async function invokeInternal(fn: string, body: Record<string, unknown> = {}) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
    return { ok: r.ok, status: r.status, body: parsed };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const started = Date.now();
  const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since24 = new Date(Date.now() - 864e5).toISOString();

  const subsystems: Subsystem[] = [];

  // ── Phase 1 — Production Health (read-only, real evidence) ──
  const [
    funnelQ, ordersQ, queueQ, pinPubQ, preQ, preFailQ, feErrQ,
    croQ, pdpQ, cieHealthQ, fspsQ, arieQ, pinFailQ,
  ] = await Promise.all([
    sb.from("canonical_events").select("canonical_name", { count: "exact", head: false })
      .gte("occurred_at", since14).in("canonical_name", [
        "CANONICAL_PAGE_VIEW","CANONICAL_PRODUCT_VIEW","CANONICAL_ADD_TO_CART",
        "CANONICAL_CART","CANONICAL_CHECKOUT","CANONICAL_PURCHASE",
      ]).limit(50000),
    sb.from("orders").select("id,status,total_cents,created_at").gte("created_at", since14).limit(1000),
    sb.from("pinterest_pin_queue").select("status,created_at").gte("created_at", since7).limit(5000),
    sb.from("pinterest_publish_logs").select("id,status,created_at").gte("created_at", since7).limit(1000),
    sb.from("pre_evaluations").select("passed,created_at").gte("created_at", since7).limit(5000),
    sb.from("pre_evaluations").select("blocking_reasons").gte("created_at", since7).eq("passed", false).limit(2000),
    sb.from("frontend_error_logs").select("error_type,component_name").gte("created_at", since24).limit(5000),
    sb.from("cro_findings").select("category,severity").eq("status", "open").limit(500),
    sb.from("pdp_health_audits").select("overall_score,product_id").gte("audited_at", since14).limit(2000),
    sb.from("cie_health_snapshots").select("overall_status,captured_at").order("captured_at", { ascending: false }).limit(1),
    sb.from("gv6_first_sale_scores").select("product_id,score").order("score", { ascending: false }).limit(25),
    sb.from("arie_health_snapshots").select("overall_status,captured_at").order("captured_at", { ascending: false }).limit(1),
    sb.from("pinterest_pipeline_failures").select("id,created_at").gte("created_at", since7).limit(1000),
  ]);

  const funnelRows = funnelQ.data ?? [];
  const funnelCount = (n: string) => funnelRows.filter((r: any) => r.canonical_name === n).length;
  const funnel = {
    page_view: funnelCount("CANONICAL_PAGE_VIEW"),
    view_item: funnelCount("CANONICAL_PRODUCT_VIEW"),
    add_to_cart: funnelCount("CANONICAL_ADD_TO_CART"),
    view_cart: funnelCount("CANONICAL_CART"),
    begin_checkout: funnelCount("CANONICAL_CHECKOUT"),
    purchase: funnelCount("CANONICAL_PURCHASE"),
  };

  const orders = ordersQ.data ?? [];
  const paidOrders = orders.filter((o: any) => ["paid","completed","fulfilled"].includes(String(o.status).toLowerCase()));
  const revenue14d = paidOrders.reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0) / 100;

  const queue = queueQ.data ?? [];
  const queueByStatus: Record<string, number> = {};
  for (const r of queue) queueByStatus[r.status] = (queueByStatus[r.status] ?? 0) + 1;

  const pre = preQ.data ?? [];
  const prePassRate = pre.length ? Math.round((pre.filter((r: any) => r.passed).length / pre.length) * 1000) / 10 : 0;

  // Aggregate PRE fail reasons (bucket by keyword)
  const preFailBuckets: Record<string, number> = {};
  for (const r of preFailQ.data ?? []) {
    const reasons = Array.isArray(r.blocking_reasons) ? r.blocking_reasons.join(" ") : String(r.blocking_reasons ?? "");
    if (reasons.includes("pre_ai_gateway_402")) preFailBuckets.ai_gateway_402 = (preFailBuckets.ai_gateway_402 ?? 0) + 1;
    if (reasons.includes("species_mismatch")) preFailBuckets.species_mismatch = (preFailBuckets.species_mismatch ?? 0) + 1;
    if (reasons.includes("product_occupancy<20%")) preFailBuckets.low_occupancy = (preFailBuckets.low_occupancy ?? 0) + 1;
    if (reasons.includes("product_visibility<95")) preFailBuckets.low_visibility = (preFailBuckets.low_visibility ?? 0) + 1;
    if (reasons.includes("click_intent<95")) preFailBuckets.low_click_intent = (preFailBuckets.low_click_intent ?? 0) + 1;
    if (reasons.includes("landing_image_divergence")) preFailBuckets.landing_divergence = (preFailBuckets.landing_divergence ?? 0) + 1;
  }

  const feErrors = feErrQ.data ?? [];
  const feErrorTop: Record<string, number> = {};
  for (const e of feErrors) {
    const k = String((e as any).error_type ?? "unknown");
    feErrorTop[k] = (feErrorTop[k] ?? 0) + 1;
  }

  // ── Subsystem verdicts (real evidence only) ──
  subsystems.push({
    name: "Traffic & Sessions", reuses: "canonical_events",
    status: funnel.page_view < 100 ? "critical" : funnel.page_view < 500 ? "warning" : "healthy",
    evidence: { page_view_14d: funnel.page_view, view_item_14d: funnel.view_item },
    blocks: funnel.page_view < 100 ? ["Traffic","Revenue"] : [],
  });
  subsystems.push({
    name: "Conversion (PDP→ATC→Checkout)", reuses: "canonical_events, cro_findings",
    status: funnel.view_item > 50 && funnel.add_to_cart === 0 ? "critical"
          : funnel.view_item > 0 && (funnel.add_to_cart / Math.max(1, funnel.view_item)) < 0.03 ? "warning" : "healthy",
    evidence: {
      pdp_to_atc_pct: funnel.view_item ? Math.round((funnel.add_to_cart / funnel.view_item) * 1000) / 10 : 0,
      atc_to_checkout_pct: funnel.add_to_cart ? Math.round((funnel.begin_checkout / funnel.add_to_cart) * 1000) / 10 : 0,
      open_cro_findings: (croQ.data ?? []).length,
    },
    blocks: funnel.add_to_cart === 0 && funnel.view_item > 0 ? ["Conversion","Revenue"] : [],
  });
  subsystems.push({
    name: "Checkout & Payment", reuses: "orders, canonical_events",
    status: funnel.begin_checkout > 0 && paidOrders.length === 0 ? "critical" : paidOrders.length === 0 ? "warning" : "healthy",
    evidence: { paid_orders_14d: paidOrders.length, revenue_usd_14d: revenue14d, checkouts_14d: funnel.begin_checkout },
    blocks: paidOrders.length === 0 ? ["Revenue","Checkout"] : [],
  });
  subsystems.push({
    name: "Pinterest Publisher", reuses: "pinterest_pin_queue, pinterest_publish_logs",
    status: (queueByStatus.posted ?? 0) === 0 && (pinPubQ.data ?? []).length === 0 ? "critical"
          : (queueByStatus.rejected ?? 0) > (queueByStatus.posted ?? 0) * 5 ? "warning" : "healthy",
    evidence: { queue_7d: queueByStatus, publish_logs_7d: (pinPubQ.data ?? []).length, pipeline_failures_7d: (pinFailQ.data ?? []).length },
    blocks: (queueByStatus.posted ?? 0) === 0 ? ["Publishing"] : [],
  });
  subsystems.push({
    name: "PRE Vision Gate", reuses: "pre_evaluations",
    status: (preFailBuckets.ai_gateway_402 ?? 0) > 5 ? "critical"
          : prePassRate < 40 ? "warning" : "healthy",
    evidence: { pass_rate_pct: prePassRate, evaluated_7d: pre.length, fail_buckets: preFailBuckets },
    blocks: (preFailBuckets.ai_gateway_402 ?? 0) > 5 ? ["Publishing","Learning"] : [],
  });
  subsystems.push({
    name: "Frontend Runtime", reuses: "frontend_error_logs",
    status: feErrors.length > 500 ? "critical" : feErrors.length > 100 ? "warning" : "healthy",
    evidence: { errors_24h: feErrors.length, top_types: Object.entries(feErrorTop).sort((a,b)=>b[1]-a[1]).slice(0,5) },
    blocks: feErrors.length > 500 ? ["Traffic","Conversion"] : [],
  });
  subsystems.push({
    name: "CIE (Conversion Integrity)", reuses: "cie_health_snapshots",
    status: (cieHealthQ.data?.[0] as any)?.overall_status === "ok" ? "healthy"
          : (cieHealthQ.data?.[0] as any)?.overall_status ? "warning" : "unknown",
    evidence: { last_snapshot: cieHealthQ.data?.[0] ?? null },
    blocks: [],
  });
  subsystems.push({
    name: "ARIE (Autonomous Revenue Intelligence)", reuses: "arie_health_snapshots",
    status: (arieQ.data?.[0] as any)?.overall_status === "ok" ? "healthy"
          : (arieQ.data?.[0] as any)?.overall_status ? "warning" : "unknown",
    evidence: { last_snapshot: arieQ.data?.[0] ?? null },
    blocks: [],
  });
  subsystems.push({
    name: "FSPS (First Sale Priority)", reuses: "gv6_first_sale_scores",
    status: (fspsQ.data ?? []).length >= 25 ? "healthy" : (fspsQ.data ?? []).length > 0 ? "warning" : "critical",
    evidence: { top_scored_products: (fspsQ.data ?? []).length, top_score: (fspsQ.data ?? [])[0]?.score ?? null },
    blocks: [],
  });
  subsystems.push({
    name: "PDP Health", reuses: "pdp_health_audits",
    status: (pdpQ.data ?? []).length > 20 ? "healthy" : (pdpQ.data ?? []).length > 0 ? "warning" : "critical",
    evidence: { audits_14d: (pdpQ.data ?? []).length, avg_score: (pdpQ.data ?? []).length
      ? Math.round(((pdpQ.data ?? []).reduce((s: number, r: any) => s + (r.overall_score ?? 0), 0) / (pdpQ.data ?? []).length) * 10) / 10
      : null },
    blocks: [],
  });

  // ── Phase 9 — Autonomous execution (reuse-only, never lower gates) ──
  const repairs_completed: Array<{ engine: string; result: unknown }> = [];
  const repairs_skipped: Array<{ engine: string; reason: string }> = [];

  // Only invoke repairs the engines expose safely and idempotently.
  const safeInvocations: Array<{ fn: string; body: Record<string, unknown>; skipIf?: string }> = [
    { fn: "genesis-v7-war-room", body: {} },
    { fn: "revenue-pipeline-smoke", body: {} },
    { fn: "cie-orchestrator", body: { action: "cycle" } },
    { fn: "pinterest-flow-monitor", body: {} },
    { fn: "first-sale-mode-status", body: {} },
  ];
  for (const inv of safeInvocations) {
    const r = await invokeInternal(inv.fn, inv.body);
    if (r.ok) repairs_completed.push({ engine: inv.fn, result: { status: r.status } });
    else repairs_skipped.push({ engine: inv.fn, reason: `HTTP ${r.status}: ${typeof r.body === "string" ? r.body : JSON.stringify(r.body).slice(0, 200)}` });
  }

  // AI-gateway–dependent repairs are only invoked when credits are available.
  if ((preFailBuckets.ai_gateway_402 ?? 0) > 0) {
    repairs_skipped.push({ engine: "pre-occupancy-rerender", reason: "AI Gateway 402 detected in pre_evaluations; skipping to avoid burning quota" });
    repairs_skipped.push({ engine: "pinterest-creative-factory", reason: "AI Gateway 402 detected; skipping AI-heavy regeneration" });
  }

  // ── Phase 8 — First Sale Priority (recomputed via existing table) ──
  const fsps = fspsQ.data ?? [];
  const meanScore = fsps.length ? fsps.reduce((s: number, r: any) => s + (r.score ?? 0), 0) / fsps.length : 0;

  // First Sale probability heuristic (evidence-only, no fabrication):
  // gated by traffic AND publishing AND conversion signals.
  const trafficOk = funnel.view_item >= 50;
  const publishingOk = (queueByStatus.posted ?? 0) > 0;
  const conversionOk = funnel.add_to_cart > 0;
  const factor = (trafficOk ? 1 : 0.2) * (publishingOk ? 1 : 0.3) * (conversionOk ? 1 : 0.25);
  const first_sale_probability_pct = Math.round(Math.min(1, factor * (meanScore / 100)) * 1000) / 10;
  const first_sale_eta_days = first_sale_probability_pct > 10 ? Math.max(1, Math.round(30 / first_sale_probability_pct))
                            : first_sale_probability_pct > 0 ? 90 : null;

  // ── Phase 11 — Executive Report (readiness weighted from subsystems) ──
  const readinessFrom = (names: string[]) => {
    const rel = subsystems.filter(s => names.includes(s.name));
    if (!rel.length) return 0;
    const map = { healthy: 100, warning: 60, critical: 15, unknown: 40 } as const;
    return Math.round(rel.reduce((s, x) => s + map[x.status], 0) / rel.length);
  };
  const traffic_readiness = readinessFrom(["Traffic & Sessions", "Frontend Runtime"]);
  const conversion_readiness = readinessFrom(["Conversion (PDP→ATC→Checkout)", "PDP Health"]);
  const checkout_readiness = readinessFrom(["Checkout & Payment"]);
  const pinterest_readiness = readinessFrom(["Pinterest Publisher", "PRE Vision Gate"]);
  const analytics_readiness = readinessFrom(["CIE (Conversion Integrity)", "ARIE (Autonomous Revenue Intelligence)"]);
  const revenue_readiness = Math.round((conversion_readiness + checkout_readiness + pinterest_readiness) / 3);
  const overall_health_score = Math.round(
    (traffic_readiness + conversion_readiness + checkout_readiness + pinterest_readiness + analytics_readiness) / 5,
  );

  // Top bottlenecks (ranked by block severity)
  const bottlenecks = subsystems
    .filter(s => s.status !== "healthy")
    .map(s => ({
      area: s.name,
      status: s.status,
      blocks: s.blocks,
      evidence: s.evidence,
      reuses: s.reuses,
    }))
    .sort((a, b) => {
      const w = { critical: 3, warning: 2, unknown: 1, healthy: 0 } as const;
      return w[b.status as keyof typeof w] - w[a.status as keyof typeof w];
    })
    .slice(0, 20);

  const report = {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    overall_health_score,
    readiness: {
      revenue: revenue_readiness,
      traffic: traffic_readiness,
      conversion: conversion_readiness,
      checkout: checkout_readiness,
      pinterest: pinterest_readiness,
      analytics: analytics_readiness,
    },
    funnel_14d: funnel,
    orders_14d: { paid: paidOrders.length, revenue_usd: revenue14d },
    subsystems,
    top_bottlenecks: bottlenecks,
    repairs_completed,
    repairs_skipped,
    fsps: {
      top25_count: fsps.length,
      mean_score: Math.round(meanScore * 10) / 10,
      top_score: fsps[0]?.score ?? null,
    },
    first_sale: {
      probability_pct: first_sale_probability_pct,
      eta_days: first_sale_eta_days,
      confidence: trafficOk && publishingOk && conversionOk ? 0.7 : 0.35,
      gating_factors: { trafficOk, publishingOk, conversionOk },
    },
    expected_lifts: {
      note: "Only reported when a repair was successfully invoked and produced measurable outputs.",
      applicable: false,
    },
  };

  // Ledger — one row per run
  try {
    await sb.from("governance_decision_log").insert({
      decision_type: "genesis_prc_cycle",
      decision: `overall=${overall_health_score} revenue=${revenue_readiness}`,
      rationale: `GPRC v1 cycle. Bottlenecks: ${bottlenecks.length}. Paid orders 14d: ${paidOrders.length}.`,
      confidence: report.first_sale.confidence,
      evidence: report as unknown as Record<string, unknown>,
      source: "genesis-prc-orchestrator",
    });
  } catch { /* non-blocking */ }

  return new Response(JSON.stringify(report), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});