// Pinterest Attribution Acceleration Mode
//
// 15-min attribution refresh + hourly health + chain verification + auto-repair.
// Actions:
//   backfill      → re-link all historical Pinterest sessions / clicks / events
//                   to pin_id via utm_content, then trigger attribution-v3 rebuild.
//   repair        → patch broken mappings (attribution_sessions missing pin_id,
//                   funnel_events missing pin_id but resolvable via session_key).
//   health        → compute coverage % over last 24h, persist health row,
//                   alert if coverage_pct < 80.
//   verify_chain  → walk click → landing → session → product_view → purchase.
//   tick          → rebuild attribution + autopilot if enough new data.
//   run_full      → repair → backfill → tick → health.
//
// Safe to call manually any time. No AI Gateway calls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COVERAGE_ALERT_THRESHOLD = 80; // %
const MIN_NEW_EVENTS_FOR_TIER_RECALC = 25;

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoHoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

/**
 * utm_content for Pinterest pins is encoded as `pin_<pinId>` or `<pinId>`.
 * Extract a clean pinterest pin id from arbitrary utm_content / utm_campaign.
 */
function pinIdFromUtm(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = String(c).match(/\b(\d{15,22})\b/); // pinterest pin ids are 15-22 digit numerics
    if (m) return m[1];
    const m2 = String(c).match(/pin[_\-:]([A-Za-z0-9]{6,})/i);
    if (m2) return m2[1];
  }
  return null;
}

// ---------------------------------------------------------------
// REPAIR: scan recent Pinterest sessions / events missing pin_id
// ---------------------------------------------------------------
async function repair(sb: ReturnType<typeof createClient>, hours = 720) {
  const since = isoHoursAgo(hours);
  let sessionsRepaired = 0;
  let eventsRepaired = 0;

  // 1. utm_session_log → pinterest_attribution_sessions backfill
  const { data: utmRows } = await sb
    .from("utm_session_log")
    .select("session_id, utm_source, utm_campaign, utm_content, utm_medium, referrer, landing_page, created_at")
    .or("utm_source.ilike.%pinterest%,referrer.ilike.%pinterest%,source_channel.eq.pinterest")
    .gte("created_at", since)
    .limit(10000);

  const upserts: any[] = [];
  for (const r of utmRows ?? []) {
    const pinId = pinIdFromUtm(r.utm_content, r.utm_campaign);
    upserts.push({
      session_key: r.session_id,
      pin_id: pinId,
      pin_mode: pinId ? "utm" : "referrer",
      landing_slug: typeof r.landing_page === "string" ? r.landing_page.replace(/^https?:\/\/[^/]+/, "") : null,
      utm_source: r.utm_source ?? "pinterest",
      utm_campaign: r.utm_campaign ?? null,
      utm_content: r.utm_content ?? null,
      last_seen: new Date().toISOString(),
    });
  }

  // Chunked upsert keyed by session_key
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error, count } = await sb
      .from("pinterest_attribution_sessions")
      .upsert(chunk, { onConflict: "session_key", ignoreDuplicates: false, count: "exact" });
    if (!error) sessionsRepaired += count ?? chunk.length;
  }

  // 2. pinterest_funnel_events missing pin_id but session_key known → patch from sessions table
  const { data: brokenEvents } = await sb
    .from("pinterest_funnel_events")
    .select("id, session_key, pin_id, occurred_at")
    .is("pin_id", null)
    .not("session_key", "is", null)
    .gte("occurred_at", since)
    .limit(10000);

  if (brokenEvents && brokenEvents.length) {
    const keys = [...new Set(brokenEvents.map((e) => e.session_key as string))];
    const { data: sessLookup } = await sb
      .from("pinterest_attribution_sessions")
      .select("session_key, pin_id")
      .in("session_key", keys);
    const pinBySession = new Map<string, string>();
    for (const s of sessLookup ?? []) {
      if (s.pin_id) pinBySession.set(s.session_key as string, s.pin_id as string);
    }
    // Batch updates per pin_id (Postgres has no efficient bulk-update; use grouped IN)
    const eventsByPin = new Map<string, string[]>();
    for (const e of brokenEvents) {
      const pin = pinBySession.get(e.session_key as string);
      if (!pin) continue;
      const arr = eventsByPin.get(pin) ?? [];
      arr.push(e.id as string);
      eventsByPin.set(pin, arr);
    }
    for (const [pin, ids] of eventsByPin) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { error, count } = await sb
          .from("pinterest_funnel_events")
          .update({ pin_id: pin })
          .in("id", chunk)
          .select("id", { count: "exact", head: true });
        if (!error) eventsRepaired += count ?? chunk.length;
      }
    }
  }

  return { sessions_repaired: sessionsRepaired, events_repaired: eventsRepaired, window_hours: hours };
}

// ---------------------------------------------------------------
// BACKFILL: ingest historical checkout purchases into funnel events
// ---------------------------------------------------------------
async function backfill(sb: ReturnType<typeof createClient>, hours = 24 * 90) {
  const since = isoHoursAgo(hours);
  let purchasesInserted = 0;
  let atcInserted = 0;

  // pinterest sessions in window
  const { data: sessions } = await sb
    .from("pinterest_attribution_sessions")
    .select("session_key, pin_id, last_seen")
    .not("pin_id", "is", null)
    .gte("last_seen", since)
    .limit(20000);
  const pinBySession = new Map<string, string>();
  for (const s of sessions ?? []) pinBySession.set(s.session_key as string, s.pin_id as string);
  if (!pinBySession.size) {
    return { purchases_inserted: 0, atc_inserted: 0, sessions_scanned: 0 };
  }

  // Find checkout events for those sessions
  const keys = [...pinBySession.keys()];
  for (let i = 0; i < keys.length; i += 200) {
    const batch = keys.slice(i, i + 200);
    const { data: cfe } = await sb
      .from("checkout_funnel_events")
      .select("session_id, step, value, currency, created_at")
      .in("session_id", batch)
      .in("step", ["add_to_cart", "purchase", "begin_checkout", "product_view"])
      .gte("created_at", since);

    const rows: any[] = [];
    for (const ev of cfe ?? []) {
      const pin = pinBySession.get(ev.session_id as string);
      if (!pin) continue;
      rows.push({
        session_key: ev.session_id,
        pin_id: pin,
        event_name: ev.step,
        value: ev.value ?? 0,
        currency: ev.currency ?? "USD",
        occurred_at: ev.created_at,
      });
    }
    if (rows.length) {
      const { error } = await sb.from("pinterest_funnel_events").insert(rows);
      if (!error) {
        purchasesInserted += rows.filter((r) => r.event_name === "purchase").length;
        atcInserted += rows.filter((r) => r.event_name === "add_to_cart").length;
      }
    }
  }

  // Rebuild attribution v3 now that history is enriched
  let rebuild: any = null;
  try {
    const res = await sb.functions.invoke("pinterest-revenue-attribution-v3", {
      body: { action: "rebuild" },
    });
    rebuild = res.data ?? { ok: false };
  } catch (e) { rebuild = { ok: false, error: (e as Error).message }; }

  return { purchases_inserted: purchasesInserted, atc_inserted: atcInserted, sessions_scanned: keys.length, rebuild };
}

// ---------------------------------------------------------------
// HEALTH: coverage % + alert
// ---------------------------------------------------------------
async function health(sb: ReturnType<typeof createClient>) {
  const since = isoHoursAgo(24);

  const { count: pinterestSessions } = await sb
    .from("utm_session_log").select("id", { count: "exact", head: true })
    .or("utm_source.ilike.%pinterest%,referrer.ilike.%pinterest%,source_channel.eq.pinterest")
    .gte("created_at", since);

  const { count: attributedSessions } = await sb
    .from("pinterest_attribution_sessions").select("id", { count: "exact", head: true })
    .not("pin_id", "is", null).gte("last_seen", since);

  const eventCount = async (name: string) => {
    const { count } = await sb.from("pinterest_funnel_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", name).gte("occurred_at", since);
    return count ?? 0;
  };
  const attributedEventCount = async (name: string) => {
    const { count } = await sb.from("pinterest_funnel_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", name).not("pin_id", "is", null).gte("occurred_at", since);
    return count ?? 0;
  };

  const [pv, atc, pu, apv, aatc, apu] = await Promise.all([
    eventCount("product_view"),
    eventCount("add_to_cart"),
    eventCount("purchase"),
    attributedEventCount("product_view"),
    attributedEventCount("add_to_cart"),
    attributedEventCount("purchase"),
  ]);

  // Coverage = weighted sessions+events with pin_id / total
  const totalSig = (pinterestSessions ?? 0) + pv + atc + pu;
  const attrSig = (attributedSessions ?? 0) + apv + aatc + apu;
  const coverage = totalSig > 0 ? +(attrSig / totalSig * 100).toFixed(2) : 100;

  // Broken chains: events with session_key but no pin_id in window
  const { count: brokenChains } = await sb.from("pinterest_funnel_events")
    .select("id", { count: "exact", head: true })
    .is("pin_id", null).not("session_key", "is", null)
    .gte("occurred_at", since);

  const alert_level =
    coverage < 50 ? "critical" :
    coverage < COVERAGE_ALERT_THRESHOLD ? "warning" : "ok";

  const row = {
    window_hours: 24,
    pinterest_clicks: pinterestSessions ?? 0,
    attributed_clicks: attributedSessions ?? 0,
    pinterest_sessions: pinterestSessions ?? 0,
    attributed_sessions: attributedSessions ?? 0,
    product_views: pv,
    attributed_product_views: apv,
    add_to_carts: atc,
    attributed_add_to_carts: aatc,
    purchases: pu,
    attributed_purchases: apu,
    coverage_pct: coverage,
    broken_chains: brokenChains ?? 0,
    repaired: 0,
    alert_level,
    details: { threshold: COVERAGE_ALERT_THRESHOLD },
  };

  // Auto-repair if alerting
  if (alert_level !== "ok") {
    try {
      const r = await repair(sb, 24);
      (row as any).repaired = (r.sessions_repaired ?? 0) + (r.events_repaired ?? 0);
      (row as any).details = { ...row.details, auto_repair: r };
    } catch (e) {
      (row as any).details = { ...row.details, auto_repair_error: (e as Error).message };
    }
  }

  await sb.from("pinterest_attribution_health").insert(row);

  return row;
}

// ---------------------------------------------------------------
// VERIFY CHAIN: walk click → landing → session → view → purchase
// ---------------------------------------------------------------
async function verifyChain(sb: ReturnType<typeof createClient>) {
  const since = isoHoursAgo(24);
  const { data: pins } = await sb
    .from("pinterest_attribution_sessions")
    .select("session_key, pin_id, landing_slug, last_seen")
    .not("pin_id", "is", null)
    .gte("last_seen", since)
    .limit(2000);

  let clicks = 0, withLanding = 0, withView = 0, withAtc = 0, withPurchase = 0;
  const broken: string[] = [];
  const keys = (pins ?? []).map((p) => p.session_key as string);
  clicks = keys.length;
  withLanding = (pins ?? []).filter((p) => p.landing_slug).length;

  if (keys.length) {
    const { data: events } = await sb
      .from("pinterest_funnel_events")
      .select("session_key, event_name")
      .in("session_key", keys)
      .gte("occurred_at", since);
    const bySession = new Map<string, Set<string>>();
    for (const e of events ?? []) {
      const s = bySession.get(e.session_key as string) ?? new Set();
      s.add(e.event_name as string);
      bySession.set(e.session_key as string, s);
    }
    for (const p of pins ?? []) {
      const evs = bySession.get(p.session_key as string) ?? new Set();
      if (evs.has("product_view") || evs.has("page_view")) withView++;
      if (evs.has("add_to_cart")) withAtc++;
      if (evs.has("purchase")) withPurchase++;
      if (!evs.size) broken.push(p.session_key as string);
    }
  }

  return {
    clicks, with_landing: withLanding, with_view: withView,
    with_atc: withAtc, with_purchase: withPurchase,
    broken_sample: broken.slice(0, 10),
  };
}

// ---------------------------------------------------------------
// TICK: 15-min cadence — rebuild attribution, and rerun autopilot
// (tier recalc) when enough new events exist.
// ---------------------------------------------------------------
async function tick(sb: ReturnType<typeof createClient>) {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count: newEvents } = await sb.from("pinterest_funnel_events")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", fifteenMinAgo);

  let rebuild: any = null, autopilot: any = null, ran_autopilot = false;
  try {
    const r = await sb.functions.invoke("pinterest-revenue-attribution-v3", { body: { action: "rebuild" } });
    rebuild = r.data;
  } catch (e) { rebuild = { error: (e as Error).message }; }

  if ((newEvents ?? 0) >= MIN_NEW_EVENTS_FOR_TIER_RECALC) {
    ran_autopilot = true;
    try {
      const r = await sb.functions.invoke("pinterest-revenue-autopilot", { body: {} });
      autopilot = r.data;
    } catch (e) { autopilot = { error: (e as Error).message }; }
  }
  return { new_events_15m: newEvents ?? 0, ran_autopilot, rebuild, autopilot };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const startedAt = Date.now();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action ?? new URL(req.url).searchParams.get("action") ?? "tick") as string;

    if (action === "repair")       return json({ ok: true, action, ...(await repair(sb, body.hours ?? 720)) });
    if (action === "backfill")     return json({ ok: true, action, ...(await backfill(sb, body.hours ?? 24 * 90)) });
    if (action === "health")       return json({ ok: true, action, ...(await health(sb)) });
    if (action === "verify_chain") return json({ ok: true, action, ...(await verifyChain(sb)) });
    if (action === "tick")         return json({ ok: true, action, ...(await tick(sb)) });
    if (action === "run_full") {
      const rep = await repair(sb, body.hours ?? 720);
      const bf  = await backfill(sb, body.hours ?? 24 * 90);
      const tk  = await tick(sb);
      const hl  = await health(sb);
      return json({
        ok: true, action, duration_ms: Date.now() - startedAt,
        repair: rep, backfill: bf, tick: tk, health: hl,
      });
    }
    return json({ ok: false, error: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});