/**
 * Governance Decision Ledger — Deno helper for edge functions.
 * Mirrors src/lib/governanceLedger.ts. Every engine running server-side
 * must use these helpers (no direct table writes, no parallel tables).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function client() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export interface RecordDecisionInput {
  sourceEngine: string;
  decisionType: string;
  proposal: Record<string, unknown>;
  expectedMetric?: string;
  expectedValue?: number;
  confidence?: number;
  linkedReport?: string;
  dedupeKey?: string;
}

export async function recordDecision(input: RecordDecisionInput): Promise<string | null> {
  const { data, error } = await client().rpc("gov_record_decision", {
    p_source_engine: input.sourceEngine,
    p_decision_type: input.decisionType,
    p_proposal: input.proposal ?? {},
    p_expected_metric: input.expectedMetric ?? null,
    p_expected_value: input.expectedValue ?? null,
    p_confidence: input.confidence ?? null,
    p_linked_report: input.linkedReport ?? null,
    p_dedupe_key: input.dedupeKey ?? null,
  });
  if (error) { console.warn("[governance] recordDecision", error.message); return null; }
  return (data as string) ?? null;
}

export interface UpdateOutcomeInput {
  id: string;
  actualMetric: string;
  actualValue: number;
  outcome: string;
  roi?: number;
  learningStatus?: string;
}

export async function updateOutcome(input: UpdateOutcomeInput): Promise<boolean> {
  const { error } = await client().rpc("gov_update_outcome", {
    p_id: input.id,
    p_actual_metric: input.actualMetric,
    p_actual_value: input.actualValue,
    p_outcome: input.outcome,
    p_roi: input.roi ?? null,
    p_learning_status: input.learningStatus ?? "evaluated",
  });
  if (error) { console.warn("[governance] updateOutcome", error.message); return false; }
  return true;
}