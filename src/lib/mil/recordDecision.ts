import { supabase } from "@/integrations/supabase/client";

export type MilDecisionInput = {
  engineKey: string;
  decisionType: string;
  subject?: string;
  reasoning?: string;
  confidence?: number;
  expected?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

/**
 * Record an AI decision into the Meta Intelligence Layer ledger.
 * Engines call this when emitting a decision; MIL grades them later by
 * matching actual_outcome against expected_outcome.
 */
export async function recordMilDecision(input: MilDecisionInput) {
  const { error } = await (supabase.from("mil_decisions") as any).insert({
    engine_key: input.engineKey,
    decision_type: input.decisionType,
    subject: input.subject ?? null,
    reasoning: input.reasoning ?? null,
    confidence: input.confidence ?? null,
    expected_outcome: input.expected ?? {},
    meta: input.meta ?? {},
  });
  if (error) console.warn("[MIL] decision record failed", error.message);
}