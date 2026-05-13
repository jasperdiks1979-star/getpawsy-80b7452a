// US-only clean analytics + diagnostics for the Visitor World Map.
// Server-side aggregation (no 1000-row cap) so 24h/7d/30d are accurate.
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

    // Page through to bypass 1000-row cap
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("visitor_activity")
        .select("session_id,visitor_id,country,city,latitude,longitude,page_path,activity_type,order_id,order_value,utm_source,utm_medium,referrer,referrer_category,is_internal,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
      if (from > 200_000) break; // hard safety cap
    }

    const total_raw_events = all.length;
    let excluded_internal = 0, excluded_bots = 0, excluded_admin = 0, excluded_non_us = 0;
    const bot_reasons: Record<string, number> = {};
    const bot_samples: Array<{ reason: string; path: string; browser: string | null; referrer: string | null; utm_source: string | null; country: string | null; created_at: string }> = [];

    const clean: any[] = [];
    for (const r of all) {
      if (r.is_internal === true) { excluded_internal++; continue; }
      const path = r.page_path || "";
      if (ADMIN_PATH_RE.test(path)) { excluded_admin++; continue; }
      const bot = detectBot(r);
      if (bot.isBot) {
        excluded_bots++;
        const reason = bot.reason || "unknown";
        bot_reasons[reason] = (bot_reasons[reason] || 0) + 1;
        if (bot_samples.length < 20) {
          bot_samples.push({
            reason,
            path,
            browser: r.browser ?? null,
            referrer: r.referrer ?? null,
            utm_source: r.utm_source ?? null,
            country: r.country ?? null,
            created_at: r.created_at,
          });
        }
        continue;
      }
      if (usOnly && !isUS(r.country)) { excluded_non_us++; continue; }
      clean.push(r);
    }

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

      const at = (r.activity_type || "browsing").toLowerCase();
      const path: string = r.page_path || "";

      // Source classification runs on every clean row (independent of pageview gate)
      const src = classifySource(r);
      sources.set(src, (sources.get(src) || 0) + 1);

      // Country bucket
      const ck = r.country || "Unknown";
      let c = countries.get(ck);
      if (!c) {
        c = { country: ck, visitors: new Set(), sessions: new Set(), pageviews: 0, pvSeen: new Set(), cart: 0, checkout: 0, purchases: new Set(), lat: r.latitude ?? undefined, lng: r.longitude ?? undefined, city: r.city ?? undefined };
        countries.set(ck, c);
      }
      c.visitors.add(vkey);
      if (r.session_id) c.sessions.add(r.session_id);

      // ── Pageview gate ──
      const isPageview = PAGEVIEW_TYPES.has(at) && !NON_PAGEVIEW_TYPES.has(at);
      if (!isPageview) {
        dropped_non_pageview_type++;
      } else {
        pageviews_raw++;
        // 1-minute bucket dedup: same visitor + same path within 60s = 1 pageview
        const bucket = Math.floor(new Date(r.created_at).getTime() / 60_000);
        const pvKey = `${vkey}|${path}|${bucket}`;
        if (pvSeen.has(pvKey)) {
          deduped_pageviews++;
        } else {
          pvSeen.add(pvKey);
          pageviews++;
          c.pvSeen.add(pvKey);
          c.pageviews++;

          // Funnel counts only fire on true pageviews, deduplicated per visitor+path
          if (path.startsWith("/products/")) {
            const k = `${vkey}|${path}`;
            if (!productSeen.has(k)) { productSeen.add(k); product_views++; }
          }
          if (path === "/cart") {
            const k = `${vkey}|cart`;
            if (!cartSeen.has(k)) { cartSeen.add(k); cart_views++; c.cart++; }
          }
          if (path === "/checkout") {
            const k = `${vkey}|checkout`;
            if (!checkoutSeen.has(k)) { checkoutSeen.add(k); checkout_started++; c.checkout++; }
          }
        }
      }

      // Purchases dedup by order_id (independent of pageview gate)
      if (r.order_id && !purchaseSeen.has(r.order_id)) {
        purchaseSeen.add(r.order_id);
        purchases++;
        c.purchases.add(r.order_id);
      }
    }

    const earliest = all.reduce<string | null>((min, r) => (!min || r.created_at < min ? r.created_at : min), null);
    const latest = all.reduce<string | null>((max, r) => (!max || r.created_at > max ? r.created_at : max), null);

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