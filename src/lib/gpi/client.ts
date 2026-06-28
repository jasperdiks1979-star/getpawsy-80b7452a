import { supabase } from "@/integrations/supabase/client";

/**
 * Genesis Pinterest Intelligence DNA — client.
 * Every engine that creates/scores/schedules/publishes Pinterest content
 * MUST consult GPI before acting.
 */
export type GpiAction =
  | "listModules"
  | "getConcepts"
  | "upsertPinDna"
  | "recordPerformance"
  | "recordPrediction"
  | "recordLearning"
  | "consult"
  | "recommend"
  | "predict"
  | "topPins";

export interface GpiRequest {
  action: GpiAction;
  engine?: string;
  payload?: Record<string, unknown>;
}

export async function gpi<T = unknown>(req: GpiRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gpi-api", { body: req });
  if (error) throw error;
  return data as T;
}

export const gpiApi = {
  listModules: () => gpi({ action: "listModules" }),
  getConcepts: (moduleKey?: string) =>
    gpi({ action: "getConcepts", payload: { moduleKey } }),
  upsertPinDna: (engine: string, dna: Record<string, unknown>) =>
    gpi({ action: "upsertPinDna", engine, payload: dna }),
  recordPerformance: (engine: string, perf: Record<string, unknown>) =>
    gpi({ action: "recordPerformance", engine, payload: perf }),
  recordPrediction: (engine: string, pred: Record<string, unknown>) =>
    gpi({ action: "recordPrediction", engine, payload: pred }),
  recordLearning: (engine: string, learning: Record<string, unknown>) =>
    gpi({ action: "recordLearning", engine, payload: learning }),
  consult: (engine: string, query: Record<string, unknown>) =>
    gpi({ action: "consult", engine, payload: query }),
  recommend: (engine: string, kind: string, context: Record<string, unknown>) =>
    gpi({ action: "recommend", engine, payload: { kind, context } }),
  predict: (engine: string, predictionType: string, features: Record<string, unknown>) =>
    gpi({ action: "predict", engine, payload: { predictionType, features } }),
  topPins: (limit = 25) => gpi({ action: "topPins", payload: { limit } }),
};