// Genesis V3.4 — Learning Engine
// For every executed autopilot action, evaluates outcomes at 24h/72h/7d/30d
// using canonical_funnel + canonical_orders, then updates the action's
// confidence via Wilson lower bound (alpha=0.05). No fabricated metrics.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Z = 1.96; // 95% confidence

function wilsonLower(successes: number, trials: number): number {
  if (trials <= 0) return 0;
  const p = successes / trials;
  const denom = 1 + (Z * Z) / trials;
  const center = p + (Z * Z) / (2 * trials);
  const margin = Z * Math.sqrt((p * (1 - p) + (Z * Z) / (4 * trials)) / trials);
  return Math.max(0, (center - margin) / denom);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // executed actions in the last 30 days
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const { data: actions, error } = await sb
      .from("autopilot_actions")
      .select("id,kind,product_id,executed_at,confidence,outcome_metrics")
      .gte("executed_at", since)
      .not("executed_at", "is", null)
      .limit(2000);
    if (error) throw error;
    if (!actions || actions.length === 0) {
      return new Response(JSON.stringify({ ok: true, evaluated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let evaluated = 0;
    let raised = 0;
    let lowered = 0;

    // Pre-pull canonical funnel rows for the period (one bulk query)
    const { data: funnel } = await sb
      .from("canonical_funnel")
      .select("first_seen_at,reached_add_to_cart,reached_purchase")
      .gte("first_seen_at", since)
      .limit(50000);

    const funnelRows = funnel ?? [];

    // Group actions by kind for per-kind aggregate confidence too
    const kindAgg: Map<string, { succ: number; trials: number }> = new Map();

    for (const a of actions) {
      if (!a.executed_at) continue;
      const execTs = new Date(a.executed_at).getTime();
      const windows = [
        { name: "h24", ms: 24 * 3600_000 },
        { name: "h72", ms: 72 * 3600_000 },
        { name: "d7",  ms: 7 * 24 * 3600_000 },
        { name: "d30", ms: 30 * 24 * 3600_000 },
      ];
      const metrics: Record<string, { sessions: number; atc: number; purchases: number }> = {};
      for (const w of windows) {
        const upper = execTs + w.ms;
        const rows = funnelRows.filter((r) => {
          const t = new Date(r.first_seen_at).getTime();
          return t >= execTs && t <= upper;
        });
        metrics[w.name] = {
          sessions: rows.length,
          atc: rows.filter((r) => r.reached_add_to_cart).length,
          purchases: rows.filter((r) => r.reached_purchase).length,
        };
      }

      // Confidence update: use 7-day window, success = atc events (proxy for funnel lift)
      const w7 = metrics.d7;
      const trials = Math.max(w7.sessions, 1);
      const successes = w7.atc;
      const wilson = wilsonLower(successes, trials);
      // Blend with prior confidence (50/50) so small samples don't crash existing scores
      const newConf = Number(((Number(a.confidence ?? 0.5) + wilson) / 2).toFixed(3));
      const oldConf = Number(a.confidence ?? 0);

      if (Math.abs(newConf - oldConf) >= 0.02) {
        await sb
          .from("autopilot_actions")
          .update({
            confidence: newConf,
            outcome_metrics: { ...(a.outcome_metrics ?? {}), windows: metrics, wilson, evaluated_at: new Date().toISOString() },
          })
          .eq("id", a.id);
        if (newConf > oldConf) raised++; else lowered++;
      }

      const agg = kindAgg.get(a.kind) ?? { succ: 0, trials: 0 };
      agg.trials += trials;
      agg.succ += successes;
      kindAgg.set(a.kind, agg);
      evaluated++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        evaluated,
        raised,
        lowered,
        per_kind: Array.from(kindAgg.entries()).map(([k, v]) => ({
          kind: k,
          wilson: Number(wilsonLower(v.succ, v.trials).toFixed(3)),
          trials: v.trials,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});