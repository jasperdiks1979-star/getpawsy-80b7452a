/**
 * Governance Decision Ledger — single shared writer/updater.
 *
 * Every strategic decision from BOS, Revenue AI, Executive Board, AI CEO,
 * Commander, FOS, or any future engine MUST flow through these helpers.
 * No parallel tables, no direct inserts elsewhere.
 *
 * Phase 2 (recordDecision) creates exactly one ledger row per decision
 * (dedupeKey prevents duplicates). Phase 3 (updateOutcome) closes the loop
 * with actual_value / outcome / roi when evidence arrives.
 */
import { supabase } from "@/integrations/supabase/client";

export type GovEngine =
  | "bos"
  | "revenue_ai"
  | "executive_board"
  | "ai_ceo"
  | "commander"
  | "fos"
  | string;

export interface RecordDecisionInput {
  sourceEngine: GovEngine;
  decisionType: string;
  proposal: Record<string, unknown>;
  expectedMetric?: string;
  expectedValue?: number;
  confidence?: number;
  linkedReport?: string;
  dedupeKey?: string;
}

export interface UpdateOutcomeInput {
  id: string;
  actualMetric: string;
  actualValue: number;
  outcome: "success" | "failure" | "partial" | "neutral" | string;
  roi?: number;
  learningStatus?: "evaluated" | "calibrated" | "rolled_back" | string;
}

export async function recordDecision(input: RecordDecisionInput): Promise<string | null> {
  const { data, error } = await supabase.rpc("gov_record_decision", {
    p_source_engine: input.sourceEngine,
    p_decision_type: input.decisionType,
    p_proposal: input.proposal ?? {},
    p_expected_metric: input.expectedMetric ?? null,
    p_expected_value: input.expectedValue ?? null,
    p_confidence: input.confidence ?? null,
    p_linked_report: input.linkedReport ?? null,
    p_dedupe_key: input.dedupeKey ?? null,
  } as never);
  if (error) {
    console.warn("[governance] recordDecision failed", error.message);
    return null;
  }
  return (data as unknown as string) ?? null;
}

export async function updateOutcome(input: UpdateOutcomeInput): Promise<boolean> {
  const { error } = await supabase.rpc("gov_update_outcome", {
    p_id: input.id,
    p_actual_metric: input.actualMetric,
    p_actual_value: input.actualValue,
    p_outcome: input.outcome,
    p_roi: input.roi ?? null,
    p_learning_status: input.learningStatus ?? "evaluated",
  } as never);
  if (error) {
    console.warn("[governance] updateOutcome failed", error.message);
    return false;
  }
  return true;
}