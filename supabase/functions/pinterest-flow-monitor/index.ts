// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Flow Monitor
// ─────────────────────────────────────────────────────────────────────────────
// Runs every 10 minutes (pg_cron). Detects stalls in the Pinterest publishing
// pipeline, logs an incident row, attempts automatic recovery, and fires an
// SMS alert (throttled by sendFailureAlert's 30-min fingerprint window).
//
// Read-only against existing Pinterest tables — never mutates pin queue rows.
// Recovery only calls existing edge functions (draft-promoter + cron-worker).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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

type Snapshot = {
  status: "healthy" | "delayed" | "stalled";
  publishedToday: number;
  queued: number;
  drafts: number;
  failed: number;
  rejected: number;
  blocked: number;
  lastPublishAt: string | null;
  minutesSinceLastPublish: number | null;
  oldestDraftAt: string | null;
  minutesOldestDraft: number | null;
  lastDirectorAt: string | null;
  minutesSinceLastDirector: number | null;
  nextPublishAt: string | null;
  incidents: Array<{ condition: string; severity: string; detail: any }>;
  recovery: any;
  // Extended autonomy KPIs
  successRate24h: number | null;          // 0..1, posted/(posted+failed) in 24h
  avgPublishIntervalMin: number | null;   // avg gap between posts in 24h
  factoryThroughput24h: number;           // creative factory jobs completed
  queueGrowthRate24h: number;             // created_24h - posted_24h
  estRuntimeDays: number | null;          // queued / posted_per_day
  tokenStatus: {
    connected: boolean;
    expiresAt: string | null;
    minutesUntilExpiry: number | null;
    boardCount: number | null;
  };
  cronJobs: Array<{ name: string; minutesSinceRun: number | null; ok: boolean }>;
  // E2E verification KPIs (24h window)
  verification: {
    verified24h: number;
    failed24h: number;
    waitingBacklog: number;
    successRate24h: number | null;
    avgScore24h: number | null;
    avgVerificationMinutes: number | null;
    lastVerifiedAt: string | null;
    lastFailedAt: string | null;
    topFailureCauses: Array<{ reason: string; count: number }>;
    autoRecoveries24h: number;
    recoverySuccessRate24h: number | null;
    productionHealthScore: number; // 0-100
  };
};

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

function nextCronTickIso(stepMinutes: number): string {
  const now = new Date();
  const next = new Date(now);
  const cur = now.getUTCMinutes();
  const nextMin = (Math.floor(cur / stepMinutes) + 1) * stepMinutes;
  next.setUTCMinutes(nextMin, 0, 0);
  return next.toISOString();
}

async function fetchSnapshot(sb: any): Promise<Snapshot> {
  const todayIso = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  ).toISOString();

  const counts: Record<string, number> = {
    queued: 0,
    draft: 0,
    failed: 0,
    rejected: 0,
    blocked_legacy_source: 0,
    posted: 0,
    skipped: 0,
    publishing: 0,
  };

  await Promise.all(
    Object.keys(counts).map(async (s) => {
      const { count } = await sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", s);
      counts[s] = count ?? 0;
    }),
  );

  const { count: publishedTodayCount } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "posted")
    .gte("posted_at", todayIso);

  const { data: lastPosted } = await sb
    .from("pinterest_pin_queue")
    .select("posted_at")
    .eq("status", "posted")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: oldestDraft } = await sb
    .from("pinterest_pin_queue")
    .select("created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Director freshness: any row created (any status) in the last hour
  const { data: lastDirector } = await sb
    .from("pinterest_pin_queue")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastPublishAt = lastPosted?.posted_at ?? null;
  const oldestDraftAt = oldestDraft?.created_at ?? null;
  const lastDirectorAt = lastDirector?.created_at ?? null;

  // ─── Extended KPIs ──────────────────────────────────────────────────────
  const since24Iso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [{ count: posted24 }, { count: failed24 }, { count: created24 }, { count: factory24 }] =
    await Promise.all([
      sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
        .eq("status", "posted").gte("posted_at", since24Iso),
      sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
        .eq("status", "failed").gte("updated_at", since24Iso),
      sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
        .gte("created_at", since24Iso),
      sb.from("pinterest_creative_factory_jobs").select("id", { count: "exact", head: true })
        .eq("status", "completed").gte("completed_at", since24Iso),
    ]);

  const posted24n = posted24 ?? 0;
  const failed24n = failed24 ?? 0;
  const created24n = created24 ?? 0;
  const factory24n = factory24 ?? 0;
  const denom = posted24n + failed24n;
  const successRate24h = denom > 0 ? posted24n / denom : null;

  // Avg publish interval (24h)
  const { data: postedRows } = await sb
    .from("pinterest_pin_queue")
    .select("posted_at")
    .eq("status", "posted")
    .gte("posted_at", since24Iso)
    .order("posted_at", { ascending: true });
  let avgPublishIntervalMin: number | null = null;
  if (postedRows && postedRows.length >= 2) {
    const ts = postedRows.map((r: any) => new Date(r.posted_at).getTime());
    let sum = 0;
    for (let i = 1; i < ts.length; i++) sum += ts[i] - ts[i - 1];
    avgPublishIntervalMin = Math.round(sum / (ts.length - 1) / 60_000);
  }

  const queueGrowthRate24h = created24n - posted24n;
  const queued = counts.queued;
  const estRuntimeDays = posted24n > 0 ? Math.round((queued / posted24n) * 10) / 10 : null;

  // Token status
  const { data: connRow } = await sb
    .from("pinterest_connection")
    .select("status, token_expires_at, board_count")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tokenStatus = {
    connected: connRow?.status === "connected",
    expiresAt: connRow?.token_expires_at ?? null,
    minutesUntilExpiry: connRow?.token_expires_at
      ? Math.round((new Date(connRow.token_expires_at).getTime() - Date.now()) / 60_000)
      : null,
    boardCount: connRow?.board_count ?? null,
  };

  // Cron freshness — derive from observable side-effects (no dependency on a
  // cron-logging table that critical Pinterest jobs may not write to).
  const { data: lastUpdated } = await sb
    .from("pinterest_pin_queue")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastQueueUpdateAt = lastUpdated?.updated_at ?? null;
  const minutesSinceQueueUpdate = minutesSince(lastQueueUpdateAt);
  const minutesSincePublish = minutesSince(lastPublishAt);
  const minutesSinceDraft = minutesSince(oldestDraftAt) ?? minutesSince(lastDirectorAt);
  const cronJobs = [
    {
      name: "pinterest-cron-worker-10min",
      minutesSinceRun: minutesSincePublish,
      ok: queued === 0 || (minutesSincePublish !== null && minutesSincePublish <= 20),
    },
    {
      name: "pinterest-flow-monitor-10min",
      minutesSinceRun: 0, // we are it
      ok: true,
    },
    {
      name: "pinterest-creative-factory-work-15min",
      minutesSinceRun: minutesSinceQueueUpdate,
      ok: minutesSinceQueueUpdate !== null && minutesSinceQueueUpdate <= 30,
    },
    {
      name: "pinterest-creative-factory-refill-30min",
      minutesSinceRun: minutesSince(lastDirectorAt),
      ok: minutesSince(lastDirectorAt) !== null && minutesSince(lastDirectorAt)! <= 60,
    },
  ];

  return {
    status: "healthy",
    publishedToday: publishedTodayCount ?? 0,
    queued,
    drafts: counts.draft,
    failed: counts.failed + counts.publishing,
    rejected: counts.rejected,
    blocked: counts.blocked_legacy_source,
    lastPublishAt,
    minutesSinceLastPublish: minutesSince(lastPublishAt),
    oldestDraftAt,
    minutesOldestDraft: minutesSince(oldestDraftAt),
    lastDirectorAt,
    minutesSinceLastDirector: minutesSince(lastDirectorAt),
    nextPublishAt: nextCronTickIso(5),
    incidents: [],
    recovery: null,
    successRate24h,
    avgPublishIntervalMin,
    factoryThroughput24h: factory24n,
    queueGrowthRate24h,
    estRuntimeDays,
    tokenStatus,
    cronJobs,
    verification: await fetchVerificationKpis(sb),
  };
}

async function fetchVerificationKpis(sb: any): Promise<Snapshot["verification"]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await sb
    .from("pinterest_pin_queue")
    .select("verification_state, verification_score, verification_failure_reason, posted_at, last_verified_at, verification_attempts")
    .eq("status", "posted")
    .gte("posted_at", since);
  const r = rows || [];
  const verified = r.filter((x: any) => x.verification_state === "verified_success").length;
  const failed = r.filter((x: any) => x.verification_state === "verification_failed").length;
  const total = verified + failed;
  const successRate = total ? verified / total : null;
  const avgScore = r.length ? Math.round(r.reduce((a: number, x: any) => a + (x.verification_score || 0), 0) / r.length) : null;
  const durations = r
    .filter((x: any) => x.last_verified_at && x.posted_at)
    .map((x: any) => (new Date(x.last_verified_at).getTime() - new Date(x.posted_at).getTime()) / 60_000);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const { data: waitingRows } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("verification_state", "waiting_verification")
    .eq("status", "posted");
  const waiting = (waitingRows as any)?.count ?? 0;
  const { data: lastV } = await sb
    .from("pinterest_pin_queue")
    .select("last_verified_at, verification_state")
    .eq("verification_state", "verified_success")
    .order("last_verified_at", { ascending: false }).limit(1).maybeSingle();
  const { data: lastF } = await sb
    .from("pinterest_pin_queue")
    .select("last_verified_at")
    .eq("verification_state", "verification_failed")
    .order("last_verified_at", { ascending: false }).limit(1).maybeSingle();
  const causes: Record<string, number> = {};
  for (const x of r) if (x.verification_failure_reason) causes[x.verification_failure_reason] = (causes[x.verification_failure_reason] || 0) + 1;
  const topFailureCauses = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count }));
  const autoRecoveries = r.filter((x: any) => (x.verification_attempts || 0) >= 2 && x.verification_state === "verified_success").length;
  const recoveryDenominator = autoRecoveries + r.filter((x: any) => (x.verification_attempts || 0) >= 2 && x.verification_state === "verification_failed").length;
  const recoveryRate = recoveryDenominator ? autoRecoveries / recoveryDenominator : null;
  const productionHealthScore = Math.round(
    (successRate ?? 1) * 70 +
    Math.min(1, (avgScore ?? 0) / 100) * 30
  );
  return {
    verified24h: verified,
    failed24h: failed,
    waitingBacklog: waiting || 0,
    successRate24h: successRate,
    avgScore24h: avgScore,
    avgVerificationMinutes: avgDuration,
    lastVerifiedAt: lastV?.last_verified_at ?? null,
    lastFailedAt: lastF?.last_verified_at ?? null,
    topFailureCauses,
    autoRecoveries24h: autoRecoveries,
    recoverySuccessRate24h: recoveryRate,
    productionHealthScore,
  };
}

async function detectIncidents(snap: Snapshot, sb: any) {
  const inc: Snapshot["incidents"] = [];

  // 1. No publish in 30+ minutes (only count as stall if there ARE pins to send)
  if (
    snap.minutesSinceLastPublish !== null &&
    snap.minutesSinceLastPublish > 30 &&
    (snap.queued > 0 || snap.drafts > 0)
  ) {
    inc.push({
      condition: "no_publish_30m",
      severity: "critical",
      detail: {
        minutes_since: snap.minutesSinceLastPublish,
        queued: snap.queued,
        drafts: snap.drafts,
      },
    });
  }

  // 2. Queue not draining: queued > 0 AND no posted_at change in 30 min
  if (
    snap.queued > 0 &&
    snap.minutesSinceLastPublish !== null &&
    snap.minutesSinceLastPublish > 30
  ) {
    inc.push({
      condition: "queue_not_draining",
      severity: "critical",
      detail: {
        queued: snap.queued,
        minutes_since_publish: snap.minutesSinceLastPublish,
      },
    });
  }

  // 3. Drafts accumulated for 20+ minutes (promoter should have run)
  if (
    snap.drafts > 0 &&
    snap.minutesOldestDraft !== null &&
    snap.minutesOldestDraft > 20
  ) {
    inc.push({
      condition: "drafts_stuck_20m",
      severity: "warning",
      detail: {
        drafts: snap.drafts,
        oldest_minutes: snap.minutesOldestDraft,
      },
    });
  }

  // 4. Generation pipeline silent: nothing new created in 2 hours
  if (
    snap.minutesSinceLastDirector !== null &&
    snap.minutesSinceLastDirector > 120
  ) {
    inc.push({
      condition: "generation_silent_2h",
      severity: "warning",
      detail: { minutes_since: snap.minutesSinceLastDirector },
    });
  }

  // 5. Pinterest token expiring soon (<24h) or expired
  if (snap.tokenStatus.minutesUntilExpiry !== null) {
    if (snap.tokenStatus.minutesUntilExpiry <= 0) {
      inc.push({
        condition: "pinterest_token_expired",
        severity: "critical",
        detail: { expires_at: snap.tokenStatus.expiresAt },
      });
    } else if (snap.tokenStatus.minutesUntilExpiry < 24 * 60) {
      inc.push({
        condition: "pinterest_token_expiring_soon",
        severity: "warning",
        detail: {
          minutes_until_expiry: snap.tokenStatus.minutesUntilExpiry,
          expires_at: snap.tokenStatus.expiresAt,
        },
      });
    }
  }

  // 6. Publish error rate >10% in 24h (only meaningful with ≥20 attempts)
  if (
    snap.successRate24h !== null &&
    snap.successRate24h < 0.9 &&
    snap.publishedToday + snap.failed >= 20
  ) {
    inc.push({
      condition: "publish_error_rate_high",
      severity: "critical",
      detail: { success_rate_24h: snap.successRate24h },
    });
  }

  // 7. Queue unexpectedly empty (queued AND drafts both zero while engine should run)
  if (snap.queued === 0 && snap.drafts === 0) {
    inc.push({
      condition: "queue_empty",
      severity: "critical",
      detail: { queued: 0, drafts: 0 },
    });
  }

  // 8. Critical cron job hasn't run in 2× cadence
  for (const j of snap.cronJobs) {
    if (!j.ok) {
      inc.push({
        condition: "cron_stalled",
        severity: "warning",
        detail: { job: j.name, minutes_since_run: j.minutesSinceRun },
      });
    }
  }

  return inc;
}

async function attemptRecovery(incidents: Snapshot["incidents"]) {
  if (incidents.length === 0) return null;
  const conds = new Set(incidents.map((i) => i.condition));
  const result: any = {};

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ANON_KEY || SERVICE_KEY}`,
  };

  if (conds.has("drafts_stuck_20m") || conds.has("no_publish_30m")) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/pinterest-draft-promoter`,
        { method: "POST", headers, body: "{}" },
      );
      result.promoter = { status: r.status, body: await r.json().catch(() => null) };
    } catch (e) {
      result.promoter = { error: String(e) };
    }
  }

  if (
    conds.has("no_publish_30m") ||
    conds.has("queue_not_draining") ||
    conds.has("drafts_stuck_20m")
  ) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/pinterest-cron-worker`,
        { method: "POST", headers, body: "{}" },
      );
      result.publisher = { status: r.status, body: await r.json().catch(() => null) };
    } catch (e) {
      result.publisher = { error: String(e) };
    }
  }

  if (conds.has("generation_silent_2h")) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/pinterest-creative-director`,
        { method: "POST", headers, body: "{}" },
      );
      result.director = { status: r.status };
    } catch (e) {
      result.director = { error: String(e) };
    }
  }

  // Auto-refill empty queue using creative factory (no new system — same engine).
  if (conds.has("queue_empty")) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/pinterest-creative-factory`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "seed_backfill", limit: 50 }),
        },
      );
      result.factory_refill = { status: r.status, body: await r.json().catch(() => null) };
    } catch (e) {
      result.factory_refill = { error: String(e) };
    }
  }

  return result;
}

function overallStatus(snap: Snapshot): Snapshot["status"] {
  if (snap.incidents.some((i) => i.severity === "critical")) return "stalled";
  if (snap.incidents.length > 0) return "delayed";
  return "healthy";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = crypto.randomUUID().slice(0, 8);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Snapshot-only mode for the dashboard (?snapshot=1 or GET)
  const url = new URL(req.url);
  const snapshotOnly = req.method === "GET" || url.searchParams.get("snapshot") === "1";

  try {
    const snap = await fetchSnapshot(sb);
    const incidents = await detectIncidents(snap, sb);
    snap.incidents = incidents;
    snap.status = overallStatus(snap);

    if (snapshotOnly) {
      return new Response(
        JSON.stringify({ ok: true, traceId: trace, snapshot: snap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Action mode (POST without ?snapshot=1): log, alert, recover.
    let recovery: any = null;
    if (incidents.length > 0) {
      recovery = await attemptRecovery(incidents);
      snap.recovery = recovery;

      for (const i of incidents) {
        const summary = `${i.condition}: ${JSON.stringify(i.detail)}`;
        const { data: incRow } = await sb
          .from("pinterest_health_incidents")
          .insert({
            condition: i.condition,
            severity: i.severity,
            status: "open",
            detail: i.detail,
            recovery_attempted: !!recovery,
            recovery_result: recovery,
          })
          .select("id")
          .single();

        if (i.severity === "critical") {
          await sendFailureAlert(sb, "pinterest-flow", summary);
          if (incRow?.id) {
            await sb
              .from("pinterest_health_incidents")
              .update({ sms_alert_sent: true })
              .eq("id", incRow.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, traceId: trace, snapshot: snap }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pinterest-flow-monitor]", e);
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});