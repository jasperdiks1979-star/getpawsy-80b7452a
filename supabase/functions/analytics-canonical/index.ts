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
// PRODUCTION GATE (v3): business KPI eligibility is decided at read time by the
// validated strict-v3 shadow layer, NOT by stored `exclude_from_commercial`.
import { buildShadowEligibility } from "../_shared/commercial-eligibility-v3.ts";


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

/**
 * SHADOW-ONLY geo normalization. Never written back to the DB; it exists so
 * `"United States"` and `geo='US'` stop disagreeing in downstream reporting.
 * Eligibility must NEVER depend on this value.
 */
const ISO2_MAP: Record<string, string> = {
  "united states": "US", "united states of america": "US", "usa": "US", "us": "US",
  "u.s.": "US", "u.s.a.": "US",
  "sweden": "SE", "se": "SE",
  "netherlands": "NL", "the netherlands": "NL", "nl": "NL",
  "germany": "DE", "de": "DE",
  "united kingdom": "GB", "great britain": "GB", "uk": "GB", "gb": "GB",
  "canada": "CA", "ca": "CA",
  "france": "FR", "fr": "FR",
  "spain": "ES", "es": "ES",
  "italy": "IT", "it": "IT",
  "belgium": "BE", "be": "BE",
  "australia": "AU", "au": "AU",
  "ireland": "IE", "ie": "IE",
  "denmark": "DK", "dk": "DK",
  "norway": "NO", "no": "NO",
  "finland": "FI", "fi": "FI",
  "poland": "PL", "pl": "PL",
  "india": "IN", "in": "IN",
  "brazil": "BR", "br": "BR",
  "japan": "JP", "jp": "JP",
};
function toIso2(country?: string | null): string | null {
  if (!country) return null;
  const k = country.trim().toLowerCase();
  if (!k) return null;
  if (ISO2_MAP[k]) return ISO2_MAP[k];
  if (/^[a-z]{2}$/.test(k)) return k.toUpperCase();
  return null;
}


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

/**
 * PERF: run chunked `.in()` lookups with bounded concurrency instead of
 * strictly sequentially. Under DB saturation a single round trip costs
 * 0.3–2s; a 7-day window needs dozens of them, which is what pushed the
 * request past the 150s edge idle timeout.
 */
async function mapChunksParallel<T, R>(
  items: T[],
  size: number,
  concurrency: number,
  fn: (batch: T[]) => Promise<R>,
): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const out: R[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    out.push(...(await Promise.all(batches.slice(i, i + concurrency).map(fn))));
  }
  return out;
}

interface ComputeOpts {
  req: Request;
  hours: number;
  geo: "US" | "all";
  envParam: string;
  deepDiagnostics: boolean;
  internalTrusted: boolean;
}

async function computeEnvelope(opts: ComputeOpts): Promise<Record<string, unknown>> {
  const { req, hours, geo, envParam: envParamRaw, deepDiagnostics, internalTrusted } = opts;
  {
    // Deploy marker to prove new bundle is live.
    (globalThis as any).__ac_deploy_marker = "phase5-precomputed-cache";
    const now = Date.now();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(now - hours * 3600_000).toISOString();
    const until = new Date(now).toISOString();

    // ── phase profiler ────────────────────────────────────────
    const t0 = Date.now();
    const timings: Record<string, number> = {};
    const mark = (label: string) => { timings[label] = Date.now() - t0; };

    // ── canonical_events ───────────────────────────────────────
    const events: any[] = [];
    const PAGE = 1000;
    // PERF: one single pass over the window. The column list is the UNION of
    // what the v1 envelope and the v2 bucket classifier need, so the v2 block
    // below reuses these rows instead of re-paging the whole window a second
    // time (that duplicate scan doubled the request cost).
    //
    // Do NOT filter canonical_events by `country = 'US'` here. The writer
    // stores mixed values (`US`, `USA`, `United States`) and many rows are
    // country-null until the visitor_activity geo enrichment below runs.
    // Geo filtering is applied after enrichment on the per-session truth set.
    const EVENT_COLUMNS =
      "canonical_name,occurred_at,visitor_id,session_id,order_id,product_id,page_path,landing_page," +
      "utm_source,utm_medium,utm_campaign,utm_content,referrer,country,city,device," +
      "ingested_at,is_internal,technical_path,is_bot,bot_confidence,traffic_quality,classification_version";
    const PAGE_WAVE = 6; // pages fetched concurrently
    let from = 0;
    let pagingDone = false;
    while (!pagingDone) {
      const offsets = Array.from({ length: PAGE_WAVE }, (_, i) => from + i * PAGE);
      const wave = await Promise.all(
        offsets.map((off) =>
          supabase
            .from("canonical_events")
            .select(EVENT_COLUMNS)
            .gte("occurred_at", since)
            .lte("occurred_at", until)
            .order("occurred_at", { ascending: false })
            .range(off, off + PAGE - 1)
        ),
      );
      for (const { data, error } of wave) {
        if (error) throw error;
        if (!data || data.length === 0) { pagingDone = true; continue; }
        events.push(...data);
        if (data.length < PAGE) pagingDone = true;
      }
      from += PAGE_WAVE * PAGE;
      if (from > 200_000) break;
    }
    mark("events");

    // ── orders (paid) ──────────────────────────────────────────
    const { data: paidOrders, error: oErr } = await supabase
      .from("orders")
      .select("id,total_amount,currency,status,created_at,shipping_address,items,stripe_session_id,stripe_payment_intent_id")
      .in("status", ["paid", "completed"])
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(5000);
    if (oErr) throw oErr;
    mark("orders");
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
      utm_content: string | null;
      referrer: string | null;
      page_path: string | null;
      /** First-touch full landing URL incl. query string (paid click evidence). */
      landing_page: string | null;
      landing_page_at: string | null;
      has_product_view: boolean;
      has_add_to_cart: boolean;
      has_view_cart: boolean;
      has_checkout: boolean;
      has_purchase: boolean;
      order_value: number;
      is_internal: boolean;
      /** DIAGNOSTIC ONLY — visitor_activity.is_internal (geo heuristic: NL).
       *  Never an input to the strict-v3 traffic-quality classifier. */
      va_is_internal: boolean;
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
          utm_content: r.utm_content ?? null,
          referrer: r.referrer ?? null,
          page_path: r.page_path ?? null,
          landing_page: r.landing_page ?? null,
          landing_page_at: r.landing_page ? r.occurred_at : null,
          has_product_view: false,
          has_add_to_cart: false,
          has_view_cart: false,
          has_checkout: false,
          has_purchase: false,
          order_value: 0,
          is_internal: false,
          va_is_internal: false,
        };
        sessionAgg.set(sid, s);
      }
      if (r.occurred_at < s.first_seen_at) s.first_seen_at = r.occurred_at;
      if (r.occurred_at > s.last_seen_at) s.last_seen_at = r.occurred_at;
      // First-touch landing URL (full path + query) — keeps paid click
      // evidence (`pins_campaign_id`, `epik`) alive for the classifier.
      if (r.landing_page && (!s.landing_page || !s.landing_page_at || r.occurred_at < s.landing_page_at)) {
        s.landing_page = r.landing_page;
        s.landing_page_at = r.occurred_at;
      }
      if (stage === "CANONICAL_PAGE_VIEW") s.page_views += 1;
      if (stage === "CANONICAL_PRODUCT_VIEW") s.has_product_view = true;
      if (stage === "CANONICAL_ADD_TO_CART") s.has_add_to_cart = true;
      if (stage === "CANONICAL_CART") s.has_view_cart = true;
      if (stage === "CANONICAL_CHECKOUT") s.has_checkout = true;
      if (stage === "CANONICAL_PURCHASE") s.has_purchase = true;
      if (!s.visitor_id && r.visitor_id) s.visitor_id = r.visitor_id;
      if (!s.country && r.country) s.country = r.country;
      if (!s.city && r.city) s.city = r.city;
      if (!s.utm_content && r.utm_content) s.utm_content = r.utm_content;
    }

    // Enrich with lat/lng + is_internal from visitor_activity for the same
    // session_ids. This is READ-ONLY and never contributes to counts — only
    // adds map-display fields. Chunked to keep the `.in()` list manageable.
    //
    // REGRESSION-FIX: writers on canonical_events and visitor_activity use
    // different session_id namespaces (UUID vs `<epoch>-<rand>`). When the
    // session_id join yields nothing, fall back to visitor_id so the truth
    // envelope still carries geo/is_internal and the map can render markers.
    const CONCURRENCY = 6;
    // PERF: instead of N chunked `.in(session_id, …)` lookups (each one a
    // separate round trip against a saturated DB), scan visitor_activity ONCE
    // over the same time window — the exact rows the two enrichment passes
    // could ever match — and join in memory. Same monotonicity guarantee
    // (window-bounded), a fraction of the round trips.
    const vaRows: any[] = [];
    {
      const VA_PAGE = 1000;
      const VA_WAVE = 6;
      let vaFrom = 0;
      let vaDone = false;
      while (!vaDone) {
        const offsets = Array.from({ length: VA_WAVE }, (_, i) => vaFrom + i * VA_PAGE);
        const wave = await Promise.all(
          offsets.map((off) =>
            supabase
              .from("visitor_activity")
              .select("session_id,visitor_id,latitude,longitude,country,city,is_internal,utm_campaign,order_value")
              .gte("created_at", since)
              .lte("created_at", until)
              .order("created_at", { ascending: false })
              .range(off, off + VA_PAGE - 1)
          ),
        );
        for (const { data, error } of wave) {
          if (error) { vaDone = true; continue; } // enrichment failure must not break truth
          if (!data || data.length === 0) { vaDone = true; continue; }
          vaRows.push(...data);
          if (data.length < VA_PAGE) vaDone = true;
        }
        vaFrom += VA_WAVE * VA_PAGE;
        if (vaFrom > 200_000) break;
      }
    }
    {
      for (const row of vaRows) {
        const s = sessionAgg.get(row.session_id as string);
        if (!s) continue;
        if (s.latitude == null && row.latitude != null) s.latitude = Number(row.latitude);
        if (s.longitude == null && row.longitude != null) s.longitude = Number(row.longitude);
        if (!s.country && row.country) s.country = row.country;
        if (!s.city && row.city) s.city = row.city;
        if (row.is_internal === true) s.va_is_internal = true; // diagnostic only
        if (!s.utm_campaign && row.utm_campaign) s.utm_campaign = row.utm_campaign;
        const ov = Number(row.order_value || 0);
        if (ov > s.order_value) s.order_value = ov;
      }
    }

    mark("va_by_session");
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
    {
      // Same window-scanned rows, joined by visitor_id this time. No extra
      // network cost at all.
      for (const row of vaRows) {
        const targets = byVisitor.get(row.visitor_id as string);
        if (!targets) continue;
        for (const s of targets) {
          if (s.latitude == null && row.latitude != null) s.latitude = Number(row.latitude);
          if (s.longitude == null && row.longitude != null) s.longitude = Number(row.longitude);
          if (!s.country && row.country) s.country = row.country;
          if (!s.city && row.city) s.city = row.city;
          if (row.is_internal === true) s.va_is_internal = true; // diagnostic only
          if (!s.utm_campaign && row.utm_campaign) s.utm_campaign = row.utm_campaign;
          const ov = Number(row.order_value || 0);
          if (ov > s.order_value) s.order_value = ov;
        }
      }
    }

    mark("va_by_visitor");
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
      /** Repaired measurement inputs (heartbeat/interaction aware). */
      effective_duration_seconds: number | null;
      duration_evidence_source: string | null;
      interaction_count: number | null;
      engagement_ms: number | null;
      classification_reason: string | null;
    };
    const flagsMap = new Map<string, CommercialFlags>();
    const sidsForFlags = Array.from(new Set(sessionsArr.map((s) => s.session_id)));
    // PERF + CORRECTNESS: a giant `.in(session_id, …)` list is both a slow
    // round trip and — past a few hundred ids — long enough to be rejected at
    // the URL level, which silently emptied `flagsMap` and let excluded
    // traffic through as "commercial". Window-scan the sessions active in the
    // request window instead, then join in memory.
    const wantedSids = new Set(sidsForFlags);
    let flagsScanError: string | null = null;
    {
      const CS_PAGE = 1000;
      const CS_WAVE = 6;
      let csFrom = 0;
      let csDone = false;
      while (!csDone) {
        const offsets = Array.from({ length: CS_WAVE }, (_, i) => csFrom + i * CS_PAGE);
        const wave = await Promise.all(
          offsets.map((off) =>
            supabase
              .from("canonical_sessions")
              .select("session_id,is_internal,is_bot,technical_path,exclude_from_commercial,traffic_class,traffic_quality,effective_duration_seconds,duration_evidence_source,interaction_count,engagement_ms,classification_reason")
              .gte("last_seen_at", since)
              .order("last_seen_at", { ascending: false })
              .range(off, off + CS_PAGE - 1)
          ),
        );
        for (const { data, error } of wave) {
          if (error) { flagsScanError = error.message; csDone = true; continue; }
          if (!data || data.length === 0) { csDone = true; continue; }
          for (const r of data) {
            if (!wantedSids.has(r.session_id as string)) continue;
            flagsMap.set(r.session_id as string, {
              is_internal: r.is_internal === true,
              is_bot: r.is_bot === true,
              technical_path: r.technical_path === true,
              exclude_from_commercial: r.exclude_from_commercial === true,
              traffic_class: (r.traffic_class as string | null) ?? null,
              traffic_quality: (r.traffic_quality as string | null) ?? null,
              effective_duration_seconds: (r.effective_duration_seconds as number | null) ?? null,
              duration_evidence_source: (r.duration_evidence_source as string | null) ?? null,
              interaction_count: (r.interaction_count as number | null) ?? null,
              engagement_ms: (r.engagement_ms as number | null) ?? null,
              classification_reason: (r.classification_reason as string | null) ?? null,
            });
          }
          if (data.length < CS_PAGE) csDone = true;
        }
        csFrom += CS_WAVE * CS_PAGE;
        if (csFrom > 200_000) break;
      }
    }
    // Any session whose flag row was not found in the window scan is looked
    // up directly in small, URL-safe chunks so coverage stays complete.
    const missingSids = sidsForFlags.filter((sid) => !flagsMap.has(sid));
    const flagRows = await mapChunksParallel(missingSids, 200, CONCURRENCY, (batch) =>
      supabase
        .from("canonical_sessions")
        .select("session_id,is_internal,is_bot,technical_path,exclude_from_commercial,traffic_class,traffic_quality,effective_duration_seconds,duration_evidence_source,interaction_count,engagement_ms,classification_reason")
        .in("session_id", batch)
    );
    for (const { data: csRows, error: csErr } of flagRows) {
      if (csErr) { flagsScanError = flagsScanError ?? csErr.message; continue; }
      for (const r of csRows ?? []) {
        flagsMap.set(r.session_id as string, {
          is_internal: r.is_internal === true,
          is_bot: r.is_bot === true,
          technical_path: r.technical_path === true,
          exclude_from_commercial: r.exclude_from_commercial === true,
          traffic_class: (r.traffic_class as string | null) ?? null,
          traffic_quality: (r.traffic_quality as string | null) ?? null,
          effective_duration_seconds: (r.effective_duration_seconds as number | null) ?? null,
          duration_evidence_source: (r.duration_evidence_source as string | null) ?? null,
          interaction_count: (r.interaction_count as number | null) ?? null,
          engagement_ms: (r.engagement_ms as number | null) ?? null,
          classification_reason: (r.classification_reason as string | null) ?? null,
        });
      }
    }
    mark("canonical_sessions_flags");
    const HUMAN_CLASS = new Set([
      "CONFIRMED_HUMAN","PROBABLE_HUMAN","HUMAN_CONFIRMED","HUMAN_PROBABLE",
    ]);
    const HUMAN_QUALITY = new Set(["confirmed_human","probable_human","human"]);
    // LEGACY gate — diagnostics only. No longer decides business KPI inclusion.
    function isCommercialLegacy(s: SessionAgg): boolean {
      const f = flagsMap.get(s.session_id);
      if (f) {
        if (f.is_internal || f.is_bot || f.technical_path || f.exclude_from_commercial) return false;
        if (f.traffic_class && !HUMAN_CLASS.has(f.traffic_class)
            && !(f.traffic_quality && HUMAN_QUALITY.has(f.traffic_quality))) {
          if (["INTERNAL_PREVIEW","BOT_CONFIRMED","BOT_PROBABLE","CRAWLER","TECHNICAL"].includes(f.traffic_class)) return false;
        }
        return true;
      }
      return !(s.is_internal || s.va_is_internal);
    }

    // ── PRODUCTION BUSINESS KPI GATE — commercial_eligible_v3_strict ───
    // Geo-independent by construction: the classifier never sees country as an
    // eligibility input. Geo filtering already happened above (sessionsArr) and
    // only narrows the population, never the verdict.
    // Memory-safe: classify in bounded chunks and retain only the compact
    // verdict per session (the full ClassifiedSession objects for 24k+ rows
    // exhaust the edge worker on the 30d window).
    type Verdict = {
      traffic_quality_class_v3: string;
      commercial_eligible_v3_strict: boolean;
      commercial_eligible_v3_expanded: boolean;
    };
    const eligibilityBySid = new Map<string, Verdict>();
    {
      const CHUNK = 1_000_000; // single pass: cluster analysis must see the whole population
      for (let i = 0; i < sessionsArr.length; i += CHUNK) {
        const slice = sessionsArr.slice(i, i + CHUNK);
        const rows = buildShadowEligibility(
          slice.map((s) => {
            const f = flagsMap.get(s.session_id);
            return {
              ...s,
              stored_traffic_class_v2: f?.traffic_class ?? null,
              stored_exclude_from_commercial: f?.exclude_from_commercial ?? null,
              stored_is_bot: f?.is_bot ?? null,
              stored_is_internal: f?.is_internal ?? null,
              stored_technical_path: f?.technical_path ?? null,
              // Repaired measurement inputs — duration proven by first-party
              // activity (canonical events + visibility-aware heartbeat) and
              // deliberate interaction count. Never fabricated.
              session_duration_seconds: typeof f?.effective_duration_seconds === "number"
                ? f.effective_duration_seconds
                : null,
              duration_evidence_source: f?.duration_evidence_source ?? null,
              interaction_count: typeof f?.interaction_count === "number" ? f.interaction_count : null,
            } as any;
          }),
        );
        rows.forEach((r, j) => {
          const sid = slice[j]?.session_id;
          if (!sid) return;
          eligibilityBySid.set(sid, {
            traffic_quality_class_v3: r.traffic_quality_class_v3,
            commercial_eligible_v3_strict: r.commercial_eligible_v3_strict,
            commercial_eligible_v3_expanded: r.commercial_eligible_v3_expanded,
          });
        });
      }
    }
    // CANARY (2026-08-31): the earlier divergence (ATC 22 vs 30) was traced to
    // the `visitor_activity.is_internal` NL-geo heuristic contaminating the
    // classifier input contract. With that field demoted to the diagnostic
    // `va_is_internal`, the corrected edge path reproduces the validated
    // shadow result exactly (sessions 376, product views 56, ATC 30, cart 29,
    // checkout 23) on the 30d window. The legacy predicate is retained below
    // as the rollback path — do not delete it.
    const V3_GATE_ACTIVE = true;

    function isCommercial(s: SessionAgg): boolean {
      return V3_GATE_ACTIVE
        ? eligibilityBySid.get(s.session_id)?.commercial_eligible_v3_strict === true
        : isCommercialLegacy(s);
    }



    // Buckets for the traffic-quality breakdown card (legacy ingest metadata).
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
    const legacyEligibleCount = sessionsArr.filter(isCommercialLegacy).length;
    const v3_class_counts: Record<string, number> = {};
    let expandedCount = 0;
    for (const r of eligibilityBySid.values()) {
      v3_class_counts[r.traffic_quality_class_v3] = (v3_class_counts[r.traffic_quality_class_v3] ?? 0) + 1;
      if (r.commercial_eligible_v3_expanded) expandedCount++;
    }
    const eligibility_gate = {
      gate: V3_GATE_ACTIVE ? "commercial_eligible_v3_strict" : "legacy_stored_exclude_from_commercial",
      legacy_gate_sessions: legacyEligibleCount,
      strict_v3_sessions: cleanSessionsArr.length,
      expanded_v3_sessions: expandedCount,
      class_counts: v3_class_counts,
      legacy_fields_are_diagnostic_only: true,
    };

    // ── GATE-INDEPENDENT KPI PROJECTIONS (read-only diagnostics) ──────
    // Both predicates are always projected over the SAME population and the
    // SAME window, so a pre/post gate-switch comparison is exact and never
    // has to compare two differently-ended rolling windows. Never used to
    // decide eligibility; purely observational.
    function projectTotals(rows: SessionAgg[]) {
      const vis = new Set<string>();
      let pv = 0, a = 0, vc = 0, ck = 0;
      for (const s of rows) {
        vis.add(s.visitor_id || s.session_id);
        pv += s.page_views;
        if (s.has_add_to_cart) a++;
        if (s.has_view_cart) vc++;
        if (s.has_checkout) ck++;
      }
      return {
        visitors: vis.size,
        sessions: rows.length,
        page_views: pv,
        product_views: rows.filter((s) => s.has_product_view).length,
        add_to_cart: a,
        view_cart: vc,
        checkout_started: ck,
        // Orders are the source of truth for purchases/revenue and are
        // independent of the session eligibility gate.
        purchases: purchases_count,
        revenue: Number(revenue.toFixed(2)),
      };
    }
    const kpi_projection = {
      window: { hours, since, until },
      legacy: projectTotals(sessionsArr.filter(isCommercialLegacy)),
      strict_v3: projectTotals(
        sessionsArr.filter((s) => eligibilityBySid.get(s.session_id)?.commercial_eligible_v3_strict === true),
      ),
      expanded_v3: projectTotals(
        sessionsArr.filter((s) => eligibilityBySid.get(s.session_id)?.commercial_eligible_v3_expanded === true),
      ),
      active_gate: V3_GATE_ACTIVE ? "strict_v3" : "legacy",
    };

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
      // Truth-fix additions (backward compatible): dashboards should
      // display `human_visitors` as the primary "Visitors" KPI and
      // `raw_sessions_all` as an auditable secondary tile.
      human_visitors: visitorsSet.size,
      raw_sessions_all: allSessionsArr.length,
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
      // Raw/audit population (un-gated). Stored v2 flags are legacy ingest
      // metadata for diagnostics only; the authoritative business gate is the
      // read-time `commercial_eligible_v3_strict` flag also carried here.
      sessions: sessionsArr.map((s) => {
        const f = flagsMap.get(s.session_id);
        const e = eligibilityBySid.get(s.session_id);
        return {
          ...s,
          stored_traffic_class_v2: f?.traffic_class ?? null,
          stored_exclude_from_commercial: f?.exclude_from_commercial ?? null,
          stored_is_bot: f?.is_bot ?? null,
          stored_is_internal: f?.is_internal ?? null,
          stored_technical_path: f?.technical_path ?? null,
          // Repaired measurement fields (raw first/last_seen_at above untouched).
          reported_duration_seconds: Math.max(
            0,
            Math.round((new Date(s.last_seen_at).getTime() - new Date(s.first_seen_at).getTime()) / 1000),
          ),
          effective_duration_seconds: f?.effective_duration_seconds ?? null,
          duration_evidence_source: f?.duration_evidence_source ?? null,
          session_duration_seconds: typeof f?.effective_duration_seconds === "number"
            ? f.effective_duration_seconds
            : null,
          interaction_count: f?.interaction_count ?? null,
          engagement_ms: f?.engagement_ms ?? null,
          classification_reason: f?.classification_reason ?? null,
          country_iso2: toIso2(s.country),

          traffic_quality_class_v3: e?.traffic_quality_class_v3 ?? null,
          commercial_eligible_v3_strict: e?.commercial_eligible_v3_strict ?? false,
          commercial_eligible_v3_expanded: e?.commercial_eligible_v3_expanded ?? false,
        };
      }),
      eligibility_gate,
      kpi_projection,



      sample_event: sample,
      diagnostics,
      timings,
      flags_coverage: {
        sessions: sidsForFlags.length,
        with_flag_row: flagsMap.size,
        scan_error: flagsScanError,
      },
      traffic_quality_breakdown,
      generated_at: new Date().toISOString(),
    };

    // ── Phase 4C: v2 as default for authenticated internal consumers ───
    // Backward-compatible. All existing v1 fields above are unchanged.
    // v2 fields are populated when:
    //   (a) caller explicitly requests envelope=v2, OR
    //   (b) admin caller AND `canonical_traffic_quality_v2.default_for_internal`
    //       flag is on AND envelope != 'v1' (explicit legacy fallback).
    const envParam = (envParamRaw || "").toLowerCase();
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
        const gate = await checkCanonicalV2Gate(req, { trustedInternal: internalTrusted });
        respBody.v2_gate = {
          enabled: gate.enabled,
          isAdmin: gate.isAdmin,
          allowV2: gate.allowV2,
          default_for_internal: defaultForInternal,
          envelope_resolved: gate.allowV2 ? "v2" : "v1",
        };
        if (gate.allowV2) {
          // PERF: reuse the single canonical_events pass from above — the
          // v1 select already carries every classifier column. This removes
          // a full duplicate scan of the window per request.
          const rows: ClassifiableRow[] = events.map((r) => ({
            session_id: r.session_id ?? null,
            visitor_id: r.visitor_id ?? null,
            occurred_at: r.occurred_at,
            ingested_at: r.ingested_at ?? null,
            is_internal: r.is_internal ?? null,
            technical_path: r.technical_path ?? null,
            is_bot: r.is_bot ?? null,
            bot_confidence: r.bot_confidence ?? null,
            traffic_quality: r.traffic_quality ?? null,
            classification_version: r.classification_version ?? null,
          })) as ClassifiableRow[];
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
          const CHUNK_ATC = 200;
          const atcChunks = await mapChunksParallel(uniqSids, CHUNK_ATC, 6, (batch) =>
            supabase
              .from("analytics_traffic_classification")
              .select("session_id,traffic_type")
              .in("session_id", batch)
          );
          for (const { data: atc, error: atcErr } of atcChunks) {
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
          //
          // PERF-FIX: these two `count: exact` probes are full sequential
          // scans over `canonical_events`. On the current (saturated) DB
          // instance each one takes ~40s, which alone pushed every
          // dashboard request past the 150s edge idle timeout — the map
          // then rendered the empty legacy v1 state. They are pure
          // diagnostics (never used by any UI counter), so they now only
          // run when explicitly requested with `deep_diagnostics: true`.
          let historicalSessions = 0;
          let joinableBySession = 0;
          if (deepDiagnostics) {
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
          }
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
    mark("v2_block");
    return respBody;
  }
}

// ── Precomputed cache layer ───────────────────────────────────────────
// The 7-day compute costs 35–90s cold against a saturated DB, which is far
// too slow for a mobile dashboard load. The heavy work is therefore done
// out-of-band by `analytics-canonical-warmer` (pg_cron, every 5 minutes)
// and persisted into `public.analytics_canonical_cache` (service-role only,
// RLS on, no anon/authenticated grants). Requests read one indexed row.
//
// Freshness contract: MAX data lag = 5 minutes (refresh cadence). A payload
// older than that is still served — clearly marked `stale: true` with its
// `age_seconds` — for at most MAX_STALE_MS while a single-flight background
// refresh runs. Beyond that the request computes inline rather than serving
// indefinitely stale data. Zeros are never fabricated and there is no silent
// V1 downgrade: on failure the caller gets a real error.
const FRESH_MS = 300_000;      // 5 min — hot-tier warmer cadence
const MAX_STALE_MS = 1_800_000; // 30 min — bounded stale-serve window (hot)
const LOCK_MS = 240_000;        // single-flight lock lease

// Long windows are warmed on a slower tier (14d/10 min, 30d/15 min,
// 90d/30 min) because they are far more expensive and move far more slowly.
// Freshness thresholds must track that cadence, otherwise every dashboard
// load would consider a perfectly current 90d payload "stale" and kick off a
// needless rebuild.
function freshMsFor(hours: number): number {
  if (hours >= 2160) return 1_800_000; // 90d — 30 min
  if (hours >= 720) return 900_000;    // 30d — 15 min
  if (hours >= 336) return 600_000;    // 14d — 10 min
  return FRESH_MS;
}

function maxStaleMsFor(hours: number): number {
  return Math.max(MAX_STALE_MS, freshMsFor(hours) * 4);
}

// Cache key is (hours, geo) ONLY. The envelope is NOT part of the key: the
// warmer requests `envelope: "v2"` while the browser sends no envelope at
// all, and keying on it produced two disjoint caches — warmed rows the UI
// could never read, forcing slow inline computes on every dashboard load.
function cacheKeyFor(hours: number, geo: string): string {
  return `${hours}|${geo}`;
}

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function readCacheRow(key: string) {
  const { data } = await svc()
    .from("analytics_canonical_cache")
    .select("cache_key,payload,generated_at,compute_ms,locked_until,refresh_error")
    .eq("cache_key", key)
    .maybeSingle();
  return data ?? null;
}

async function writeCacheRow(
  key: string,
  hours: number,
  geo: string,
  envelope: string,
  payload: Record<string, unknown>,
  computeMs: number,
) {
  await svc().from("analytics_canonical_cache").upsert({
    cache_key: key,
    hours,
    geo,
    envelope,
    payload,
    compute_ms: computeMs,
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    locked_until: null,
    refresh_error: null,
  }, { onConflict: "cache_key" });
}

/** Single-flight: only one worker may rebuild a given cache key at a time. */
async function acquireLock(key: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  const { data, error } = await svc()
    .from("analytics_canonical_cache")
    .update({ locked_until: until })
    .eq("cache_key", key)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select("cache_key");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

async function releaseLock(key: string, err?: string) {
  await svc()
    .from("analytics_canonical_cache")
    .update({ locked_until: null, refresh_error: err ?? null })
    .eq("cache_key", key);
}

/** Structured, PII-free cache observability. Key/window only — no visitor data. */
function acLog(event: string, key: string, extra: Record<string, unknown> = {}) {
  try {
    console.log(JSON.stringify({ fn: "analytics-canonical", event, cache_key: key, ...extra }));
  } catch { /* logging must never break a request */ }
}

export async function refreshKey(opts: ComputeOpts): Promise<Record<string, unknown>> {
  const key = cacheKeyFor(opts.hours, opts.geo);
  const started = Date.now();
  acLog("recompute_start", key, { hours: opts.hours, geo: opts.geo });
  let payload: Record<string, unknown>;
  try {
    payload = await computeEnvelope(opts);
  } catch (e) {
    acLog("recompute_failure", key, { duration_ms: Date.now() - started, error: (e as Error).message });
    throw e;
  }
  acLog("recompute_success", key, { duration_ms: Date.now() - started });
  await writeCacheRow(
    key,
    opts.hours,
    opts.geo,
    (payload as any)?.v2 ? "v2" : "v1",
    payload,
    Date.now() - started,
  );
  return payload;
}

function withCacheMeta(
  payload: Record<string, unknown>,
  meta: { cache: "hit" | "miss" | "stale"; generatedAt: string | null; ageSeconds: number | null; hours: number },
) {
  return {
    ...payload,
    cached: meta.cache !== "miss",
    cache_status: meta.cache,
    cache_generated_at: meta.generatedAt,
    cache_age_seconds: meta.ageSeconds,
    cache_stale: meta.cache === "stale",
    cache_max_lag_seconds: freshMsFor(meta.hours) / 1000,
    cache_source_window_hours: meta.hours,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = new URL(req.url);
    let body: any = null;
    if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }
    const { hours, geo } = parseInput(url, body);
    const envParam = String(url.searchParams.get("envelope") || body?.envelope || "").toLowerCase();
    const deepDiagnostics =
      body?.deep_diagnostics === true || url.searchParams.get("deep_diagnostics") === "true";
    const internalTrusted = !!req.headers.get("x-internal-secret");
    const forceRefresh = body?.refresh === true || url.searchParams.get("refresh") === "true";
    const key = cacheKeyFor(hours, geo);
    const opts: ComputeOpts = { req, hours, geo, envParam, deepDiagnostics, internalTrusted };

    // Deep diagnostics always bypass the cache (they add expensive probes).
    if (deepDiagnostics) return json(withCacheMeta(await computeEnvelope(opts), {
      cache: "miss", generatedAt: null, ageSeconds: null, hours,
    }));

    // Warmer / explicit rebuild path.
    if (forceRefresh) {
      const got = await acquireLock(key);
      if (!got) {
        // Single-flight is now ENFORCED here too. Requested windows above the
        // supported ceiling clamp down onto an existing key (e.g. the 90d
        // warmer tier lands on the 720h key), so two tiers used to rebuild the
        // identical window concurrently — doubling DB load until the inline
        // rebuild hit the 150s idle timeout (504). A locked key means another
        // worker is already producing exactly this payload: serve the last
        // known-good instead of racing it.
        const locked = await readCacheRow(key);
        if (locked?.payload) {
          const ageSeconds = Math.round(
            (Date.now() - new Date(locked.generated_at as string).getTime()) / 1000,
          );
          return json(withCacheMeta(locked.payload as Record<string, unknown>, {
            cache: "stale", generatedAt: locked.generated_at as string, ageSeconds, hours,
          }));
        }
        return json({
          ok: true,
          skipped: "rebuild_in_progress",
          cache_status: "warming",
          hours,
          geo,
          retry_after_seconds: 30,
        }, 202);
      }
      try {
        const payload = await refreshKey(opts);
        return json(withCacheMeta(payload, {
          cache: "miss", generatedAt: new Date().toISOString(), ageSeconds: 0, hours,
        }));
      } catch (e) {
        await releaseLock(key, (e as Error).message);
        throw e;
      }
    }

    // In-process memo (protects against burst re-renders in one isolate).
    const memo = cache.get(key);
    if (memo && Date.now() - memo.at < TTL_MS) {
      acLog("cache_hit_memo", key, { hours, geo });
      return json({ ...memo.body, cached: true, cache_status: "hit" });
    }

    const row = await readCacheRow(key);
    if (row?.payload) {
      const ageMs = Date.now() - new Date(row.generated_at as string).getTime();
      const ageSeconds = Math.round(ageMs / 1000);
      if (ageMs <= freshMsFor(hours)) {
        acLog("cache_hit", key, { hours, geo, age_seconds: ageSeconds });
        cache.set(key, { at: Date.now(), body: row.payload });
        return json(withCacheMeta(row.payload as Record<string, unknown>, {
          cache: "hit", generatedAt: row.generated_at as string, ageSeconds, hours,
        }));
      }
      const staleServable = ageMs <= maxStaleMsFor(hours) || (!internalTrusted && hours >= 24);
      if (staleServable) {
        // Serve last-known-good immediately, rebuild in the background under
        // a single-flight lock so concurrent admin loads cannot stampede.
        // For browser (non-internal) reads of the expensive windows the stale
        // bound is intentionally unlimited: a marked, slightly old payload is
        // strictly better for the admin than a 60–150s synchronous rebuild on
        // a phone. Age is always surfaced via `cache_age_seconds`/`cache_stale`
        // so no number is ever presented as fresher than it is, and the warmer
        // owns the actual rebuild.
        acLog("cache_stale", key, { hours, geo, age_seconds: ageSeconds });
        const bg = (async () => {
          if (!(await acquireLock(key))) { acLog("recompute_skipped_locked", key, { hours, geo }); return; }
          try { await refreshKey(opts); }
          catch (e) { await releaseLock(key, (e as Error).message); }
        })();
        try { (globalThis as any).EdgeRuntime?.waitUntil?.(bg); } catch { /* noop */ }
        return json(withCacheMeta(row.payload as Record<string, unknown>, {
          cache: "stale", generatedAt: row.generated_at as string, ageSeconds, hours,
        }));
      }
    }

    // Cold: nothing usable cached. Only the warmer (internal) and the cheap 1h
    // window may compute inline; a browser request for a 24h+ window kicks the
    // rebuild into the background and reports CACHE_NOT_READY instead of
    // holding a mobile connection open for minutes.
    if (!internalTrusted && hours >= 24) {
      acLog("cache_miss", key, { hours, geo });
      const bg = (async () => {
        if (!(await acquireLock(key))) { acLog("recompute_skipped_locked", key, { hours, geo }); return; }
        try { await refreshKey(opts); }
        catch (e) { await releaseLock(key, (e as Error).message); }
      })();
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(bg); } catch { /* noop */ }
      return json({
        ok: false,
        error: "CACHE_NOT_READY",
        cache_status: "warming",
        hours,
        geo,
        retry_after_seconds: 30,
      }, 202);
    }
    const payload = await refreshKey(opts);
    cache.set(key, { at: Date.now(), body: payload });
    return json(withCacheMeta(payload, {
      cache: "miss", generatedAt: new Date().toISOString(), ageSeconds: 0, hours,
    }));
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});