import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = new Date();
    // Week start = Monday of current ISO week (UTC) minus 7d for the closing report
    const dow = now.getUTCDay(); // 0=Sun
    const monOffset = (dow + 6) % 7; // days since Monday
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - monOffset));
    const weekStart = new Date(thisMonday.getTime() - 7 * 86400_000);
    const weekEnd = new Date(thisMonday.getTime() - 86400_000);
    const weekStartIso = isoDay(weekStart);
    const weekEndIso = isoDay(weekEnd);

    // Pull decisions in window
    const { data: decisions } = await sb
      .from("growth_decisions")
      .select("id, day, decision_type, status, payload, product_id, reason")
      .gte("day", weekStartIso)
      .lte("day", weekEndIso);

    const picks = (decisions ?? []).filter((d) => d.decision_type === "daily_pick");
    const safe = picks.filter((d) => (d.payload as Record<string, unknown> | null)?.bucket === "safe_winner").length;
    const experiments = picks.filter((d) => (d.payload as Record<string, unknown> | null)?.bucket === "experiment").length;
    const published = picks.filter((d) => d.status === "published").length;
    const failed = picks.filter((d) => d.status === "failed").length;

    // Metrics aggregation
    const decisionIds = picks.map((d) => d.id);
    let totalImp = 0, totalClicks = 0, totalSaves = 0, rewardSum = 0, rewardN = 0;
    if (decisionIds.length > 0) {
      const { data: metrics } = await sb
        .from("growth_decision_metrics")
        .select("decision_id, impressions, clicks, saves, reward")
        .in("decision_id", decisionIds)
        .gte("snapshot_day", weekStartIso)
        .lte("snapshot_day", weekEndIso);
      for (const m of metrics ?? []) {
        totalImp += Number(m.impressions ?? 0);
        totalClicks += Number(m.clicks ?? 0);
        totalSaves += Number(m.saves ?? 0);
        if (m.reward != null) { rewardSum += Number(m.reward); rewardN++; }
      }
    }
    const ctr = totalImp > 0 ? totalClicks / totalImp : 0;
    const saveRate = totalImp > 0 ? totalSaves / totalImp : 0;
    const avgReward = rewardN > 0 ? rewardSum / rewardN : 0;

    // Top picks by reward
    type PickAgg = { decision_id: string; product_id: string | null; product_name: string; angle: string; reward: number; clicks: number; impressions: number };
    const aggMap = new Map<string, PickAgg>();
    for (const p of picks) {
      const pl = (p.payload ?? {}) as Record<string, unknown>;
      aggMap.set(p.id, {
        decision_id: p.id,
        product_id: p.product_id as string | null,
        product_name: String(pl.product_name ?? "Unknown"),
        angle: String(pl.recommended_angle ?? "—"),
        reward: 0,
        clicks: 0,
        impressions: 0,
      });
    }
    if (decisionIds.length > 0) {
      const { data: metrics2 } = await sb
        .from("growth_decision_metrics")
        .select("decision_id, impressions, clicks, reward")
        .in("decision_id", decisionIds);
      for (const m of metrics2 ?? []) {
        const a = aggMap.get(m.decision_id as string);
        if (!a) continue;
        a.reward = Math.max(a.reward, Number(m.reward ?? 0));
        a.clicks += Number(m.clicks ?? 0);
        a.impressions += Number(m.impressions ?? 0);
      }
    }
    const top = [...aggMap.values()].sort((a, b) => b.reward - a.reward).slice(0, 5);
    const bottom = [...aggMap.values()].filter((p) => p.impressions > 0).sort((a, b) => a.reward - b.reward).slice(0, 5);

    // Strategy snapshot
    const { data: strat } = await sb
      .from("growth_strategy_scores")
      .select("dimension, key, score, samples")
      .order("score", { ascending: false })
      .limit(40);

    // Self-heal & event counts
    const sinceWeek = weekStart.toISOString();
    const { data: events } = await sb
      .from("growth_events")
      .select("event_type")
      .gte("created_at", sinceWeek);
    const eventCounts: Record<string, number> = {};
    for (const e of events ?? []) eventCounts[e.event_type] = (eventCounts[e.event_type] ?? 0) + 1;

    const payload = {
      generated_at: new Date().toISOString(),
      window: { start: weekStartIso, end: weekEndIso },
      summary: {
        picks_total: picks.length,
        safe_winners: safe,
        experiments,
        published,
        failed,
        impressions: totalImp,
        clicks: totalClicks,
        saves: totalSaves,
        ctr: Number(ctr.toFixed(4)),
        save_rate: Number(saveRate.toFixed(4)),
        avg_reward: Number(avgReward.toFixed(3)),
      },
      top_performers: top,
      bottom_performers: bottom,
      top_strategies: strat ?? [],
      event_counts: eventCounts,
    };

    const { error: upErr } = await sb
      .from("growth_weekly_reports")
      .upsert({ week_start: weekStartIso, payload }, { onConflict: "week_start" });
    if (upErr) throw upErr;

    await sb.from("growth_events").insert({
      event_type: "weekly_report",
      trace_id: traceId,
      payload: { week_start: weekStartIso, picks: picks.length, impressions: totalImp, clicks: totalClicks },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, week_start: weekStartIso, message: `Weekly report generated for ${weekStartIso}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});