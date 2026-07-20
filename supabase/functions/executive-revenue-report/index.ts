import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const PAID_STATUSES = ["paid", "completed", "fulfilled", "shipped", "delivered"];
const MODEL = "google/gemini-2.5-flash";

function daysAgoIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function startOfTodayUtcIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trigger = (await req.json().catch(() => ({})))?.trigger ?? "manual";

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const since30 = daysAgoIso(30);
    const since7 = daysAgoIso(7);
    const todayStart = startOfTodayUtcIso();
    const today = new Date().toISOString().slice(0, 10);

    const [ordersRes, hotRes, pinsRes, recsRes, runsRes] = await Promise.all([
      sb.from("orders")
        .select("id,total_amount,status,created_at,items")
        .gte("created_at", since30)
        .in("status", PAID_STATUSES)
        .limit(2000),
      sb.from("hot_product_scores")
        .select("product_id,hot_score,revenue_30d,profit_30d,units_30d,recommended_action,auto_promoted,signals,pinterest_fit_score,margin_score,viral_score,intent_score")
        .eq("day", today)
        .order("hot_score", { ascending: false })
        .limit(25),
      sb.from("pinterest_pin_performance")
        .select("pin_id,product_id,pin_title,impressions,clicks,saves,ctr,performance_score")
        .order("performance_score", { ascending: false, nullsFirst: false })
        .limit(30),
      sb.from("ai_revenue_recommendations")
        .select("title,body,severity,category,product_id,status,created_at")
        .in("status", ["open", "pending", "new"])
        .order("created_at", { ascending: false })
        .limit(15),
      sb.from("self_improvement_runs")
        .select("started_at,status,revenue_7d,profit_7d,winners_count,losers_count,actions_taken")
        .order("started_at", { ascending: false })
        .limit(3),
    ]);

    const orders = ordersRes.data ?? [];
    const now = Date.now();
    const t0 = new Date(todayStart).getTime();
    const t7 = now - 7 * 24 * 3600 * 1000;
    let revToday = 0, rev7 = 0, rev30 = 0;
    for (const o of orders as any[]) {
      const ts = new Date(o.created_at).getTime();
      const amt = Number(o.total_amount || 0);
      rev30 += amt;
      if (ts >= t7) rev7 += amt;
      if (ts >= t0) revToday += amt;
    }
    const aov30 = orders.length ? rev30 / orders.length : 0;

    const hot = hotRes.data ?? [];
    const profit30 = hot.reduce((a: number, h: any) => a + Number(h.profit_30d || 0), 0);
    const winners = hot.filter((h: any) => Number(h.hot_score) >= 85).slice(0, 10);
    const losers = hot.slice().sort((a: any, b: any) => Number(a.hot_score) - Number(b.hot_score)).slice(0, 5);

    const signals = {
      revenue: { today: revToday, last7: rev7, last30: rev30, profit30, orders: orders.length, aov: aov30 },
      top_pins: (pinsRes.data ?? []).slice(0, 10),
      hot_products_top: hot.slice(0, 10).map((h: any) => ({
        product_id: h.product_id,
        name: h.signals?.name,
        hot_score: Number(h.hot_score),
        revenue_30d: Number(h.revenue_30d),
        action: h.recommended_action,
        promoted: h.auto_promoted,
      })),
      open_recommendations: recsRes.data ?? [],
      recent_improvement_runs: runsRes.data ?? [],
    };

    let summary = "";
    let recommended_actions: any[] = [];
    let expected_revenue_impact = 0;
    let model: string | null = null;

    if (LOVABLE_API_KEY) {
      const prompt = `You are the GetPawsy CEO + Pinterest Growth Director.
Write a tight, action-oriented executive morning report based on the signals below.
Focus on US Pinterest revenue. Be concrete, no fluff, no vanity metrics.

SIGNALS:
${JSON.stringify(signals, null, 2)}

Return JSON with keys:
- summary: 4-6 sentence morning briefing (revenue trend + top insight + biggest risk).
- recommended_actions: array of up to 8 objects { action, why, expected_impact_usd, priority (1-5) }. Sorted by priority desc.
- expected_revenue_impact: sum of expected_impact_usd for priority >= 3.`;

      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: "You are a precise revenue analyst. Always return valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (resp.ok) {
          const j = await resp.json();
          const txt = j?.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(txt);
          summary = String(parsed.summary || "");
          recommended_actions = Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions.slice(0, 8) : [];
          expected_revenue_impact = Number(parsed.expected_revenue_impact || 0);
          model = MODEL;
        } else {
          summary = `AI gateway returned ${resp.status}. Heuristic summary: revenue 30d $${rev30.toFixed(0)}, ${winners.length} hot winners, ${losers.length} weak products.`;
        }
      } catch (e) {
        summary = `AI synthesis failed: ${(e as Error).message}. Heuristic: rev30=$${rev30.toFixed(0)}, winners=${winners.length}.`;
      }
    } else {
      summary = `LOVABLE_API_KEY missing — heuristic only. Rev30=$${rev30.toFixed(0)}, winners=${winners.length}, losers=${losers.length}.`;
    }

    const row = {
      report_date: today,
      revenue_today: revToday,
      revenue_7d: rev7,
      revenue_30d: rev30,
      profit_30d: profit30,
      orders_30d: orders.length,
      aov_30d: aov30,
      summary,
      winners,
      losers,
      opportunities: recsRes.data ?? [],
      recommended_actions,
      expected_revenue_impact,
      raw_signals: signals,
      model,
      trigger,
    };

    const { error: upErr } = await sb
      .from("executive_revenue_reports")
      .upsert(row, { onConflict: "report_date" });
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({ ok: true, report_date: today, expected_revenue_impact, actions: recommended_actions.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});