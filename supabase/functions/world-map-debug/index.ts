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

const US_VALUES = new Set([
  "us", "usa", "u.s.", "u.s.a.", "united states", "united states of america",
]);
const isUS = (c?: string | null) => !!c && US_VALUES.has(c.trim().toLowerCase());

const ADMIN_PATH_RE = /^\/(admin|dashboard|founder-mode|diagnostics|growth-verification|healthz)/i;
const TEST_QUERY_RE = /[?&](test|internal|dryrun|preview)=true/i;

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
        .select("session_id,visitor_id,country,city,latitude,longitude,page_path,order_id,order_value,utm_source,utm_medium,referrer,referrer_category,is_internal,created_at")
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

    const clean: any[] = [];
    for (const r of all) {
      if (r.is_internal === true) { excluded_internal++; continue; }
      const path = r.page_path || "";
      if (ADMIN_PATH_RE.test(path)) { excluded_admin++; continue; }
      if (TEST_QUERY_RE.test(path)) { excluded_bots++; continue; }
      if (usOnly && !isUS(r.country)) { excluded_non_us++; continue; }
      clean.push(r);
    }

    const sessions = new Set<string>();
    const visitors = new Set<string>();
    let pageviews = 0, product_views = 0, cart_views = 0, checkout_started = 0, purchases = 0;
    const sources = new Map<string, number>();
    const countries = new Map<string, { country: string; visitors: Set<string>; sessions: Set<string>; pageviews: number; cart: number; checkout: number; purchases: number; lat?: number; lng?: number; city?: string }>();

    for (const r of clean) {
      pageviews++;
      if (r.session_id) sessions.add(r.session_id);
      if (r.visitor_id || r.session_id) visitors.add(r.visitor_id || r.session_id);
      const path: string = r.page_path || "";
      if (path.startsWith("/products/")) product_views++;
      if (path === "/cart") cart_views++;
      if (path === "/checkout") checkout_started++;
      if (r.order_id) purchases++;
      const src = classifySource(r);
      sources.set(src, (sources.get(src) || 0) + 1);

      const ck = r.country || "Unknown";
      let c = countries.get(ck);
      if (!c) {
        c = { country: ck, visitors: new Set(), sessions: new Set(), pageviews: 0, cart: 0, checkout: 0, purchases: 0, lat: r.latitude ?? undefined, lng: r.longitude ?? undefined, city: r.city ?? undefined };
        countries.set(ck, c);
      }
      if (r.visitor_id || r.session_id) c.visitors.add(r.visitor_id || r.session_id);
      if (r.session_id) c.sessions.add(r.session_id);
      c.pageviews++;
      if (path === "/cart") c.cart++;
      if (path === "/checkout") c.checkout++;
      if (r.order_id) c.purchases++;
    }

    const earliest = all.reduce<string | null>((min, r) => (!min || r.created_at < min ? r.created_at : min), null);
    const latest = all.reduce<string | null>((max, r) => (!max || r.created_at > max ? r.created_at : max), null);

    const warnings: string[] = [];
    if (range !== "24h" && clean.length === 0) warnings.push("No clean events in range — check filters or seeding.");
    if (usOnly && excluded_non_us > clean.length * 5) warnings.push("Most traffic is non-US; verify Pinterest US targeting.");
    if (total_raw_events >= 200_000) warnings.push("Hit safety cap of 200k rows — counts may be partial.");

    const body = {
      ok: true,
      range,
      us_only: usOnly,
      total_raw_events,
      excluded_internal,
      excluded_bots,
      excluded_admin,
      excluded_non_us,
      clean_events: clean.length,
      unique_visitors: visitors.size,
      sessions: sessions.size,
      pageviews,
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
        purchases: c.purchases,
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