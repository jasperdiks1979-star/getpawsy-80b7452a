import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("aee-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "aee-api error");
  return data.result as T;
}

export const AEE = {
  createHypothesis: (p: Record<string, unknown>) => call("createHypothesis", p),
  createExperiment: (p: Record<string, unknown>) => call("createExperiment", p),
  approveExperiment: (experiment_id: string, approved_by = "human") => call("approveExperiment", { experiment_id, approved_by }),
  launchExperiment: (experiment_id: string, rollout_pct?: number) => call("launchExperiment", { experiment_id, rollout_pct }),
  pauseExperiment: (experiment_id: string, reason?: string) => call("pauseExperiment", { experiment_id, reason }),
  stopExperiment: (experiment_id: string, reason?: string) => call("stopExperiment", { experiment_id, reason }),
  assign: (experiment_id: string, subject_type: string, subject_id: string) => call("assign", { experiment_id, subject_type, subject_id }),
  record: (p: Record<string, unknown>) => call("record", p),
  evaluateExperiment: (experiment_id: string) => call("evaluateExperiment", { experiment_id }),
  declareWinner: (experiment_id: string, recommended_action?: string) => call("declareWinner", { experiment_id, recommended_action }),
  declareNoDifference: (experiment_id: string, lessons?: string) => call("declareNoDifference", { experiment_id, lessons }),
  recordFailure: (p: Record<string, unknown>) => call("recordFailure", p),
  generateLearning: (experiment_id: string) => call("generateLearning", { experiment_id }),
  recommendExperiment: (limit = 5) => call("recommendExperiment", { limit }),
  searchExperiments: (p: Record<string, unknown> = {}) => call("searchExperiments", p),
  getExperiment: (experiment_id: string) => call("getExperiment", { experiment_id }),
  stats: () => call("stats"),
};