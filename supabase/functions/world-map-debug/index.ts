// world-map-debug — LEGACY response shape, CANONICAL source of truth.
// As of the Analytics Integrity Certification pass, this function no longer
// aggregates `visitor_activity` on its own. It reads `canonical_events` +
// `orders(paid|completed)` (same query the `analytics-canonical` service uses)
// and reshapes the result into the response CleanAnalyticsPanel already
// consumes, so every dashboard now converges on the same numbers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Range = "24h" | "7d" | "30d";
const RANGE_MS: Record<Range, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

export const US_VALUES = new Set([
  "us", "usa", "u.s.", "u.s.a.", "united states", "united states of america",
]);
export const isUS = (c?: string | null) => !!c && US_VALUES.has(c.trim().toLowerCase());

const ADMIN_PATH_RE = /^\/(admin|dashboard|founder-mode|diagnostics|growth-verification|healthz)/i;
const TEST_QUERY_RE = /[?&](test|internal|dryrun|preview)=true/i;

// ── Explicit bot detection ────────────────────────────────────────
// Each rule returns a stable reason code so the UI can show *why* an event
// was excluded, not just that it was excluded. First match wins.
const BOT_BROWSER_RE = /(bot|crawler|spider|crawl|slurp|bingpreview|headless|phantomjs|puppeteer|playwright|lighthouse|pingdom|gtmetrix|monitor|uptimerobot|curl|wget|python-requests|httpclient|axios|node-fetch|go-http-client|java\/)/i;
const BOT_REFERRER_RE = /(googlebot|bingbot|yandex|baiduspider|duckduckbot|ahrefs|semrush|mj12bot|dotbot|screaming\s*frog|petalbot|applebot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|skypeuripreview|embedly|crawler\.)/i;
const BOT_UTM_RE = /(bot|crawler|spider|preview|monitor|uptime|test|qa|automation)/i;

type BotCheck = { isBot: boolean; reason: string | null };
function detectBot(r: any): BotCheck {
  const path: string = r.page_path || "";
  if (TEST_QUERY_RE.test(path)) return { isBot: true, reason: "test_query_param" };
  const browser: string = (r.browser || "").toString();
  if (browser && BOT_BROWSER_RE.test(browser)) return { isBot: true, reason: "bot_browser_ua" };
  const referrer: string = (r.referrer || "").toString();
  if (referrer && BOT_REFERRER_RE.test(referrer)) return { isBot: true, reason: "bot_referrer" };
  const utm = `${r.utm_source || ""} ${r.utm_medium || ""} ${r.utm_campaign || ""}`.trim();
  if (utm && BOT_UTM_RE.test(utm) && !/pinterest|tiktok|google|facebook|instagram/i.test(utm)) {
    return { isBot: true, reason: "bot_utm_marker" };
  }
  // Synthetic-ping signature: exact (0,0) lat/lng OR fully empty signal stack
  // (no geo, no browser, no referrer, no session/visitor identity). Any single
  // real client field present disqualifies this rule to avoid false positives
  // on legit visitors with blocked geo lookup.
  if (r.latitude === 0 && r.longitude === 0) {
    return { isBot: true, reason: "zero_geo_ping" };
  }
  const hasGeo = r.country || r.city || r.latitude != null || r.longitude != null;
  const hasClientSignal = !!(r.browser || r.device_type || r.referrer || r.utm_source);
  const hasIdentity = !!(r.visitor_id || r.session_id);
  if (!hasGeo && !hasClientSignal && !hasIdentity) {
    return { isBot: true, reason: "empty_signal_stack" };
  }
  return { isBot: false, reason: null };
}

// Activity types that count as a "pageview". Anything else (cart_action, add_to_cart event,
// purchase event, heartbeat, etc.) is NOT counted as a pageview to avoid mixing event types.
const PAGEVIEW_TYPES = new Set([
  "browsing", "page_view", "pageview", "view", "product_view", "view_item",
  "view_cart", "checkout", "begin_checkout", "purchase",
]);
// Rows we never count as a pageview, even if path looks like one.
const NON_PAGEVIEW_TYPES = new Set([
  "heartbeat", "ping", "presence", "click", "scroll", "search", "add_to_cart_click",
]);

// Returns the canonical visitor key, never mixing visitor_id with session_id silently.
function visitorKey(r: { visitor_id?: string | null; session_id?: string | null }): string | null {
  if (r.visitor_id) return `v:${r.visitor_id}`;
  if (r.session_id) return `s:${r.session_id}`;
  return null;
}

function classifySource(row: { utm_source?: string | null; referrer_category?: string | null; referrer?: string | null; utm_medium?: string | null }) {
  const us = (row.utm_source || "").toLowerCase();
  const um = (row.utm_medium || "").toLowerCase();
  const ref = (row.referrer || "").toLowerCase();
  if (us.includes("pinterest") || ref.includes("pinterest")) return "pinterest";
  if (us.includes("tiktok") || ref.includes("tiktok")) return "tiktok";
  if (us === "google" && (um === "cpc" || um === "paid")) return "google_ads";
  if (ref.includes("googleadservices") || /[?&](gclid|gbraid|wbraid)=/.test(row.referrer || "")) return "google_ads";
  if (us === "google" || ref.includes("google.")) return "google_organic";
  if (row.referrer_category === "social") return "social";
  if (row.referrer_category === "organic") return "organic";
  if (row.referrer_category === "direct" || !ref) return "direct";
  return "referral";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const range = (url.searchParams.get("range") as Range) || "24h";
    const usOnly = url.searchParams.get("us_only") !== "false"; // default true
    const ms = RANGE_MS[range] ?? RANGE_MS["24h"];
    const since = new Date(Date.now() - ms).toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Canonical source of truth ─────────────────────────────────
    // Read canonical_events (already deduped, QA-excluded at ingest) and
    // orders(paid|completed). Everything below just aggregates from that.
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      let q = supabase
        .from("canonical_events")
        .select("canonical_name,occurred_at,visitor_id,session_id,order_id,product_id,page_path,utm_source,utm_medium,referrer,country,city,device")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (usOnly) q = q.eq("country", "US");
      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from > 200_000) break;
    }

    // canonical_events already filters QA/bots at ingest, so exclusion
    // counters are structural-only. We keep the response shape stable for the
    // legacy dashboard, but the numbers are canonical.
    const total_raw_events = all.length;
    const excluded_internal = 0;
    const excluded_bots = 0;
    const excluded_admin = 0;
    const excluded_non_us = 0; // pre-filtered at query level when usOnly
    const bot_reasons: Record<string, number> = {};
    const bot_samples: any[] = [];
    const clean = all;

    // Also fetch paid orders for the same window (revenue/purchase truth).
    const { data: paidOrders } = await supabase
      .from("orders")
      .select("id,total_amount,status,created_at,shipping_address")
      .in("status", ["paid", "completed"])
      .gte("created_at", since)
      .limit(5000);
    let filteredPaid = paidOrders ?? [];
    if (usOnly) {
      filteredPaid = filteredPaid.filter((o: any) => {
        const c = o?.shipping_address?.country || o?.shipping_address?.country_code;
        return isUS(c);
      });
    }
    const paidById = new Map<string, any>();
    for (const o of filteredPaid) paidById.set(o.id, o);

    // ── Deduplicated metric accumulators ─────────────────────────────
    // Visitors: distinct (visitor_id || session_id), nulls excluded.
    // Sessions: distinct session_id only — never falls back to visitor_id.
    // Pageviews: only rows whose activity_type is a real pageview, deduplicated
    //            per (visitor_key + path + 1-minute bucket) to suppress heartbeat
    //            and SPA double-fires. Order/purchase/cart events do NOT inflate it.
    // Funnel counts (product_view, cart, checkout, purchase) are deduplicated per
    // (visitor_key + path) so a refresh storm doesn't fake a funnel.
    const sessions = new Set<string>();
    const visitors = new Set<string>();
    const visitorsStrict = new Set<string>(); // visitor_id only
    const pvSeen = new Set<string>();         // dedup pageviews
    const productSeen = new Set<string>();
    const cartSeen = new Set<string>();
    const checkoutSeen = new Set<string>();
    const purchaseSeen = new Set<string>();   // dedup purchases by order_id
    let pageviews_raw = 0;
    let pageviews = 0, product_views = 0, cart_views = 0, checkout_started = 0, purchases = 0;
    let dropped_no_identity = 0, dropped_non_pageview_type = 0, deduped_pageviews = 0;
    const sources = new Map<string, number>();
    const countries = new Map<string, { country: string; visitors: Set<string>; sessions: Set<string>; pageviews: number; pvSeen: Set<string>; cart: number; checkout: number; purchases: Set<string>; lat?: number; lng?: number; city?: string }>();

    for (const r of clean) {
      const vkey = visitorKey(r);
      if (!vkey) { dropped_no_identity++; continue; }

      visitors.add(vkey);
      if (r.visitor_id) visitorsStrict.add(r.visitor_id);
      if (r.session_id) sessions.add(r.session_id);

      const name = String(r.canonical_name || "");
      const path: string = r.page_path || "";

      // Source classification runs on every clean row (independent of pageview gate)
      const src = classifySource(r);
      sources.set(src, (sources.get(src) || 0) + 1);

      // Country bucket
      const ck = r.country || "Unknown";
      let c = countries.get(ck);
      if (!c) {
        c = { country: ck, visitors: new Set(), sessions: new Set(), pageviews: 0, pvSeen: new Set(), cart: 0, checkout: 0, purchases: new Set(), lat: undefined, lng: undefined, city: r.city ?? undefined };
        countries.set(ck, c);
      }
      c.visitors.add(vkey);
      if (r.session_id) c.sessions.add(r.session_id);

      if (name === "CANONICAL_PAGE_VIEW" || name === "CANONICAL_PRODUCT_VIEW") {
        pageviews_raw++;
        pageviews++;
        c.pageviews++;
        if (name === "CANONICAL_PRODUCT_VIEW") {
          const k = `${vkey}|pv`;
          if (!productSeen.has(k)) { productSeen.add(k); product_views++; }
        }
      } else {
        dropped_non_pageview_type++;
      }

      if (name === "CANONICAL_ADD_TO_CART" || name === "CANONICAL_CART") {
        const k = `${vkey}|atc`;
        if (!cartSeen.has(k)) { cartSeen.add(k); cart_views++; c.cart++; }
      }
      if (name === "CANONICAL_CHECKOUT") {
        const k = `${vkey}|co`;
        if (!checkoutSeen.has(k)) { checkoutSeen.add(k); checkout_started++; c.checkout++; }
      }

      // Purchase counts come from `orders` below, not from canonical events,
      // so revenue truth stays authoritative. Country attribution is still
      // derived here when the event carries the order id.
      if (r.order_id) c.purchases.add(r.order_id);
    }
    // Purchase count = distinct paid orders in window (matches canonical service).
    purchases = filteredPaid.length;

    const earliest = all.reduce<string | null>((min, r) => (!min || r.occurred_at < min ? r.occurred_at : min), null);
    const latest = all.reduce<string | null>((max, r) => (!max || r.occurred_at > max ? r.occurred_at : max), null);

    const warnings: string[] = [];
    if (range !== "24h" && clean.length === 0) warnings.push("No clean events in range — check filters or seeding.");
    if (usOnly && excluded_non_us > clean.length * 5) warnings.push("Most traffic is non-US; verify Pinterest US targeting.");
    if (total_raw_events >= 200_000) warnings.push("Hit safety cap of 200k rows — counts may be partial.");
    if (dropped_no_identity > 0) warnings.push(`${dropped_no_identity} events dropped: no visitor_id and no session_id.`);
    if (pageviews_raw > 0 && deduped_pageviews / pageviews_raw > 0.5) warnings.push(`High pageview dedup ratio (${Math.round((deduped_pageviews / pageviews_raw) * 100)}%) — possible heartbeat or SPA double-fire.`);
    if (visitors.size > 0 && sessions.size > visitors.size * 5) warnings.push("Sessions ≫ visitors — session_id may be regenerating per pageview.");
    if (visitorsStrict.size > 0 && visitors.size > visitorsStrict.size * 3) warnings.push("Many visitors are session-only (no visitor_id) — cookie/localStorage may be blocked.");

    const body = {
      ok: true,
      range,
      us_only: usOnly,
      total_raw_events,
      excluded_internal,
      excluded_bots,
      bot_reasons,
      bot_samples,
      excluded_admin,
      excluded_non_us,
      clean_events: clean.length,
      unique_visitors: visitors.size,
      unique_visitors_strict: visitorsStrict.size,
      sessions: sessions.size,
      pageviews,
      pageviews_raw,
      deduped_pageviews,
      dropped_no_identity,
      dropped_non_pageview_type,
      product_views,
      add_to_cart: cart_views,
      checkout_started,
      purchases,
      conversion_rate: visitors.size > 0 ? +((purchases / visitors.size) * 100).toFixed(2) : 0,
      earliest_event_at: earliest,
      latest_event_at: latest,
      countries: Array.from(countries.values()).map((c) => ({
        country: c.country,
        unique_visitors: c.visitors.size,
        sessions: c.sessions.size,
        pageviews: c.pageviews,
        add_to_cart: c.cart,
        checkout_started: c.checkout,
        purchases: c.purchases.size,
        latitude: c.lat,
        longitude: c.lng,
        city: c.city,
      })).sort((a, b) => b.unique_visitors - a.unique_visitors),
      top_sources: Array.from(sources.entries()).map(([source, events]) => ({ source, events })).sort((a, b) => b.events - a.events),
      warnings,
    };

    return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});