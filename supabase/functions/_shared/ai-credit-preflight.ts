// Shared AI Gateway preflight for creative pipelines.
//
// Returns `{ ok: true }` when generation is allowed, otherwise
// `{ ok: false, reason, state }` with a stable machine-readable reason that
// callers can echo into their run report so operators understand WHY a run
// was skipped (vs. silently producing nothing).
//
// Reasons:
//   credits_paused          → AI generation lane explicitly paused
//   image_generation_killed → image lane killed (env / column / cap / manual)
//   recent_402_burst        → ≥1 payment_required in the last 15 minutes
//   ai_key_missing          → LOVABLE_API_KEY not configured

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  isCreditPaused,
  isImageGenerationKilled,
  recordCreditEvent,
} from "./pinterest-credit-guard.ts";

export interface PreflightResult {
  ok: boolean;
  reason: string | null;
  state: "green" | "orange" | "red";
  detail?: Record<string, unknown>;
}

export async function aiCreditPreflight(
  supabase: SupabaseClient,
  functionName: string,
  opts: { requireImage?: boolean } = {},
): Promise<PreflightResult> {
  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return { ok: false, reason: "ai_key_missing", state: "red" };
  }

  const guard = await isCreditPaused(supabase);
  if (guard.paused) {
    await recordCreditEvent(supabase, {
      event_type: "paused",
      function_name: functionName,
      message: "preflight_skipped:credits_paused",
    }).catch(() => {});
    return {
      ok: false,
      reason: "credits_paused",
      state: guard.state,
      detail: {
        last_402_at: guard.last_402_at,
        manual_pause: guard.manual_pause,
        emergency_mode: guard.emergency_mode,
      },
    };
  }

  if (opts.requireImage) {
    const kill = await isImageGenerationKilled(supabase);
    if (kill.killed) {
      return {
        ok: false,
        reason: `image_generation_killed:${kill.reason ?? "unknown"}`,
        state: guard.state,
      };
    }
  }

  // Recent 402 burst window (15 min) — stop before we trigger more 402s.
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("pinterest_credit_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "payment_required")
    .gte("created_at", since);
  if ((count ?? 0) >= 1) {
    return {
      ok: false,
      reason: "recent_402_burst",
      state: guard.state === "green" ? "orange" : guard.state,
      detail: { window_minutes: 15, count_402: count },
    };
  }

  return { ok: true, reason: null, state: guard.state };
}