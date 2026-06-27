// Phase 8 — Autonomous Growth Loop aggregator.
//
// Reads ONLY from existing production tables (no duplicates, no mock data)
// and writes a single executive snapshot row into `ai_executive_snapshots`
// tagged `generated_by='growth-loop-phase8'`. The Growth Commander UI reads
// the latest row of that flavour and renders the Phase 8I summary.
//
// Action contract:
//   POST { action?: "run" | "snapshot", trigger?: "cron_*" }
//   - run      → recompute + insert a new snapshot (admin OR cron)
//   - snapshot → return latest snapshot (admin OR public read via RLS)
//
// Source tables (all already populated by other engines):
//   growth_orchestrator_recommendations   → ranked opportunities + EPS
//   agp_product_opportunity               → product intelligence
//   pinterest_revenue_opportunity_scores  → Pinterest opportunities
//   growth_keyword_opportunities          → SEO opportunities
//   monitoring_alerts (open, severity)    → biggest bottleneck
//   analytics_health_checks               → health floor

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = Record<string, any>;
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function num(v: unknown, d = 0): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clamp(n: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, n)); }

async function authorize(req: Request, body: Row) {
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  if (auth === `Bearer ${SERVICE_ROLE}`) return { sb, mode: "service" };
  const trigger = String(body?.trigger ?? "");
  if (body?.action === "run" && trigger.startsWith("cron_")) return { sb, mode: "cron" };
  if (!auth.startsWith("Bearer ")) return null;
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return null;
  const { data: role } = await sb.from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return role ? { sb, mode: "admin", user } : null;
}

async function topRecs(sb: ReturnType<typeof createClient>, category: string | null, limit = 10) {
  let q = sb.from("growth_orchestrator_recommendations")
    .select("id,title,category,confidence,expected_impact,priority_score,est_revenue_gain,est_traffic_gain,evidence,source,created_at")
    .order("priority_score", { ascending: false }).limit(limit);
  if (category) q = q.eq("category", category);
  const { data } = await q;
  return data ?? [];
}

async function buildSnapshot(sb: ReturnType<typeof createClient>) {
  const [growth, revenue, pinterest, seo, alerts, health, productOpps, pinOpps] = await Promise.all([
    topRecs(sb, null, 10),
    sb.from("growth_orchestrator_recommendations")
      .select("id,title,confidence,priority_score,est_revenue_gain")
      .order("est_revenue_gain", { ascending: false }).limit(10).then(r => r.data ?? []),
    topRecs(sb, "pinterest", 10),
    topRecs(sb, "seo", 10),
    sb.from("monitoring_alerts").select("id,severity,category,title,created_at")
      .eq("status", "open").order("severity", { ascending: false }).limit(20).then(r => r.data ?? []),
    sb.from("analytics_health_checks").select("status,score,checked_at")
      .order("checked_at", { ascending: false }).limit(1).then(r => r.data?.[0] ?? null),
    sb.from("agp_product_opportunity").select("product_slug,opportunity_score,revenue_potential,confidence")
      .order("opportunity_score", { ascending: false }).limit(10).then(r => r.data ?? []),
    sb.from("pinterest_revenue_opportunity_scores").select("product_id,score,tier")
      .gte("score", 700).order("score", { ascending: false }).limit(10).then(r => r.data ?? []),
  ]);

  const estRevenueImpact = (growth as Row[]).reduce((s, r) => s + num(r.est_revenue_gain), 0);
  const estTrafficImpact = (growth as Row[]).reduce((s, r) => s + num(r.est_traffic_gain), 0);

  // Overall growth score: weighted blend of health, top-rec confidence,
  // and inverse pressure from open critical alerts. 0–100, deterministic.
  const healthScore = num((health as Row | null)?.score, 70);
  const avgConf = growth.length
    ? growth.reduce((s, r) => s + num((r as Row).confidence), 0) / growth.length
    : 0.5;
  const criticalAlerts = (alerts as Row[]).filter(a => String(a.severity).toLowerCase() === "critical").length;
  const alertPenalty = clamp(criticalAlerts / 10, 0, 1);
  const growthScore = Math.round(
    clamp(0.45 * (healthScore / 100) + 0.35 * avgConf + 0.20 * (1 - alertPenalty)) * 100
  );

  const biggestBottleneck = (alerts as Row[])[0]
    ? { title: (alerts as Row[])[0].title, severity: (alerts as Row[])[0].severity, category: (alerts as Row[])[0].category }
    : null;

  return {
    window_days: 14,
    revenue_health: {
      growth_score: growthScore,
      est_revenue_impact_usd: Math.round(estRevenueImpact),
      est_traffic_impact_sessions: Math.round(estTrafficImpact),
      analytics_health_score: healthScore,
    },
    traffic_quality: { open_alerts: alerts.length, critical_alerts: criticalAlerts },
    winners: { top_revenue_recs: revenue, top_product_opportunities: productOpps },
    losers: { biggest_bottleneck: biggestBottleneck },
    top_sources: {
      top_growth_opportunities: growth,
      top_pinterest_opportunities: pinterest,
      top_pinterest_products: pinOpps,
      top_seo_opportunities: seo,
    },
    anomalies: alerts.slice(0, 10),
    ai_summary:
      `Growth Score ${growthScore}/100. ${growth.length} ranked opportunities, ` +
      `${revenue.length} revenue-weighted, ${pinterest.length} Pinterest, ${seo.length} SEO. ` +
      `${criticalAlerts} critical alerts open. Est revenue impact $${Math.round(estRevenueImpact).toLocaleString()}.`,
    generated_by: "growth-loop-phase8",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: Row = {};
  try { body = await req.json(); } catch {}
  const action = String(body?.action ?? "run");

  if (action === "snapshot") {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await sb.from("ai_executive_snapshots")
      .select("*").eq("generated_by", "growth-loop-phase8")
      .order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, snapshot: data });
  }

  const ctx = await authorize(req, body);
  if (!ctx) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const snap = await buildSnapshot(ctx.sb);
    const { data, error } = await ctx.sb.from("ai_executive_snapshots").insert({
      snapshot_date: new Date().toISOString().slice(0, 10),
      ...snap,
    }).select("id, generated_at").maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, id: data?.id, generated_at: data?.generated_at, summary: snap.ai_summary, growth_score: snap.revenue_health.growth_score });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});