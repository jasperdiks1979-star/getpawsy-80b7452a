import { supabase } from "@/integrations/supabase/client";

export type AgalDecisionInput = {
  engine_key: string;
  engine_version?: string;
  decision_type: string;
  subject?: string;
  prompt?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  reasoning?: string;
  confidence?: number;
  expected_result?: Record<string, number>;
  actual_result?: Record<string, number> | null;
  financial_impact_cents?: number;
  business_impact_score?: number;
  meta?: Record<string, unknown>;
};

/** Append a decision to the AGAL immutable ledger. Engines never write directly. */
export async function recordAgalDecision(input: AgalDecisionInput) {
  const { data, error } = await supabase.functions.invoke("agal-auditor", {
    body: { ...input },
    headers: {},
  } as any);
  if (error) throw error;
  return data;
}