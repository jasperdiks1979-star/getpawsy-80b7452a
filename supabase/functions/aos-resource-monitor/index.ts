// AOS Phase 2 — Resource Manager.
// Snapshots API/credit/queue/cron usage; auto-throttles non-critical work when caps approach.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function pct(used: number, cap: number) { return cap > 0 ? used / cap : 0; }
function statusOf(p: number) { return p >= 0.9 ? "critical" : p >= 0.7 ? "warn" : "ok"; }

async function snapshot(resource: string, used: number, cap: number, details: any = {}) {
  const p = pct(used, cap);
  await supabase.from("aos_resource_usage").insert({
    resource, used, cap, pct: p, status: statusOf(p), details,
  });
  return { resource, used, cap, pct: p, status: statusOf(p) };
}

async function publishEvent(type: string, payload: any, severity = "warn") {
  await supabase.from("aos_events").insert({
    event_type: type, source_engine: "aos_resource", payload, severity,
  });
}

async function run() {
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since1 = new Date(Date.now() - 3600 * 1000).toISOString();
  const results: any[] = [];

  // Pinterest credits
  try {
    const { data: cred } = await supabase
      .from("pinterest_credit_state").select("*").limit(1).maybeSingle();
    if (cred) {
      const used = Number(cred?.credits_used_today ?? cred?.credits_used ?? 0);
      const cap = Number(cred?.daily_cap ?? cred?.credits_cap ?? 100);
      results.push(await snapshot("pinterest_credits", used, cap, cred));
    }
  } catch (_) {}

  // Background jobs queue depth
  try {
    const { count: pending } = await supabase
      .from("background_jobs").select("id", { count: "exact", head: true }).eq("status", "pending");
    results.push(await snapshot("queue_pending", pending ?? 0, 500, { source: "background_jobs" }));
  } catch (_) {}

  // Edge function errors (1h)
  try {
    const { count: errs } = await supabase
      .from("frontend_error_logs").select("id", { count: "exact", head: true }).gte("created_at", since1);
    results.push(await snapshot("frontend_errors_1h", errs ?? 0, 100, {}));
  } catch (_) {}

  // AOS task backlog
  try {
    const { count: pendingTasks } = await supabase
      .from("aos_tasks").select("id", { count: "exact", head: true }).eq("status", "pending");
    results.push(await snapshot("aos_tasks_pending", pendingTasks ?? 0, 200, {}));
  } catch (_) {}

  // Auto-throttle: pause low-priority work when any resource is critical.
  const critical = results.filter(r => r.status === "critical");
  if (critical.length > 0) {
    await publishEvent("resource.critical", { critical }, "critical");
    const { error } = await supabase.from("aos_tasks")
      .update({ status: "throttled" })
      .eq("status", "pending")
      .lt("priority", 60);
    if (!error) await publishEvent("resource.auto_throttle", { reason: critical.map(c => c.resource) }, "warn");
  } else {
    // Recover throttled tasks when resources are healthy
    await supabase.from("aos_tasks").update({ status: "pending" }).eq("status", "throttled");
  }

  return { results, critical: critical.length };
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