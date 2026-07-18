// pinterest-campaign-report
// Aggregates the pin → landing → ATC → purchase funnel for a given
// utm_campaign (default: golden_pin). Joins pinterest_attribution_sessions
// (carries utm_campaign) with pinterest_funnel_events (carries
// event_name + value). Read-only. Admin JWT required.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = {
  session_key: string;
  utm_campaign: string | null;
  utm_source: string | null;
  utm_content: string | null;
  pin_id: string | null;
  landing_slug: string | null;
  first_seen: string;
  click_counted: boolean;
};
type Ev = {
  session_key: string | null;
  pin_id: string | null;
  event_name: string;
  product_slug: string | null;
  value: number | null;
  occurred_at: string;
};

async function authorize(req: Request): Promise<{ ok: boolean; status?: number; msg?: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, msg: "missing bearer" };
  const svc = createClient(SUPABASE_URL, SERVICE);
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, status: 401, msg: "invalid jwt" };
  const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: { role?: string }) => r.role === "admin"))
    return { ok: false, status: 403, msg: "admin only" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const auth = await authorize(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, traceId, error: auth.msg }), {
      status: auth.status ?? 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const campaign = String(body.campaign ?? url.searchParams.get("campaign") ?? "golden_pin");
    const days = Math.max(1, Math.min(365, Number(body.days ?? url.searchParams.get("days") ?? 30)));
    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();

    const sb = createClient(SUPABASE_URL, SERVICE);

    // 1. Sessions in the campaign window (paginated safety cap 10k)
    const { data: sessions, error: sErr } = await sb
      .from("pinterest_attribution_sessions")
      .select("session_key,utm_campaign,utm_source,utm_content,pin_id,landing_slug,first_seen,click_counted")
      .eq("utm_campaign", campaign)
      .gte("first_seen", sinceIso)
      .order("first_seen", { ascending: false })
      .limit(10000);
    if (sErr) throw new Error(`sessions: ${sErr.message}`);
    const sess = (sessions ?? []) as Row[];
    const sessionKeys = sess.map((s) => s.session_key);

    // 2. Events for those sessions
    let events: Ev[] = [];
    if (sessionKeys.length > 0) {
      const chunk = 500;
      for (let i = 0; i < sessionKeys.length; i += chunk) {
        const slice = sessionKeys.slice(i, i + chunk);
        const { data: evs, error: eErr } = await sb
          .from("pinterest_funnel_events")
          .select("session_key,pin_id,event_name,product_slug,value,occurred_at")
          .in("session_key", slice)
          .gte("occurred_at", sinceIso);
        if (eErr) throw new Error(`events: ${eErr.message}`);
        events = events.concat((evs ?? []) as Ev[]);
      }
    }

    // 3. Aggregations
    const totalSessions = sess.length;
    const outboundClicks = sess.filter((s) => s.click_counted).length;

    const seenBy = (name: string) => {
      const keys = new Set<string>();
      for (const e of events) if (e.event_name === name && e.session_key) keys.add(e.session_key);
      return keys.size;
    };
    const landings = seenBy("page_view") + seenBy("product_view");
    const uniqueLandingSessions = (() => {
      const s = new Set<string>();
      for (const e of events)
        if ((e.event_name === "page_view" || e.event_name === "product_view") && e.session_key) s.add(e.session_key);
      return s.size;
    })();
    const addToCartSessions = seenBy("add_to_cart");
    const checkoutSessions = seenBy("begin_checkout") + seenBy("checkout");
    const purchaseSessions = seenBy("purchase");

    const revenueUsd = events
      .filter((e) => e.event_name === "purchase" && typeof e.value === "number" && (e.value as number) > 0)
      .reduce((a, e) => a + (e.value as number), 0);
    const atcValueUsd = events
      .filter((e) => e.event_name === "add_to_cart" && typeof e.value === "number" && (e.value as number) > 0)
      .reduce((a, e) => a + (e.value as number), 0);

    // 4. Per-pin breakdown
    const perPin: Record<string, {
      pin_id: string;
      sessions: number;
      outbound_clicks: number;
      atc_sessions: number;
      purchase_sessions: number;
      revenue_usd: number;
    }> = {};
    for (const s of sess) {
      const pid = s.pin_id ?? "unknown";
      const row = (perPin[pid] ??= {
        pin_id: pid,
        sessions: 0,
        outbound_clicks: 0,
        atc_sessions: 0,
        purchase_sessions: 0,
        revenue_usd: 0,
      });
      row.sessions += 1;
      if (s.click_counted) row.outbound_clicks += 1;
    }
    // fold session-linked events into per-pin
    const sessionPin = new Map<string, string>();
    for (const s of sess) sessionPin.set(s.session_key, s.pin_id ?? "unknown");
    const sessionEventTypes = new Map<string, Set<string>>();
    for (const e of events) {
      if (!e.session_key) continue;
      const set = sessionEventTypes.get(e.session_key) ?? new Set<string>();
      set.add(e.event_name);
      sessionEventTypes.set(e.session_key, set);
      if (e.event_name === "purchase" && typeof e.value === "number") {
        const pid = sessionPin.get(e.session_key) ?? "unknown";
        (perPin[pid] ??= {
          pin_id: pid, sessions: 0, outbound_clicks: 0, atc_sessions: 0, purchase_sessions: 0, revenue_usd: 0,
        }).revenue_usd += (e.value as number);
      }
    }
    for (const [sk, types] of sessionEventTypes) {
      const pid = sessionPin.get(sk) ?? "unknown";
      const row = (perPin[pid] ??= {
        pin_id: pid, sessions: 0, outbound_clicks: 0, atc_sessions: 0, purchase_sessions: 0, revenue_usd: 0,
      });
      if (types.has("add_to_cart")) row.atc_sessions += 1;
      if (types.has("purchase")) row.purchase_sessions += 1;
    }

    const perPinArr = Object.values(perPin).sort((a, b) => b.revenue_usd - a.revenue_usd || b.outbound_clicks - a.outbound_clicks);

    // 5. Rates
    const denom = outboundClicks || totalSessions || 1;
    const rate = (n: number) => (denom > 0 ? Math.round((n / denom) * 10000) / 100 : 0);

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        campaign,
        window_days: days,
        since_iso: sinceIso,
        totals: {
          attributed_sessions: totalSessions,
          outbound_clicks: outboundClicks,
          unique_landing_sessions: uniqueLandingSessions,
          landing_events: landings,
          add_to_cart_sessions: addToCartSessions,
          checkout_sessions: checkoutSessions,
          purchase_sessions: purchaseSessions,
          revenue_usd: Math.round(revenueUsd * 100) / 100,
          atc_value_usd: Math.round(atcValueUsd * 100) / 100,
        },
        rates_pct: {
          click_to_atc: rate(addToCartSessions),
          click_to_checkout: rate(checkoutSessions),
          click_to_purchase: rate(purchaseSessions),
          atc_to_purchase: addToCartSessions ? Math.round((purchaseSessions / addToCartSessions) * 10000) / 100 : 0,
          revenue_per_click_usd: outboundClicks ? Math.round((revenueUsd / outboundClicks) * 100) / 100 : 0,
        },
        per_pin: perPinArr,
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});