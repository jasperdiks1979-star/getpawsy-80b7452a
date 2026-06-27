// Sales Commander — Mission Zero (first 100 verified sales).
// Thin aggregator over orders + existing growth tables. Read-only, no mutations.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFIED = ["paid", "fulfilled", "completed", "succeeded"];

async function authorize(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  if (auth === `Bearer ${SERVICE_ROLE}`) return { sb, mode: "service" as const };
  if (!auth.startsWith("Bearer ")) return null;
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return null;
  const { data: role } = await sb.from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return role ? { sb, mode: "admin" as const } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const ok = await authorize(req);
    if (!ok) return json({ error: "unauthorized" }, 401);
    const { sb } = ok;

    const now = new Date();
    const startToday = new Date(now); startToday.setUTCHours(0, 0, 0, 0);
    const startWeek = new Date(now.getTime() - 7 * 86400000);
    const startMonth = new Date(now.getTime() - 30 * 86400000);

    const { data: orders } = await sb.from("orders")
      .select("id,status,total_amount,currency,items,created_at")
      .in("status", VERIFIED)
      .order("created_at", { ascending: false })
      .limit(2000);
    const rows = orders ?? [];
    const sum = (rs: typeof rows) => rs.reduce((a, r) => a + Number(r.total_amount || 0), 0);
    const inRange = (since: Date) => rows.filter((r) => new Date(r.created_at) >= since);

    const salesAll = rows.length;
    const revenueAll = sum(rows);
    const salesToday = inRange(startToday).length;
    const revenueToday = sum(inRange(startToday));
    const salesWeek = inRange(startWeek).length;
    const revenueWeek = sum(inRange(startWeek));
    const salesMonth = inRange(startMonth).length;
    const revenueMonth = sum(inRange(startMonth));

    // 30-day daily rate → days-to-100 forecast.
    const dailyRate = salesMonth / 30;
    const remaining = Math.max(0, 100 - salesAll);
    const daysTo100 = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : null;
    const projected = daysTo100 != null ? new Date(now.getTime() + daysTo100 * 86400000).toISOString() : null;
    const confidence = Math.min(1, salesMonth / 30); // grows with data
    const aov = salesAll ? revenueAll / salesAll : 0;

    // Visitor + Pinterest signals (best-effort, never throw).
    const [{ count: visitors30 }, { count: pinClicks30 }] = await Promise.all([
      sb.from("visitor_activity").select("id", { count: "exact", head: true })
        .gte("created_at", startMonth.toISOString()),
      sb.from("pinterest_funnel_events").select("id", { count: "exact", head: true })
        .eq("event_name", "page_view").gte("created_at", startMonth.toISOString()),
    ]).catch(() => [{ count: 0 } as any, { count: 0 } as any]);
    const cvr = visitors30 ? salesMonth / visitors30 : 0;
    const rpv = visitors30 ? revenueMonth / visitors30 : 0;
    const rppc = pinClicks30 ? revenueMonth / pinClicks30 : 0;

    // Top opportunities (reuse existing engines, no new scoring).
    const [{ data: topRecs }, { data: topProducts }, { data: topPins }] = await Promise.all([
      sb.from("growth_orchestrator_recommendations")
        .select("id,title,category,confidence,priority_score,est_revenue_gain,expected_impact,evidence")
        .order("priority_score", { ascending: false }).limit(100),
      sb.from("agp_product_opportunity")
        .select("product_id,product_slug,opportunity_score,expected_revenue_gain,reason")
        .order("opportunity_score", { ascending: false }).limit(50),
      sb.from("pinterest_revenue_opportunity_scores")
        .select("product_id,score,tier,bestseller_probability,components")
        .order("score", { ascending: false }).limit(50),
    ]);

    return json({
      ok: true,
      generated_at: now.toISOString(),
      mission: { goal: 100, current: salesAll, remaining, progress_pct: Math.min(100, (salesAll / 100) * 100) },
      revenue: { all_time: revenueAll, today: revenueToday, week: revenueWeek, month: revenueMonth },
      sales: { all_time: salesAll, today: salesToday, week: salesWeek, month: salesMonth },
      kpis: { aov, conversion_rate: cvr, revenue_per_visitor: rpv, revenue_per_pin_click: rppc, visitors_30d: visitors30 ?? 0, pin_clicks_30d: pinClicks30 ?? 0 },
      forecast: { daily_rate: dailyRate, days_to_100: daysTo100, projected_completion: projected, confidence },
      opportunities: {
        top_recommendations: topRecs ?? [],
        top_products: topProducts ?? [],
        top_pins: topPins ?? [],
      },
      recent_orders: rows.slice(0, 20).map((r) => ({ id: r.id, total: Number(r.total_amount), currency: r.currency, created_at: r.created_at })),
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
