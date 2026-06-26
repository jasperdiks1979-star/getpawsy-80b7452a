// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Autopilot Watchdog
// ─────────────────────────────────────────────────────────────────────────────
// Runs every 10 minutes via pg_cron. Self-healing layer that guarantees the
// Pinterest engine never silently stalls.
//
// Triggers:
//   - no new AI pin generated in >45 min            -> restart generation
//   - no publish in >60 min (and queue has work)    -> restart publisher
//   - scheduler missed >=2 consecutive ticks (>30m) -> kick scheduler
//   - approved queue < 10                            -> refill (target 20-40)
//
// All operational warnings are logged into pinterest_health_incidents and
// never escalated to SMS (SMS gate = sales_only). A critical SMS is allowed
// only when a stall persists for >6 hours.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gateAndLog } from "../_shared/sms-mode.ts";
import { sendFailureAlert } from "../_shared/post-payment-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const THRESHOLDS = {
  generationStaleMin: 45,
  publishStaleMin: 60,
  schedulerStaleMin: 30, // 2 consecutive 15-min ticks
  approvedQueueMin: 10,
  approvedQueueTarget: 30,
  criticalEscalationHours: 6,
};

type SchedulerRow = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_success: string | null;
  fails_2h: number;
  succ_2h: number;
};

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

async function callFn(name: string, body: unknown = {}) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ANON_KEY || SERVICE_KEY}`,
  };
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = crypto.randomUUID().slice(0, 8);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── PCIE2_GLOBAL_STOP guard ──
  try {
    const { checkPcie2Lock } = await import("../_shared/pcie2-publish-lock.ts");
    const __lock = await checkPcie2Lock(sb, "pinterest-autopilot-watchdog");
    if (__lock.blocked) {
      return new Response(JSON.stringify({ ok: false, code: __lock.code, message: __lock.message, publishing_disabled: true, pipeline: "pcie2_only", trace }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, code: "PCIE2_GLOBAL_STOP_FAIL_CLOSED", message: String(e), publishing_disabled: true, trace }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // 1. Pipeline freshness
    const [{ data: lastPosted }, { data: lastCreated }] = await Promise.all([
      sb
        .from("pinterest_pin_queue")
        .select("posted_at")
        .eq("status", "posted")
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("pinterest_pin_queue")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // 2. Queue counts
    const statuses = ["queued", "draft", "posted", "failed", "publishing"] as const;
    const counts: Record<string, number> = {};
    await Promise.all(
      statuses.map(async (s) => {
        const { count } = await sb
          .from("pinterest_pin_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", s);
        counts[s] = count ?? 0;
      }),
    );
    // approved = queued + draft awaiting publish (operationally "ready or near-ready")
    const approved = counts.queued;

    const todayIso = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    ).toISOString();
    const [{ count: pinsGeneratedToday }, { count: pinsPublishedToday }] = await Promise.all([
      sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso),
      sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "posted")
        .gte("posted_at", todayIso),
    ]);

    const generatedLast24h = await sb
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());

    const lastPublishAt = lastPosted?.posted_at ?? null;
    const lastCreatedAt = lastCreated?.created_at ?? null;
    const minSincePublish = minutesSince(lastPublishAt);
    const minSinceCreate = minutesSince(lastCreatedAt);

    // 3. Scheduler health
    const { data: schedRaw, error: schedErr } = await sb.rpc("pinterest_scheduler_health");
    if (schedErr) console.error("[watchdog] scheduler rpc error", schedErr);
    const scheduler: SchedulerRow[] = Array.isArray(schedRaw)
      ? (schedRaw as SchedulerRow[])
      : typeof schedRaw === "string"
      ? (JSON.parse(schedRaw) as SchedulerRow[])
      : [];
    const schedJobs: Record<string, SchedulerRow> = {};
    for (const r of scheduler) schedJobs[r.jobname] = r;
    const autopilotSched = schedJobs["pinterest-autopilot-scheduler-15min"];
    const schedMinSinceSuccess = minutesSince(autopilotSched?.last_success ?? null);

    // 4. Detect incidents
    const incidents: Array<{ condition: string; severity: string; detail: any; action: string }> = [];

    if (minSinceCreate !== null && minSinceCreate > THRESHOLDS.generationStaleMin) {
      incidents.push({
        condition: "generation_stale",
        severity: "warning",
        detail: { minutes_since: minSinceCreate, threshold: THRESHOLDS.generationStaleMin },
        action: "restart_generation",
      });
    }

    if (
      minSincePublish !== null &&
      minSincePublish > THRESHOLDS.publishStaleMin &&
      (counts.queued > 0 || counts.draft > 0)
    ) {
      incidents.push({
        condition: "publish_stale",
        severity: "warning",
        detail: { minutes_since: minSincePublish, queued: counts.queued, drafts: counts.draft },
        action: "restart_publisher",
      });
    }

    if (
      schedMinSinceSuccess !== null &&
      schedMinSinceSuccess > THRESHOLDS.schedulerStaleMin
    ) {
      incidents.push({
        condition: "scheduler_missed_ticks",
        severity: "warning",
        detail: {
          jobname: "pinterest-autopilot-scheduler-15min",
          minutes_since_success: schedMinSinceSuccess,
        },
        action: "kick_scheduler",
      });
    }

    if (approved < THRESHOLDS.approvedQueueMin) {
      incidents.push({
        condition: "queue_below_minimum",
        severity: "warning",
        detail: {
          approved,
          minimum: THRESHOLDS.approvedQueueMin,
          target: THRESHOLDS.approvedQueueTarget,
        },
        action: "refill_queue",
      });
    }

    const generated24h = generatedLast24h.count ?? 0;
    if (generated24h < 20) {
      incidents.push({
        condition: "generation_guarantee_breach",
        severity: "warning",
        detail: { generated_24h: generated24h, target: 20 },
        action: "extra_generation_batch",
      });
    }

    // 5. Recovery
    const recovery: Record<string, unknown> = {};
    const actions = new Set(incidents.map((i) => i.action));

    if (actions.has("restart_generation") || actions.has("refill_queue") || actions.has("extra_generation_batch")) {
      recovery.regen_autopilot = await callFn("pinterest-regen-autopilot");
      recovery.creative_director = await callFn("pinterest-creative-director");
    }
    if (actions.has("restart_publisher")) {
      recovery.draft_promoter = await callFn("pinterest-draft-promoter");
      recovery.cron_worker = await callFn("pinterest-cron-worker");
    }
    if (actions.has("kick_scheduler")) {
      recovery.autopilot_scheduler = await callFn("pinterest-autopilot-scheduler");
    }

    // 6. Log incidents (warnings only — logged, never SMS)
    for (const inc of incidents) {
      await sb.from("pinterest_health_incidents").insert({
        condition: `watchdog:${inc.condition}`,
        severity: inc.severity,
        status: "open",
        detail: inc.detail,
        recovery_attempted: Object.keys(recovery).length > 0,
        recovery_result: recovery,
      });
    }

    // 7. >6h true outage escalation (critical, gated by sales_only → blocked in normal mode)
    let escalated: any = null;
    if (
      minSincePublish !== null &&
      minSincePublish > THRESHOLDS.criticalEscalationHours * 60 &&
      (counts.queued > 0 || counts.draft > 0)
    ) {
      const gate = await gateAndLog(
        sb,
        "pinterest_outage_6h",
        `Pinterest pipeline has not published for ${minSincePublish} min.`,
      );
      escalated = { attempted: true, allowed: gate.allowed, mode: gate.mode };
      if (gate.allowed) {
        await sendFailureAlert(
          sb,
          "pinterest-outage-6h",
          `Pinterest stalled ${minSincePublish}m. Queue=${counts.queued} Drafts=${counts.draft}`,
        );
      }
    }

    const watchdogStatus =
      incidents.length === 0 ? "green" : escalated?.allowed ? "red" : "yellow";

    return new Response(
      JSON.stringify({
        ok: true,
        traceId: trace,
        watchdog: {
          status: watchdogStatus,
          checked_at: new Date().toISOString(),
          thresholds: THRESHOLDS,
          metrics: {
            approved,
            drafts: counts.draft,
            queued: counts.queued,
            failed: counts.failed + counts.publishing,
            posted_today: pinsPublishedToday ?? 0,
            generated_today: pinsGeneratedToday ?? 0,
            generated_24h: generated24h,
            last_publish_at: lastPublishAt,
            minutes_since_publish: minSincePublish,
            last_generation_at: lastCreatedAt,
            minutes_since_generation: minSinceCreate,
          },
          scheduler,
          incidents,
          recovery,
          escalated,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pinterest-autopilot-watchdog]", e);
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});