// Zero-Waste Pinterest AI Engine V2 — pre-generation gate.
// Single choke-point every image-generating pcie2 path must call before spending credits.
// Reads gate decision from SQL fn pcie2_should_generate(product_id) and logs to
// pcie2_zero_waste_events. Honors shadow-mode (log but allow) via pcie2_frozen_rules.
import { createClient } from "npm:@supabase/supabase-js@2";

export type GateDecision = {
  allow: boolean;         // effective (shadow-aware)
  hard_allow: boolean;    // would allow without shadow-override
  shadow: boolean;
  enabled: boolean;
  score: number;
  reasons: Array<{ code: string; [k: string]: unknown }>;
  reject_rate_today: number;
  images_today: number;
  rejects_today: number;
};

const AVG_CREDITS_PER_IMAGE = 0.04;

function client() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function evaluateZeroWasteGate(
  productId: string,
  opts: { phase?: string; jobId?: string; meta?: Record<string, unknown> } = {},
): Promise<GateDecision> {
  const supa = client();
  const { data, error } = await supa.rpc("pcie2_should_generate", { _product_id: productId });
  if (error || !data) {
    // Fail closed on RPC failure — cheaper than false-positive generation.
    return {
      allow: false, hard_allow: false, shadow: false, enabled: true,
      score: 0, reasons: [{ code: "gate_rpc_error", error: error?.message }],
      reject_rate_today: 0, images_today: 0, rejects_today: 0,
    };
  }
  const g = data as GateDecision;
  const blocked = !g.hard_allow;
  const outcome = !blocked ? "allow" : (g.shadow ? "shadow_block" : "block");
  await supa.from("pcie2_zero_waste_events").insert({
    phase: opts.phase ?? "pre_gen",
    outcome,
    product_id: productId,
    job_id: opts.jobId ?? null,
    score: g.score,
    threshold: 95,
    reasons: g.reasons,
    credits_saved: blocked ? AVG_CREDITS_PER_IMAGE : 0,
    meta: { ...(opts.meta ?? {}), shadow: g.shadow, enabled: g.enabled },
  }).then(() => {}, () => {});
  return g;
}

// Convenience: throw-if-blocked wrapper for pipeline hot paths.
export function shouldSkip(g: GateDecision): { skip: boolean; reason?: string } {
  if (!g.enabled) return { skip: false };
  if (g.hard_allow) return { skip: false };
  if (g.shadow) return { skip: false };       // shadow-mode: log only
  return { skip: true, reason: g.reasons.map((r) => r.code).join(",") || "zero_waste_v2_block" };
}