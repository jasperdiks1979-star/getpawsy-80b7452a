// AI CEO — Revenue Autopilot Phase 10
// Pure intelligence layer. Reads from existing engines. Writes only to ai_ceo_*.
// Hourly loop: observe → explain → predict → rank → recommend → learn.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Rec = {
  rank: number;
  title: string;
  category: string;
  reason: string;
  evidence: Record<string, unknown>;
  expected_revenue_cents: number;
  expected_sales: number;
  expected_traffic: number;
  impact_score: number;
  confidence: number;
  risk: number;
  difficulty: number;
  roi_score: number;
  time_to_result_hours: number;
  owner: string;
  dedupe_key: string;
};

async function observe(sb: ReturnType<typeof createClient>) {
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const since1 = new Date(Date.now() - 86400000).toISOString();

  const [ordersAll, orders7, orders1, checkout7, visitors7, oosProducts, priorityRecs, executive] =
    await Promise.all([
      sb.from("orders").select("id, total_amount, created_at, status").in("status", ["paid", "fulfilled", "completed"]),
      sb.from("orders").select("id, total_amount").in("status", ["paid", "fulfilled", "completed"]).gte("created_at", since7),
      sb.from("orders").select("id, total_amount").in("status", ["paid", "fulfilled", "completed"]).gte("created_at", since1),
      sb.from("checkout_funnel_events").select("event_name").gte("created_at", since7),
      sb.from("visitor_activity").select("id, utm_source").gte("created_at", since7),
      sb.from("products").select("id, name, slug, us_stock").lte("us_stock", 0).limit(50),
      sb.from("agp_action_priorities").select("*").order("priority_score", { ascending: false }).limit(20),
      sb.from("ai_executive_snapshots").select("*").order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const totalSales = ordersAll.data?.length ?? 0;
  const totalRevCents = (ordersAll.data ?? []).reduce((s, o: any) => s + Math.round(Number(o.total_amount ?? 0) * 100), 0);
  const sales7 = orders7.data?.length ?? 0;
  const rev7Cents = (orders7.data ?? []).reduce((s, o: any) => s + Math.round(Number(o.total_amount ?? 0) * 100), 0);
  const sales1 = orders1.data?.length ?? 0;
  const rev1Cents = (orders1.data ?? []).reduce((s, o: any) => s + Math.round(Number(o.total_amount ?? 0) * 100), 0);

  const ev = checkout7.data ?? [];
  const counts: Record<string, number> = {};
  for (const e of ev) counts[(e as any).event_name] = (counts[(e as any).event_name] ?? 0) + 1;
  const checkoutStarts = counts["begin_checkout"] ?? counts["checkout_start"] ?? 0;
  const purchases = counts["purchase"] ?? 0;
  const checkoutCvr = checkoutStarts > 0 ? purchases / checkoutStarts : 0;

  const visitors = visitors7.data?.length ?? 0;
  const aov = sales7 > 0 ? rev7Cents / sales7 / 100 : 0;
  const cvr = visitors > 0 ? sales7 / visitors : 0;

  return {
    sales: { all: totalSales, week: sales7, day: sales1, remaining_to_100: Math.max(0, 100 - totalSales) },
    revenue: { all_cents: totalRevCents, week_cents: rev7Cents, day_cents: rev1Cents, aov },
    funnel: { visitors_7d: visitors, checkout_starts: checkoutStarts, purchases, checkout_cvr: checkoutCvr, site_cvr: cvr },
    inventory: { out_of_stock_count: oosProducts.data?.length ?? 0, oos_sample: oosProducts.data ?? [] },
    upstream_recs: priorityRecs.data ?? [],
    executive_snapshot: executive.data ?? null,
    since: { d1: since1, d7: since7, d30: since30 },
  };
}

function explain(obs: any) {
  const out: string[] = [];
  if (obs.sales.day === 0) out.push("No sales in last 24h — focus on top-of-funnel boost or checkout fixes.");
  if (obs.funnel.checkout_cvr < 0.2 && obs.funnel.checkout_starts > 5)
    out.push(`Checkout CVR low (${(obs.funnel.checkout_cvr * 100).toFixed(1)}%) — friction repair urgent.`);
  if (obs.inventory.out_of_stock_count > 100)
    out.push(`${obs.inventory.out_of_stock_count} OOS products bleed traffic — supplier swap candidates.`);
  if (obs.funnel.visitors_7d < 200) out.push("Traffic thin — Pinterest publish cadence and SEO push needed.");
  return { notes: out };
}

function predict(obs: any) {
  const dailyRev = obs.revenue.week_cents / 7;
  const dailySales = obs.sales.week / 7;
  return {
    tomorrow: { sales: Math.round(dailySales), revenue_cents: Math.round(dailyRev) },
    d7: { sales: Math.round(dailySales * 7), revenue_cents: Math.round(dailyRev * 7) },
    d30: { sales: Math.round(dailySales * 30), revenue_cents: Math.round(dailyRev * 30) },
    confidence: Math.min(1, obs.sales.week / 20),
  };
}

function rank(obs: any): Rec[] {
  const recs: Rec[] = [];
  let r = 1;
  const push = (rec: Omit<Rec, "rank" | "roi_score">) => {
    const roi = (rec.expected_revenue_cents / 100) * rec.confidence * (1 - rec.risk * 0.3) / Math.max(1, rec.difficulty);
    recs.push({ ...rec, rank: r++, roi_score: roi });
  };

  if (obs.funnel.checkout_cvr < 0.25 && obs.funnel.checkout_starts > 3) {
    push({
      title: "Repair checkout friction",
      category: "checkout",
      reason: `Checkout CVR ${(obs.funnel.checkout_cvr * 100).toFixed(1)}% with ${obs.funnel.checkout_starts} starts/7d. Lifting to 50% recovers ~${Math.round((obs.funnel.checkout_starts - obs.funnel.purchases) * 0.5)} sales.`,
      evidence: obs.funnel,
      expected_revenue_cents: Math.round((obs.funnel.checkout_starts - obs.funnel.purchases) * 0.5 * (obs.revenue.aov || 35) * 100),
      expected_sales: Math.max(1, Math.round((obs.funnel.checkout_starts - obs.funnel.purchases) * 0.5)),
      expected_traffic: 0, impact_score: 0.9, confidence: 0.75, risk: 0.1, difficulty: 2,
      time_to_result_hours: 48, owner: "engineering",
      dedupe_key: "checkout_friction",
    });
  }

  if (obs.inventory.out_of_stock_count > 50) {
    push({
      title: `Replace ${obs.inventory.out_of_stock_count} OOS winners`,
      category: "inventory",
      reason: `${obs.inventory.out_of_stock_count} products at zero US stock burn paid traffic. Swap to in-stock suppliers.`,
      evidence: { oos: obs.inventory.out_of_stock_count, sample: obs.inventory.oos_sample.slice(0, 5) },
      expected_revenue_cents: obs.inventory.out_of_stock_count * 200,
      expected_sales: Math.round(obs.inventory.out_of_stock_count / 50),
      expected_traffic: obs.inventory.out_of_stock_count * 10, impact_score: 0.8, confidence: 0.65, risk: 0.2, difficulty: 3,
      time_to_result_hours: 72, owner: "merchandising",
      dedupe_key: "oos_swap",
    });
  }

  if (obs.funnel.visitors_7d < 500) {
    push({
      title: "Accelerate Pinterest publishing cadence",
      category: "pinterest",
      reason: `Only ${obs.funnel.visitors_7d} visitors/7d. Pinterest queue can deliver +200–400 visitors/week per 40 quality pins.`,
      evidence: { visitors_7d: obs.funnel.visitors_7d },
      expected_revenue_cents: Math.round(300 * (obs.funnel.site_cvr || 0.01) * (obs.revenue.aov || 35) * 100),
      expected_sales: Math.max(1, Math.round(300 * (obs.funnel.site_cvr || 0.01))),
      expected_traffic: 300, impact_score: 0.7, confidence: 0.55, risk: 0.15, difficulty: 1,
      time_to_result_hours: 96, owner: "pinterest",
      dedupe_key: "pinterest_cadence",
    });
  }

  // Carry upstream priority recommendations (deduped to top 5)
  for (const u of (obs.upstream_recs ?? []).slice(0, 5)) {
    const u_any = u as any;
    push({
      title: u_any.recommendation_title ?? u_any.action_title ?? "Priority action",
      category: u_any.category ?? "growth",
      reason: u_any.rationale ?? u_any.explanation ?? "Upstream AGP priority signal.",
      evidence: { source: "agp_action_priorities", id: u_any.id, score: u_any.priority_score },
      expected_revenue_cents: Math.round(Number(u_any.expected_revenue_cents ?? u_any.revenue_potential ?? 0)),
      expected_sales: Number(u_any.expected_sales ?? 0),
      expected_traffic: Number(u_any.expected_traffic ?? 0),
      impact_score: Math.min(1, Number(u_any.priority_score ?? 50) / 100),
      confidence: Number(u_any.confidence ?? 0.5),
      risk: Number(u_any.risk_score ?? 0.2),
      difficulty: Number(u_any.difficulty ?? 2),
      time_to_result_hours: 72, owner: u_any.owner ?? "autonomous",
      dedupe_key: `agp_${u_any.id}`,
    });
  }

  // Anti-waste filter: require >=$10 expected revenue OR strong confidence
  return recs
    .filter((x) => x.expected_revenue_cents >= 1000 || x.confidence >= 0.7)
    .sort((a, b) => b.roi_score - a.roi_score)
    .slice(0, 10)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

function executiveScore(obs: any, recs: Rec[]) {
  const revHealth = Math.min(100, (obs.sales.week / 10) * 100);
  const checkoutHealth = Math.min(100, obs.funnel.checkout_cvr * 200);
  const trafficHealth = Math.min(100, obs.funnel.visitors_7d / 10);
  const inventoryHealth = Math.max(0, 100 - obs.inventory.out_of_stock_count / 5);
  const overall = Math.round((revHealth + checkoutHealth + trafficHealth + inventoryHealth) / 4);
  return {
    revenue_health: Math.round(revHealth),
    checkout_health: Math.round(checkoutHealth),
    traffic_health: Math.round(trafficHealth),
    inventory_health: Math.round(inventoryHealth),
    overall_business_health: overall,
    actions_ranked: recs.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger ?? "manual";
  const mode = body.mode ?? "loop"; // loop | daily_report

  const { data: run, error: runErr } = await sb
    .from("ai_ceo_runs")
    .insert({ status: "running", trigger })
    .select()
    .single();
  if (runErr) return new Response(JSON.stringify({ error: runErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const obs = await observe(sb);
    const exp = explain(obs);
    const pred = predict(obs);
    const recs = rank(obs);
    const score = executiveScore(obs, recs);

    await sb.from("ai_ceo_runs").update({
      status: "complete", finished_at: new Date().toISOString(),
      observe: obs, explain: exp, predict: pred, executive_score: score,
    }).eq("id", run.id);

    if (recs.length) {
      await sb.from("ai_ceo_recommendations").insert(recs.map((r) => ({ ...r, run_id: run.id })));
    }

    if (mode === "daily_report") {
      await sb.from("ai_ceo_daily_reports").upsert({
        report_date: new Date().toISOString().slice(0, 10),
        mission_status: { sales: obs.sales, revenue: obs.revenue, funnel: obs.funnel },
        top_10: recs,
        executive_score: score,
        forecast: pred,
        summary: exp.notes.join(" "),
        generated_at: new Date().toISOString(),
      }, { onConflict: "report_date" });
    }

    return new Response(JSON.stringify({ ok: true, run_id: run.id, recommendations: recs.length, executive_score: score }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("ai_ceo_runs").update({ status: "error", error: msg, finished_at: new Date().toISOString() }).eq("id", run.id);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});