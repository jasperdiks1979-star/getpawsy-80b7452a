// Self-Healing Intelligence Layer — Recoverer
// Executes a SINGLE named playbook against a SINGLE incident with a strict
// static allow-list of handlers. Never invents actions; never publishes; never
// duplicates work. Captures before/after state and dispatches the validator.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function invokeFn(name: string, body: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text.slice(0, 500) };
}

// Static allow-list. Adding new handlers requires a code change + review.
type HandlerCtx = {
  db: ReturnType<typeof admin>;
  incidentId: string;
  subsystem: string;
  evidence: Record<string, unknown>;
};

type HandlerResult = {
  outcome: "success" | "failed" | "skipped" | "escalated";
  after?: Record<string, unknown>;
  error?: string;
};

const handlers: Record<string, { target?: string; run: (ctx: HandlerCtx) => Promise<HandlerResult> }> = {
  invoke_edge_function: {
    async run(ctx) {
      // For the generic invoker the playbook row supplies the target function name.
      const { data: pb } = await ctx.db
        .from("shil_playbooks")
        .select("target_function")
        .eq("name", (ctx as unknown as { playbook: string }).playbook ?? "")
        .maybeSingle();
      const target = pb?.target_function;
      if (!target) return { outcome: "skipped", error: "no_target_function" };
      const res = await invokeFn(target, { source: "shil", incident_id: ctx.incidentId });
      return res.ok
        ? { outcome: "success", after: { invoked: target, status: res.status } }
        : { outcome: "failed", error: `invoke_failed ${res.status} ${res.body}` };
    },
  },

  flag_unpause_premium_engine: {
    async run(ctx) {
      // Safety preconditions: creative inventory ready ≥ 20 AND no open critical incidents.
      const { count: ready } = await ctx.db
        .from("pcie2_publish_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "ready");
      const { count: critical } = await ctx.db
        .from("shil_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "recovering"])
        .eq("severity", "critical");
      if ((ready ?? 0) < 20 || (critical ?? 0) > 0) {
        return { outcome: "skipped", error: "preconditions_unmet", after: { ready, critical } };
      }
      const { error } = await ctx.db
        .from("pinterest_runtime_settings")
        .update({ premium_engine_paused: false })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) return { outcome: "failed", error: error.message };
      return { outcome: "success", after: { premium_engine_paused: false } };
    },
  },

  escalate_notification: {
    async run(ctx) {
      await ctx.db.from("guardian_notification_queue").insert({
        kind: "shil_escalation",
        severity: "high",
        payload: { subsystem: ctx.subsystem, incident_id: ctx.incidentId, evidence: ctx.evidence },
        status: "queued",
      });
      return { outcome: "escalated", after: { notified: true } };
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const incidentId: string | undefined = body.incident_id;
    const playbookName: string | undefined = body.playbook;

    if (!incidentId || !playbookName) {
      return new Response(JSON.stringify({ ok: false, error: "incident_id_and_playbook_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = admin();
    const { data: incident } = await db
      .from("shil_incidents")
      .select("id, subsystem, evidence, status")
      .eq("id", incidentId)
      .maybeSingle();

    if (!incident) {
      return new Response(JSON.stringify({ ok: false, error: "incident_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: playbook } = await db
      .from("shil_playbooks")
      .select("name, handler_key, target_function, is_safe, enabled, requires_approval")
      .eq("name", playbookName)
      .maybeSingle();

    if (!playbook || !playbook.enabled || !playbook.is_safe || playbook.requires_approval) {
      // Fall back to escalation
      const escalator = handlers.escalate_notification;
      const r = await escalator.run({
        db,
        incidentId,
        subsystem: incident.subsystem,
        evidence: (incident.evidence as Record<string, unknown>) ?? {},
      });
      const { data: rec } = await db
        .from("shil_recoveries")
        .insert({
          incident_id: incidentId,
          playbook_name: "escalate_only",
          handler_key: "escalate_notification",
          finished_at: new Date().toISOString(),
          outcome: r.outcome,
          after_state: r.after ?? {},
        })
        .select("id")
        .single();
      await db
        .from("shil_incidents")
        .update({ status: "escalated", escalated_at: new Date().toISOString(), recovery_id: rec?.id })
        .eq("id", incidentId);
      return new Response(JSON.stringify({ ok: true, outcome: r.outcome, escalated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const handler = handlers[playbook.handler_key];
    if (!handler) {
      return new Response(JSON.stringify({ ok: false, error: "handler_not_in_allowlist" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark recovering
    await db.from("shil_incidents").update({ status: "recovering" }).eq("id", incidentId);
    const startedAt = new Date();
    const { data: rec } = await db
      .from("shil_recoveries")
      .insert({
        incident_id: incidentId,
        playbook_name: playbook.name,
        handler_key: playbook.handler_key,
        before_state: incident.evidence ?? {},
        outcome: "pending",
      })
      .select("id")
      .single();

    // Inject playbook name onto ctx for the generic invoker handler
    const ctx = {
      db,
      incidentId,
      subsystem: incident.subsystem,
      evidence: (incident.evidence as Record<string, unknown>) ?? {},
      playbook: playbook.name,
    };
    let result: HandlerResult;
    try {
      result = await handler.run(ctx as unknown as HandlerCtx);
    } catch (e) {
      result = { outcome: "failed", error: String(e) };
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await db
      .from("shil_recoveries")
      .update({
        finished_at: finishedAt.toISOString(),
        outcome: result.outcome,
        after_state: result.after ?? {},
        error: result.error ?? null,
        duration_ms: durationMs,
      })
      .eq("id", rec!.id);

    if (result.outcome === "success") {
      // Fire-and-forget validator
      fetch(`${SUPABASE_URL}/functions/v1/self-healing-validator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ incident_id: incidentId, recovery_id: rec!.id }),
      }).catch(() => {});
    } else if (result.outcome === "escalated") {
      await db
        .from("shil_incidents")
        .update({ status: "escalated", escalated_at: new Date().toISOString(), recovery_id: rec!.id })
        .eq("id", incidentId);
    } else if (result.outcome === "failed") {
      await db
        .from("shil_incidents")
        .update({ status: "failed", recovery_id: rec!.id, notes: result.error ?? null })
        .eq("id", incidentId);
    } else {
      await db.from("shil_incidents").update({ recovery_id: rec!.id }).eq("id", incidentId);
    }

    return new Response(
      JSON.stringify({ ok: true, recovery_id: rec!.id, outcome: result.outcome, duration_ms: durationMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});