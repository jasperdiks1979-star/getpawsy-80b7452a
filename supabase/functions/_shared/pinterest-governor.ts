// Anti-duplication + banned-phrase governor wrapper.
//
// Wraps the SECURITY DEFINER SQL function `public.governor_check_pin(slug, board_id, headline, overlay, cta)`.
// Every publisher path (creative-director draft insert, viral-batch row insert,
// publish-now / cron-worker pre-POST) MUST call `checkGovernor` and treat
// `allowed === false` as a hard reject (quarantine + skip insert / mark
// rejected before publish).
//
// Returns the raw verdict from the RPC plus a normalized reason string.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface GovernorViolation {
  rule: string;
  value?: number;
  limit?: number;
  lookback?: number;
  phrase?: string;
}

export interface GovernorVerdict {
  allowed: boolean;
  enabled: boolean;
  violations: GovernorViolation[];
  reason: string | null;
}

export interface GovernorInput {
  slug: string | null | undefined;
  boardId?: string | null;
  headline?: string | null;
  overlay?: string | null;
  cta?: string | null;
}

/**
 * Call public.governor_check_pin. NEVER throws — on any error it returns
 * `{ allowed: true, enabled: false, violations: [], reason: "governor_unavailable" }`
 * so a transient DB hiccup can't block the entire publisher. Callers that
 * want strict mode can check `enabled` and treat unavailability as a soft
 * deny themselves.
 */
// deno-lint-ignore no-explicit-any
export async function checkGovernor(sb: SupabaseClient<any, any, any>, input: GovernorInput): Promise<GovernorVerdict> {
  try {
    const { data, error } = await sb.rpc("governor_check_pin", {
      p_slug: input.slug ?? "",
      p_board_id: input.boardId ?? null,
      p_headline: input.headline ?? null,
      p_overlay: input.overlay ?? null,
      p_cta: input.cta ?? null,
    });
    if (error) {
      console.warn("[governor] rpc error:", error.message);
      return { allowed: true, enabled: false, violations: [], reason: "governor_unavailable" };
    }
    const v = (data ?? {}) as Record<string, unknown>;
    const violations = Array.isArray(v.violations) ? (v.violations as GovernorViolation[]) : [];
    const allowed = v.allowed !== false; // default permissive only when rules disabled
    const enabled = v.enabled !== false;
    return {
      allowed,
      enabled,
      violations,
      reason: violations.length > 0 ? violations.map((x) => x.rule + (x.phrase ? `:${x.phrase}` : "")).join(",") : null,
    };
  } catch (e) {
    console.warn("[governor] unexpected error:", e instanceof Error ? e.message : e);
    return { allowed: true, enabled: false, violations: [], reason: "governor_unavailable" };
  }
}

/** Short tag suitable for `qa_reasons` / `rejection_reason`. */
export function governorRejectReason(v: GovernorVerdict): string {
  return v.reason ? `governor:${v.reason}` : "governor:violation";
}