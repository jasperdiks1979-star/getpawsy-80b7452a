// ACOS Wave B — Decision Dispatcher
// SINGLE chokepoint that turns approved acos_decisions rows into real actions.
// Hard-locked behind: app_config.global_stop, pcie2_publish_enabled, acos_settings.autonomous_mutations,
// per-engine flags, and per-decision approval status.
import { corsHeaders, svc, ok, err, requireAdmin, getSettings } from "../_shared/acos-common.ts";

type DecisionRow = {
  id: string;
  engine: string;
  action: string;
  target_kind: string | null;
  target_ref: string | null;
  reason: string | null;
  expected_outcome: Record<string, unknown> | null;
  status: string;
  approval_required: boolean;
  approved_at: string | null;
  dispatched_at: string | null;
  dispatch_idempotency_key: string | null;
  risk_score: number | null;
};

async function readKv(key: string): Promise<unknown> {
  const sb = svc();
  const { data } = await sb.from("app_config").select("value").eq("key", key).maybeSingle();
  return data?.value;
}

async function logDispatch(row: {
  decision_id?: string | null; decision_type?: string | null; outcome: string;
  blocked_reason?: string | null; target_function?: string | null;
  request_payload?: unknown; response_payload?: unknown; duration_ms?: number;
}) {
  await svc().from("acos_dispatch_log").insert({
    decision_id: row.decision_id ?? null,
    decision_type: row.decision_type ?? null,
    outcome: row.outcome,
    blocked_reason: row.blocked_reason ?? null,
    target_function: row.target_function ?? null,
    request_payload: row.request_payload ?? {},
    response_payload: row.response_payload ?? {},
    duration_ms: row.duration_ms ?? null,
  });
}

async function routeDecision(d: DecisionRow): Promise<{ ok: boolean; target?: string; result?: unknown; error?: string }> {
  const sb = svc();
  const t0 = Date.now();
  try {
    switch (d.action) {
      case "pin_seo_variant": {
        await sb.from("acos_pin_seo_variants").insert({
          product_id: d.target_ref,
          variants: d.expected_outcome ?? {},
          source: `dispatcher:${d.engine}`,
        });
        return { ok: true, target: "acos_pin_seo_variants", result: { inserted: 1 } };
      }
      case "creative_publish":
      case "creative_refresh": {
        // Delegate to PCIE2 publish assembler (the only CI-stamped path).
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pcie2-publish-assembler`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "x-acos-source": d.engine,
            "x-acos-decision-id": d.id,
          },
          body: JSON.stringify({ source: "acos", decisionId: d.id, payload: d.expected_outcome ?? {} }),
        });
        const body = await res.json().catch(() => ({}));
        return { ok: res.ok, target: "pcie2-publish-assembler", result: { status: res.status, body } };
      }
      case "ads_recommendation":
      case "board_action":
      case "landing_audit":
      case "winner_signal":
      case "loser_signal":
      case "creative_family":
      case "creative_fatigue": {
        // Recorded-only — already in acos_* observation tables; mark dispatched.
        return { ok: true, target: "noop_recorded", result: { note: "observation-only action" } };
      }
      default:
        return { ok: false, error: `unsupported_action:${d.action}` };
    }
  } catch (e) {
    return { ok: false, error: String((e as Error).message ?? e) };
  } finally {
    void t0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    // Manual trigger requires admin; cron uses service role (no Authorization → allow via secret header).
    const cronSecret = req.headers.get("x-acos-cron-secret");
    const isCron = cronSecret && cronSecret === Deno.env.get("ACOS_CRON_SECRET");
    if (!isCron) {
      const auth = await requireAdmin(req);
      if (!auth.ok) return auth.res;
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);

    // Safety: global stop
    const globalStop = Boolean(await readKv("global_stop"));
    if (globalStop) {
      await logDispatch({ outcome: "blocked", blocked_reason: "global_stop" });
      return ok({ blocked: true, reason: "global_stop", traceId });
    }

    const settings = await getSettings();
    if (settings.emergency_stop) {
      await logDispatch({ outcome: "blocked", blocked_reason: "acos_emergency_stop" });
      return ok({ blocked: true, reason: "acos_emergency_stop", traceId });
    }
    // Autonomous mutations flag (stored as kv)
    const sb = svc();
    const { data: amRow } = await sb.from("acos_settings").select("value").eq("key", "autonomous_mutations").maybeSingle();
    const mutationsOn = amRow?.value === true || amRow?.value === "true";
    if (!mutationsOn) {
      await logDispatch({ outcome: "blocked", blocked_reason: "autonomous_mutations_off" });
      return ok({ blocked: true, reason: "autonomous_mutations_off", traceId });
    }

    // Per-engine flags
    const flags = settings.flags ?? {};

    // Pick up approved, undispatched decisions (limit batch).
    const { data: rows } = await sb
      .from("acos_decisions")
      .select("id,engine,action,target_kind,target_ref,reason,expected_outcome,status,approval_required,approved_at,dispatched_at,dispatch_idempotency_key,risk_score")
      .eq("status", "approved")
      .is("dispatched_at", null)
      .limit(25);

    const results: Array<Record<string, unknown>> = [];
    for (const d of (rows ?? []) as DecisionRow[]) {
      if (flags[d.engine] === false) {
        await logDispatch({ decision_id: d.id, decision_type: d.action, outcome: "blocked", blocked_reason: `engine_disabled:${d.engine}` });
        results.push({ id: d.id, outcome: "blocked", reason: `engine_disabled:${d.engine}` });
        continue;
      }
      if (dryRun) {
        results.push({ id: d.id, outcome: "dry_run" });
        continue;
      }
      const t0 = Date.now();
      const routed = await routeDecision(d);
      const duration = Date.now() - t0;
      const outcome = routed.ok ? "dispatched" : "failed";
      await sb.from("acos_decisions").update({
        dispatched_at: new Date().toISOString(),
        execution_result: { ok: routed.ok, target: routed.target ?? null, result: routed.result ?? null, error: routed.error ?? null },
        status: routed.ok ? "executed" : "failed",
      }).eq("id", d.id);
      await logDispatch({
        decision_id: d.id, decision_type: d.action, outcome,
        target_function: routed.target ?? null,
        request_payload: d.expected_outcome ?? {},
        response_payload: routed.result ?? { error: routed.error },
        duration_ms: duration,
      });
      results.push({ id: d.id, outcome, target: routed.target, error: routed.error });
    }

    return ok({ traceId, processed: results.length, results });
  } catch (e) {
    return err(String((e as Error).message ?? e), 500, traceId);
  }
});