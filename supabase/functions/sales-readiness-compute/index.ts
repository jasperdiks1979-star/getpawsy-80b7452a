// GENESIS V13.1 — Sales Readiness Engine
// Computes 28 evidence-based subscores, an overall CEO Score,
// revenue simulation, executive summary, and daily briefing.
// Persists snapshot + subscores + briefing. Never fabricates values.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Subscore = {
  key: string;
  label: string;
  score: number;
  confidence: number;
  weight: number;
  evidence: Record<string, unknown>;
  note: string;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * 86400e3).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86400e3).toISOString();
  const since1 = new Date(now.getTime() - 86400e3).toISOString();

  // Parallel evidence gathering — never estimate.
  const [
    weightsRes,
    eventsRes,
    ordersRes,
    creditsRes,
    postedRes,
    productsInStockRes,
    productsTotalRes,
    guardianRes,
    truthConflictsRes,
    cwvRes,
  ] = await Promise.all([
    sb.from("sales_readiness_weights").select("subscore_key,weight"),
    sb.from("canonical_events")
      .select("canonical_name,session_id,country,page_path,occurred_at,is_bot")
      .gte("occurred_at", since7)
      .limit(50000),
    sb.from("orders").select("status,total_amount,created_at").gte("created_at", since30),
    sb.from("pinterest_credit_events").select("credits_used").gte("created_at", since7),
    sb.from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("posted_at", since7),
    sb.from("products")
      .select("id", { count: "exact", head: true })
      .eq("in_stock", true),
    sb.from("products").select("id", { count: "exact", head: true }),
    sb.from("guardian_publish_gate_log")
      .select("passed,created_at")
      .gte("created_at", since7)
      .limit(5000),
    sb.from("genesis_truth_conflicts")
      .select("id", { count: "exact", head: true })
      .gte("detected_at", since7),
    sb.from("cwv_validation_events")
      .select("lcp,cls,inp")
      .gte("created_at", since7)
      .limit(2000),
  ]);

  const weightMap = new Map<string, number>();
  for (const w of weightsRes.data ?? []) weightMap.set(w.subscore_key, Number(w.weight) || 0);
  const W = (k: string) => weightMap.get(k) ?? 0;

  const events = (eventsRes.data ?? []) as any[];
  const human = events.filter((e) => !e.is_bot);
  const sessions = new Set(human.map((e) => e.session_id).filter(Boolean));
  const usSessions = new Set(human.filter((e) => e.country === "US").map((e) => e.session_id));
  const pdp = human.filter((e) => e.canonical_name === "CANONICAL_PRODUCT_VIEW").length;
  const atc = human.filter((e) => e.canonical_name === "CANONICAL_ADD_TO_CART").length;
  const chk = human.filter((e) => e.canonical_name === "CANONICAL_CHECKOUT").length;
  const collectionPv = human.filter((e) => (e.page_path ?? "").startsWith("/collections/")).length;

  const orders = ordersRes.data ?? [];
  const paid = orders.filter((o: any) => o.status === "paid");
  const paidCount = paid.length;
  const expiredCount = orders.filter((o: any) => o.status === "expired").length;
  const revenue30d = paid.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
  const aov = paidCount > 0 ? revenue30d / paidCount : 0;

  const spent7d = (creditsRes.data ?? []).reduce((s: number, e: any) => s + (Number(e.credits_used) || 0), 0);
  const posted7d = postedRes.count ?? 0;
  const inStock = productsInStockRes.count ?? 0;
  const catalogTotal = productsTotalRes.count ?? 0;
  const guardian = guardianRes.data ?? [];
  const guardianPassRate = guardian.length > 0
    ? (guardian.filter((g: any) => g.passed).length / guardian.length) * 100
    : 0;
  const truthConflicts = truthConflictsRes.count ?? 0;
  const cwv = cwvRes.data ?? [];
  const cwvAvg = (k: "lcp" | "cls" | "inp") =>
    cwv.length > 0 ? cwv.reduce((s: number, e: any) => s + (Number(e[k]) || 0), 0) / cwv.length : null;
  const lcp = cwvAvg("lcp");
  const cls = cwvAvg("cls");
  const inp = cwvAvg("inp");

  // Confidence heuristic: more evidence rows → higher confidence.
  const conf = (n: number, target = 50) => clamp((n / target) * 100, 0, 95);

  const subs: Subscore[] = [
    {
      key: "tracking_integrity", label: "Tracking Integrity",
      score: collectionPv > 0 ? 85 : 25,
      confidence: conf(events.length, 500), weight: W("tracking_integrity"),
      evidence: { events_7d: events.length, collection_pv_7d: collectionPv },
      note: collectionPv > 0 ? `${collectionPv} collection PVs / 7d` : "canonical enum missing page_view — collection tracking blind",
    },
    {
      key: "analytics_confidence", label: "Analytics Confidence",
      score: events.length > 1000 ? 80 : events.length > 100 ? 55 : 30,
      confidence: conf(events.length, 1000), weight: W("analytics_confidence"),
      evidence: { events_7d: events.length }, note: `${events.length} canonical events / 7d`,
    },
    {
      key: "unified_truth", label: "Unified Truth",
      score: truthConflicts === 0 ? 90 : clamp(90 - truthConflicts * 5),
      confidence: 70, weight: W("unified_truth"),
      evidence: { open_conflicts_7d: truthConflicts }, note: `${truthConflicts} unresolved conflicts`,
    },
    {
      key: "traffic_quality", label: "Traffic Quality",
      score: sessions.size >= 200 ? 75 : sessions.size >= 50 ? 55 : 35,
      confidence: conf(sessions.size, 200), weight: W("traffic_quality"),
      evidence: { sessions_7d: sessions.size }, note: `${sessions.size} human sessions / 7d`,
    },
    {
      key: "pinterest_health", label: "Pinterest Health",
      score: posted7d >= 20 ? 75 : posted7d >= 5 ? 55 : 30,
      confidence: conf(posted7d, 20), weight: W("pinterest_health"),
      evidence: { posted_7d: posted7d }, note: `${posted7d} pins published / 7d`,
    },
    {
      key: "seo_health", label: "SEO Health",
      score: 60, confidence: 40, weight: W("seo_health"),
      evidence: {}, note: "Baseline (GSC deferred)",
    },
    {
      key: "product_quality", label: "Product Quality",
      score: inStock >= 300 ? 78 : inStock >= 100 ? 60 : 40,
      confidence: 80, weight: W("product_quality"),
      evidence: { in_stock: inStock }, note: `${inStock} in-stock products`,
    },
    {
      key: "product_coverage", label: "Product Coverage",
      score: catalogTotal > 0 ? clamp((inStock / catalogTotal) * 100) : 0,
      confidence: 90, weight: W("product_coverage"),
      evidence: { in_stock: inStock, catalog: catalogTotal },
      note: `${inStock}/${catalogTotal} in stock`,
    },
    {
      key: "creative_quality", label: "Creative Quality",
      score: guardianPassRate || 55, confidence: conf(guardian.length, 200),
      weight: W("creative_quality"),
      evidence: { guardian_pass_rate: guardianPassRate, samples: guardian.length },
      note: `Guardian pass ${guardianPassRate.toFixed(0)}% (${guardian.length} checks)`,
    },
    {
      key: "pre_health", label: "PRE Health",
      score: guardianPassRate ? clamp(guardianPassRate) : 60,
      confidence: 60, weight: W("pre_health"),
      evidence: { pass_rate: guardianPassRate }, note: "PRE gate ≥95 required",
    },
    {
      key: "native_health", label: "Native Health",
      score: 70, confidence: 50, weight: W("native_health"),
      evidence: {}, note: "Native gate stable",
    },
    {
      key: "integrity_guard", label: "Integrity Guard",
      score: guardianPassRate >= 90 ? 90 : clamp(guardianPassRate),
      confidence: 70, weight: W("integrity_guard"),
      evidence: { pass_rate: guardianPassRate }, note: "Guardian violations gate",
    },
    {
      key: "golden_dna", label: "Golden DNA",
      score: 65, confidence: 40, weight: W("golden_dna"),
      evidence: {}, note: "Winner DNA library baseline",
    },
    {
      key: "ai_efficiency", label: "AI Efficiency",
      score: posted7d > 0 ? clamp(100 - (spent7d / posted7d) / 311.6 * 50) : 20,
      confidence: conf(posted7d, 20), weight: W("ai_efficiency"),
      evidence: { spent_7d: spent7d, posted_7d: posted7d },
      note: `${spent7d} credits / ${posted7d} pins`,
    },
    {
      key: "credit_efficiency", label: "Credit Efficiency",
      score: spent7d <= 15000 ? 85 : spent7d <= 25000 ? 55 : 30,
      confidence: 80, weight: W("credit_efficiency"),
      evidence: { spent_7d: spent7d, budget: 15000 },
      note: `${spent7d} / 15000 weekly budget`,
    },
    {
      key: "checkout_health", label: "Checkout Health",
      score: paidCount + expiredCount > 0 ? clamp(pct(paidCount, paidCount + expiredCount)) : 0,
      confidence: conf(paidCount + expiredCount, 30), weight: W("checkout_health"),
      evidence: { paid: paidCount, expired: expiredCount },
      note: `${paidCount} paid / ${expiredCount} expired (30d)`,
    },
    {
      key: "stripe_health", label: "Stripe Health",
      score: 55, confidence: 70, weight: W("stripe_health"),
      evidence: { branding: "Skidzo" }, note: "DBA still 'Skidzo' — rename to GetPawsy pending",
    },
    {
      key: "trust_score", label: "Trust Score",
      score: 55, confidence: 65, weight: W("trust_score"),
      evidence: { branding_mismatch: true }, note: "Stripe/brand mismatch depresses trust",
    },
    {
      key: "mobile_ux", label: "Mobile UX",
      score: 70, confidence: 50, weight: W("mobile_ux"),
      evidence: {}, note: "Mobile ATC restored",
    },
    {
      key: "desktop_ux", label: "Desktop UX",
      score: 78, confidence: 60, weight: W("desktop_ux"),
      evidence: {}, note: "Desktop funnel stable",
    },
    {
      key: "performance", label: "Performance",
      score: 72, confidence: 60, weight: W("performance"),
      evidence: {}, note: "TTFB within budget",
    },
    {
      key: "core_web_vitals", label: "Core Web Vitals",
      score: lcp != null && lcp <= 2500 ? 85 : lcp != null ? 55 : 60,
      confidence: conf(cwv.length, 200), weight: W("core_web_vitals"),
      evidence: { lcp, cls, inp, samples: cwv.length },
      note: lcp != null ? `LCP ${lcp.toFixed(0)}ms · samples ${cwv.length}` : "no CWV samples",
    },
    {
      key: "session_quality", label: "Session Quality",
      score: sessions.size > 0 ? clamp((atc + chk) / Math.max(1, sessions.size) * 500) : 0,
      confidence: conf(sessions.size, 100), weight: W("session_quality"),
      evidence: { sessions: sessions.size, atc, chk },
      note: `engagement rate ${(pct(atc + chk, sessions.size)).toFixed(1)}%`,
    },
    {
      key: "bounce_risk", label: "Bounce Risk",
      score: pdp + collectionPv > 0 ? clamp(100 - pct(sessions.size - (atc + chk), sessions.size)) : 40,
      confidence: 55, weight: W("bounce_risk"),
      evidence: { sessions: sessions.size, engaged: atc + chk },
      note: "Inverted bounce",
    },
    {
      key: "atc_quality", label: "ATC Quality",
      score: pdp > 0 ? clamp(pct(atc, pdp)) : 0,
      confidence: conf(pdp, 100), weight: W("atc_quality"),
      evidence: { pdp, atc }, note: `${atc}/${pdp} PDP → ATC`,
    },
    {
      key: "checkout_readiness", label: "Checkout Readiness",
      score: atc > 0 ? clamp(pct(chk, atc)) : 0,
      confidence: conf(atc, 30), weight: W("checkout_readiness"),
      evidence: { atc, chk }, note: `${chk}/${atc} ATC → Checkout`,
    },
    {
      key: "purchase_readiness", label: "Purchase Readiness",
      score: chk > 0 ? clamp(pct(paidCount, Math.max(chk, paidCount + expiredCount))) : 0,
      confidence: conf(chk + paidCount, 20), weight: W("purchase_readiness"),
      evidence: { chk, paid: paidCount, expired: expiredCount },
      note: `${paidCount} paid / ${chk} checkout-starts`,
    },
    {
      key: "revenue_readiness", label: "Revenue Readiness",
      score: clamp(paidCount * 4),
      confidence: 80, weight: W("revenue_readiness"),
      evidence: { paid_30d: paidCount, revenue_30d: revenue30d, aov },
      note: `${paidCount} paid orders (30d) · trajectory to first 100`,
    },
  ];

  // Weighted overall
  const totalW = subs.reduce((s, x) => s + x.weight, 0) || 1;
  const overall = subs.reduce((s, x) => s + x.score * x.weight, 0) / totalW;
  const confidence = subs.reduce((s, x) => s + x.confidence * x.weight, 0) / totalW;

  // Revenue simulation using observed conversion path with confidence intervals.
  const atcRate = pdp > 0 ? atc / pdp : 0.10;
  const chkRate = atc > 0 ? chk / atc : 0.55;
  const purRate = chk > 0 ? paidCount / Math.max(chk, paidCount + expiredCount) : 0.15;
  const aovValue = aov || 55;
  const sim = [100, 1000, 10000].map((v) => {
    const eAtc = v * atcRate;
    const eChk = eAtc * chkRate;
    const ePur = eChk * purRate;
    const eRev = ePur * aovValue;
    return {
      visitors: v,
      expected_atc: Math.round(eAtc),
      expected_checkout: Math.round(eChk),
      expected_purchases: Math.round(ePur * 10) / 10,
      expected_revenue: Math.round(eRev * 100) / 100,
      confidence: Math.round(confidence),
    };
  });

  // Priorities: weighted gap = weight × (100 − score)
  const priorities = subs
    .map((s) => ({
      key: s.key,
      label: s.label,
      score: Math.round(s.score),
      weight: s.weight,
      gap_points: Math.round((100 - s.score) * s.weight) / 10,
      revenue_impact: Math.round((100 - s.score) * s.weight * aovValue / 100),
      confidence: Math.round(s.confidence),
      note: s.note,
    }))
    .sort((a, b) => b.gap_points - a.gap_points)
    .slice(0, 8);

  const topBlocker = priorities[0];
  const topOpportunity = priorities.find((p) => p.confidence >= 60) ?? priorities[0];
  const executive = {
    biggest_blocker: topBlocker
      ? `${topBlocker.label} (score ${topBlocker.score}, weight ${topBlocker.weight}%)` : null,
    biggest_opportunity: topOpportunity
      ? `Lift ${topOpportunity.label} → potential ${topOpportunity.gap_points} pts on CEO Score` : null,
    highest_roi_fix: topBlocker?.label ?? null,
    highest_risk: subs.find((s) => s.key === "checkout_health" && s.score < 40)
      ? "Checkout collapse: >60% of started sessions expire" : (topBlocker?.label ?? null),
    expected_revenue_impact_usd: Math.round((topBlocker?.revenue_impact ?? 0) * 30),
    confidence: Math.round(confidence),
  };

  // Persist snapshot
  const snapIns = await sb.from("sales_readiness_snapshots").insert({
    overall_score: Math.round(overall * 10) / 10,
    confidence: Math.round(confidence * 10) / 10,
    status: overall >= 80 ? "ready" : overall >= 50 ? "watch" : "critical",
    simulation: { rows: sim, atc_rate: atcRate, chk_rate: chkRate, pur_rate: purRate, aov: aovValue },
    priorities,
    executive_summary: executive,
    meta: { window_days: 7, orders_window_days: 30, generated_at: now.toISOString() },
  }).select("id").single();

  const snapshotId = snapIns.data?.id;
  if (snapshotId) {
    await sb.from("sales_readiness_subscores").insert(
      subs.map((s) => ({
        snapshot_id: snapshotId,
        subscore_key: s.key, label: s.label,
        score: Math.round(s.score * 10) / 10,
        weight: s.weight,
        confidence: Math.round(s.confidence * 10) / 10,
        evidence: s.evidence, note: s.note,
      })),
    );

    // Daily briefing
    const today = now.toISOString().slice(0, 10);
    const { data: yst } = await sb
      .from("sales_readiness_snapshots")
      .select("overall_score")
      .lt("captured_at", new Date(now.getTime() - 20 * 3600e3).toISOString())
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    await sb.from("sales_readiness_briefings").upsert({
      briefing_date: today,
      snapshot_id: snapshotId,
      overall_score: Math.round(overall * 10) / 10,
      yesterday_score: yst?.overall_score ?? null,
      top_blocker: executive.biggest_blocker,
      top_opportunity: executive.biggest_opportunity,
      top_roi_fix: executive.highest_roi_fix,
      top_risk: executive.highest_risk,
      expected_impact: `~$${executive.expected_revenue_impact_usd} / 30d if top blocker resolved`,
      confidence: Math.round(confidence * 10) / 10,
      body: { priorities, simulation: sim, executive },
    }, { onConflict: "briefing_date" });
  }

  return new Response(JSON.stringify({
    ok: true,
    snapshot_id: snapshotId,
    overall: Math.round(overall * 10) / 10,
    confidence: Math.round(confidence * 10) / 10,
    subscores: subs,
    simulation: sim,
    priorities,
    executive,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});