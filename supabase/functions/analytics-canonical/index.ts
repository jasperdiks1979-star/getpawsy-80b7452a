// analytics-canonical — the ONE source of truth for every dashboard.
// Reads `canonical_events` + `orders` (paid) with the Clean filter baked in.
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
//   sample_event: { ... } | null,   // one recent canonical event for debugging
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    const url = new URL(req.url);
    let body: any = null;
    if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }
    const { hours, geo } = parseInput(url, body);
    const key = `${hours}|${geo}`;
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
        .select("canonical_name,occurred_at,visitor_id,session_id,order_id,product_id,page_path,utm_source,utm_medium,referrer,country,device")
        .gte("occurred_at", since)
        .lte("occurred_at", until)
        .order("occurred_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (geo === "US") q = q.eq("country", "US");
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
      .select("id,total_amount,currency,status,created_at,shipping_address")
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
    const revenue = purchases.reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
    const currency = (purchases[0] as any)?.currency ?? "eur";

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

    const purchases_count = purchases.length;
    const totals = {
      visitors: visitors.size,
      sessions: sessions.size,
      page_views: page_views_raw,
      product_views: perStage.CANONICAL_PRODUCT_VIEW.size,
      add_to_cart: perStage.CANONICAL_ADD_TO_CART.size,
      view_cart: perStage.CANONICAL_CART.size,
      checkout_started: perStage.CANONICAL_CHECKOUT.size,
      purchases: purchases_count,
      revenue: Number(revenue.toFixed(2)),
      currency,
      conversion_rate: visitors.size > 0 ? +((purchases_count / visitors.size) * 100).toFixed(2) : 0,
    };

    const funnel = STAGES.map((stage) => ({
      stage,
      count: stage === "CANONICAL_PURCHASE" ? purchases_count : (stage === "CANONICAL_PAGE_VIEW" ? page_views_raw : perStage[stage].size),
    }));

    const countries = Array.from(perCountry.entries()).map(([country, c]) => ({
      country,
      visitors: c.visitors.size,
      sessions: c.sessions.size,
      page_views: c.pv,
      add_to_cart: c.atc.size,
      checkout_started: c.co.size,
      purchases: c.pur.size,
    })).sort((a, b) => b.visitors - a.visitors);

    const sources = Array.from(perSource.entries()).map(([source, ss]) => ({
      source, sessions: ss.size,
    })).sort((a, b) => b.sessions - a.sessions);

    const sample = events[0] ?? null;

    const respBody = {
      ok: true,
      window: { hours, since, until },
      filter: { geo, clean: true, source: "canonical_events + orders(status IN paid,completed)" },
      totals,
      funnel,
      countries,
      sources,
      sample_event: sample,
      generated_at: new Date().toISOString(),
    };

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