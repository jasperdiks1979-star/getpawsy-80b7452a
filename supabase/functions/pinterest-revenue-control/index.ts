// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Revenue Control Center — admin orchestrator.
//
// Single edge function backing /admin/pinterest-revenue-control. All actions
// require an authenticated admin user. Read-only against revenue/queue tables;
// "action" calls only invoke EXISTING edge functions and never mutate pin
// queue rows directly (no duplication of publishing logic).
//
// Actions:
//   - snapshot         : full dashboard payload (status, recent pins, revenue)
//   - run_health_check : invokes pinterest-flow-monitor in action mode
//   - recover          : invokes draft-promoter + cron-worker, logs incident
//   - generate         : invokes pinterest-creative-director (3 drafts)
//   - publish_next     : invokes pinterest-cron-worker once
//   - test_sms         : sends an owner SMS using existing Twilio config
//   - export_audit     : returns last 200 pins as CSV
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendFailureAlert } from "../_shared/post-payment-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

async function invokeFn(name: string, body: unknown = {}) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE}`,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 500); }
    return { status: r.status, body: parsed };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

// deno-lint-ignore no-explicit-any
async function buildSnapshot(svc: any) {
  // Re-use flow-monitor in snapshot mode for status truth.
  const monitor = await fetch(
    `${SUPABASE_URL}/functions/v1/pinterest-flow-monitor?snapshot=1`,
    { headers: { Authorization: `Bearer ${SERVICE}` } },
  )
    .then((r) => r.json())
    .catch((e) => ({ ok: false, message: String(e) }));

  // Last 10 published pins.
  const { data: recentPins } = await svc
    .from("pinterest_pin_queue")
    .select(
      "id, product_slug, product_name, pin_title, board_name, pinterest_pin_id, external_url, posted_at, pin_image_url, destination_link, category_key",
    )
    .eq("status", "posted")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(10);

  // Stuck / recovered pins (failed or recovery_mode_publish).
  const { data: stuckPins } = await svc
    .from("pinterest_pin_queue")
    .select(
      "id, product_slug, pin_title, status, retries, last_publish_error, recovery_mode_publish, updated_at",
    )
    .or("status.eq.failed,recovery_mode_publish.eq.true")
    .order("updated_at", { ascending: false })
    .limit(20);

  // Revenue attribution (7-day window).
  const { data: revenue } = await svc
    .from("pinterest_revenue_attribution_v3")
    .select(
      "pin_id, product_slug, board, headline, cta, hook, clicks, orders, revenue_cents, roas, computed_at",
    )
    .eq("window_days", 7)
    .order("revenue_cents", { ascending: false })
    .limit(25);

  // Recent incidents.
  const { data: incidents } = await svc
    .from("pinterest_health_incidents")
    .select("id, created_at, condition, severity, status, recovery_attempted, sms_alert_sent")
    .order("created_at", { ascending: false })
    .limit(15);

  // Avg draft→queued→posted (last 50 posted).
  const { data: timing } = await svc
    .from("pinterest_pin_queue")
    .select("created_at, approved_at, posted_at")
    .eq("status", "posted")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(50);
  let avgDraftToPostedMin: number | null = null;
  if (timing && timing.length > 0) {
    const diffs = timing
      .filter((t: any) => t.created_at && t.posted_at)
      .map(
        (t: any) =>
          (new Date(t.posted_at).getTime() - new Date(t.created_at).getTime()) /
          60_000,
      );
    if (diffs.length)
      avgDraftToPostedMin = Math.round(
        diffs.reduce((a: number, b: number) => a + b, 0) / diffs.length,
      );
  }

  // Generated today.
  const todayIso = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  ).toISOString();
  const { count: generatedToday } = await svc
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayIso);

  return {
    monitor: monitor?.snapshot ?? null,
    generatedToday: generatedToday ?? 0,
    avgDraftToPostedMin,
    recentPins: recentPins ?? [],
    stuckPins: stuckPins ?? [],
    revenue: revenue ?? [],
    incidents: incidents ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = crypto.randomUUID().slice(0, 8);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ ok: false, traceId: trace, message: "unauthorized" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, traceId: trace, message: "unauthorized" }, 401);
  }
  const svc = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdmin } = await svc.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) {
    return json({ ok: false, traceId: trace, message: "forbidden" }, 403);
  }

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action ?? "snapshot";

  try {
    if (action === "snapshot") {
      const snap = await buildSnapshot(svc);
      return json({ ok: true, traceId: trace, snapshot: snap });
    }

    if (action === "run_health_check") {
      const r = await invokeFn("pinterest-flow-monitor", {});
      return json({ ok: true, traceId: trace, result: r });
    }

    if (action === "recover") {
      const promoter = await invokeFn("pinterest-draft-promoter", {});
      const publisher = await invokeFn("pinterest-cron-worker", {});
      await svc.from("pinterest_health_incidents").insert({
        condition: "manual_recovery",
        severity: "warning",
        status: "open",
        detail: { triggered_by: userData.user.id },
        recovery_attempted: true,
        recovery_result: { promoter, publisher },
      });
      const ok =
        (promoter.status >= 200 && promoter.status < 300) ||
        (publisher.status >= 200 && publisher.status < 300);
      if (!ok) {
        await sendFailureAlert(
          svc,
          "pinterest-revenue-control",
          `Manual recovery failed promoter=${promoter.status} publisher=${publisher.status}`,
        );
      }
      return json({ ok, traceId: trace, promoter, publisher });
    }

    if (action === "generate") {
      const r = await invokeFn("pinterest-creative-director", { count: 3 });
      return json({ ok: r.status >= 200 && r.status < 300, traceId: trace, result: r });
    }

    if (action === "publish_next") {
      const r = await invokeFn("pinterest-cron-worker", { reason: "manual_publish_next" });
      return json({ ok: r.status >= 200 && r.status < 300, traceId: trace, result: r });
    }

    if (action === "test_sms") {
      // Build a Pinterest-status SMS and route through sendFailureAlert
      // (which already handles missing-config -> pending_config logging).
      const snap = await buildSnapshot(svc);
      const m = snap.monitor || {};
      const msg =
        `GetPawsy Pinterest ⚠️ TEST — ` +
        `queued:${m.queued ?? 0} drafts:${m.drafts ?? 0} ` +
        `posted_today:${m.publishedToday ?? 0} ` +
        `last:${m.lastPublishAt ?? "n/a"}`;
      await sendFailureAlert(svc, "pinterest-revenue-control-test", msg);
      return json({ ok: true, traceId: trace, message: "test_sms_dispatched" });
    }

    if (action === "export_audit") {
      const { data: rows } = await svc
        .from("pinterest_pin_queue")
        .select(
          "id, status, product_slug, pin_title, board_name, pinterest_pin_id, external_url, posted_at, created_at, retries, last_publish_error, destination_link",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      const cols = [
        "id","status","product_slug","pin_title","board_name","pinterest_pin_id",
        "external_url","posted_at","created_at","retries","last_publish_error","destination_link",
      ];
      const esc = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const csv = [cols.join(",")]
        .concat((rows ?? []).map((r: any) => cols.map((c) => esc(r[c])).join(",")))
        .join("\n");
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="pinterest-audit-${Date.now()}.csv"`,
        },
      });
    }

    return json({ ok: false, traceId: trace, message: `unknown_action:${action}` }, 400);
  } catch (e) {
    console.error("[pinterest-revenue-control]", e);
    return json({ ok: false, traceId: trace, message: String(e) }, 500);
  }
});