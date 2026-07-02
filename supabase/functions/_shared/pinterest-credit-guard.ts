// Pinterest Credit Protection — shared guard.
//
// All Pinterest functions that hit ai.gateway.lovable.dev MUST funnel through
// these helpers so credit-exhaustion (HTTP 402) and recovery are tracked
// centrally.
//
// LANE SPLIT (critical):
//   - AI Generation Lane  → may pause when credits are exhausted.
//   - Publishing Lane     → MUST keep running even at 0 credits.
//
// `isCreditPaused()` / `isAiGenerationPaused()` ONLY blocks AI Gateway work.
// `isPublishingPaused()` is independent and is only set by an explicit
// operator action (`publishing_paused` column). Credit guard NEVER toggles it.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { recomputeForecast, maybeFire24hAlert } from "./pinterest-credit-forecast.ts";

const ORANGE_THRESHOLD_402 = 1; // any 402 in last hour → orange minimum
const WARNING_COOLDOWN_HOURS = 6;
// Evidence-backed auto-recovery: after a 402, re-check within this window.
// Prevents hammering while still turning transient 402s into self-healing events.
const AUTO_RECOVERY_COOLDOWN_MS = 60 * 1000;
let __lastAutoRecoveryAt = 0;

/**
 * Fire an evidence-backed re-probe. Called after a 402 from any AI gateway
 * response. Rate-limited to once per minute per worker to avoid probe storms.
 * Never throws; publishing/generation callers ignore the outcome.
 */
async function scheduleEvidenceRecovery(supabase: SupabaseClient, functionName: string): Promise<void> {
  const now = Date.now();
  if (now - __lastAutoRecoveryAt < AUTO_RECOVERY_COOLDOWN_MS) return;
  __lastAutoRecoveryAt = now;

  const invoke = async () => {
    try {
      // 1. Zero-cost evidence path — look for recent gateway successes.
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("pinterest_credit_events")
        .select("id, created_at, function_name")
        .in("event_type", ["success", "probe_success"])
        .gte("created_at", tenMinAgo)
        .order("created_at", { ascending: false })
        .limit(1);
      if (recent && recent.length > 0) {
        await supabase
          .from("ai_probe_backoff_state")
          .update({
            consecutive_failures: 0,
            next_allowed_at: new Date().toISOString(),
            last_status_code: 200,
            updated_at: new Date().toISOString(),
          })
          .eq("id", 1);
        await recordCreditEvent(supabase, {
          event_type: "resumed",
          function_name: `auto-recover:${functionName}`,
          message: "evidence_backed_recovery_after_402",
          raw: { evidence: recent[0] },
        });
        return;
      }
      // 2. Force the probe (bypasses backoff) to verify with a 1-token call.
      await supabase.functions.invoke("pinterest-credit-probe", {
        body: { force: true, source: `auto-recover:${functionName}` },
      });
    } catch (_) { /* auto-recovery must never throw */ }
  };

  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(invoke());
  else invoke();
}

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Hard cost-protection kill switches (2026-06-17) ─────────────────────────
// CJ / supplier image hosts are NEVER allowed on Pinterest. Pins backed by
// these URLs are rejected before any API call.
export const CJ_SUPPLIER_IMAGE_HOSTS: readonly string[] = [
  "cjdropshipping.com",
  "cf.cjdropshipping.com",
  "cc.cjdropshipping.com",
  "img.cjdropshipping.com",
  "oss.cjdropshipping.com",
  "cjjsbox.com",
  "alicdn.com",
  "aliexpress.com",
  "alibaba.com",
  "dhgate.com",
  "1688.com",
];

export function isCjSupplierImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CJ_SUPPLIER_IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return /cjdropshipping|cjjsbox|alicdn|aliexpress|alibaba|1688|dhgate/i.test(url);
  }
}

/**
 * Hard kill switch for ALL image-model generation. Honors three signals:
 *   1. env `PINTEREST_IMAGE_GENERATION_KILLED=true` (instant ops switch)
 *   2. `pinterest_credit_state.image_generation_killed` column
 *   3. `pinterest_credit_state.manual_pause`
 * Also enforces a rolling 24h image-credit budget cap.
 */
export async function isImageGenerationKilled(
  supabase: SupabaseClient,
): Promise<{ killed: boolean; reason: string | null }> {
  if ((Deno.env.get("PINTEREST_IMAGE_GENERATION_KILLED") ?? "").toLowerCase() === "true") {
    return { killed: true, reason: "env_kill_switch" };
  }
  const { data } = await supabase
    .from("pinterest_credit_state")
    .select("image_generation_killed, manual_pause, manual_pause_reason, daily_image_credit_cap, ai_generation_paused")
    .eq("id", 1)
    .maybeSingle();
  if (data?.image_generation_killed) return { killed: true, reason: "image_generation_killed" };
  if (data?.manual_pause) return { killed: true, reason: data?.manual_pause_reason ?? "manual_pause" };
  if (data?.ai_generation_paused) return { killed: true, reason: "ai_generation_paused" };
  const cap = Number(data?.daily_image_credit_cap ?? 0);
  if (cap > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await supabase
      .from("pinterest_credit_events")
      .select("credits_used")
      .eq("event_type", "success")
      .eq("function_name", "creative-director:image")
      .gte("created_at", since);
    const used = (events ?? []).reduce((s, r: any) => s + Number(r.credits_used ?? 0), 0);
    if (used >= cap) return { killed: true, reason: `daily_image_cap_reached:${used}>=${cap}` };
  }
  return { killed: false, reason: null };
}

export async function isAutopilotDisabled(supabase: SupabaseClient): Promise<boolean> {
  if ((Deno.env.get("PINTEREST_AUTOPILOT_DISABLED") ?? "").toLowerCase() === "true") return true;
  const { data } = await supabase
    .from("pinterest_credit_state")
    .select("autopilot_disabled")
    .eq("id", 1)
    .maybeSingle();
  return data?.autopilot_disabled === true;
}

export async function isCreditPaused(supabase: SupabaseClient): Promise<{
  paused: boolean;
  state: "green" | "orange" | "red";
  last_402_at: string | null;
  last_success_at: string | null;
  manual_pause?: boolean;
  emergency_mode?: boolean;
}> {
  const { data } = await supabase
    .from("pinterest_credit_state")
    .select("paused, ai_generation_paused, state, last_402_at, last_success_at, manual_pause, emergency_mode, forecast_state")
    .eq("id", 1)
    .maybeSingle();
  const aiPaused =
    (data?.ai_generation_paused ?? data?.paused ?? false) || (data?.manual_pause ?? false);
  return {
    // `paused` here refers strictly to the AI generation lane.
    paused: aiPaused,
    state: (data?.forecast_state ?? data?.state ?? "green") as "green" | "orange" | "red",
    last_402_at: data?.last_402_at ?? null,
    last_success_at: data?.last_success_at ?? null,
    manual_pause: data?.manual_pause ?? false,
    emergency_mode: data?.emergency_mode ?? false,
  };
}

/** Explicit name — same semantics as `isCreditPaused`. Only blocks AI work. */
export const isAiGenerationPaused = isCreditPaused;

/**
 * Publishing-lane gate. Independent from credits. Only true when an operator
 * has explicitly halted publishing. Credit exhaustion never sets this.
 */
export async function isPublishingPaused(
  supabase: SupabaseClient,
): Promise<{ paused: boolean; reason: string | null }> {
  const { data } = await supabase
    .from("pinterest_credit_state")
    .select("publishing_paused")
    .eq("id", 1)
    .maybeSingle();
  return { paused: data?.publishing_paused === true, reason: null };
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
  credits_used?: number;
  tokens_used?: number;
  model?: string;
  pin_queue_id?: string | null;
  product_slug?: string | null;
  category_slug?: string | null;
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
    credits_used: evt.credits_used ?? null,
    tokens_used: evt.tokens_used ?? null,
    model: evt.model ?? null,
    pin_queue_id: evt.pin_queue_id ?? null,
    product_slug: evt.product_slug ?? null,
    category_slug: evt.category_slug ?? null,
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
    // AI-generation lane only. Publishing lane is intentionally NOT touched.
    patch.paused = true; // legacy alias
    patch.ai_generation_paused = true;
    patch.state = "red";
    patch.consecutive_402_count = (current?.consecutive_402_count ?? 0) + 1;
  } else if (evt.event_type === "success" || evt.event_type === "probe_success") {
    patch.last_success_at = new Date().toISOString();
    patch.paused = false;
    patch.ai_generation_paused = false;
    patch.consecutive_402_count = 0;
    // Green if no 402 in last hour; orange if 402 within window but back to success
    patch.state = (fail1h ?? 0) >= ORANGE_THRESHOLD_402 ? "orange" : "green";
  } else if (evt.event_type === "probe_failed") {
    patch.last_probe_at = new Date().toISOString();
  } else if (evt.event_type === "resumed") {
    patch.paused = false;
    patch.ai_generation_paused = false;
    patch.state = "green";
  } else if (evt.event_type === "paused") {
    patch.paused = true;
    patch.ai_generation_paused = true;
    patch.state = "red";
  }

  await supabase
    .from("pinterest_credit_state")
    .update(patch)
    .eq("id", 1);

  // Recompute forecast (cheap) + fire 24h alert if needed. Failure-tolerant.
  if (evt.event_type === "success" || evt.event_type === "payment_required") {
    try {
      const snap = await recomputeForecast(supabase);
      await maybeFire24hAlert(supabase, snap);
    } catch (_) { /* never block on forecast errors */ }
  }

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
    // Evidence-backed auto-recovery — some 402s are transient (per-key rate
    // slice, race with a top-up). Kick a re-probe so a stale pause auto-clears.
    await scheduleEvidenceRecovery(supabase, functionName);
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
  // Estimate credit cost: prefer reported usage.total_tokens, fallback to 1 unit.
  const tokens = Number(json?.usage?.total_tokens ?? 0);
  const credits = tokens > 0 ? tokens / 1000 : 1; // ~1 credit per 1k tokens, else 1
  const model = (init.body && typeof init.body === "string"
    ? (() => { try { return JSON.parse(init.body as string)?.model; } catch { return undefined; } })()
    : undefined) as string | undefined;
  await recordCreditEvent(supabase, {
    event_type: "success",
    status_code: resp.status,
    function_name: functionName,
    credits_used: credits,
    tokens_used: tokens || undefined,
    model,
  });
  return { ok: true, status: resp.status, json };
}