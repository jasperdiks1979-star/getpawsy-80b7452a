import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = new Date().toISOString();

  try {
    const body = await req.json().catch(() => ({}));
    const trigger: string = body.trigger ?? "cron";

    const { data: snap } = await sb.from("pinterest_pipeline_health_snapshots").select("health_score").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const healthBefore: number | null = (snap as any)?.health_score ?? null;

    const checks: Record<string, unknown> = {};
    const actions: Array<{ name: string; ok: boolean; detail?: string }> = [];

    try {
      const cutoff = new Date(Date.now() - 20 * 60_000).toISOString();
      const { data } = await sb.from("cinematic_ad_jobs").update({ status: "render_queued" }).eq("status", "rendering").lt("updated_at", cutoff).select("id");
      actions.push({ name: "reset_stuck_rendering", ok: true, detail: `${(data ?? []).length}` });
    } catch (e) { actions.push({ name: "reset_stuck_rendering", ok: false, detail: (e as Error).message }); }

    try {
      const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data } = await sb.from("pinterest_pin_queue").update({ status: "pending" }).eq("status", "processing").lt("updated_at", cutoff).select("id");
      actions.push({ name: "reset_stuck_pins", ok: true, detail: `${(data ?? []).length}` });
    } catch (e) { actions.push({ name: "reset_stuck_pins", ok: false, detail: (e as Error).message }); }

    const invokeProbe = async (fn: string) => {
      try { const { error } = await sb.functions.invoke(fn, { body: {} }); return !error; } catch { return false; }
    };
    checks.credit_state = await invokeProbe("pinterest-credit-status");

    try {
      const { data: conn } = await sb.from("pinterest_connection").select("expires_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      checks.pinterest_token_expires_at = (conn as any)?.expires_at ?? null;
    } catch { checks.pinterest_token_expires_at = null; }

    for (const fn of ["pinterest-regen-autopilot", "pinterest-pipeline-drain", "cinematic-ad-autopublish"]) {
      try { await sb.functions.invoke(fn, { body: { trigger: "recovery" } }); actions.push({ name: `invoke:${fn}`, ok: true }); }
      catch (e) { actions.push({ name: `invoke:${fn}`, ok: false, detail: (e as Error).message }); }
    }

    try { await sb.functions.invoke("pipeline-failure-retry", { body: { trigger: "recovery" } }); actions.push({ name: "invoke:pipeline-failure-retry", ok: true }); }
    catch (e) { actions.push({ name: "invoke:pipeline-failure-retry", ok: false, detail: (e as Error).message }); }

    await sb.from("pinterest_pipeline_recovery_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      trigger,
      outcome: "completed",
      health_before: healthBefore,
      checks,
      actions,
    });

    return new Response(JSON.stringify({ ok: true, traceId, actions, checks }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    await sb.from("pinterest_pipeline_recovery_runs").insert({ started_at: startedAt, finished_at: new Date().toISOString(), trigger: "error", outcome: `failed:${(err as Error).message}` }).catch(() => {});
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});