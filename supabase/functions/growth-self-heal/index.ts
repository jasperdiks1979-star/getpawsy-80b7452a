import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Growth self-healing job.
 * - Detects stuck `creative_job` decisions (>6h still queued/processing)
 * - Detects scheduled decisions whose scheduled_at is >2h overdue without publishing
 * - Detects daily picks not produced into creatives within 12h
 * - If anomalies exceed a threshold within last 24h, flips emergency_stop and logs
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = Date.now();
    const issues: Array<{ kind: string; decision_id?: string; detail: string }> = [];
    const healed: Array<{ kind: string; decision_id: string; action: string }> = [];

    // 1) Stuck creative_job rows (>6h, status pending/processing)
    const sixHoursAgo = new Date(now - 6 * 3600_000).toISOString();
    const { data: stuckCreative } = await sb
      .from("growth_decisions")
      .select("id, status, created_at, payload")
      .eq("decision_type", "creative_job")
      .in("status", ["pending", "processing", "queued"])
      .lt("created_at", sixHoursAgo)
      .limit(50);
    for (const d of stuckCreative ?? []) {
      issues.push({ kind: "stuck_creative_job", decision_id: d.id, detail: `since ${d.created_at}` });
      await sb.from("growth_decisions").update({ status: "failed", reason: "Self-heal: stuck >6h" }).eq("id", d.id);
      healed.push({ kind: "stuck_creative_job", decision_id: d.id, action: "marked_failed" });
    }

    // 2) Overdue scheduled picks (>2h past scheduled_at, status still scheduled)
    const twoHoursAgo = new Date(now - 2 * 3600_000).toISOString();
    const { data: overdue } = await sb
      .from("growth_decisions")
      .select("id, status, payload, reason")
      .eq("decision_type", "daily_pick")
      .eq("status", "scheduled")
      .lt("updated_at", twoHoursAgo)
      .limit(100);
    for (const d of overdue ?? []) {
      const sched = (d.payload as Record<string, unknown> | null)?.scheduled_at as string | undefined;
      if (sched && new Date(sched).getTime() < now - 2 * 3600_000) {
        issues.push({ kind: "overdue_scheduled", decision_id: d.id, detail: `scheduled_at ${sched}` });
        await sb.from("growth_decisions").update({
          status: "approved",
          payload: { ...(d.payload as Record<string, unknown>), scheduled_at: null, self_healed_at: new Date().toISOString() },
          reason: `${d.reason ?? ""} | Self-heal: rescheduled`.slice(0, 500),
        }).eq("id", d.id);
        healed.push({ kind: "overdue_scheduled", decision_id: d.id, action: "reset_to_approved" });
      }
    }

    // 3) Daily picks (last 24h) without an associated creative_job
    const since24 = new Date(now - 24 * 3600_000).toISOString();
    const { data: recentPicks } = await sb
      .from("growth_decisions")
      .select("id, product_id, created_at, status")
      .eq("decision_type", "daily_pick")
      .in("status", ["approved", "scheduled"])
      .gte("created_at", since24);
    const pickIds = (recentPicks ?? []).map((p) => p.id);
    if (pickIds.length > 0) {
      const { data: creatives } = await sb
        .from("growth_decisions")
        .select("payload")
        .eq("decision_type", "creative_job")
        .gte("created_at", since24);
      const linked = new Set<string>();
      for (const c of creatives ?? []) {
        const pid = (c.payload as Record<string, unknown> | null)?.parent_decision_id as string | undefined;
        if (pid) linked.add(pid);
      }
      for (const p of recentPicks ?? []) {
        if (!linked.has(p.id)) {
          issues.push({ kind: "pick_without_creative", decision_id: p.id, detail: "no creative_job within 24h" });
        }
      }
    }

    // 4) Anomaly threshold → emergency stop
    let emergencyTriggered = false;
    if (issues.length >= 10) {
      await sb.from("growth_autopilot_config").update({
        emergency_stop: true,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      emergencyTriggered = true;
    }

    await sb.from("growth_events").insert({
      event_type: "self_heal",
      trace_id: traceId,
      payload: {
        issues_found: issues.length,
        healed_count: healed.length,
        emergency_triggered: emergencyTriggered,
        issues: issues.slice(0, 50),
        healed: healed.slice(0, 50),
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        issues: issues.length,
        healed: healed.length,
        emergency_triggered: emergencyTriggered,
        message: `Self-heal: ${issues.length} issues, ${healed.length} healed${emergencyTriggered ? ", EMERGENCY STOP" : ""}`,
      }),
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