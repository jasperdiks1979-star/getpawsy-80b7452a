// Pinterest Credit Protection — shared guard.
//
// All Pinterest functions that hit ai.gateway.lovable.dev MUST funnel through
// these helpers so credit-exhaustion (HTTP 402) and recovery are tracked
// centrally.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ORANGE_THRESHOLD_402 = 1; // any 402 in last hour → orange minimum
const WARNING_COOLDOWN_HOURS = 6;

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function isCreditPaused(supabase: SupabaseClient): Promise<{
  paused: boolean;
  state: "green" | "orange" | "red";
  last_402_at: string | null;
  last_success_at: string | null;
}> {
  const { data } = await supabase
    .from("pinterest_credit_state")
    .select("paused, state, last_402_at, last_success_at")
    .eq("id", 1)
    .maybeSingle();
  return {
    paused: data?.paused ?? false,
    state: (data?.state ?? "green") as "green" | "orange" | "red",
    last_402_at: data?.last_402_at ?? null,
    last_success_at: data?.last_success_at ?? null,
  };
}

export interface CreditEventInput {
  event_type:
    | "success"
    | "payment_required"
    | "rate_limited"
    | "error"
    | "probe_success"
    | "probe_failed"
    | "paused"
    | "resumed"
    | "warning";
  status_code?: number;
  function_name?: string;
  message?: string;
  raw?: unknown;
}

export async function recordCreditEvent(
  supabase: SupabaseClient,
  evt: CreditEventInput,
): Promise<void> {
  // 1. Append to event log (best-effort).
  await supabase.from("pinterest_credit_events").insert({
    event_type: evt.event_type,
    status_code: evt.status_code ?? null,
    function_name: evt.function_name ?? null,
    message: evt.message ?? null,
    raw: evt.raw ?? null,
  });

  // 2. Recompute rolling 1h counters.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: succ1h } = await supabase
    .from("pinterest_credit_events")
    .select("id", { count: "exact", head: true })
    .in("event_type", ["success", "probe_success"])
    .gte("created_at", oneHourAgo);
  const { count: fail1h } = await supabase
    .from("pinterest_credit_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "payment_required")
    .gte("created_at", oneHourAgo);

  // 3. Update state row.
  const { data: current } = await supabase
    .from("pinterest_credit_state")
    .select("paused, state, consecutive_402_count, last_warning_sent_at")
    .eq("id", 1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    recent_success_count_1h: succ1h ?? 0,
    recent_402_count_1h: fail1h ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (evt.event_type === "payment_required") {
    patch.last_402_at = new Date().toISOString();
    patch.paused = true;
    patch.state = "red";
    patch.consecutive_402_count = (current?.consecutive_402_count ?? 0) + 1;
  } else if (evt.event_type === "success" || evt.event_type === "probe_success") {
    patch.last_success_at = new Date().toISOString();
    patch.paused = false;
    patch.consecutive_402_count = 0;
    // Green if no 402 in last hour; orange if 402 within window but back to success
    patch.state = (fail1h ?? 0) >= ORANGE_THRESHOLD_402 ? "orange" : "green";
  } else if (evt.event_type === "probe_failed") {
    patch.last_probe_at = new Date().toISOString();
  } else if (evt.event_type === "resumed") {
    patch.paused = false;
    patch.state = "green";
  } else if (evt.event_type === "paused") {
    patch.paused = true;
    patch.state = "red";
  }

  await supabase
    .from("pinterest_credit_state")
    .update(patch)
    .eq("id", 1);

  // 4. File system alert + warning when state turns red and cooldown expired.
  if (evt.event_type === "payment_required") {
    const lastWarn = current?.last_warning_sent_at
      ? new Date(current.last_warning_sent_at).getTime()
      : 0;
    const cooldownMs = WARNING_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (Date.now() - lastWarn > cooldownMs) {
      await supabase.from("pinterest_credit_events").insert({
        event_type: "warning",
        function_name: evt.function_name ?? null,
        message: "Lovable AI credits exhausted — Pinterest creative generation paused. Top up credits to resume.",
      });
      // Try to file a monitoring alert if that table is available.
      try {
        await supabase.from("monitoring_alerts").insert({
          alert_type: "pinterest_credits_exhausted",
          severity: "critical",
          title: "Pinterest AI Gateway credits exhausted",
          message: "Pinterest creative generation auto-paused. Publish pipeline still draining drafts/queued pins. Top up Lovable AI credits to resume.",
          metadata: { function: evt.function_name, status: evt.status_code },
        });
      } catch (_) { /* table may not exist in some envs */ }
      await supabase
        .from("pinterest_credit_state")
        .update({ last_warning_sent_at: new Date().toISOString() })
        .eq("id", 1);
    }
  }
}

/**
 * Wraps a Lovable AI Gateway fetch. Returns `{ ok, status, json, paused }`.
 * If credits are paused before the call, returns ok=false / paused=true without
 * touching the network.
 */
export async function aiGatewayFetch(
  supabase: SupabaseClient,
  functionName: string,
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: any; paused?: boolean }> {
  const guard = await isCreditPaused(supabase);
  if (guard.paused) {
    return { ok: false, status: 402, json: { error: "payment_required", message: "credits_paused" }, paused: true };
  }
  const resp = await fetch(url, init);
  let json: any = null;
  try { json = await resp.json(); } catch { /* non-JSON */ }

  if (resp.status === 402) {
    await recordCreditEvent(supabase, {
      event_type: "payment_required",
      status_code: 402,
      function_name: functionName,
      message: json?.error?.message ?? json?.message ?? "payment_required",
      raw: json,
    });
    return { ok: false, status: 402, json, paused: true };
  }
  if (resp.status === 429) {
    await recordCreditEvent(supabase, {
      event_type: "rate_limited",
      status_code: 429,
      function_name: functionName,
      message: "rate_limited",
    });
    return { ok: false, status: 429, json };
  }
  if (!resp.ok) {
    await recordCreditEvent(supabase, {
      event_type: "error",
      status_code: resp.status,
      function_name: functionName,
      message: json?.error?.message ?? `http_${resp.status}`,
    });
    return { ok: false, status: resp.status, json };
  }
  await recordCreditEvent(supabase, {
    event_type: "success",
    status_code: resp.status,
    function_name: functionName,
  });
  return { ok: true, status: resp.status, json };
}