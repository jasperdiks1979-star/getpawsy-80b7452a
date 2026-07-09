// Genesis V2.5 — Canonical Analytics ingest
// Pulls last N hours from source tables, normalizes to canonical_events.
// Idempotent via dedup_key UNIQUE.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL     = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

type Canon =
  | "CANONICAL_PAGE_VIEW"
  | "CANONICAL_PRODUCT_VIEW"
  | "CANONICAL_ADD_TO_CART"
  | "CANONICAL_CART"
  | "CANONICAL_CHECKOUT"
  | "CANONICAL_PURCHASE"
  | "CANONICAL_ENGAGEMENT";

const CCI_MAP: Record<string, Canon> = {
  page_view: "CANONICAL_PAGE_VIEW",
  product_view: "CANONICAL_PRODUCT_VIEW",
  product_card_click: "CANONICAL_PRODUCT_VIEW",
  add_to_cart_click: "CANONICAL_ADD_TO_CART",
  add_to_cart_success: "CANONICAL_ADD_TO_CART",
  cart_open: "CANONICAL_CART",
  checkout_click: "CANONICAL_CHECKOUT",
  checkout_loaded: "CANONICAL_CHECKOUT",
  payment_redirect_started: "CANONICAL_CHECKOUT",
  payment_success: "CANONICAL_PURCHASE",
  purchase_confirmed: "CANONICAL_PURCHASE",
  homepage_view: "CANONICAL_PAGE_VIEW",
  collection_view: "CANONICAL_PAGE_VIEW",
};

const CHECKOUT_MAP: Record<string, Canon> = {
  begin_checkout: "CANONICAL_CHECKOUT",
  checkout_loaded: "CANONICAL_CHECKOUT",
  checkout_click: "CANONICAL_CHECKOUT",
  payment_redirect_started: "CANONICAL_CHECKOUT",
  payment_success: "CANONICAL_PURCHASE",
  purchase: "CANONICAL_PURCHASE",
};

function dedup(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p ?? "").join("|");
}

/**
 * Semantic dedup key — collapses repeated clicks / redirects / page-reloads
 * inside a short window into a single canonical event.
 *
 * Buckets:
 *   PAGE_VIEW / ENGAGEMENT:  session + canonical + path        + 60s
 *   PRODUCT_VIEW:            session + canonical + product     + 60s
 *   ADD_TO_CART:             session + canonical + product     + 30s
 *   CART:                    session + canonical               + 60s
 *   CHECKOUT:                session + canonical + stripe_sess + 60s
 *   PURCHASE:                order_id OR stripe_session_id (unique)
 */
function bucketISO(iso: string | null | undefined, seconds: number): string {
  const t = iso ? new Date(iso).getTime() : Date.now();
  const b = Math.floor(t / (seconds * 1000)) * seconds * 1000;
  return new Date(b).toISOString();
}

function semanticDedupKey(input: {
  source: string;
  canonical: Canon;
  session_id?: string | null;
  product_id?: string | null;
  page_path?: string | null;
  stripe_session_id?: string | null;
  order_id?: string | null;
  occurred_at?: string | null;
}): string {
  const { source, canonical, session_id, product_id, page_path, stripe_session_id, order_id, occurred_at } = input;
  if (canonical === "CANONICAL_PURCHASE") {
    const anchor = order_id ?? stripe_session_id ?? session_id ?? "unknown";
    return dedup([source, canonical, anchor]);
  }
  let windowSec = 60;
  let anchor: string | null | undefined = null;
  if (canonical === "CANONICAL_ADD_TO_CART") { windowSec = 30; anchor = product_id; }
  else if (canonical === "CANONICAL_PRODUCT_VIEW") { anchor = product_id; }
  else if (canonical === "CANONICAL_CHECKOUT") {
    // Checkout dedup: one canonical checkout per (session, stripe_session_id) pair
    // per 30-minute window. When stripe_session_id is still null (pre-redirect
    // begin_checkout / checkout_loaded), collapse refreshes, back-nav and
    // route re-mounts inside the same session so `CANONICAL_CHECKOUT` cannot
    // exceed `CANONICAL_ADD_TO_CART`. Once Stripe issues a session id, that
    // id becomes the anchor and a genuine second attempt still records.
    anchor = stripe_session_id ?? null;
    windowSec = 1800;
  }
  else if (canonical === "CANONICAL_PAGE_VIEW") { anchor = page_path; }
  else if (canonical === "CANONICAL_ENGAGEMENT") { anchor = page_path; }
  return dedup([source, canonical, session_id, anchor, bucketISO(occurred_at, windowSec)]);
}

async function ingestCci(sb: ReturnType<typeof createClient>, sinceISO: string) {
  const { data, error } = await sb
    .from("cci_events")
    .select("id, session_id, visitor_id, event_name, product_id, source, medium, campaign, landing_page, page_path, referrer, device, country, meta, created_at")
    .gte("created_at", sinceISO)
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? [])
    .map((e: any) => {
      const canonical = CCI_MAP[e.event_name];
      if (!canonical) return null;
      return {
        occurred_at: e.created_at,
        canonical_name: canonical,
        source_system: "cci",
        source_event_id: e.id,
        visitor_id: e.visitor_id,
        session_id: e.session_id,
        product_id: e.product_id ?? null,
        page_path: e.page_path,
        landing_page: e.landing_page,
        referrer: e.referrer,
        utm_source: e.source,
        utm_medium: e.medium,
        utm_campaign: e.campaign,
        utm_content: (e.meta && typeof e.meta === "object" ? (e.meta as any).utm_content : null) ?? null,
        country: e.country,
        device: e.device,
        meta: e.meta ?? {},
        dedup_key: semanticDedupKey({
          source: "cci",
          canonical,
          session_id: e.session_id,
          product_id: e.product_id ?? null,
          page_path: e.page_path ?? null,
          occurred_at: e.created_at,
        }),
      };
    })
    .filter(Boolean);
  if (rows.length === 0) return 0;
  const { error: upErr } = await sb.from("canonical_events").upsert(rows as any, { onConflict: "dedup_key", ignoreDuplicates: true });
  if (upErr) throw upErr;
  return rows.length;
}

async function ingestCheckout(sb: ReturnType<typeof createClient>, sinceISO: string) {
  const { data, error } = await sb
    .from("checkout_funnel_events")
    .select("id, session_id, stripe_session_id, step, value, currency, metadata, source, created_at, geo_country, device")
    .gte("created_at", sinceISO)
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? [])
    .map((e: any) => {
      const canonical = CHECKOUT_MAP[e.step];
      if (!canonical) return null;
      // Prefer real attribution stashed in metadata.utm over the
      // legacy `source` column which is hard-coded to 'client'.
      const utm = (e.metadata && typeof e.metadata === "object" ? e.metadata.utm : null) || {};
      const visitorId = e.metadata && typeof e.metadata === "object"
        ? (typeof e.metadata.visitor_id === "string" ? e.metadata.visitor_id : null)
        : null;
      return {
        occurred_at: e.created_at,
        canonical_name: canonical,
        source_system: "checkout_funnel",
        source_event_id: e.id,
        visitor_id: visitorId,
        session_id: e.session_id,
        stripe_session_id: e.stripe_session_id,
        utm_source: (typeof utm.source === "string" && utm.source) || e.source || null,
        utm_medium: (typeof utm.medium === "string" && utm.medium) || null,
        utm_campaign: (typeof utm.campaign === "string" && utm.campaign) || null,
        utm_content: (typeof utm.content === "string" && utm.content) || null,
        utm_term: (typeof utm.term === "string" && utm.term) || null,
        country: e.geo_country,
        device: e.device,
        value_cents: e.value ? Math.round(Number(e.value) * 100) : null,
        currency: e.currency,
        meta: e.metadata ?? {},
        dedup_key: semanticDedupKey({
          source: "checkout_funnel",
          canonical,
          session_id: e.session_id,
          stripe_session_id: e.stripe_session_id ?? null,
          occurred_at: e.created_at,
        }),
      };
    })
    .filter(Boolean);
  if (rows.length === 0) return 0;
  const { error: upErr } = await sb.from("canonical_events").upsert(rows as any, { onConflict: "dedup_key", ignoreDuplicates: true });
  if (upErr) throw upErr;
  return rows.length;
}

async function ingestOrders(sb: ReturnType<typeof createClient>, sinceISO: string) {
  const { data, error } = await sb
    .from("orders")
    .select("id, stripe_session_id, ga_client_id, total_amount, currency, status, created_at")
    .eq("status", "paid")
    .gte("created_at", sinceISO)
    .limit(2000);
  if (error) throw error;
  const rows = (data ?? []).map((o: any) => ({
    occurred_at: o.created_at,
    canonical_name: "CANONICAL_PURCHASE" as Canon,
    source_system: "orders",
    source_event_id: o.id,
    stripe_session_id: o.stripe_session_id,
    ga_client_id: o.ga_client_id,
    order_id: o.id,
    value_cents: o.total_amount ? Math.round(Number(o.total_amount) * 100) : null,
    currency: o.currency,
    meta: {},
    dedup_key: semanticDedupKey({
      source: "orders",
      canonical: "CANONICAL_PURCHASE",
      order_id: o.id,
      stripe_session_id: o.stripe_session_id ?? null,
    }),
  }));
  if (rows.length === 0) return 0;
  const { error: upErr } = await sb.from("canonical_events").upsert(rows as any, { onConflict: "dedup_key", ignoreDuplicates: true });
  if (upErr) throw upErr;
  return rows.length;
}

async function refreshSessions(sb: ReturnType<typeof createClient>, sinceISO: string) {
  const sql = `
    INSERT INTO public.canonical_sessions
      (session_id, visitor_id, ga_client_id, first_seen_at, last_seen_at,
       landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
       country, city, device, browser, os, last_stage, order_id, stripe_session_id, updated_at)
    SELECT
      session_id,
      (array_agg(visitor_id) FILTER (WHERE visitor_id IS NOT NULL))[1],
      (array_agg(ga_client_id) FILTER (WHERE ga_client_id IS NOT NULL))[1],
      min(occurred_at), max(occurred_at),
      (array_agg(landing_page ORDER BY occurred_at) FILTER (WHERE landing_page IS NOT NULL))[1],
      (array_agg(referrer ORDER BY occurred_at) FILTER (WHERE referrer IS NOT NULL))[1],
      (array_agg(utm_source ORDER BY occurred_at) FILTER (WHERE utm_source IS NOT NULL))[1],
      (array_agg(utm_medium ORDER BY occurred_at) FILTER (WHERE utm_medium IS NOT NULL))[1],
      (array_agg(utm_campaign ORDER BY occurred_at) FILTER (WHERE utm_campaign IS NOT NULL))[1],
      (array_agg(utm_content ORDER BY occurred_at) FILTER (WHERE utm_content IS NOT NULL))[1],
      (array_agg(utm_term ORDER BY occurred_at) FILTER (WHERE utm_term IS NOT NULL))[1],
      (array_agg(country) FILTER (WHERE country IS NOT NULL))[1],
      (array_agg(city) FILTER (WHERE city IS NOT NULL))[1],
      (array_agg(device) FILTER (WHERE device IS NOT NULL))[1],
      (array_agg(browser) FILTER (WHERE browser IS NOT NULL))[1],
      (array_agg(os) FILTER (WHERE os IS NOT NULL))[1],
      (array_agg(canonical_name ORDER BY occurred_at DESC))[1],
      (array_agg(order_id) FILTER (WHERE order_id IS NOT NULL))[1],
      (array_agg(stripe_session_id) FILTER (WHERE stripe_session_id IS NOT NULL))[1],
      now()
    FROM public.canonical_events
    WHERE session_id IS NOT NULL AND ingested_at >= $1::timestamptz - interval '5 minutes'
    GROUP BY session_id
    ON CONFLICT (session_id) DO UPDATE SET
      last_seen_at      = GREATEST(canonical_sessions.last_seen_at, EXCLUDED.last_seen_at),
      last_stage        = EXCLUDED.last_stage,
      order_id          = COALESCE(EXCLUDED.order_id, canonical_sessions.order_id),
      stripe_session_id = COALESCE(EXCLUDED.stripe_session_id, canonical_sessions.stripe_session_id),
      updated_at        = now();
  `;
  // supabase-js can't run raw SQL; expose via RPC if needed. Skip in v1 — sessions backfilled by refresh job.
  // We instead call a small RPC below.
  // Prefer the combined refresh + attribution RPC; fall back to the legacy upsert-only path.
  const { error } = await sb.rpc("canonical_session_refresh_with_attribution", { since: sinceISO });
  if (error) {
    const { error: fallbackErr } = await sb.rpc("canonical_session_upsert_recent", { since: sinceISO });
    if (fallbackErr && !fallbackErr.message.includes("does not exist")) throw fallbackErr;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: either service-role JWT (cron) or shared internal secret
  const internalHeader = req.headers.get("x-internal-secret") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const okInternal = INTERNAL.length > 0 && internalHeader === INTERNAL;
  const okJwt = auth.includes(SERVICE_KEY);
  if (!okInternal && !okJwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const hours = Math.min(Number(url.searchParams.get("hours") ?? "2"), 24 * 35);
  const sinceISO = new Date(Date.now() - hours * 3600_000).toISOString();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const out: Record<string, unknown> = { since: sinceISO };
  try {
    out.cci = await ingestCci(sb, sinceISO);
    out.checkout_funnel = await ingestCheckout(sb, sinceISO);
    out.orders = await ingestOrders(sb, sinceISO);
    await refreshSessions(sb, sinceISO).catch((e) => { out.sessions_warning = String(e?.message ?? e); });
    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message), partial: out }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
