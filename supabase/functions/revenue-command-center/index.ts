// Revenue Command Center aggregator. Admin-only.
// Returns: traffic, conversion, products, pinterest, revenue summary.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const svc = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdmin } = await svc.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (!isAdmin) return json({ ok: false, traceId, message: "forbidden" }, 403);

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86400_000);
  const dayAgo = new Date(now.getTime() - 86400_000);

  const iso = (d: Date) => d.toISOString();

  try {
    // ── TRAFFIC ─────────────────────────────────────────────
    const [pinVisitors, productPageVisitors, topPagesRaw] = await Promise.all([
      svc.from("visitor_activity").select("id", { count: "exact", head: true })
        .gte("created_at", iso(dayAgo))
        .eq("utm_source", "pinterest")
        .eq("is_bot_suspect", false),
      svc.from("visitor_activity").select("id", { count: "exact", head: true })
        .gte("created_at", iso(dayAgo))
        .like("page_path", "/products/%")
        .eq("is_bot_suspect", false),
      svc.from("visitor_activity").select("page_path")
        .gte("created_at", iso(dayAgo))
        .eq("is_bot_suspect", false)
        .not("page_path", "is", null)
        .limit(2000),
    ]);
    const topPagesMap = new Map<string, number>();
    for (const r of (topPagesRaw.data ?? []) as { page_path: string }[]) {
      if (!r.page_path) continue;
      topPagesMap.set(r.page_path, (topPagesMap.get(r.page_path) ?? 0) + 1);
    }
    const topPages = [...topPagesMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, visits]) => ({ path, visits }));

    // ── CONVERSION (last 24h) ────────────────────────────────
    const [atc, coStart, purchases, sessions] = await Promise.all([
      svc.from("checkout_funnel_events").select("id", { count: "exact", head: true })
        .gte("created_at", iso(dayAgo)).eq("step", "add_to_cart").eq("is_bot", false),
      svc.from("checkout_funnel_events").select("id", { count: "exact", head: true })
        .gte("created_at", iso(dayAgo)).eq("step", "checkout_started").eq("is_bot", false),
      svc.from("checkout_funnel_events").select("id", { count: "exact", head: true })
        .gte("created_at", iso(dayAgo)).eq("step", "purchase").eq("is_bot", false),
      svc.from("checkout_funnel_events").select("session_id")
        .gte("created_at", iso(dayAgo)).eq("is_bot", false).limit(5000),
    ]);
    const uniqSessions = new Set((sessions.data ?? []).map((r: { session_id: string }) => r.session_id)).size;
    const purchaseCount = purchases.count ?? 0;
    const conversionRate = uniqSessions > 0 ? (purchaseCount / uniqSessions) * 100 : 0;

    // ── REVENUE ─────────────────────────────────────────────
    const [rToday, rWeek, rMonth] = await Promise.all([
      svc.from("orders").select("total_amount").eq("status", "paid").gte("created_at", iso(startOfDay)),
      svc.from("orders").select("total_amount").eq("status", "paid").gte("created_at", iso(weekAgo)),
      svc.from("orders").select("total_amount").eq("status", "paid").gte("created_at", iso(monthAgo)),
    ]);
    const sumCents = (rows: { total_amount: number | null }[] | null) =>
      (rows ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const revToday = sumCents(rToday.data as any);
    const revWeek = sumCents(rWeek.data as any);
    const revMonth = sumCents(rMonth.data as any);
    const monthOrders = (rMonth.data ?? []).length;
    const aov = monthOrders > 0 ? revMonth / monthOrders : 0;

    // ── PRODUCTS ────────────────────────────────────────────
    const [monthOrdersFull, oosRes] = await Promise.all([
      svc.from("orders").select("items").eq("status", "paid").gte("created_at", iso(monthAgo)).limit(5000),
      svc.from("products").select("id,name,slug").or("available.eq.false,in_stock.eq.false").eq("active", true).limit(50),
    ]);
    const prodCounts = new Map<string, { name: string; slug: string; units: number; revenue: number }>();
    for (const o of (monthOrdersFull.data ?? []) as { items: any }[]) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const key = String(it.id ?? it.product_id ?? it.slug ?? it.name ?? "");
        if (!key) continue;
        const qty = Number(it.quantity ?? 1);
        const price = Number(it.price ?? it.unit_amount ?? 0);
        const cur = prodCounts.get(key) ?? { name: it.name ?? it.title ?? key, slug: it.slug ?? "", units: 0, revenue: 0 };
        cur.units += qty;
        cur.revenue += qty * price;
        prodCounts.set(key, cur);
      }
    }
    const ranked = [...prodCounts.values()].sort((a, b) => b.revenue - a.revenue);
    const bestProducts = ranked.slice(0, 10);
    const worstProducts = ranked.slice(-10).reverse().filter(p => p.units > 0);

    // ── PINTEREST ───────────────────────────────────────────
    const [pubToday, queued, drafts, failures, recentPub] = await Promise.all([
      svc.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
        .gte("posted_at", iso(startOfDay)).eq("status", "posted"),
      svc.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
      svc.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "draft"),
      svc.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
        .gte("created_at", iso(dayAgo)).eq("status", "failed"),
      svc.from("pinterest_pin_queue").select("posted_at").eq("status", "posted")
        .order("posted_at", { ascending: false }).limit(1),
    ]);
    const lastPub = (recentPub.data?.[0] as { posted_at: string } | undefined)?.posted_at ?? null;
    const minsSinceLastPub = lastPub ? Math.round((Date.now() - new Date(lastPub).getTime()) / 60000) : null;

    const { data: topPinsRaw } = await svc
      .from("pinterest_pin_performance")
      .select("pin_id,pin_title,clicks,impressions,saves,product_slug")
      .order("clicks", { ascending: false })
      .limit(10);

    return json({
      ok: true,
      traceId,
      generated_at: now.toISOString(),
      traffic: {
        pinterest_visitors_24h: pinVisitors.count ?? 0,
        product_page_visitors_24h: productPageVisitors.count ?? 0,
        top_pages: topPages,
      },
      conversion: {
        add_to_carts_24h: atc.count ?? 0,
        checkout_starts_24h: coStart.count ?? 0,
        purchases_24h: purchaseCount,
        sessions_24h: uniqSessions,
        conversion_rate_pct: Number(conversionRate.toFixed(2)),
      },
      revenue: {
        today_cents: revToday,
        week_cents: revWeek,
        month_cents: revMonth,
        aov_cents: Math.round(aov),
        orders_month: monthOrders,
      },
      products: {
        best: bestProducts,
        worst: worstProducts,
        out_of_stock: oosRes.data ?? [],
      },
      pinterest: {
        published_today: pubToday.count ?? 0,
        queued: queued.count ?? 0,
        drafts: drafts.count ?? 0,
        failures_24h: failures.count ?? 0,
        last_published_at: lastPub,
        minutes_since_last_publish: minsSinceLastPub,
        top_pins: topPinsRaw ?? [],
      },
    });
  } catch (e) {
    console.error("[revenue-command-center]", traceId, e);
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});