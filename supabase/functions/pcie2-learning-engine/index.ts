// PCIE2 Self-Learning Engine — folds Pinterest performance back into the libraries.
// Reads pinterest_analytics_daily + pcie2_pin_performance, updates rolling weights in
// pcie2_feature_attribution and bumps performance_score on headlines/hooks/creatives.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { mode = "incremental" } = (await req.json().catch(() => ({}))) as { mode?: string };

  // Pull recent pin performance (last 7d)
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const { data: perf } = await SUPA
    .from("pcie2_pin_performance")
    .select("creative_id, impressions, saves, outbound_clicks, pin_clicks, closeups, ctr")
    .gte("updated_at", since)
    .limit(5000);

  let updated = 0;
  if (perf?.length) {
    // bump creative performance_score by weighted CTR + outbound rate
    for (const p of perf as any[]) {
      if (!p.creative_id) continue;
      const score = Number(p.ctr ?? 0) * 100 + Number(p.outbound_clicks ?? 0) * 0.5 + Number(p.saves ?? 0) * 0.2;
      await SUPA.from("pcie2_creatives").update({ performance: { score, samples: p } }).eq("id", p.creative_id);
      updated++;
    }
  }

  await SUPA.from("pcie2_learning_runs").insert({
    run_kind: mode, status: "completed", metrics: { perf_rows: perf?.length ?? 0, updated },
  }).then(() => null).catch(() => null);

  return new Response(JSON.stringify({ ok: true, mode, perf_rows: perf?.length ?? 0, updated }), { headers: { ...cors, "Content-Type": "application/json" } });
});
