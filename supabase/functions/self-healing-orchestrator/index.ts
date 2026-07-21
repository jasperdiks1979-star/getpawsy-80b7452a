// Self-Healing Intelligence Layer — Orchestrator
// Runs all enabled probes, opens incidents, classifies via shil_signatures,
// dispatches safe playbooks to self-healing-recoverer.
// Triggered by pg_cron every 5 minutes OR manually with admin header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type ProbeResult = {
  status: "green" | "yellow" | "red";
  symptom?: string;
  evidence?: Record<string, unknown>;
  severityOverride?: "low" | "medium" | "high" | "critical";
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

async function hashSig(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

// ------------------------- PROBES -------------------------
const probes: Record<string, () => Promise<ProbeResult>> = {
  async probe_creative_factory_stalled() {
    const db = admin();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error } = await db
      .from("pinterest_creative_factory_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["processing", "running", "in_progress"])
      .lt("updated_at", tenMinAgo);
    if (error) return { status: "yellow", symptom: "probe_error", evidence: { error: error.message } };
    if ((count ?? 0) > 0)
      return {
        status: "red",
        symptom: "creative_factory_stalled_jobs",
        evidence: { stalled: count, older_than: tenMinAgo },
      };
    return { status: "green" };
  },

  async probe_pcie2_queue_stall() {
    const db = admin();
    const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count } = await db
      .from("pcie2_publish_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready")
      .lt("updated_at", halfHourAgo);
    if ((count ?? 0) > 5)
      return {
        status: "red",
        symptom: "pcie2_queue_not_draining",
        evidence: { stuck_ready: count },
      };
    return { status: "green", evidence: { stuck_ready: count ?? 0 } };
  },

  async probe_pcie2_missing_pin_images() {
    const db = admin();
    const { count } = await db
      .from("pcie2_publish_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .is("pin_image_url", null);
    if ((count ?? 0) > 10)
      return {
        status: "red",
        symptom: "queued_pins_missing_image",
        evidence: { missing: count },
      };
    if ((count ?? 0) > 0)
      return { status: "yellow", symptom: "queued_pins_missing_image_minor", evidence: { missing: count } };
    return { status: "green" };
  },

  async probe_pinterest_oauth_expiry() {
    const db = admin();
    const oneHourAhead = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("pinterest_connection")
      .select("id, token_expires_at, status, access_token")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { status: "yellow", symptom: "probe_error", evidence: { error: error.message } };
    if (!data || !data.access_token)
      return { status: "red", symptom: "pinterest_oauth_missing", evidence: { connected: false } };
    if (data.token_expires_at && data.token_expires_at < oneHourAhead)
      return {
        status: "red",
        symptom: "pinterest_oauth_expiring",
        evidence: { expires_at: data.token_expires_at },
      };
    return { status: "green" };
  },

  async probe_pinterest_cron_worker() {
    const db = admin();
    const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data } = await db
      .from("pinterest_publish_logs")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.created_at < halfHourAgo)
      return {
        status: "yellow",
        symptom: "pinterest_publishing_inactive_30m",
        evidence: { last_publish: data.created_at },
      };
    return { status: "green", evidence: { last_publish: data?.created_at ?? null } };
  },

  async probe_premium_engine_paused() {
    const db = admin();
    const { data } = await db
      .from("pinterest_runtime_settings")
      .select("premium_engine_paused")
      .limit(1)
      .maybeSingle();
    if (data?.premium_engine_paused === true)
      return {
        status: "yellow",
        symptom: "premium_engine_paused",
        evidence: { paused: true },
      };
    return { status: "green" };
  },

  async probe_checkout_funnel_collapse() {
    const db = admin();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: begins }, { count: completes }] = await Promise.all([
      db.from("checkout_funnel_events").select("id", { count: "exact", head: true }).eq("step", "begin_checkout").gte("created_at", dayAgo),
      db.from("checkout_funnel_events").select("id", { count: "exact", head: true }).eq("step", "complete_payment").gte("created_at", dayAgo),
    ]);
    if ((begins ?? 0) >= 5 && (completes ?? 0) === 0)
      return {
        status: "red",
        symptom: "checkout_funnel_zero_completion_24h",
        severityOverride: "critical",
        evidence: { begins, completes },
      };
    return { status: "green", evidence: { begins, completes } };
  },

  async probe_stripe_session_expiry_burst() {
    const db = admin();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "expired")
      .is("stripe_payment_intent_id", null)
      .gte("created_at", dayAgo);
    if ((count ?? 0) >= 10)
      return {
        status: "red",
        symptom: "stripe_session_expiry_burst",
        severityOverride: "critical",
        evidence: { expired_no_pi: count, window: "24h" },
      };
    return { status: "green", evidence: { expired_no_pi: count ?? 0 } };
  },

  async probe_analytics_ingestion_freshness() {
    const db = admin();
    const { data } = await db
      .from("analytics_funnel_waterfall")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { status: "yellow", symptom: "analytics_no_rows", evidence: {} };
    const ageMs = Date.now() - new Date(data.updated_at).getTime();
    if (ageMs > 30 * 60 * 1000)
      return {
        status: "yellow",
        symptom: "analytics_ingestion_stale",
        evidence: { age_min: Math.round(ageMs / 60000) },
      };
    return { status: "green" };
  },

  async probe_frontend_error_rate() {
    const db = admin();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("frontend_error_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hourAgo);
    if ((count ?? 0) > 50)
      return {
        status: "red",
        symptom: "frontend_error_spike",
        evidence: { errors_1h: count },
      };
    if ((count ?? 0) > 20)
      return { status: "yellow", symptom: "frontend_error_elevated", evidence: { errors_1h: count } };
    return { status: "green", evidence: { errors_1h: count ?? 0 } };
  },

  async probe_pinterest_pipeline_failures() {
    const db = admin();
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("pinterest_pipeline_failures")
      .select("id", { count: "exact", head: true })
      .gte("created_at", hourAgo);
    if ((count ?? 0) > 5)
      return {
        status: "red",
        symptom: "pinterest_pipeline_failure_burst",
        evidence: { failures_1h: count },
      };
    return { status: "green" };
  },

  async probe_cron_job_freshness() {
    const db = admin();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("cron_job_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", twoHoursAgo);
    if ((count ?? 0) === 0)
      return { status: "red", symptom: "cron_no_runs_2h", evidence: { runs: 0 } };
    return { status: "green", evidence: { runs_2h: count } };
  },

  async probe_media_asset_404() {
    const db = admin();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("cj_media_asset_registry")
      .select("id", { count: "exact", head: true })
      .is("public_url", null)
      .gte("updated_at", dayAgo);
    if ((count ?? 0) > 20)
      return { status: "yellow", symptom: "media_asset_missing_batch", evidence: { missing: count } };
    return { status: "green" };
  },

  async probe_cinematic_worker_heartbeat() {
    const db = admin();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await db
      .from("cinematic_worker_heartbeats")
      .select("last_seen_at:last_poll_at")
      .order("last_poll_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { status: "green" };
    if (data.last_seen_at < tenMinAgo)
      return {
        status: "yellow",
        symptom: "cinematic_worker_silent_10m",
        evidence: { last_seen: data.last_seen_at },
      };
    return { status: "green" };
  },

  async probe_render_worker_heartbeat() {
    const db = admin();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await db
      .from("render_worker_heartbeats")
      .select("last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { status: "green" };
    if (data.last_seen_at < tenMinAgo)
      return {
        status: "yellow",
        symptom: "render_worker_silent_10m",
        evidence: { last_seen: data.last_seen_at },
      };
    return { status: "green" };
  },

  async probe_guardian_status() {
    const db = admin();
    const { data } = await db
      .from("guardian_status")
      .select("color, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.color && String(data.color).toLowerCase() === "red")
      return {
        status: "red",
        symptom: "guardian_color_red",
        evidence: { color: data.color, at: data.updated_at },
      };
    return { status: "green" };
  },
};

// ------------------------- ORCHESTRATION -------------------------

async function runOnce() {
  const db = admin();
  const startedAt = new Date().toISOString();

  const { data: subsystems, error: subErr } = await db
    .from("shil_subsystems")
    .select("id, name, category, probe_key, severity, default_playbook, enabled")
    .eq("enabled", true);

  if (subErr) throw new Error(subErr.message);

  const results: Array<{
    subsystem: string;
    status: ProbeResult["status"];
    symptom?: string;
    incident_id?: string;
    recovery_dispatched?: boolean;
    evidence?: Record<string, unknown>;
  }> = [];

  for (const sub of subsystems ?? []) {
    const probe = probes[sub.probe_key];
    if (!probe) {
      results.push({ subsystem: sub.name, status: "yellow", symptom: "probe_not_implemented" });
      continue;
    }

    let probeResult: ProbeResult;
    try {
      probeResult = await probe();
    } catch (e) {
      probeResult = { status: "yellow", symptom: "probe_exception", evidence: { error: String(e) } };
    }

    await db
      .from("shil_subsystems")
      .update({
        last_status: probeResult.status,
        last_checked_at: new Date().toISOString(),
        last_evidence: probeResult.evidence ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (probeResult.status === "green") {
      results.push({ subsystem: sub.name, status: "green", evidence: probeResult.evidence });
      continue;
    }

    // -------- DIAGNOSE / SIGNATURE --------
    const sigInput = `${sub.name}::${probeResult.symptom ?? "unknown"}`;
    const signature_hash = await hashSig(sigInput);

    const { data: existingSig } = await db
      .from("shil_signatures")
      .select("id, occurrences, preferred_playbook")
      .eq("signature_hash", signature_hash)
      .maybeSingle();

    let signatureId: string | undefined;
    if (existingSig) {
      signatureId = existingSig.id;
      await db
        .from("shil_signatures")
        .update({
          occurrences: (existingSig.occurrences ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
          confidence: Math.min(0.99, 0.5 + (existingSig.occurrences ?? 1) * 0.05),
        })
        .eq("id", existingSig.id);
    } else {
      const { data: newSig } = await db
        .from("shil_signatures")
        .insert({
          signature_hash,
          subsystem: sub.name,
          symptom: probeResult.symptom ?? "unknown",
          preferred_playbook: sub.default_playbook,
          evidence_sample: probeResult.evidence ?? {},
        })
        .select("id")
        .single();
      signatureId = newSig?.id;
    }

    // -------- DEDUPE OPEN INCIDENT --------
    const { data: openIncident } = await db
      .from("shil_incidents")
      .select("id")
      .eq("subsystem", sub.name)
      .eq("signature_hash", signature_hash)
      .in("status", ["open", "recovering"])
      .order("detected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let incidentId = openIncident?.id;
    if (!incidentId) {
      const severity = probeResult.severityOverride ?? sub.severity ?? "medium";
      const { data: inc } = await db
        .from("shil_incidents")
        .insert({
          subsystem: sub.name,
          signature_id: signatureId,
          signature_hash,
          severity,
          status: "open",
          evidence: probeResult.evidence ?? {},
        })
        .select("id")
        .single();
      incidentId = inc?.id;
    }

    // -------- DISPATCH RECOVERY (if safe playbook) --------
    const playbookName =
      existingSig?.preferred_playbook || sub.default_playbook || "escalate_only";

    let dispatched = false;
    if (incidentId && playbookName) {
      // Dedup: skip if there is already a recovery in-flight or attempted in
      // the last 10 minutes for this incident.
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentRec } = await db
        .from("shil_recoveries")
        .select("id, outcome, started_at")
        .eq("incident_id", incidentId)
        .gte("started_at", tenMinAgo)
        .limit(1)
        .maybeSingle();
      if (recentRec) {
        results.push({
          subsystem: sub.name,
          status: probeResult.status,
          symptom: probeResult.symptom,
          incident_id: incidentId,
          recovery_dispatched: false,
          evidence: { ...probeResult.evidence, dedup: "recent_recovery_skipped" },
        });
        continue;
      }
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/self-healing-recoverer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ incident_id: incidentId, playbook: playbookName }),
        });
        dispatched = true;
      } catch (e) {
        await db
          .from("shil_incidents")
          .update({
            notes: `recoverer_dispatch_failed: ${String(e)}`,
          })
          .eq("id", incidentId);
      }
    }

    results.push({
      subsystem: sub.name,
      status: probeResult.status,
      symptom: probeResult.symptom,
      incident_id: incidentId,
      recovery_dispatched: dispatched,
      evidence: probeResult.evidence,
    });
  }

  return { startedAt, finishedAt: new Date().toISOString(), results, count: results.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const summary = await runOnce();
    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});