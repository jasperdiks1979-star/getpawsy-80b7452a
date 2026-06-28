import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ede-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "ede-api error");
  return data.result as T;
}

export const EDE = {
  proposeDecision: (p: Record<string, unknown>) => call("proposeDecision", p),
  generateAlternatives: (proposal_id: string, k = 5) => call("generateAlternatives", { proposal_id, k }),
  simulateScenario: (proposal_id: string, scenario_type: "best"|"expected"|"worst"|"black_swan", description?: string) =>
    call("simulateScenario", { proposal_id, scenario_type, description }),
  calculateBusinessValue: (proposal_id: string) => call("calculateBusinessValue", { proposal_id }),
  runExecutiveVote: (proposal_id: string) => call("runExecutiveVote", { proposal_id }),
  evaluateProposal: (proposal_id: string, alternatives_k = 5) =>
    call("evaluateProposal", { proposal_id, alternatives_k }),
  approveDecision: (proposal_id: string, approver = "human") => call("approveDecision", { proposal_id, approver }),
  reviewDecision: (proposal_id: string, expected: Record<string, number>, actual: Record<string, number>, reviewer?: string) =>
    call("reviewDecision", { proposal_id, expected, actual, reviewer }),
  listQueue: (status: string = "draft", limit = 50) => call("listQueue", { status, limit }),
  getProposal: (proposal_id: string) => call("getProposal", { proposal_id }),
  stats: () => call("stats"),
  recalcWeights: () => call("recalcWeights"),
};