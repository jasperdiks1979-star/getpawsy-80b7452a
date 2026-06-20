import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const day7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const day30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [perf7, perf30, voices, categories, scores, trends, exec, losers] = await Promise.all([
      supabase.from("revenue_ai_pin_performance").select("*").gte("day", day7).limit(5000),
      supabase.from("revenue_ai_pin_performance").select("revenue_cents").gte("day", day30),
      supabase.from("revenue_ai_voice_rankings").select("*").order("ranking", { ascending: true }).limit(50),
      supabase.from("revenue_ai_category_profiles").select("*").order("avg_revenue_per_click", { ascending: false }).limit(20),
      supabase.from("revenue_ai_revenue_scores").select("*").order("composite", { ascending: false }).limit(100),
      supabase.from("revenue_ai_trend_signals").select("*").order("day", { ascending: false }).limit(50),
      supabase.from("revenue_ai_executive_reports").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("revenue_ai_loser_blocklist").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    const kpis7 = {
      clicks: sum(perf7.data ?? [], "outbound_clicks"),
      atc: sum(perf7.data ?? [], "atc"),
      checkouts: sum(perf7.data ?? [], "checkouts"),
      purchases: sum(perf7.data ?? [], "purchases"),
      revenue_cents: sum(perf7.data ?? [], "revenue_cents"),
    };
    const revenue30 = sum(perf30.data ?? [], "revenue_cents");
    const estimated_monthly_cents = revenue30;

    const topPins = [...(perf7.data ?? [])].sort((a: any, b: any) => Number(b.revenue_cents) - Number(a.revenue_cents)).slice(0, 25);

    return new Response(JSON.stringify({
      ok: true,
      kpis7,
      estimated_monthly_cents,
      topPins,
      voiceRankings: voices.data ?? [],
      categoryProfiles: categories.data ?? [],
      revenueScores: scores.data ?? [],
      trends: trends.data ?? [],
      latestExecReport: exec.data ?? null,
      losers: losers.data ?? [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});