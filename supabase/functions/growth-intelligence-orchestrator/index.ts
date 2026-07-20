import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const STEPS = [
  "revenue-priority-v2",
  "revenue-ai-perf-rollup",
  "revenue-ai-winner-detect",
  "revenue-ai-revenue-score",
  "pinterest-autopilot",
  "growth-scorecard-compute",
  "pdp-health-audit",
  "pinterest-campaign-advisor",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const results: any[] = [];
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const fn of STEPS) {
    const start = Date.now();
    try {
      const r = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "growth-orchestrator" }),
      });
      const body = await r.text();
      results.push({ step: fn, ok: r.ok, ms: Date.now() - start, status: r.status, body: body.slice(0, 200) });
      if (!r.ok) {
        await supabase.from("monitoring_alerts").upsert({
          alert_key: `growth-orchestrator:${fn}`,
          severity: "P2",
          category: "growth_intelligence",
          title: `Growth orchestrator step failed: ${fn}`,
          description: body.slice(0, 500),
        }, { onConflict: "alert_key" });
      }
    } catch (e) {
      results.push({ step: fn, ok: false, error: String(e) });
      await supabase.from("monitoring_alerts").upsert({
        alert_key: `growth-orchestrator-exc:${fn}`,
        severity: "P1", category: "growth_intelligence",
        title: `Growth orchestrator exception: ${fn}`,
        description: String(e).slice(0, 500),
      }, { onConflict: "alert_key" }).then(() => {}).catch(() => {});
    }
  }

  await supabase.from("growth_decisions").insert({
    decision_type: "orchestrator_run",
    day: new Date().toISOString().slice(0, 10),
    reason: `Ran ${results.filter(r => r.ok).length}/${STEPS.length} steps`,
    payload: { results },
  }).then(() => {}).catch(() => {});

  return new Response(JSON.stringify({ ok: true, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});