import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa = createClient(url, key, { auth: { persistSession: false } });

  let windowDays = 7;
  try {
    const body = await req.json();
    if (body?.window_days && Number.isFinite(body.window_days)) windowDays = Math.max(1, Math.min(90, Number(body.window_days)));
  } catch (_) { /* allow empty body */ }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const sincePrev = new Date(Date.now() - 2 * windowDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. Pinterest-attributed sessions + funnel events
  const [sessionsR, funnelR, ordersR, prevOrdersR, pinsR] = await Promise.all([
    supa.from("pinterest_attribution_sessions").select("id, session_id", { count: "exact", head: false }).gte("created_at", since).limit(50000),
    supa.from("pinterest_funnel_events").select("event_type, value_cents, created_at").gte("created_at", since).limit(100000),
    supa.from("orders").select("id, total_cents, created_at, utm_source, product_slugs:metadata").gte("created_at", since).limit(20000),
    supa.from("orders").select("id, total_cents, utm_source, product_slugs:metadata").gte("created_at", sincePrev).lt("created_at", since).limit(20000),
    supa.from("pinterest_pins").select("id, impressions, outbound_clicks, saves").limit(20000),
  ]);

  const sessions = sessionsR.data?.length ?? 0;
  const funnel = funnelR.data ?? [];
  const atc = funnel.filter((e: any) => e.event_type === "add_to_cart" || e.event_type === "cart").length;
  const purchases = funnel.filter((e: any) => e.event_type === "purchase" || e.event_type === "checkout_complete").length;

  const orders = (ordersR.data ?? []).filter((o: any) => (o.utm_source || "").toLowerCase().includes("pinterest"));
  const revenueCents = orders.reduce((s: number, o: any) => s + (Number(o.total_cents) || 0), 0);
  const prevOrders = (prevOrdersR.data ?? []).filter((o: any) => (o.utm_source || "").toLowerCase().includes("pinterest"));
  const prevRevenue = prevOrders.reduce((s: number, o: any) => s + (Number(o.total_cents) || 0), 0);

  // 2. Pinterest reach proxies — sum across pins table where available
  const pins = pinsR.data ?? [];
  const organicReach = pins.reduce((s: number, p: any) => s + (Number(p.impressions) || 0), 0);
  const outboundClicks = pins.reduce((s: number, p: any) => s + (Number(p.outbound_clicks) || 0), 0);
  const ctr = organicReach > 0 ? outboundClicks / organicReach : 0;
  const convRate = sessions > 0 ? purchases / sessions : 0;
  const paidReach = 0; // ads scope-blocked; report honestly as 0 until Wave 2 ads sync produces a value
  const roas = 0; // no ad spend visible to the gateway yet

  // 3. Trending / losing — aggregate by product slug from orders metadata
  const slugRev = new Map<string, number>();
  const slugPrev = new Map<string, number>();
  for (const o of orders) {
    const slugs: string[] = Array.isArray((o as any).product_slugs?.product_slugs)
      ? (o as any).product_slugs.product_slugs
      : [];
    for (const s of slugs) slugRev.set(s, (slugRev.get(s) ?? 0) + Number(o.total_cents || 0) / Math.max(slugs.length, 1));
  }
  for (const o of prevOrders) {
    const slugs: string[] = Array.isArray((o as any).product_slugs?.product_slugs)
      ? (o as any).product_slugs.product_slugs
      : [];
    for (const s of slugs) slugPrev.set(s, (slugPrev.get(s) ?? 0) + Number(o.total_cents || 0) / Math.max(slugs.length, 1));
  }
  const trending = [...slugRev.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, revenue_cents]) => ({ slug, revenue_cents: Math.round(revenue_cents) }));
  const losing = [...slugPrev.entries()]
    .map(([slug, prev]) => {
      const now = slugRev.get(slug) ?? 0;
      const delta = prev > 0 ? (now - prev) / prev : 0;
      return { slug, delta };
    })
    .filter((x) => x.delta < -0.2)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 10);

  // 4. AI opportunities — pull from existing PE issue log (read-only)
  const { data: issues } = await supa
    .from("pe_issue_log")
    .select("title, expected_impact, severity, status")
    .in("status", ["open", "queued"])
    .order("created_at", { ascending: false })
    .limit(8);
  const aiOpportunities = (issues ?? []).map((i: any) => ({
    title: i.title ?? "Open issue",
    impact: i.expected_impact ?? i.severity ?? "unknown",
  }));

  // 5. Growth score — weighted blend (transparent, honest)
  const revScore = clamp((revenueCents / 100_000) * 10); // $1000 = 10pts up to 100
  const reachScore = clamp(Math.log10(Math.max(organicReach, 1)) * 18);
  const ctrScore = clamp(ctr * 5000);
  const convScore = clamp(convRate * 2000);
  const growthScore = Math.round((revScore + reachScore + ctrScore + convScore) / 4);

  const insert = await supa
    .from("pga_executive_snapshots")
    .insert({
      window_days: windowDays,
      revenue_cents: revenueCents,
      sessions,
      organic_reach: organicReach,
      paid_reach: paidReach,
      ctr,
      outbound_clicks: outboundClicks,
      add_to_cart: atc,
      purchases,
      roas,
      conversion_rate: convRate,
      growth_score: growthScore,
      trending_products: trending,
      losing_products: losing,
      ai_opportunities: aiOpportunities,
      source_breakdown: {
        sessions_source: "pinterest_attribution_sessions",
        funnel_source: "pinterest_funnel_events",
        revenue_source: "orders (utm_source~pinterest)",
        reach_source: "pinterest_pins",
        opportunities_source: "pe_issue_log",
        prev_revenue_cents: prevRevenue,
      },
    })
    .select()
    .single();

  await supa.from("pga_timeline_events").insert({
    event_type: "overview_sync",
    category: "system",
    severity: "info",
    summary: `Executive snapshot computed: growth=${growthScore}, revenue=$${(revenueCents / 100).toFixed(2)}, sessions=${sessions}`,
    payload: { window_days: windowDays, snapshot_id: insert.data?.id ?? null },
    actor: "pga-overview-sync",
  });

  return new Response(JSON.stringify({ ok: true, snapshot: insert.data, error: insert.error?.message ?? null }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: insert.error ? 500 : 200,
  });
});