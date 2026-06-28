// Self-Healing Intelligence Layer — Validator
// Re-runs the subsystem probe after a recovery and stamps validation_passed.
// If validation fails, escalates via guardian_notification_queue.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const incidentId: string = body.incident_id;
    const recoveryId: string = body.recovery_id;
    if (!incidentId || !recoveryId) {
      return new Response(JSON.stringify({ ok: false, error: "incident_and_recovery_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = admin();
    const { data: inc } = await db
      .from("shil_incidents")
      .select("id, subsystem, detected_at")
      .eq("id", incidentId)
      .maybeSingle();
    if (!inc) {
      return new Response(JSON.stringify({ ok: false, error: "incident_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-invoke the orchestrator (runs all probes — cheap enough for v1) and
    // read the resulting subsystem status row to validate.
    await fetch(`${SUPABASE_URL}/functions/v1/self-healing-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
    }).catch(() => {});

    // Wait a tick for the update to settle
    await new Promise((r) => setTimeout(r, 1500));

    const { data: sub } = await db
      .from("shil_subsystems")
      .select("last_status, last_evidence")
      .eq("name", inc.subsystem)
      .maybeSingle();

    const passed = sub?.last_status === "green";
    const now = new Date();

    await db
      .from("shil_recoveries")
      .update({
        validation_passed: passed,
        validation_evidence: { status_after: sub?.last_status, evidence: sub?.last_evidence ?? {} },
      })
      .eq("id", recoveryId);

    if (passed) {
      const detectedAt = new Date(inc.detected_at).getTime();
      const mttr = Math.max(0, Math.round((now.getTime() - detectedAt) / 1000));
      await db
        .from("shil_incidents")
        .update({
          status: "recovered",
          recovered_at: now.toISOString(),
          mttr_seconds: mttr,
          recovery_id: recoveryId,
        })
        .eq("id", incidentId);
    } else {
      await db
        .from("shil_incidents")
        .update({ status: "escalated", escalated_at: now.toISOString() })
        .eq("id", incidentId);
      await db.from("guardian_notification_queue").insert({
        kind: "shil_validation_failed",
        severity: "high",
        payload: { incident_id: incidentId, subsystem: inc.subsystem },
        status: "queued",
      });
    }

    return new Response(JSON.stringify({ ok: true, validation_passed: passed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});