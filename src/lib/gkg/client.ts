import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gkg-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "gkg-api error");
  return data.result as T;
}

export const GKG = {
  upsertNode: (p: Record<string, unknown>) => call("upsertNode", p),
  upsertEdge: (p: Record<string, unknown>) => call("upsertEdge", p),
  searchKnowledge: (q: string, limit = 25) => call("searchKnowledge", { q, limit }),
  semanticSearch: (q: string, limit = 10) => call("semanticSearch", { q, limit }),
  reason: (question: string, source_engine = "ui") => call("reason", { question, source_engine }),
  generateHypotheses: (question: string, k = 5, source_engine = "ui") =>
    call("generateHypotheses", { question, k, source_engine }),
  findRootCause: (symptom: string, context: Record<string, unknown> = {}, source_engine = "ui") =>
    call("findRootCause", { symptom, context, source_engine }),
  predictOutcome: (scenario: string, intervention: Record<string, unknown> = {}, baseline: Record<string, unknown> = {}) =>
    call("predictOutcome", { scenario, intervention, baseline }),
  buildDecisionBrief: (decision_topic: string, target_consumer = "executive_board") =>
    call("buildDecisionBrief", { decision_topic, target_consumer }),
  recordOutcome: (trace_id: string, actual_outcome: Record<string, unknown>, learning?: string) =>
    call("recordOutcome", { trace_id, actual_outcome, learning }),
  addMemory: (m: Record<string, unknown>) => call("addMemory", m),
  detectContradiction: (c: Record<string, unknown>) => call("detectContradiction", c),
  neighbors: (node_id: string, relation?: string, direction: "in" | "out" | "both" = "both", limit = 50) =>
    call("neighbors", { node_id, relation, direction, limit }),
  evolve: () => call("evolve"),
  stats: () => call("stats"),
};