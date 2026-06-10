// Pinterest Revenue AI V5 — unified learn/score/forecast orchestrator.
// Extends V4 (pinterest-revenue-engine-loop) — does NOT replace it.
// Actions: learn, score_visitors, rank_opportunities, forecast, dashboard, loop, backfill, health_check

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Json = Record<string, unknown>;

function ok(body: Json) {
  return new Response(JSON.stringify({ ok: true, traceId: crypto.randomUUID(), ...body }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(message: string, status = 500) {
  return new Response(JSON.stringify({ ok: false, traceId: crypto.randomUUID(), message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Phase 2: score Pinterest visitor sessions ----------
async function scoreVisitors(opts?: { sinceIso?: string; untilIso?: string; replace?: boolean; limit?: number }) {
  const sinceIso = opts?.sinceIso ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const untilIso = opts?.untilIso ?? new Date().toISOString();
  const limit = Math.min(opts?.limit ?? 5000, 20000);
  let query = sb
    .from("visitor_activity")
    .select("session_id,created_at,country,region,city,utm_source,utm_campaign,utm_content,landing_page,page_path,event_type,product_id,product_slug,revenue_cents,session_duration_seconds")
    .ilike("utm_source", "%pinterest%")
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso)
    .limit(limit);
  const { data: visits, error } = await query;
  if (error) throw error;

  const bySession = new Map<string, any>();
  for (const v of visits ?? []) {
    const key = String(v.session_id || `${v.created_at}_${v.landing_page}`);
    const cur = bySession.get(key) ?? {
      session_key: key,
      visited_at: v.created_at,
      country: v.country, region: v.region, city: v.city,
      product_id: null, product_slug: null,
      board_id: null, pin_id: null, keyword: null, creative_style: null, hook_category: null,
      page_views: 0, atc_count: 0, checkout_count: 0, purchase_count: 0,
      revenue_cents: 0, session_seconds: 0,
    };
    cur.page_views += 1;
    if (v.product_id && !cur.product_id) cur.product_id = v.product_id;
    if (v.product_slug && !cur.product_slug) cur.product_slug = v.product_slug;
    if (v.event_type === "add_to_cart") cur.atc_count += 1;
    if (v.event_type === "begin_checkout") cur.checkout_count += 1;
    if (v.event_type === "purchase") cur.purchase_count += 1;
    cur.revenue_cents += Number(v.revenue_cents || 0);
    cur.session_seconds = Math.max(cur.session_seconds, Number(v.session_duration_seconds || 0));
    // Extract pin/board from utm_content (format: pin_<id>_board_<id>)
    if (v.utm_content) {
      const m = String(v.utm_content).match(/pin[_-]?([a-z0-9]+)/i);
      if (m && !cur.pin_id) cur.pin_id = m[1];
      const b = String(v.utm_content).match(/board[_-]?([a-z0-9]+)/i);
      if (b && !cur.board_id) cur.board_id = b[1];
    }
    if (v.utm_campaign && !cur.keyword) cur.keyword = String(v.utm_campaign).slice(0, 120);
    bySession.set(key, cur);
  }

  const rows = Array.from(bySession.values()).map((s) => {
    // Revenue score: actual revenue dominates; ATC and checkout count as soft signals
    const revenueScore = (s.revenue_cents / 100) * 10 + s.purchase_count * 50 + s.checkout_count * 8 + s.atc_count * 3;
    // Traffic quality: pages × time, capped
    const qualityScore = Math.min(100, s.page_views * 8 + Math.min(s.session_seconds, 300) / 6);
    // Buyer intent: explicit conversion signals
    const intentScore = Math.min(100, s.atc_count * 25 + s.checkout_count * 50 + s.purchase_count * 100);
    return { ...s, revenue_score: revenueScore, traffic_quality_score: qualityScore, buyer_intent_score: intentScore };
  });

  if (rows.length === 0) return { scored: 0, window: { sinceIso, untilIso } };

  // For backfills we replace prior rows in the window to stay idempotent.
  if (opts?.replace) {
    const { error: delErr } = await sb
      .from("pinterest_visitor_revenue_scores")
      .delete()
      .gte("visited_at", sinceIso)
      .lt("visited_at", untilIso);
    if (delErr) throw delErr;
  }

  // Chunked insert to avoid payload limits on large historical windows.
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insErr } = await sb
      .from("pinterest_visitor_revenue_scores")
      .insert(rows.slice(i, i + 500));
    if (insErr) throw insErr;
  }
  return { scored: rows.length, window: { sinceIso, untilIso }, replaced: !!opts?.replace };
}

// ---------- Backfill: walk historical visitor_activity day-by-day ----------
// Idempotent: deletes existing scored rows per day before re-inserting.
// After the walk, re-runs ranking + forecasting so dashboards reflect
// the corrected geo+intent attribution.
async function backfill(opts?: { days?: number; sinceIso?: string; untilIso?: string }) {
  const days = Math.min(Math.max(opts?.days ?? 90, 1), 365);
  const until = opts?.untilIso ? new Date(opts.untilIso) : new Date();
  const since = opts?.sinceIso ? new Date(opts.sinceIso) : new Date(until.getTime() - days * 86400 * 1000);
  // Snap to midnight UTC so day windows align.
  since.setUTCHours(0, 0, 0, 0);
  until.setUTCHours(0, 0, 0, 0);

  const perDay: Array<{ day: string; scored: number; error?: string }> = [];
  let totalScored = 0;

  for (let t = since.getTime(); t < until.getTime(); t += 86400 * 1000) {
    const dayStart = new Date(t).toISOString();
    const dayEnd = new Date(t + 86400 * 1000).toISOString();
    try {
      const r = await scoreVisitors({ sinceIso: dayStart, untilIso: dayEnd, replace: true, limit: 20000 });
      totalScored += r.scored;
      perDay.push({ day: dayStart.slice(0, 10), scored: r.scored });
    } catch (e) {
      perDay.push({ day: dayStart.slice(0, 10), scored: 0, error: String((e as Error).message || e) });
    }
  }

  // Re-rank + re-forecast with the corrected history.
  let ranked = 0, forecasted = 0;
  const errors: Record<string, string> = {};
  try { ranked = (await rankOpportunities()).ranked ?? 0; } catch (e) { errors.rank = String(e); }
  try { forecasted = (await forecast()).forecasted ?? 0; } catch (e) { errors.forecast = String(e); }

  return {
    backfilled: true,
    window: { sinceIso: since.toISOString(), untilIso: until.toISOString(), days: Math.round((until.getTime() - since.getTime()) / 86400000) },
    totalScored,
    perDay,
    ranked,
    forecasted,
    errors: Object.keys(errors).length ? errors : undefined,
  };
}

// ---------- Phase 3+8: unified opportunity ranking ----------
async function rankOpportunities() {
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  // Rank products by revenue_cents from visitor scores
  const { data: visits } = await sb
    .from("pinterest_visitor_revenue_scores")
    .select("product_id,product_slug,board_id,keyword,country,revenue_cents,page_views,buyer_intent_score")
    .gte("visited_at", since)
    .limit(20000);

  const agg = new Map<string, { type: string; key: string; revenue: number; clicks: number; us: number; conv: number; total: number }>();
  const bump = (type: string, key: string | null, v: any) => {
    if (!key) return;
    const k = `${type}:${key}`;
    const cur = agg.get(k) ?? { type, key, revenue: 0, clicks: 0, us: 0, conv: 0, total: 0 };
    cur.revenue += Number(v.revenue_cents || 0);
    cur.clicks += 1;
    cur.total += 1;
    if (v.country === "US") cur.us += 1;
    if (v.buyer_intent_score > 0) cur.conv += 1;
    agg.set(k, cur);
  };
  for (const v of visits ?? []) {
    bump("product", v.product_id || v.product_slug, v);
    bump("board", v.board_id, v);
    bump("keyword", v.keyword, v);
  }

  // Group by type and percentile rank
  const byType = new Map<string, any[]>();
  for (const row of agg.values()) {
    const arr = byType.get(row.type) ?? [];
    arr.push(row);
    byType.set(row.type, arr);
  }

  const rows: any[] = [];
  for (const [type, arr] of byType) {
    arr.sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks);
    const n = arr.length;
    arr.forEach((r, i) => {
      const pct = n > 1 ? 1 - i / (n - 1) : 1;
      let tier: string;
      if (r.clicks < 5) tier = "untested";
      else if (pct >= 0.8) tier = "winner";
      else if (pct <= 0.2) tier = "loser";
      else tier = "neutral";
      const usShare = r.total > 0 ? r.us / r.total : 0;
      const conversionRate = r.clicks > 0 ? r.conv / r.clicks : 0;
      const score = Math.round(r.revenue / 10 + r.clicks * 2 + usShare * 30 + conversionRate * 50);
      rows.push({
        entity_type: type, entity_key: String(r.key).slice(0, 200),
        opportunity_score: score, rank_tier: tier, rank_percentile: pct,
        revenue_cents_30d: Math.round(r.revenue), clicks_30d: r.clicks,
        ctr_30d: 0, us_share_30d: usShare, conversion_rate_30d: conversionRate,
        metadata: {}, scored_at: new Date().toISOString(),
      });
    });
  }

  if (rows.length === 0) return { ranked: 0 };
  // Upsert in chunks
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from("pinterest_opportunity_ranks").upsert(chunk, { onConflict: "entity_type,entity_key" });
    if (error) throw error;
  }
  return { ranked: rows.length, byType: Object.fromEntries(Array.from(byType.entries()).map(([k, v]) => [k, v.length])) };
}

// ---------- Phase 12: forecast (EWMA over 30d) ----------
async function forecast() {
  const { data: ranks } = await sb
    .from("pinterest_opportunity_ranks")
    .select("entity_type,entity_key,revenue_cents_30d,clicks_30d,conversion_rate_30d,us_share_30d,rank_tier")
    .in("entity_type", ["product", "board", "keyword"])
    .limit(2000);

  const rows: any[] = [];
  for (const r of ranks ?? []) {
    if (!r.clicks_30d || r.clicks_30d < 3) continue;
    const dailyClicks = r.clicks_30d / 30;
    const dailyRev = (r.revenue_cents_30d || 0) / 30;
    const trendBoost = r.rank_tier === "winner" ? 1.25 : r.rank_tier === "loser" ? 0.6 : 1.0;
    const conf = Math.min(1, r.clicks_30d / 200);
    for (const h of [7, 30]) {
      rows.push({
        entity_type: r.entity_type, entity_key: r.entity_key, horizon_days: h,
        expected_impressions: Math.round(dailyClicks * h * 30 * trendBoost),
        expected_clicks: Math.round(dailyClicks * h * trendBoost),
        expected_conversions: Math.round(dailyClicks * h * trendBoost * (r.conversion_rate_30d || 0)),
        expected_revenue_cents: Math.round(dailyRev * h * trendBoost),
        confidence: conf, model: "ewma_v1", basis_days: 30,
        rising: r.rank_tier === "winner",
        computed_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length === 0) return { forecasted: 0 };
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from("pinterest_forecasts").upsert(chunk, { onConflict: "entity_type,entity_key,horizon_days" });
    if (error) throw error;
  }
  return { forecasted: rows.length };
}

// ---------- Phase 11: dashboard ----------
async function dashboard() {
  const [ranks, forecasts, usDaily, visitors] = await Promise.all([
    sb.from("pinterest_opportunity_ranks").select("*").order("opportunity_score", { ascending: false }).limit(50),
    sb.from("pinterest_forecasts").select("*").eq("horizon_days", 30).order("expected_revenue_cents", { ascending: false }).limit(50),
    sb.from("pinterest_us_share_daily").select("*").order("day", { ascending: false }).limit(14),
    sb.from("pinterest_visitor_revenue_scores").select("country,region,city,revenue_cents,buyer_intent_score").gte("visited_at", new Date(Date.now() - 30 * 86400 * 1000).toISOString()).limit(5000),
  ]);

  // Geo aggregation
  const byState = new Map<string, { state: string; clicks: number; revenue: number }>();
  const byCity = new Map<string, { city: string; clicks: number; revenue: number }>();
  let usClicks = 0, totalClicks = 0;
  for (const v of visitors.data ?? []) {
    totalClicks++;
    if (v.country === "US") {
      usClicks++;
      if (v.region) {
        const c = byState.get(v.region) ?? { state: v.region, clicks: 0, revenue: 0 };
        c.clicks++; c.revenue += Number(v.revenue_cents || 0); byState.set(v.region, c);
      }
      if (v.city) {
        const k = `${v.city}, ${v.region ?? ""}`;
        const c = byCity.get(k) ?? { city: k, clicks: 0, revenue: 0 };
        c.clicks++; c.revenue += Number(v.revenue_cents || 0); byCity.set(k, c);
      }
    }
  }

  return {
    summary: {
      usShare: totalClicks > 0 ? usClicks / totalClicks : 0,
      totalPinterestVisitors30d: totalClicks,
      usVisitors30d: usClicks,
    },
    topProducts: (ranks.data ?? []).filter((r: any) => r.entity_type === "product").slice(0, 20),
    topBoards: (ranks.data ?? []).filter((r: any) => r.entity_type === "board").slice(0, 20),
    topKeywords: (ranks.data ?? []).filter((r: any) => r.entity_type === "keyword").slice(0, 20),
    forecasts30d: forecasts.data ?? [],
    usDaily: usDaily.data ?? [],
    byState: Array.from(byState.values()).sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks).slice(0, 20),
    byCity: Array.from(byCity.values()).sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks).slice(0, 20),
  };
}

// ---------- Full loop: chain V4 loop + V5 scoring/forecasting ----------
async function loop() {
  const report: Json = { startedAt: new Date().toISOString() };
  try {
    // 1. Run V4 loop (US snapshot + board scoring + tiering + keyword/title expansion)
    const v4 = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-revenue-engine-loop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "loop" }),
    }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    report.v4_loop = v4;
  } catch (e) {
    report.v4_loop_error = String(e);
  }
  try { report.score_visitors = await scoreVisitors(); } catch (e) { report.score_visitors_error = String(e); }
  try { report.rank_opportunities = await rankOpportunities(); } catch (e) { report.rank_error = String(e); }
  try { report.forecast = await forecast(); } catch (e) { report.forecast_error = String(e); }
  report.finishedAt = new Date().toISOString();
  try { report.health_check = await healthCheck(report); } catch (e) { report.health_check_error = String(e); }
  return report;
}

// ---------- Health checks + alerting ----------
type StageAlert = {
  alert_key: string;
  severity: "P1" | "P2";
  category: string;
  title: string;
  description: string;
  affected_urls: string[];
  suggested_fix: string;
};

async function emitAlerts(alerts: StageAlert[], allKeys: string[]) {
  const { data: existing } = await sb
    .from("monitoring_alerts")
    .select("alert_key")
    .eq("is_active", true)
    .like("alert_key", "pinterest_revenue_ai:%");
  const existingKeys = new Set((existing ?? []).map((r: any) => r.alert_key));
  const activeKeys = new Set(alerts.map((a) => a.alert_key));

  for (const a of alerts) {
    await sb.from("monitoring_alerts").upsert({
      ...a,
      last_detected_at: new Date().toISOString(),
      is_active: true,
      resolved_at: null,
      notification_sent: existingKeys.has(a.alert_key),
    }, { onConflict: "alert_key" });
  }

  // Auto-resolve previously-active alerts that didn't fire this run
  const toResolve = allKeys.filter((k) => existingKeys.has(k) && !activeKeys.has(k));
  if (toResolve.length) {
    await sb.from("monitoring_alerts")
      .update({ is_active: false, resolved_at: new Date().toISOString() })
      .in("alert_key", toResolve);
  }

  return { fired: alerts.map((a) => a.alert_key), resolved: toResolve };
}

async function healthCheck(loopReport?: Json) {
  const alerts: StageAlert[] = [];
  const KEYS = {
    sync:      "pinterest_revenue_ai:v4_sync",
    score:     "pinterest_revenue_ai:score_visitors",
    rank:      "pinterest_revenue_ai:rank_opportunities",
    forecast:  "pinterest_revenue_ai:forecast",
    publish:   "pinterest_revenue_ai:publishing",
    backlog:   "pinterest_revenue_ai:publish_backlog",
    rejection: "pinterest_revenue_ai:high_rejection_rate",
    usShare:   "pinterest_revenue_ai:us_share_low",
    stale:     "pinterest_revenue_ai:loop_stale",
  };
  const allKeys = Object.values(KEYS);

  // 1. V4 sync stage
  const v4 = (loopReport?.v4_loop as any) ?? null;
  if (loopReport && (loopReport.v4_loop_error || (v4 && v4.ok === false) || (v4 && v4.error))) {
    alerts.push({
      alert_key: KEYS.sync, severity: "P1", category: "pinterest_revenue_ai",
      title: "Revenue AI: V4 sync loop failed",
      description: String(loopReport.v4_loop_error || v4?.message || v4?.error || "pinterest-revenue-engine-loop returned an error"),
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Inspect pinterest-revenue-engine-loop logs. Re-run via /admin/revenue-ai → Run loop now.",
    });
  }

  // 2. score_visitors
  if (loopReport?.score_visitors_error) {
    alerts.push({
      alert_key: KEYS.score, severity: "P1", category: "pinterest_revenue_ai",
      title: "Revenue AI: visitor scoring failed",
      description: String(loopReport.score_visitors_error),
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Check pinterest-revenue-ai logs (action=score_visitors). Verify visitor_activity ingest.",
    });
  } else {
    // Detect abnormal: recent Pinterest visitor_activity exists but 0 scored rows in last 24h
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ count: rawCount }, { count: scoredCount }] = await Promise.all([
      sb.from("visitor_activity").select("session_id", { count: "exact", head: true })
        .gte("created_at", since).ilike("utm_source", "%pinterest%"),
      sb.from("pinterest_visitor_revenue_scores").select("id", { count: "exact", head: true })
        .gte("created_at", since),
    ]);
    if ((rawCount ?? 0) >= 25 && (scoredCount ?? 0) === 0) {
      alerts.push({
        alert_key: KEYS.score, severity: "P1", category: "pinterest_revenue_ai",
        title: "Revenue AI: 0 visitor scores in 24h despite Pinterest traffic",
        description: `visitor_activity has ${rawCount} Pinterest sessions in last 24h but pinterest_visitor_revenue_scores has 0. Scoring pipeline is stalled.`,
        affected_urls: ["/admin/revenue-ai"],
        suggested_fix: "Run pinterest-revenue-ai?action=backfill&days=2 and inspect logs.",
      });
    }
  }

  // 3. rank_opportunities
  if (loopReport?.rank_error) {
    alerts.push({
      alert_key: KEYS.rank, severity: "P1", category: "pinterest_revenue_ai",
      title: "Revenue AI: opportunity ranking failed",
      description: String(loopReport.rank_error),
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Check pinterest-revenue-ai logs (action=rank_opportunities).",
    });
  } else {
    const { count } = await sb.from("pinterest_opportunity_ranks")
      .select("id", { count: "exact", head: true })
      .gte("updated_at", new Date(Date.now() - 12 * 3600 * 1000).toISOString());
    if ((count ?? 0) === 0) {
      alerts.push({
        alert_key: KEYS.rank, severity: "P2", category: "pinterest_revenue_ai",
        title: "Revenue AI: no opportunity ranks updated in 12h",
        description: "pinterest_opportunity_ranks has no rows updated in the last 12h. Ranking may be silently no-op'ing.",
        affected_urls: ["/admin/revenue-ai"],
        suggested_fix: "Invoke pinterest-revenue-ai?action=rank_opportunities and inspect output.",
      });
    }
  }

  // 4. forecast
  if (loopReport?.forecast_error) {
    alerts.push({
      alert_key: KEYS.forecast, severity: "P2", category: "pinterest_revenue_ai",
      title: "Revenue AI: forecasting failed",
      description: String(loopReport.forecast_error),
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Check pinterest-revenue-ai logs (action=forecast).",
    });
  } else {
    const { count } = await sb.from("pinterest_forecasts")
      .select("id", { count: "exact", head: true })
      .gte("generated_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if ((count ?? 0) === 0) {
      alerts.push({
        alert_key: KEYS.forecast, severity: "P2", category: "pinterest_revenue_ai",
        title: "Revenue AI: no forecasts generated in 24h",
        description: "pinterest_forecasts has no rows from the last 24h. Forecasting stage produced no output.",
        affected_urls: ["/admin/revenue-ai"],
        suggested_fix: "Invoke pinterest-revenue-ai?action=forecast and inspect output.",
      });
    }
  }

  // 5. Publishing health (last 24h)
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: q24 } = await sb
    .from("pinterest_pin_queue")
    .select("status")
    .gte("created_at", since24h);
  const counts: Record<string, number> = {};
  for (const r of q24 ?? []) counts[(r as any).status] = (counts[(r as any).status] ?? 0) + 1;
  const posted = counts.posted ?? 0;
  const rejected = counts.rejected ?? 0;
  const queued = counts.queued ?? 0;
  const total = (q24 ?? []).length;

  if (total >= 20 && posted === 0) {
    alerts.push({
      alert_key: KEYS.publish, severity: "P1", category: "pinterest_revenue_ai",
      title: "Revenue AI: 0 pins published in last 24h",
      description: `pinterest_pin_queue has ${total} rows in 24h but 0 posted (queued=${queued}, rejected=${rejected}). Publisher is down.`,
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Check pinterest-publish / pinterest-growth-engine logs and OAuth status.",
    });
  }
  if (queued >= 200) {
    alerts.push({
      alert_key: KEYS.backlog, severity: "P2", category: "pinterest_revenue_ai",
      title: `Revenue AI: publish backlog (${queued} queued)`,
      description: `pinterest_pin_queue has ${queued} pins in 'queued' state created in the last 24h. Throughput is too low.`,
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Increase publisher cadence or inspect rate-limit / API errors.",
    });
  }
  if (total >= 50 && rejected / total > 0.6) {
    alerts.push({
      alert_key: KEYS.rejection, severity: "P2", category: "pinterest_revenue_ai",
      title: `Revenue AI: high rejection rate (${Math.round((rejected / total) * 100)}%)`,
      description: `${rejected} of ${total} pins rejected in last 24h. Likely creative/compliance issue.`,
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Inspect pinterest_pin_verdicts for top rejection reasons; tune creative director.",
    });
  }

  // 6. US share drop
  const dash = (loopReport as any)?.score_visitors ? null : await dashboard().catch(() => null);
  const usShare =
    (loopReport?.score_visitors as any)?.usShare ??
    dash?.summary?.usShare ?? null;
  const sample =
    (loopReport?.score_visitors as any)?.totalClicks ??
    dash?.summary?.totalPinterestVisitors30d ?? 0;
  if (usShare !== null && sample >= 100 && usShare < 0.4) {
    alerts.push({
      alert_key: KEYS.usShare, severity: "P2", category: "pinterest_revenue_ai",
      title: `Revenue AI: US share dropped to ${Math.round(usShare * 100)}%`,
      description: `US share is ${Math.round(usShare * 100)}% of ${sample} Pinterest visitors (target 80%, floor 40%).`,
      affected_urls: ["/admin/revenue-ai"],
      suggested_fix: "Re-tune US keyword bank / board allocation; verify priority category floor still active.",
    });
  }

  // 7. Loop staleness (no successful loop in >9h while cron runs every 6h)
  if (!loopReport) {
    const { data: lastForecast } = await sb
      .from("pinterest_forecasts")
      .select("generated_at")
      .order("generated_at", { ascending: false })
      .limit(1);
    const last = lastForecast?.[0]?.generated_at ? new Date(lastForecast[0].generated_at as string).getTime() : 0;
    if (Date.now() - last > 9 * 3600 * 1000) {
      alerts.push({
        alert_key: KEYS.stale, severity: "P1", category: "pinterest_revenue_ai",
        title: "Revenue AI: loop has not completed in >9h",
        description: `Last forecast generated_at = ${last ? new Date(last).toISOString() : "never"}. Cron may be failing.`,
        affected_urls: ["/admin/revenue-ai"],
        suggested_fix: "Trigger pinterest-revenue-ai?action=loop manually and inspect cron schedule 124.",
      });
    }
  }

  const result = await emitAlerts(alerts, allKeys);
  return { ...result, counts: { posted, rejected, queued, total }, usShare, sample };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as Json));
    const action = url.searchParams.get("action") || (body as Json).action as string || "dashboard";
    switch (action) {
      case "score_visitors": return ok(await scoreVisitors());
      case "rank_opportunities": return ok(await rankOpportunities());
      case "forecast": return ok(await forecast());
      case "dashboard": return ok(await dashboard());
      case "loop": return ok(await loop());
      case "health_check": return ok(await healthCheck());
      case "backfill": return ok(await backfill({
        days: Number(url.searchParams.get("days") ?? (body as any).days ?? 90),
        sinceIso: url.searchParams.get("since") ?? (body as any).since,
        untilIso: url.searchParams.get("until") ?? (body as any).until,
      }));
      default: return fail(`unknown action: ${action}`, 400);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
});