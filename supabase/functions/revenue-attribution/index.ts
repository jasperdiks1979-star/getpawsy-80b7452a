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
        certification_type: "revenue_attribution",
        payload,
        payload_hash: hash,
        status: "certified",
      }).select().maybeSingle();
      if (error) throw error;
      return json({ ok: true, certification: data, hash });
    }
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