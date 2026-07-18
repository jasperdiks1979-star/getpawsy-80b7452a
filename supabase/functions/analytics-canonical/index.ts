// analytics-canonical — the ONE source of truth for every dashboard.
// (PR-3 redeploy marker — truth envelope must include sessions[])
// Reads `canonical_events` + `orders` (paid) with the Clean filter baked in,
// and enriches per-session geo/internal signals from `visitor_activity` so
// the truth envelope (`sessions[]`) can power maps and CSV exports without
// any dashboard re-querying `visitor_activity` for counter-producing metrics.
// Never expose raw or per-dashboard-specific counts elsewhere; every admin
// dashboard MUST consume this function via `useCanonicalFunnel`.
//
// Input (query or body): { hours?: number, geo?: 'US'|'all' }
//    hours defaults to 24, capped at 24*30.
//    geo   defaults to 'all'.
//
// Output: {
//   ok, window: { hours, since, until },
//   filter: { geo, clean: true },
//   totals: { visitors, sessions, page_views, product_views,
//             add_to_cart, view_cart, checkout_started, purchases,
//             revenue, currency, conversion_rate },
//   funnel: [{ stage, count }],
//   countries: [{ country, visitors, sessions, page_views, add_to_cart,
//                 checkout_started, purchases }],
//   sources:   [{ source, sessions }],
//   sessions:  [{ session_id, visitor_id, country, city, latitude, longitude,
//                 first_seen_at, last_seen_at, page_views, source, device,
//                 utm_source, utm_medium, utm_campaign, referrer, page_path,
//                 has_product_view, has_add_to_cart, has_view_cart,
//                 has_checkout, has_purchase, order_value, is_internal }],
//   sample_event: { ... } | null,   // one recent canonical event for debugging
// }
//
// Certification note (PR-1 analytics-truth): counter-producing surfaces
// (World Map counters, badges, CSV/Summary export, Clean Analytics Panel)
// MUST derive from `totals` + `sessions[]` — never from a parallel
// `visitor_activity` fetch. Enforced by `src/test/analytics-truth-parity.test.ts`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";
import { checkCanonicalV2Gate } from "../_shared/canonicalV2Flag.ts";
import {
  aggregateBuckets,
  classificationCoverage,
  totalsFromAggregate,
  type ClassifiableRow,
} from "../_shared/canonicalV2Buckets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Stage =
  | "CANONICAL_PAGE_VIEW"
  | "CANONICAL_PRODUCT_VIEW"
  | "CANONICAL_ADD_TO_CART"
  | "CANONICAL_CART"
  | "CANONICAL_CHECKOUT"
  | "CANONICAL_PURCHASE";

const STAGES: Stage[] = [
  "CANONICAL_PAGE_VIEW",
  "CANONICAL_PRODUCT_VIEW",
  "CANONICAL_ADD_TO_CART",
  "CANONICAL_CART",
  "CANONICAL_CHECKOUT",
  "CANONICAL_PURCHASE",
];

const US_VALUES = new Set([
  "us", "usa", "u.s.", "u.s.a.", "united states", "united states of america",
]);
const isUS = (c?: string | null) => !!c && US_VALUES.has(c.trim().toLowerCase());

function classifySource(row: { utm_source?: string | null; referrer?: string | null; utm_medium?: string | null }) {
  const us = (row.utm_source || "").toLowerCase();
  const um = (row.utm_medium || "").toLowerCase();
  const ref = (row.referrer || "").toLowerCase();
  if (us.includes("pinterest") || ref.includes("pinterest")) return "pinterest";
  if (us.includes("tiktok") || ref.includes("tiktok")) return "tiktok";
  if (us === "google" && (um === "cpc" || um === "paid")) return "google_ads";
  if (ref.includes("googleadservices") || /[?&](gclid|gbraid|wbraid)=/.test(ref)) return "google_ads";
  if (us === "google" || ref.includes("google.")) return "google_organic";
  if (us.includes("facebook") || us.includes("meta") || us.includes("instagram")) return "meta";
  if (us.includes("email") || us.includes("newsletter") || us.includes("klaviyo")) return "email";
  if (!ref && !us) return "direct";
  return "referral";
}

function parseInput(url: URL, body: any): { hours: number; geo: "US" | "all" } {
  const rawH = body?.hours ?? url.searchParams.get("hours");
  const rawG = body?.geo ?? url.searchParams.get("geo");
  let hours = Number(rawH);
  if (!Number.isFinite(hours) || hours <= 0) hours = 24;
  hours = Math.min(hours, 24 * 30);
  const geo = (rawG === "US" ? "US" : "all") as "US" | "all";
  return { hours, geo };
}

// Tiny in-memory cache; 30s TTL keyed on inputs.
const cache = new Map<string, { at: number; body: any }>();
const TTL_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const url = new URL(req.url);
    let body: any = null;
    if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }
    const { hours, geo } = parseInput(url, body);
    const envelope = (url.searchParams.get("envelope") || body?.envelope) === "v2" ? "v2" : "v1";
    const key = `${hours}|${geo}|${envelope}`;
    // Deploy marker to prove new bundle is live.
    (globalThis as any).__ac_deploy_marker = "phase4b-v2-3-atc-source";
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) {
      return new Response(JSON.stringify({ ...hit.body, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(now - hours * 3600_000).toISOString();
    const until = new Date(now).toISOString();

    // ── canonical_events ───────────────────────────────────────
    const events: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let q = supabase
        .from("canonical_events")
        .select("canonical_name,occurred_at,visitor_id,session_id,order_id,product_id,page_path,utm_source,utm_medium,utm_campaign,referrer,country,city,device")
        .gte("occurred_at", since)
        .lte("occurred_at", until)
        .order("occurred_at", { ascending: false })
        .range(from, from + PAGE - 1);
      // Do NOT filter canonical_events by `country = 'US'` here. The writer
      // stores mixed values (`US`, `USA`, `United States`) and many rows are
      // country-null until the visitor_activity geo enrichment below runs.
      // Geo filtering is applied after enrichment on the per-session truth set.
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      events.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from > 200_000) break;
    }

    // ── orders (paid) ──────────────────────────────────────────
    const { data: paidOrders, error: oErr } = await supabase
      .from("orders")
      .select("id,total_amount,currency,status,created_at,shipping_address,items,stripe_session_id,stripe_payment_intent_id")
      .in("status", ["paid", "completed"])
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(5000);
    if (oErr) throw oErr;
    let purchases = paidOrders ?? [];
    if (geo === "US") {
      purchases = purchases.filter((o: any) => {
        const c = o?.shipping_address?.country || o?.shipping_address?.country_code;
        return isUS(c);
      });
    }
    // ── Purchase semantics (v2 rule) ──────────────────────────────
    // Classify each paid/completed order as GENUINE or TEST_ORDER. A
    // genuine sale requires: real Stripe session, non-empty line items,
    // positive amount, and no explicit test marker (`test_` id prefix or
    // `is_test` flag). We DO NOT use a naïve minimum-order-value filter;
    // €1 with a real product still qualifies as genuine.
    function classifyOrder(o: any): "genuine" | "test" {
      const amount = Number(o?.total_amount || 0);
      const items = Array.isArray(o?.items) ? o.items : [];
      const ssid = String(o?.stripe_session_id || "");
      const piid = String(o?.stripe_payment_intent_id || "");
      const isTestGateway = ssid.startsWith("cs_test_") || piid.startsWith("pi_test_");
      const explicitTestFlag = o?.is_test === true || o?.test === true;
      if (explicitTestFlag) return "test";
      if (isTestGateway) return "test";
      if (items.length === 0) return "test"; // smoke test / zero-line-item
      if (amount <= 0) return "test";
      // Line-item level test markers. Internal/live-gateway validation
      // orders (e.g. `TEST-PAYMENT-VALIDATION`) share real Stripe live
      // sessions and one line item, so they slip past the gateway/empty
      // checks. Detect them by SKU id / product name markers.
      const TEST_RE = /(^|[-_\s])(test|smoke|canary|validation|qa|dev)(-payment|[-_\s]|$)/i;
      const looksTest = items.some((it: any) => {
        const id = String(it?.id ?? "");
        const name = String(it?.name ?? "");
        const sku = String(it?.sku ?? "");
        return TEST_RE.test(id) || TEST_RE.test(name) || TEST_RE.test(sku);
      });
      if (looksTest) return "test";
      return "genuine";
    }
    const genuineOrders = purchases.filter((o: any) => classifyOrder(o) === "genuine");
    const testOrders = purchases.filter((o: any) => classifyOrder(o) === "test");
    const revenue = genuineOrders.reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
    const testOrderAmount = testOrders.reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
    const currency = (genuineOrders[0] as any)?.currency ?? (purchases[0] as any)?.currency ?? "eur";

    // ── aggregate ──────────────────────────────────────────────
    const visitors = new Set<string>();
    const sessions = new Set<string>();
    let page_views_raw = 0;
    const perStage: Record<Stage, Set<string>> = {
      CANONICAL_PAGE_VIEW: new Set(),
      CANONICAL_PRODUCT_VIEW: new Set(),
      CANONICAL_ADD_TO_CART: new Set(),
      CANONICAL_CART: new Set(),
      CANONICAL_CHECKOUT: new Set(),
      CANONICAL_PURCHASE: new Set(),
    };
    const perCountry = new Map<string, { visitors: Set<string>; sessions: Set<string>; pv: number; atc: Set<string>; co: Set<string>; pur: Set<string> }>();
    const perSource = new Map<string, Set<string>>();

    for (const r of events) {
      const vkey = r.visitor_id || r.session_id;
      if (!vkey) continue;
      visitors.add(vkey);
      if (r.session_id) sessions.add(r.session_id);

      const stage = r.canonical_name as Stage;
      if (stage === "CANONICAL_PAGE_VIEW") page_views_raw++;
      if (stage in perStage) perStage[stage].add(String(r.session_id || r.visitor_id));

      const ck = r.country || "Unknown";
      let c = perCountry.get(ck);
      if (!c) { c = { visitors: new Set(), sessions: new Set(), pv: 0, atc: new Set(), co: new Set(), pur: new Set() }; perCountry.set(ck, c); }
      c.visitors.add(vkey);
      if (r.session_id) c.sessions.add(r.session_id);
      if (stage === "CANONICAL_PAGE_VIEW") c.pv++;
      if (stage === "CANONICAL_ADD_TO_CART") c.atc.add(String(vkey));
      if (stage === "CANONICAL_CHECKOUT") c.co.add(String(vkey));
      if (stage === "CANONICAL_PURCHASE" && r.order_id) c.pur.add(r.order_id);

      const src = classifySource(r);
      if (!perSource.has(src)) perSource.set(src, new Set());
      if (r.session_id) perSource.get(src)!.add(r.session_id);
    }

    // Primary purchase counter is GENUINE only. Test and cancelled are
    // reported separately so admins can audit without polluting revenue.
    const purchases_count = genuineOrders.length;
    const test_orders_count = testOrders.length;
    // NOTE: `totals` intentionally aggregated later from `sessionAgg` so
    // Map/CSV/Summary parity holds by construction. See below.

    // funnel is built AFTER totals below (needs the reconciled per-session set).

    // ── per-session aggregation (truth envelope) ─────────────
    // One row per session, derived from the SAME canonical_events array
    // used for totals. This is what map markers, CSV and Summary consume.
    type SessionAgg = {
      session_id: string;
      visitor_id: string | null;
      country: string | null;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
      first_seen_at: string;
      last_seen_at: string;
      page_views: number;
      source: string;
      device: string | null;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      referrer: string | null;
      page_path: string | null;
      has_product_view: boolean;
      has_add_to_cart: boolean;
      has_view_cart: boolean;
      has_checkout: boolean;
      has_purchase: boolean;
      order_value: number;
      is_internal: boolean;
    };
    const sessionAgg = new Map<string, SessionAgg>();
    for (const r of events) {
      const sid = r.session_id;
      if (!sid) continue;
      const stage = r.canonical_name as Stage;
      let s = sessionAgg.get(sid);
      if (!s) {
        s = {
          session_id: sid,
          visitor_id: r.visitor_id ?? null,
          country: r.country ?? null,
          city: r.city ?? null,
          latitude: null,
          longitude: null,
          first_seen_at: r.occurred_at,
          last_seen_at: r.occurred_at,
          page_views: 0,
          source: classifySource(r),
          device: r.device ?? null,
          utm_source: r.utm_source ?? null,
          utm_medium: r.utm_medium ?? null,
          utm_campaign: r.utm_campaign ?? null,
          referrer: r.referrer ?? null,
          page_path: r.page_path ?? null,
          has_product_view: false,
          has_add_to_cart: false,
          has_view_cart: false,
          has_checkout: false,
          has_purchase: false,
          order_value: 0,
          is_internal: false,
        };
        sessionAgg.set(sid, s);
      }
      if (r.occurred_at < s.first_seen_at) s.first_seen_at = r.occurred_at;
      if (r.occurred_at > s.last_seen_at) s.last_seen_at = r.occurred_at;
      if (stage === "CANONICAL_PAGE_VIEW") s.page_views += 1;
      if (stage === "CANONICAL_PRODUCT_VIEW") s.has_product_view = true;
      if (stage === "CANONICAL_ADD_TO_CART") s.has_add_to_cart = true;
      if (stage === "CANONICAL_CART") s.has_view_cart = true;
      if (stage === "CANONICAL_CHECKOUT") s.has_checkout = true;
      if (stage === "CANONICAL_PURCHASE") s.has_purchase = true;
      if (!s.visitor_id && r.visitor_id) s.visitor_id = r.visitor_id;
      if (!s.country && r.country) s.country = r.country;
      if (!s.city && r.city) s.city = r.city;
    }

    // Enrich with lat/lng + is_internal from visitor_activity for the same
    // session_ids. This is READ-ONLY and never contributes to counts — only
    // adds map-display fields. Chunked to keep the `.in()` list manageable.
    //
    // REGRESSION-FIX: writers on canonical_events and visitor_activity use
    // different session_id namespaces (UUID vs `<epoch>-<rand>`). When the
    // session_id join yields nothing, fall back to visitor_id so the truth
    // envelope still carries geo/is_internal and the map can render markers.
    const sessionIds = Array.from(sessionAgg.keys());
    const CHUNK = 500;
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const batch = sessionIds.slice(i, i + CHUNK);
      const { data: va, error: vaErr } = await supabase
        .from("visitor_activity")
        .select("session_id,visitor_id,latitude,longitude,country,city,is_internal,utm_campaign,order_value")
        .in("session_id", batch)
        // MONOTONICITY FIX: bound enrichment to the same time window as the
        // canonical_events query. Without this, an unrelated historical
        // visitor_activity row with is_internal=true can retroactively flag
        // a session as internal — causing 24h totals to drop below 10h for
        // the same filters (10h=26 → 24h=23 was the reported symptom).
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false });
      if (vaErr) continue; // enrichment failure must not break the truth envelope
      for (const row of va ?? []) {
        const s = sessionAgg.get(row.session_id as string);
        if (!s) continue;
        if (s.latitude == null && row.latitude != null) s.latitude = Number(row.latitude);
        if (s.longitude == null && row.longitude != null) s.longitude = Number(row.longitude);
        if (!s.country && row.country) s.country = row.country;
        if (!s.city && row.city) s.city = row.city;
        if (row.is_internal === true) s.is_internal = true;
        if (!s.utm_campaign && row.utm_campaign) s.utm_campaign = row.utm_campaign;
        const ov = Number(row.order_value || 0);
        if (ov > s.order_value) s.order_value = ov;
      }
    }

    // Fallback enrichment by visitor_id for sessions still missing geo.
    // Guarantees map markers cannot go to zero just because a session_id
    // namespace mismatch exists between the two writers.
    const byVisitor = new Map<string, SessionAgg[]>();
    for (const s of sessionAgg.values()) {
      if (s.latitude != null && s.longitude != null) continue;
      if (!s.visitor_id) continue;
      const arr = byVisitor.get(s.visitor_id) ?? [];
      arr.push(s);
      byVisitor.set(s.visitor_id, arr);
    }
    const visitorIds = Array.from(byVisitor.keys());
    for (let i = 0; i < visitorIds.length; i += CHUNK) {
      const batch = visitorIds.slice(i, i + CHUNK);
      const { data: va, error: vaErr } = await supabase
        .from("visitor_activity")
        .select("visitor_id,latitude,longitude,country,city,is_internal,utm_campaign,order_value")
        .in("visitor_id", batch)
        // Same monotonicity guard as the session_id enrichment above.
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false });
      if (vaErr) continue;
      for (const row of va ?? []) {
        const targets = byVisitor.get(row.visitor_id as string);
        if (!targets) continue;
        for (const s of targets) {
          if (s.latitude == null && row.latitude != null) s.latitude = Number(row.latitude);
          if (s.longitude == null && row.longitude != null) s.longitude = Number(row.longitude);
          if (!s.country && row.country) s.country = row.country;
          if (!s.city && row.city) s.city = row.city;
          if (row.is_internal === true) s.is_internal = true;
          if (!s.utm_campaign && row.utm_campaign) s.utm_campaign = row.utm_campaign;
          const ov = Number(row.order_value || 0);
          if (ov > s.order_value) s.order_value = ov;
        }
      }
    }

    const allSessionsArr = Array.from(sessionAgg.values()).sort(
      (a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1),
    );
    const sessionsArr = geo === "US"
      ? allSessionsArr.filter((s) => isUS(s.country))
      : allSessionsArr;

    // ── Commercial-eligibility join ────────────────────────────────────
    // Authoritative flags live on `canonical_sessions`. `visitor_activity`
    // only knew about `is_internal`. Without this join, bot/technical/
    // excluded-from-commercial traffic bled into the "visitors" KPI (the
    // documented 55/55 US inflation). Truth predicate:
    //   NOT is_internal AND NOT is_bot AND NOT technical_path
    //   AND NOT exclude_from_commercial
    //   AND (traffic_class ∈ {human classes} OR NULL / traffic_quality is human)
    type CommercialFlags = {
      is_internal: boolean;
      is_bot: boolean;
      technical_path: boolean;
      exclude_from_commercial: boolean;
      traffic_class: string | null;
      traffic_quality: string | null;
    };
    const flagsMap = new Map<string, CommercialFlags>();
    const sidsForFlags = Array.from(new Set(sessionsArr.map((s) => s.session_id)));
    for (let i = 0; i < sidsForFlags.length; i += 500) {
      const batch = sidsForFlags.slice(i, i + 500);
      const { data: csRows } = await supabase
        .from("canonical_sessions")
        .select("session_id,is_internal,is_bot,technical_path,exclude_from_commercial,traffic_class,traffic_quality")
        .in("session_id", batch);
      for (const r of csRows ?? []) {
        flagsMap.set(r.session_id as string, {
          is_internal: r.is_internal === true,
          is_bot: r.is_bot === true,
          technical_path: r.technical_path === true,
          exclude_from_commercial: r.exclude_from_commercial === true,
          traffic_class: (r.traffic_class as string | null) ?? null,
          traffic_quality: (r.traffic_quality as string | null) ?? null,
        });
      }
    }
    const HUMAN_CLASS = new Set([
      "CONFIRMED_HUMAN","PROBABLE_HUMAN","HUMAN_CONFIRMED","HUMAN_PROBABLE",
    ]);
    const HUMAN_QUALITY = new Set(["confirmed_human","probable_human","human"]);
    function isCommercial(s: SessionAgg): boolean {
      const f = flagsMap.get(s.session_id);
      if (f) {
        if (f.is_internal || f.is_bot || f.technical_path || f.exclude_from_commercial) return false;
        if (f.traffic_class && !HUMAN_CLASS.has(f.traffic_class)
            && !(f.traffic_quality && HUMAN_QUALITY.has(f.traffic_quality))) {
          // classifier ran and did not label as human → exclude
          if (["INTERNAL_PREVIEW","BOT_CONFIRMED","BOT_PROBABLE","CRAWLER","TECHNICAL"].includes(f.traffic_class)) return false;
        }
        return true;
      }
      // No canonical_sessions row → fall back to legacy `is_internal` only.
      return !s.is_internal;
    }
    // Buckets for the traffic-quality breakdown card.
    let excluded_internal = 0, excluded_bot = 0, excluded_technical = 0,
        excluded_commercial_flag = 0, excluded_low_quality = 0;
    for (const s of sessionsArr) {
      const f = flagsMap.get(s.session_id);
      if (!f) continue;
      if (f.is_internal) { excluded_internal++; continue; }
      if (f.is_bot) { excluded_bot++; continue; }
      if (f.technical_path) { excluded_technical++; continue; }
      if (f.exclude_from_commercial) { excluded_commercial_flag++; continue; }
      if (f.traffic_class && !HUMAN_CLASS.has(f.traffic_class)
          && ["INTERNAL_PREVIEW","BOT_CONFIRMED","BOT_PROBABLE","CRAWLER","TECHNICAL"].includes(f.traffic_class)) {
        excluded_low_quality++;
      }
    }
    const cleanSessionsArr = sessionsArr.filter(isCommercial);
    const traffic_quality_breakdown = {
      raw_sessions: allSessionsArr.length,
      commercial_sessions: cleanSessionsArr.length,
      excluded_internal,
      excluded_bot,
      excluded_technical,
      excluded_commercial_flag,
      excluded_low_quality,
      unknown_country: cleanSessionsArr.filter((s) => !s.country || !s.country.trim()).length,
    };

    // ── diagnostics: makes monotonicity + geo failures self-explaining ─
    const sessionsWithGeo = cleanSessionsArr.filter(
      (s) => s.latitude != null && s.longitude != null,
    ).length;
    const sessionsWithoutGeo = cleanSessionsArr.length - sessionsWithGeo;
    const filteredOutByInternal = sessionsArr.length - cleanSessionsArr.length;
    const filteredOutByUsOnly = geo === "US"
      ? allSessionsArr.length - sessionsArr.length
      : 0;
    const diagnostics = {
      canonical_sessions: allSessionsArr.length,
      sessions_after_geo_filter: sessionsArr.length,
      sessions_after_internal_filter: cleanSessionsArr.length,
      sessions_with_geo: sessionsWithGeo,
      sessions_without_geo: sessionsWithoutGeo,
      filtered_out_by_us_only: filteredOutByUsOnly,
      filtered_out_by_internal: filteredOutByInternal,
      window_since: since,
      window_until: until,
      window_hours: hours,
    };

    const countryAgg = new Map<string, { visitors: Set<string>; sessions: number; page_views: number; add_to_cart: number; checkout_started: number; purchases: number }>();
    const sourceAgg = new Map<string, number>();
    for (const s of cleanSessionsArr) {
      const country = s.country || "Unknown";
      const c = countryAgg.get(country) ?? { visitors: new Set<string>(), sessions: 0, page_views: 0, add_to_cart: 0, checkout_started: 0, purchases: 0 };
      c.visitors.add(s.visitor_id || s.session_id);
      c.sessions += 1;
      c.page_views += s.page_views;
      if (s.has_add_to_cart) c.add_to_cart += 1;
      if (s.has_checkout) c.checkout_started += 1;
      if (s.has_purchase) c.purchases += 1;
      countryAgg.set(country, c);
      sourceAgg.set(s.source, (sourceAgg.get(s.source) ?? 0) + 1);
    }
    const countries = Array.from(countryAgg.entries()).map(([country, c]) => ({
      country,
      visitors: c.visitors.size,
      sessions: c.sessions,
      page_views: c.page_views,
      add_to_cart: c.add_to_cart,
      checkout_started: c.checkout_started,
      purchases: c.purchases,
    })).sort((a, b) => b.visitors - a.visitors);
    const sources = Array.from(sourceAgg.entries()).map(([source, sessions]) => ({
      source,
      sessions,
    })).sort((a, b) => b.sessions - a.sessions);

    // ── totals derived from sessionAgg (parity by construction) ────────
    // Every counter Map/CSV/Summary shows is computed the same way here.
    const visitorsSet = new Set<string>();
    let pvSum = 0, atc = 0, viewCart = 0, checkout = 0, purchase = 0;
    let orderValueSum = 0;
    for (const s of cleanSessionsArr) {
      visitorsSet.add(s.visitor_id || s.session_id);
      pvSum += s.page_views;
      if (s.has_add_to_cart) atc++;
      if (s.has_view_cart) viewCart++;
      if (s.has_checkout) checkout++;
      if (s.has_purchase) purchase++;
      orderValueSum += s.order_value;
    }
    const totals = {
      visitors: visitorsSet.size,
      sessions: cleanSessionsArr.length,
      page_views: pvSum,
      product_views: cleanSessionsArr.filter((s) => s.has_product_view).length,
      add_to_cart: atc,
      view_cart: viewCart,
      checkout_started: checkout,
      purchases: purchases_count,
      revenue: Number(revenue.toFixed(2)),
      currency,
      conversion_rate: visitorsSet.size > 0
        ? +((purchases_count / visitorsSet.size) * 100).toFixed(2) : 0,
      // v2 purchase semantics — additive, safe to ignore for legacy readers.
      genuine_orders: purchases_count,
      test_orders: test_orders_count,
      genuine_revenue: Number(revenue.toFixed(2)),
      test_order_amount: Number(testOrderAmount.toFixed(2)),
    };

    const funnel = STAGES.map((stage) => ({
      stage,
      count:
        stage === "CANONICAL_PURCHASE" ? purchases_count :
        stage === "CANONICAL_PAGE_VIEW" ? pvSum :
        stage === "CANONICAL_ADD_TO_CART" ? atc :
        stage === "CANONICAL_CART" ? viewCart :
        stage === "CANONICAL_CHECKOUT" ? checkout :
        perStage[stage].size,
    }));

    const sample = events[0] ?? null;

    const respBody: Record<string, unknown> = {
      ok: true,
      deploy_marker: (globalThis as any).__ac_deploy_marker,
      window: { hours, since, until },
      filter: { geo, clean: true, source: "canonical_events + orders(status IN paid,completed)" },
      totals,
      funnel,
      countries,
      sources,
      sessions: sessionsArr,
      sample_event: sample,
      diagnostics,
      generated_at: new Date().toISOString(),
    };

    // ── Phase 4C: v2 as default for authenticated internal consumers ───
    // Backward-compatible. All existing v1 fields above are unchanged.
    // v2 fields are populated when:
    //   (a) caller explicitly requests envelope=v2, OR
    //   (b) admin caller AND `canonical_traffic_quality_v2.default_for_internal`
    //       flag is on AND envelope != 'v1' (explicit legacy fallback).
    const envParam = (url.searchParams.get("envelope") || body?.envelope || "").toLowerCase();
    const wantsV1Fallback = envParam === "v1";
    const wantsV2Explicit = envParam === "v2";
    let defaultForInternal = false;
    try {
      const { data: cfg } = await supabase
        .from("app_config")
        .select("key,value")
        .eq("key", "canonical_traffic_quality_v2.default_for_internal")
        .maybeSingle();
      defaultForInternal = cfg?.value === true || cfg?.value === "true";
    } catch { /* noop */ }
    if (!wantsV1Fallback && (wantsV2Explicit || defaultForInternal)) {
      try {
        const gate = await checkCanonicalV2Gate(req);
        respBody.v2_gate = {
          enabled: gate.enabled,
          isAdmin: gate.isAdmin,
          allowV2: gate.allowV2,
          default_for_internal: defaultForInternal,
          envelope_resolved: gate.allowV2 ? "v2" : "v1",
        };
        if (gate.allowV2) {
          const rows: ClassifiableRow[] = [];
          const PAGE2 = 1000;
          let from2 = 0;
          while (true) {
            const { data, error } = await supabase
              .from("canonical_events")
              .select("session_id,visitor_id,occurred_at,ingested_at,is_internal,technical_path,is_bot,bot_confidence,traffic_quality,classification_version")
              .gte("occurred_at", since)
              .lte("occurred_at", until)
              .order("occurred_at", { ascending: false })
              .range(from2, from2 + PAGE2 - 1);
            if (error) break;
            if (!data || data.length === 0) break;
            rows.push(...(data as ClassifiableRow[]));
            if (data.length < PAGE2) break;
            from2 += PAGE2;
            if (from2 > 200_000) break;
          }
          // Authoritative session-level classification lives in
          // analytics_traffic_classification (ATC). canonical_events only
          // carries a schema DEFAULT of 'uncertain' — no classifier has
          // written classification_version there yet. Join ATC in per
          // session_id and stamp `atc_traffic_type` on every event before
          // aggregation.
          const uniqSids = Array.from(new Set(
            rows.map((r) => r.session_id).filter((s): s is string => !!s),
          ));
          const atcMap = new Map<string, string>();
          const CHUNK_ATC = 500;
          for (let i = 0; i < uniqSids.length; i += CHUNK_ATC) {
            const batch = uniqSids.slice(i, i + CHUNK_ATC);
            const { data: atc, error: atcErr } = await supabase
              .from("analytics_traffic_classification")
              .select("session_id,traffic_type")
              .in("session_id", batch);
            if (atcErr) continue;
            for (const r of atc ?? []) {
              if (r.session_id && r.traffic_type) atcMap.set(r.session_id, r.traffic_type as string);
            }
          }
          for (const r of rows) {
            if (r.session_id && atcMap.has(r.session_id)) {
              (r as ClassifiableRow).atc_traffic_type = atcMap.get(r.session_id) || null;
            }
          }
          const agg = aggregateBuckets(rows, gate.phase4aCutoffIso);
          const v2totals = totalsFromAggregate(agg);
          const coverage = classificationCoverage(agg);
          // Historical join estimate.
          let historicalSessions = 0;
          let joinableBySession = 0;
          try {
            const { count } = await supabase
              .from("canonical_events")
              .select("session_id", { count: "exact", head: true })
              .lt("ingested_at", gate.phase4aCutoffIso);
            historicalSessions = count ?? 0;
          } catch { /* noop */ }
          try {
            const { count } = await supabase
              .from("canonical_events")
              .select("session_id", { count: "exact", head: true })
              .lt("ingested_at", gate.phase4aCutoffIso)
              .not("classification_version", "is", null);
            joinableBySession = count ?? 0;
          } catch { /* noop */ }
          respBody.v2 = {
            ...v2totals,
            classification_version: "v2.phase4a+atc",
            classification_source: "analytics_traffic_classification (authoritative) + canonical_events (fallback when classification_version present)",
            classification_coverage_pct: coverage,
            phase4a_cutoff_iso: gate.phase4aCutoffIso,
            classified_sessions_post_deploy: v2totals.raw_sessions - v2totals.legacy_unclassified_sessions,
            unclassified_historical_sessions: historicalSessions,
            joinable_by_session_id: joinableBySession,
            joinable_by_visitor_fallback: Math.max(0, historicalSessions - joinableBySession),
            permanently_unclassifiable: 0,
            estimated_backfill_coverage_pct: historicalSessions > 0
              ? Math.round((joinableBySession / historicalSessions) * 10000) / 100
              : 0,
            orders_count: purchases_count,
            genuine_orders: purchases_count,
            test_orders: test_orders_count,
            genuine_revenue: Number(revenue.toFixed(2)),
            test_order_amount: Number(testOrderAmount.toFixed(2)),
            checkout_started: totals.checkout_started,
            atc_sessions_matched: atcMap.size,
            atc_sessions_scanned: uniqSids.length,
          };
        }
      } catch (e) {
        respBody.v2_error = (e as Error).message;
      }
    }
    cache.set(key, { at: now, body: respBody });
    return new Response(JSON.stringify(respBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});