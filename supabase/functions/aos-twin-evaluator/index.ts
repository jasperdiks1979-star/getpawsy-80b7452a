// AOS Phase 2 — Digital Twin back-evaluator.
// Compares earlier predictions to reality; logs error + adjusts confidence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function run() {
  // Evaluate predictions older than their horizon and not yet evaluated.
  const { data: rows } = await supabase
    .from("aos_digital_twin_snapshots")
    .select("*").is("evaluated_at", null).order("created_at").limit(50);

  let evaluated = 0, meanErr = 0;
  for (const r of rows ?? []) {
    const horizonMs = r.horizon === "24h" ? 24 * 3600 * 1000 : 3600 * 1000;
    const due = new Date(r.created_at).getTime() + horizonMs;
    if (Date.now() < due) continue;

    const since = new Date(due - horizonMs).toISOString();
    const until = new Date(due).toISOString();
    const { count } = await supabase
      .from("orders").select("id", { count: "exact", head: true })
      .gte("created_at", since).lt("created_at", until);
    const actual = { orders: count ?? 0 };
    const predicted = Number((r.predicted as any)?.orders ?? 0);
    const err = predicted > 0 ? Math.abs(actual.orders - predicted) / predicted : (actual.orders > 0 ? 1 : 0);
    meanErr += err;
    evaluated++;

    await supabase.from("aos_digital_twin_snapshots").update({
      actual, error: { orders_pct: err },
      evaluated_at: new Date().toISOString(),
      confidence: Math.max(0, 1 - err),
    }).eq("id", r.id);

    // Publish into shared knowledge so other engines learn from the twin's accuracy.
    await supabase.from("aos_events").insert({
      event_type: "twin.evaluated", source_engine: "aos_twin",
      payload: { id: r.id, horizon: r.horizon, predicted, actual, error_pct: err },
      severity: err > 0.5 ? "warn" : "info",
    });
  }
  if (evaluated > 0) meanErr /= evaluated;
  return { evaluated, mean_error: meanErr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const res = await run();
    return new Response(JSON.stringify({ ok: true, ...res }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});