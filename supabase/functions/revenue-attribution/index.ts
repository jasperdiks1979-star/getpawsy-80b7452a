// GENESIS Ω∞ — Revenue Attribution Engine (read-only aggregator)
// Reads the v_product_attribution_daily / v_funnel_intelligence_daily /
// v_landing_page_intelligence_daily views + canonical_sessions and returns
// pre-rolled data for /admin/revenue-attribution-center.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = Record<string, unknown>;

async function requireAdmin(req: Request): Promise<{ ok: boolean; sb: ReturnType<typeof createClient> }> {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, sb };
  const { data: user } = await sb.auth.getUser(token);
  if (!user?.user) return { ok: false, sb };
  const { data: role } = await sb
    .from("user_roles").select("role").eq("user_id", user.user.id).eq("role", "admin").maybeSingle();
  return { ok: !!role, sb };
}

function sinceISO(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 10000) / 100;
}

async function sourcesRollup(sb: ReturnType<typeof createClient>, days: number) {
  const { data, error } = await sb
    .from("v_funnel_intelligence_daily")
    .select("*")
    .gte("day", sinceISO(days).slice(0, 10))
    .limit(5000);
  if (error) throw error;
  const map = new Map<string, any>();
  for (const r of (data ?? []) as Row[]) {
    const ch = String(r.channel ?? "unknown");
    const cur = map.get(ch) ?? {
      channel: ch, landing: 0, product: 0, atc: 0, checkout: 0, purchase: 0, revenue_cents: 0,
    };
    cur.landing += Number(r.landing_sessions ?? 0);
    cur.product += Number(r.product_view_sessions ?? 0);
    cur.atc += Number(r.atc_sessions ?? 0);
    cur.checkout += Number(r.checkout_sessions ?? 0);
    cur.purchase += Number(r.purchase_sessions ?? 0);
    cur.revenue_cents += Number(r.revenue_cents ?? 0);
    map.set(ch, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, conversion_pct: pct(r.purchase, r.landing || r.product) }))
    .sort((a, b) => b.revenue_cents - a.revenue_cents);
}

async function productsRollup(sb: ReturnType<typeof createClient>, days: number) {
  const { data, error } = await sb
    .from("v_product_attribution_daily")
    .select("*")
    .gte("day", sinceISO(days).slice(0, 10))
    .limit(20000);
  if (error) throw error;
  const map = new Map<string, any>();
  for (const r of (data ?? []) as Row[]) {
    const pid = String(r.product_id ?? "unknown");
    const cur = map.get(pid) ?? {
      product_id: pid, product_views: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue_cents: 0, sessions: 0,
    };
    cur.product_views += Number(r.product_views ?? 0);
    cur.add_to_carts += Number(r.add_to_carts ?? 0);
    cur.checkouts += Number(r.checkouts ?? 0);
    cur.purchases += Number(r.purchases ?? 0);
    cur.revenue_cents += Number(r.revenue_cents ?? 0);
    cur.sessions += Number(r.sessions ?? 0);
    map.set(pid, cur);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      atc_rate_pct: pct(r.add_to_carts, r.product_views),
      purchase_rate_pct: pct(r.purchases, r.product_views),
      abandonment_pct: pct(r.add_to_carts - r.purchases, r.add_to_carts),
    }))
    .sort((a, b) => b.revenue_cents - a.revenue_cents)
    .slice(0, 200);
}

async function landingRollup(sb: ReturnType<typeof createClient>, days: number) {
  const { data, error } = await sb
    .from("v_landing_page_intelligence_daily")
    .select("*")
    .gte("day", sinceISO(days).slice(0, 10))
    .limit(20000);
  if (error) throw error;
  const map = new Map<string, any>();
  for (const r of (data ?? []) as Row[]) {
    const key = String(r.landing_page ?? "/");
    const cur = map.get(key) ?? {
      landing_page: key, sessions: 0, unique_visitors: 0, product_view_sessions: 0,
      atc_sessions: 0, purchases: 0, revenue_cents: 0,
    };
    cur.sessions += Number(r.sessions ?? 0);
    cur.unique_visitors += Number(r.unique_visitors ?? 0);
    cur.product_view_sessions += Number(r.product_view_sessions ?? 0);
    cur.atc_sessions += Number(r.atc_sessions ?? 0);
    cur.purchases += Number(r.purchases ?? 0);
    cur.revenue_cents += Number(r.revenue_cents ?? 0);
    map.set(key, cur);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      bounce_pct: pct(r.sessions - r.product_view_sessions, r.sessions),
      conversion_pct: pct(r.purchases, r.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 100);
}

async function coverageCert(sb: ReturnType<typeof createClient>, days: number) {
  const since = sinceISO(days);
  // UTM coverage
  const { data: sessionsAgg } = await sb.rpc("noop_never_exists").select().limit(0).maybeSingle().then(
    () => ({ data: null }),
    () => ({ data: null }),
  );
  void sessionsAgg;
  const { count: totalSessions } = await sb
    .from("canonical_sessions").select("session_id", { count: "exact", head: true })
    .gte("first_seen_at", since);
  const { count: classifiedSessions } = await sb
    .from("canonical_sessions").select("session_id", { count: "exact", head: true })
    .not("classified_channel", "is", null).gte("first_seen_at", since);
  const { count: nonDirect } = await sb
    .from("canonical_sessions").select("session_id", { count: "exact", head: true })
    .not("classified_channel", "in", "(direct,unknown)").gte("first_seen_at", since);
  const { count: withUtm } = await sb
    .from("canonical_sessions").select("session_id", { count: "exact", head: true })
    .not("first_utm_source", "is", null).gte("first_seen_at", since);
  const { count: totalOrders } = await sb
    .from("orders").select("id", { count: "exact", head: true })
    .eq("status", "paid").gte("created_at", since);
  const { count: attributedOrders } = await sb
    .from("canonical_sessions").select("session_id", { count: "exact", head: true })
    .not("order_id", "is", null).gte("first_seen_at", since);
  const t = totalSessions ?? 0;
  return {
    window_days: days,
    total_sessions: t,
    attribution_completeness_pct: pct(classifiedSessions ?? 0, t),
    utm_coverage_pct: pct(withUtm ?? 0, t),
    source_classification_accuracy_pct: pct(nonDirect ?? 0, t),
    revenue_traceability_pct: pct(attributedOrders ?? 0, totalOrders ?? 0),
    total_orders: totalOrders ?? 0,
    attributed_orders: attributedOrders ?? 0,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- CJIE (Customer Journey Intelligence) ----------
async function cjieOverview(sb: ReturnType<typeof createClient>, days: number) {
  const since = sinceISO(days);
  const { data, error } = await sb.from("cjie_session_journeys")
    .select("intent_class,abandonment_reason,reached_purchase,reached_atc,reached_checkout,classified_channel,duration_ms,event_count,trust_interactions,checkout_interactions,last_seen,intent_confidence,abandonment_confidence")
    .gte("last_seen", since).limit(50000);
  if (error) throw error;
  const rows = data ?? [];
  const total = rows.length;
  const intent: Record<string, number> = {};
  const abandon: Record<string, number> = {};
  const channel: Record<string, { sessions: number; buyers: number }> = {};
  let purchases = 0, atc = 0, checkout = 0, unknown = 0, trustHits = 0;
  let intentConfSum = 0, abandonConfSum = 0, abandonRows = 0;
  for (const r of rows) {
    intent[String(r.intent_class ?? "Unknown")] = (intent[String(r.intent_class ?? "Unknown")] ?? 0) + 1;
    if (r.abandonment_reason) {
      abandon[String(r.abandonment_reason)] = (abandon[String(r.abandonment_reason)] ?? 0) + 1;
      abandonConfSum += Number(r.abandonment_confidence ?? 0);
      abandonRows++;
    }
    const ch = String(r.classified_channel ?? "unknown");
    channel[ch] ??= { sessions: 0, buyers: 0 };
    channel[ch].sessions++;
    if (r.reached_purchase) { channel[ch].buyers++; purchases++; }
    if (r.reached_atc) atc++;
    if (r.reached_checkout) checkout++;
    if (r.intent_class === "Unknown") unknown++;
    intentConfSum += Number(r.intent_confidence ?? 0);
    const ti = (r.trust_interactions ?? {}) as Record<string, unknown>;
    if (ti && Object.keys(ti).length > 0) trustHits++;
  }
  const channelRows = Object.entries(channel).map(([c, v]) => ({
    channel: c, sessions: v.sessions, buyers: v.buyers,
    conversion_pct: pct(v.buyers, v.sessions),
  })).sort((a, b) => b.sessions - a.sessions);
  return {
    window_days: days,
    total_sessions: total,
    reached_atc: atc,
    reached_checkout: checkout,
    reached_purchase: purchases,
    intent_distribution: intent,
    abandonment_distribution: abandon,
    channel_conversion: channelRows,
    journey_completeness_pct: pct(total - unknown, total),
    behaviour_classification_pct: pct(total - unknown, total),
    abandonment_classification_pct: pct(abandonRows - (abandon["Unknown"] ?? 0), abandonRows),
    trust_classification_pct: pct(trustHits, total),
    unknown_journey_pct: pct(unknown, total),
    avg_intent_confidence: total ? Math.round((intentConfSum / total) * 100) / 100 : 0,
    avg_abandon_confidence: abandonRows ? Math.round((abandonConfSum / abandonRows) * 100) / 100 : 0,
  };
}

async function cjieLive(sb: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data, error } = await sb.from("cjie_session_journeys")
    .select("session_id,visitor_id,classified_channel,intent_class,intent_confidence,abandonment_reason,duration_ms,event_count,page_count,entry_page,exit_page,country,device,reached_atc,reached_checkout,reached_purchase,last_seen,stage_sequence")
    .gte("last_seen", since).order("last_seen", { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}

async function cjiePaths(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("v_journey_paths_top").select("*").limit(40);
  if (error) throw error;
  return data ?? [];
}

async function cjieProducts(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb.from("v_product_journey_health").select("*").limit(100);
  if (error) throw error;
  return data ?? [];
}

async function cjieSessionDetail(sb: ReturnType<typeof createClient>, sessionId: string) {
  const [{ data: j }, { data: events }] = await Promise.all([
    sb.from("cjie_session_journeys").select("*").eq("session_id", sessionId).maybeSingle(),
    sb.from("canonical_events").select("occurred_at,canonical_name,page_path,product_id,value_cents,meta")
      .eq("session_id", sessionId).order("occurred_at", { ascending: true }).limit(500),
  ]);
  return { journey: j, events: events ?? [] };
}

async function cjieQuestions(sb: ReturnType<typeof createClient>, days: number) {
  const since = sinceISO(days);
  const [journeys, products, paths] = await Promise.all([
    sb.from("cjie_session_journeys").select("classified_channel,device,country,intent_class,abandonment_reason,reached_purchase,entry_page,product_ids").gte("last_seen", since).limit(50000),
    sb.from("v_product_journey_health").select("product_id,purchase_rate_pct,lost_after_atc,views").limit(500),
    sb.from("v_journey_paths_top").select("path,sessions,conversion_pct,reached_purchase").limit(40),
  ]);
  const rows = journeys.data ?? [];
  const byKey = (k: keyof typeof rows[number]) => {
    const m = new Map<string, { s: number; b: number }>();
    for (const r of rows) {
      const key = String((r as any)[k] ?? "unknown");
      const cur = m.get(key) ?? { s: 0, b: 0 };
      cur.s++; if ((r as any).reached_purchase) cur.b++;
      m.set(key, cur);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, sessions: v.s, buyers: v.b, conversion_pct: pct(v.b, v.s) }))
      .sort((a, b) => b.buyers - a.buyers || b.sessions - a.sessions);
  };
  const entryPageCvr = byKey("entry_page" as any).filter((r) => r.sessions >= 3).slice(0, 10);
  const deviceCvr = byKey("device" as any).slice(0, 10);
  const countryCvr = byKey("country" as any).slice(0, 10);
  const channelCvr = byKey("classified_channel" as any).slice(0, 10);
  const bestPath = (paths.data ?? []).filter((p: any) => p.reached_purchase).sort((a: any, b: any) => b.sessions - a.sessions)[0] ?? null;
  const worstProduct = (products.data ?? []).filter((p: any) => p.views >= 20).sort((a: any, b: any) => b.lost_after_atc - a.lost_after_atc)[0] ?? null;
  return {
    best_converting_journey: bestPath,
    best_landing_pages: entryPageCvr,
    worst_product_by_lost_atc: worstProduct,
    best_channels: channelCvr,
    device_conversion: deviceCvr,
    country_conversion: countryCvr,
    retarget_candidates_count: rows.filter((r: any) => !r.reached_purchase && (r.intent_class === "Abandoned Cart" || r.intent_class === "Checkout Hesitation" || r.intent_class === "High Purchase Intent")).length,
  };
}

async function cjieCertify(sb: ReturnType<typeof createClient>, days: number) {
  const [overview, questions] = await Promise.all([cjieOverview(sb, days), cjieQuestions(sb, days)]);
  const payload = {
    type: "customer_journey_intelligence",
    window_days: days,
    issued_at: new Date().toISOString(),
    overview,
    questions,
  };
  const hash = await sha256Hex(JSON.stringify(payload));
  const { data, error } = await sb.from("genesis_perpetual_certifications").insert({
    narrative: `CJIE Certification — ${days}d. Completeness ${overview.journey_completeness_pct}%, Behaviour ${overview.behaviour_classification_pct}%, Abandonment ${overview.abandonment_classification_pct}%, Trust ${overview.trust_classification_pct}%, Unknown ${overview.unknown_journey_pct}%.`,
    evidence: payload,
    fingerprint_sha256: hash,
  }).select().maybeSingle();
  if (error) throw error;
  return { certification: data, hash };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { ok, sb } = await requireAdmin(req);
  if (!ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "overview";
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "14"), 1), 90);
  try {
    if (action === "sources")   return json({ ok: true, sources: await sourcesRollup(sb, days) });
    if (action === "products")  return json({ ok: true, products: await productsRollup(sb, days) });
    if (action === "landing")   return json({ ok: true, landing: await landingRollup(sb, days) });
    if (action === "coverage")  return json({ ok: true, coverage: await coverageCert(sb, days) });
    if (action === "certify") {
      const [sources, products, landing, coverage] = await Promise.all([
        sourcesRollup(sb, days), productsRollup(sb, days), landingRollup(sb, days), coverageCert(sb, days),
      ]);
      const payload = {
        type: "revenue_attribution",
        window_days: days,
        issued_at: new Date().toISOString(),
        coverage,
        top_sources: sources.slice(0, 20),
        top_products: products.slice(0, 20),
        top_landing: landing.slice(0, 20),
      };
      const hash = await sha256Hex(JSON.stringify(payload));
      const { data, error } = await sb.from("genesis_perpetual_certifications").insert({
        narrative: `Revenue Attribution Certification — ${days}d window. Completeness ${coverage.attribution_completeness_pct}%, UTM ${coverage.utm_coverage_pct}%, Traceability ${coverage.revenue_traceability_pct}%.`,
        evidence: payload,
        fingerprint_sha256: hash,
      }).select().maybeSingle();
      if (error) throw error;
      return json({ ok: true, certification: data, hash });
    }
    // ---- CJIE actions ----
    if (action === "cjie_overview")   return json({ ok: true, overview: await cjieOverview(sb, days) });
    if (action === "cjie_live")       return json({ ok: true, live: await cjieLive(sb) });
    if (action === "cjie_paths")      return json({ ok: true, paths: await cjiePaths(sb) });
    if (action === "cjie_products")   return json({ ok: true, products: await cjieProducts(sb) });
    if (action === "cjie_questions")  return json({ ok: true, questions: await cjieQuestions(sb, days) });
    if (action === "cjie_session") {
      const sid = url.searchParams.get("session_id") ?? "";
      if (!sid) return json({ ok: false, error: "session_id required" }, 400);
      return json({ ok: true, ...(await cjieSessionDetail(sb, sid)) });
    }
    if (action === "cjie_certify")    return json({ ok: true, ...(await cjieCertify(sb, days)) });
    // overview
    const [sources, coverage] = await Promise.all([sourcesRollup(sb, days), coverageCert(sb, days)]);
    return json({ ok: true, sources, coverage });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}