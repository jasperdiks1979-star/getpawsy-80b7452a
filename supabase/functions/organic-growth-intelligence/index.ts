// organic-growth-intelligence — Layer-1 truth envelope for the Organic
// Growth Intelligence Center. Reads ONLY from canonical sources:
//   • canonical_sessions_traffic_class  (classification truth)
//   • canonical_events                  (funnel + revenue truth)
//   • canonical_traffic_class_funnel_24h (pre-agg 24h)
//   • v_organic_product_ranking_30d     (product leaderboard)
//   • v_organic_pin_ranking_30d         (pin leaderboard)
//
// No new classifiers. No new attribution. No fabricated data. Everything
// that isn't in the canonical layer is emitted as { status: "not_connected" }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Window = "24h" | "7d" | "30d";
const WINDOWS: Record<Window, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

// Canonical platform buckets. Never re-classify; only bucket the
// canonical `traffic_platform` string.
const ORGANIC_PLATFORMS = [
  "google", "pinterest", "tiktok", "facebook", "instagram", "reddit",
  "linkedin", "youtube", "bing", "duckduckgo", "yahoo", "referral",
  "direct", "unknown",
];
const PAID_PLATFORMS = ["google", "pinterest", "tiktok", "meta", "microsoft", "other"];

function bucketPlatform(p: string | null | undefined): string {
  const s = (p || "unknown").toLowerCase();
  if (ORGANIC_PLATFORMS.includes(s)) return s;
  if (s === "facebook" || s === "instagram" || s === "meta") return s;
  return "unknown";
}

interface SessRow {
  session_id: string;
  visitor_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  country: string | null;
  traffic_class: string;
  traffic_platform: string | null;
  paid_flag: boolean;
  organic_flag: boolean;
  bot_flag: boolean;
  internal_flag: boolean;
  attribution_confidence: number | null;
}

interface EvtRow {
  session_id: string | null;
  canonical_name: string;
  value_cents: number | null;
  page_path: string | null;
  product_id: string | null;
  occurred_at: string;
}

async function loadWindow(supabase: any, hours: number) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  // Canonical sessions (already excludes nothing — we filter flags in code)
  const { data: sessions, error: sErr } = await supabase
    .from("canonical_sessions_traffic_class")
    .select("session_id,visitor_id,first_seen_at,last_seen_at,country,traffic_class,traffic_platform,paid_flag,organic_flag,bot_flag,internal_flag,attribution_confidence")
    .gte("first_seen_at", since)
    .limit(50000);
  if (sErr) throw sErr;

  const clean: SessRow[] = (sessions || []).filter(
    (r: SessRow) => !r.bot_flag && !r.internal_flag,
  );
  const ids = clean.map((s) => s.session_id);

  // Events per session (paged)
  const events: EvtRow[] = [];
  const PAGE = 1000;
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("canonical_events")
      .select("session_id,canonical_name,value_cents,page_path,product_id,occurred_at")
      .in("session_id", slice);
    if (error) throw error;
    if (data) events.push(...(data as EvtRow[]));
  }
  return { sessions: clean, events };
}

interface ChannelAgg {
  platform: string;
  is_organic: boolean;
  is_paid: boolean;
  sessions: number;
  visitors: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  revenue_cents: number;
  attribution_confidence_sum: number;
  attribution_confidence_n: number;
}

function aggregate(sessions: SessRow[], events: EvtRow[]) {
  const bySession = new Map<string, EvtRow[]>();
  for (const e of events) {
    if (!e.session_id) continue;
    const arr = bySession.get(e.session_id) || [];
    arr.push(e);
    bySession.set(e.session_id, arr);
  }

  const channels = new Map<string, ChannelAgg>();
  const visitorsByChannel = new Map<string, Set<string>>();
  let totalSessions = 0, totalVisitors = new Set<string>();
  let totalPV = 0, totalPRV = 0, totalATC = 0, totalCHK = 0, totalPURCH = 0, totalREV = 0;
  let confSum = 0, confN = 0;

  const attribution = { organic: 0, paid: 0, blended: 0, heuristic: 0, insufficient_data: 0 };

  for (const s of sessions) {
    const p = bucketPlatform(s.traffic_platform);
    const isOrg = !!s.organic_flag;
    const isPaid = !!s.paid_flag;
    const key = `${p}::${isPaid ? "paid" : isOrg ? "organic" : "unknown"}`;
    let agg = channels.get(key);
    if (!agg) {
      agg = {
        platform: p, is_organic: isOrg, is_paid: isPaid,
        sessions: 0, visitors: 0, product_views: 0, add_to_cart: 0,
        checkout_started: 0, purchases: 0, revenue_cents: 0,
        attribution_confidence_sum: 0, attribution_confidence_n: 0,
      };
      channels.set(key, agg);
      visitorsByChannel.set(key, new Set());
    }
    agg.sessions++;
    if (s.visitor_id) visitorsByChannel.get(key)!.add(s.visitor_id);
    if (s.attribution_confidence != null) {
      agg.attribution_confidence_sum += Number(s.attribution_confidence);
      agg.attribution_confidence_n++;
      confSum += Number(s.attribution_confidence);
      confN++;
    }
    totalSessions++;
    if (s.visitor_id) totalVisitors.add(s.visitor_id);

    // classification_reason isn't returned to keep payload small; classify by flags
    const conf = Number(s.attribution_confidence || 0);
    if (conf < 0.4) attribution.insufficient_data++;
    else if (isOrg && isPaid) attribution.blended++;
    else if (isPaid) attribution.paid++;
    else if (isOrg) attribution.organic++;
    else attribution.heuristic++;

    const evs = bySession.get(s.session_id) || [];
    for (const e of evs) {
      switch (e.canonical_name) {
        case "CANONICAL_PAGE_VIEW": totalPV++; break;
        case "CANONICAL_PRODUCT_VIEW":
          agg.product_views++; totalPRV++; break;
        case "CANONICAL_ADD_TO_CART":
          agg.add_to_cart++; totalATC++; break;
        case "CANONICAL_CHECKOUT":
          agg.checkout_started++; totalCHK++; break;
        case "CANONICAL_PURCHASE":
          agg.purchases++; totalPURCH++;
          if (e.value_cents) { agg.revenue_cents += e.value_cents; totalREV += e.value_cents; }
          break;
      }
    }
  }

  for (const [k, agg] of channels) {
    agg.visitors = visitorsByChannel.get(k)!.size;
  }

  return {
    totals: {
      sessions: totalSessions,
      visitors: totalVisitors.size,
      page_views: totalPV,
      product_views: totalPRV,
      add_to_cart: totalATC,
      checkout_started: totalCHK,
      purchases: totalPURCH,
      revenue_cents: totalREV,
      conversion_rate: totalSessions ? totalPURCH / totalSessions : 0,
      avg_attribution_confidence: confN ? confSum / confN : 0,
    },
    channels: [...channels.values()],
    attribution,
  };
}

function organicOnly(totals: ReturnType<typeof aggregate>["totals"], channels: ChannelAgg[]) {
  const org = channels.filter((c) => c.is_organic && !c.is_paid);
  const sum = (fn: (c: ChannelAgg) => number) => org.reduce((a, c) => a + fn(c), 0);
  return {
    sessions: sum((c) => c.sessions),
    visitors: sum((c) => c.visitors),
    product_views: sum((c) => c.product_views),
    add_to_cart: sum((c) => c.add_to_cart),
    checkout_started: sum((c) => c.checkout_started),
    purchases: sum((c) => c.purchases),
    revenue_cents: sum((c) => c.revenue_cents),
    conversion_rate: (() => {
      const s = sum((c) => c.sessions); return s ? sum((c) => c.purchases) / s : 0;
    })(),
    avg_attribution_confidence: totals.avg_attribution_confidence,
  };
}

function topLandingPages(events: EvtRow[], sessions: SessRow[]) {
  const orgSessions = new Set(sessions.filter((s) => s.organic_flag && !s.paid_flag).map((s) => s.session_id));
  const pages = new Map<string, { sessions: Set<string>; purchases: number; revenue_cents: number; product_views: number; atc: number }>();
  for (const e of events) {
    if (!e.session_id || !orgSessions.has(e.session_id)) continue;
    if (e.canonical_name !== "CANONICAL_PAGE_VIEW" || !e.page_path) continue;
    const cur = pages.get(e.page_path) || { sessions: new Set(), purchases: 0, revenue_cents: 0, product_views: 0, atc: 0 };
    cur.sessions.add(e.session_id);
    pages.set(e.page_path, cur);
  }
  // enrich with per-page purchase/atc counts (best-effort via last page seen)
  for (const e of events) {
    if (!e.session_id || !orgSessions.has(e.session_id) || !e.page_path) continue;
    const cur = pages.get(e.page_path);
    if (!cur) continue;
    if (e.canonical_name === "CANONICAL_ADD_TO_CART") cur.atc++;
    else if (e.canonical_name === "CANONICAL_PRODUCT_VIEW") cur.product_views++;
    else if (e.canonical_name === "CANONICAL_PURCHASE") { cur.purchases++; cur.revenue_cents += e.value_cents || 0; }
  }
  return [...pages.entries()]
    .map(([path, v]) => ({
      path,
      sessions: v.sessions.size,
      product_views: v.product_views,
      add_to_cart: v.atc,
      purchases: v.purchases,
      revenue_cents: v.revenue_cents,
      conversion_rate: v.sessions.size ? v.purchases / v.sessions.size : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 15);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [w24, w7d, w30d, prod, pin, funnel24] = await Promise.all([
      loadWindow(supabase, WINDOWS["24h"]),
      loadWindow(supabase, WINDOWS["7d"]),
      loadWindow(supabase, WINDOWS["30d"]),
      supabase.from("v_organic_product_ranking_30d").select("*").order("organic_rank_score", { ascending: false }).limit(25),
      supabase.from("v_organic_pin_ranking_30d").select("*").order("organic_rank_score", { ascending: false }).limit(25),
      supabase.from("canonical_traffic_class_funnel_24h").select("*"),
    ]);

    const agg24 = aggregate(w24.sessions, w24.events);
    const agg7d = aggregate(w7d.sessions, w7d.events);
    const agg30d = aggregate(w30d.sessions, w30d.events);

    // Yesterday window (24h..48h ago) for delta vs previous day.
    const nowMs = Date.now();
    const yStart = new Date(nowMs - 48 * 3600_000).toISOString();
    const yEnd = new Date(nowMs - 24 * 3600_000).toISOString();
    const { data: ySessions } = await supabase
      .from("canonical_sessions_traffic_class")
      .select("session_id,visitor_id,first_seen_at,last_seen_at,country,traffic_class,traffic_platform,paid_flag,organic_flag,bot_flag,internal_flag,attribution_confidence")
      .gte("first_seen_at", yStart).lt("first_seen_at", yEnd).limit(50000);
    const yClean: SessRow[] = (ySessions || []).filter((r: SessRow) => !r.bot_flag && !r.internal_flag);
    const yIds = yClean.map((s) => s.session_id);
    const yEvts: EvtRow[] = [];
    for (let i = 0; i < yIds.length; i += 1000) {
      const { data } = await supabase
        .from("canonical_events")
        .select("session_id,canonical_name,value_cents,page_path,product_id,occurred_at")
        .in("session_id", yIds.slice(i, i + 1000));
      if (data) yEvts.push(...(data as EvtRow[]));
    }
    const aggYest = aggregate(yClean, yEvts);

    const organic24 = organicOnly(agg24.totals, agg24.channels);
    const organicYest = organicOnly(aggYest.totals, aggYest.channels);
    const organic7d = organicOnly(agg7d.totals, agg7d.channels);
    const organic30d = organicOnly(agg30d.totals, agg30d.channels);

    const pctDelta = (curr: number, prev: number) =>
      prev === 0 ? (curr === 0 ? 0 : null) : (curr - prev) / prev;

    // Insights & recommendations — evidence-backed only.
    const insights: Array<{ text: string; evidence: string; confidence: number; sample_size: number }> = [];
    const recommendations: Array<{ text: string; evidence_source: string; confidence: number; sample_size: number; freshness: string }> = [];

    const orgChannels30 = agg30d.channels.filter((c) => c.is_organic && !c.is_paid);
    const totalOrgSess30 = orgChannels30.reduce((a, c) => a + c.sessions, 0);
    for (const c of orgChannels30) {
      if (c.sessions < 30) continue;
      const share = totalOrgSess30 ? c.sessions / totalOrgSess30 : 0;
      if (share >= 0.5) {
        insights.push({
          text: `${c.platform} contributes ${(share * 100).toFixed(0)}% of all organic sessions (30d).`,
          evidence: "canonical_sessions_traffic_class",
          confidence: 0.95, sample_size: c.sessions,
        });
      }
    }
    const dYest = pctDelta(organic24.sessions, organicYest.sessions);
    if (dYest != null && Math.abs(dYest) >= 0.2 && (organic24.sessions + organicYest.sessions) >= 40) {
      insights.push({
        text: `Organic sessions ${dYest >= 0 ? "up" : "down"} ${(Math.abs(dYest) * 100).toFixed(0)}% vs yesterday.`,
        evidence: "canonical_sessions_traffic_class",
        confidence: 0.9, sample_size: organic24.sessions + organicYest.sessions,
      });
    }
    // Recommendation: top organic product with strong evidence
    if (prod.data && prod.data.length > 0) {
      const top = prod.data[0] as any;
      if ((top.organic_sessions || 0) >= 30) {
        recommendations.push({
          text: `Amplify content around product ${top.product_id} — leading organic driver (30d).`,
          evidence_source: "organic",
          confidence: 0.9,
          sample_size: top.organic_sessions,
          freshness: new Date().toISOString(),
        });
      }
    }

    const envelope = {
      ok: true,
      generated_at: new Date().toISOString(),
      windows: {
        "24h": { totals_all: agg24.totals, organic: organic24, attribution: agg24.attribution, channels: agg24.channels, top_landing_pages: topLandingPages(w24.events, w24.sessions) },
        "7d": { totals_all: agg7d.totals, organic: organic7d, attribution: agg7d.attribution, channels: agg7d.channels },
        "30d": { totals_all: agg30d.totals, organic: organic30d, attribution: agg30d.attribution, channels: agg30d.channels },
      },
      deltas: {
        vs_yesterday: {
          sessions: pctDelta(organic24.sessions, organicYest.sessions),
          visitors: pctDelta(organic24.visitors, organicYest.visitors),
          purchases: pctDelta(organic24.purchases, organicYest.purchases),
          revenue_cents: pctDelta(organic24.revenue_cents, organicYest.revenue_cents),
        },
        vs_7d_avg: {
          sessions: pctDelta(organic24.sessions, organic7d.sessions / 7),
          purchases: pctDelta(organic24.purchases, organic7d.purchases / 7),
          revenue_cents: pctDelta(organic24.revenue_cents, organic7d.revenue_cents / 7),
        },
        vs_30d_avg: {
          sessions: pctDelta(organic24.sessions, organic30d.sessions / 30),
          purchases: pctDelta(organic24.purchases, organic30d.purchases / 30),
          revenue_cents: pctDelta(organic24.revenue_cents, organic30d.revenue_cents / 30),
        },
      },
      leaderboard: {
        top_products: prod.data ?? [],
        top_pins: pin.data ?? [],
      },
      funnel_24h: funnel24.data ?? [],
      insights,
      recommendations,
      adapters: {
        google_search_console: { status: "not_connected", note: "Connect GSC to unlock impressions / queries / avg position." },
        google_merchant_center: { status: "not_connected" },
        google_ads: { status: "not_connected" },
        pinterest_ads: { status: "not_connected" },
        microsoft_clarity: { status: "not_connected" },
        bing_webmaster: { status: "not_connected" },
        ga4_comparison: { status: "not_connected" },
      },
      seo_health: { status: "not_tracked", note: "SEO scanner integration pending — no fabricated numbers." },
    };

    return new Response(JSON.stringify(envelope), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});