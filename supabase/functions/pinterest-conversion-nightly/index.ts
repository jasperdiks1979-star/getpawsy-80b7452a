// Pinterest Conversion Validation Engine — Nightly orchestrator
// Sequences audit → repair → re-verify → writes a run row with score & status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function invoke(name: string, body: unknown) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

function lightFromScore(score: number): "green" | "orange" | "red" {
  if (score >= 85) return "green";
  if (score >= 60) return "orange";
  return "red";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const trigger = body.trigger ?? "cron";
  const runId = crypto.randomUUID();

  const { data: runRow } = await supabase
    .from("pinterest_conversion_runs")
    .insert({ id: runId, trigger_source: trigger, status: "running" })
    .select()
    .single();

  try {
    const audit1 = await invoke("pinterest-conversion-audit", { run_id: runId, limit: 800 });
    const repair = await invoke("pinterest-conversion-repair", { run_id: runId });
    // Re-verify: second audit for repaired pins reuses same run_id (rows distinguishable by created_at)
    const audit2 = await invoke("pinterest-conversion-audit", {
      run_id: runId,
      limit: 200,
    });

    const s = audit2.json?.pins_total ? audit2.json : audit1.json;
    const total = Number(s?.pins_total ?? 0);
    const ready = Number(s?.pins_ready ?? 0);
    const score = total === 0 ? 100 : Math.round((ready / total) * 100);
    const status = lightFromScore(score);

    // Count auto-closed alerts since run start
    const { data: closedAlerts } = await supabase
      .from("pinterest_conversion_alerts")
      .select("id", { count: "exact", head: true })
      .eq("auto_closed", true)
      .gte("closed_at", runRow?.started_at ?? new Date(0).toISOString());

    await supabase
      .from("pinterest_conversion_runs")
      .update({
        finished_at: new Date().toISOString(),
        pins_total: total,
        pins_ready: ready,
        pins_failed: Number(s?.pins_failed ?? 0),
        pins_repaired: Number(repair.json?.repaired ?? 0),
        products_at_risk: Number(s?.products_at_risk ?? 0),
        broken_urls: Number(s?.broken_urls ?? 0),
        redirect_issues: Number(s?.redirect_issues ?? 0),
        utm_failures: Number(s?.utm_failures ?? 0),
        inventory_failures: Number(s?.inventory_failures ?? 0),
        cart_failures: Number(s?.cart_failures ?? 0),
        alerts_opened: Number(s?.alerts_opened ?? 0),
        alerts_auto_closed: (closedAlerts as any)?.length ?? 0,
        overall_score: score,
        status,
        notes: { trace, audit1: audit1.json, repair: repair.json, audit2: audit2.json },
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ ok: true, traceId: trace, run_id: runId, overall_score: score, status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    await supabase
      .from("pinterest_conversion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "error",
        notes: { trace, error: (e as Error).message },
      })
      .eq("id", runId);
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});