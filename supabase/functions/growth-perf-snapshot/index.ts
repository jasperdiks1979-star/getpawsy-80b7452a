import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Reward = ctr (0..1 capped) * 0.7 + save_rate * 0.3, scaled 0..100
function reward(impr: number, clicks: number, saves: number) {
  if (impr <= 0) return 0;
  const ctr = Math.min(clicks / impr, 0.5);
  const sr = Math.min(saves / impr, 0.5);
  return Number((ctr * 0.7 + sr * 0.3) * 200).toFixed(3); // 0..100ish
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const { data: decisions, error } = await sb
      .from("growth_decisions")
      .select("id, day, product_id, payload")
      .eq("decision_type", "daily_pick")
      .gte("day", since)
      .not("product_id", "is", null);
    if (error) throw error;

    let updated = 0;
    const perDecision: Array<{ id: string; impressions: number; clicks: number; saves: number; reward: number; pin_count: number }> = [];

    for (const d of decisions ?? []) {
      const { data: pins } = await sb
        .from("pinterest_pin_performance")
        .select("impressions, clicks, saves, created_at")
        .eq("product_id", String(d.product_id))
        .gte("created_at", `${d.day}T00:00:00Z`);

      const impressions = (pins ?? []).reduce((a, p) => a + (p.impressions ?? 0), 0);
      const clicks = (pins ?? []).reduce((a, p) => a + (p.clicks ?? 0), 0);
      const saves = (pins ?? []).reduce((a, p) => a + (p.saves ?? 0), 0);
      const ctr = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0;
      const r = Number(reward(impressions, clicks, saves));
      const pin_count = (pins ?? []).length;

      if (pin_count === 0 && impressions === 0) continue;

      await sb
        .from("growth_decision_metrics")
        .upsert(
          {
            decision_id: d.id,
            snapshot_day: today,
            impressions,
            clicks,
            saves,
            ctr,
            reward: r,
            pin_count,
          },
          { onConflict: "decision_id,snapshot_day" },
        );
      perDecision.push({ id: d.id, impressions, clicks, saves, reward: r, pin_count });
      updated++;
    }

    await sb.from("growth_events").insert({
      event_type: "perf_snapshot",
      trace_id: traceId,
      payload: { day: today, updated, total: (decisions ?? []).length },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, message: `Snapshot ${updated} decisions`, perDecision }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});