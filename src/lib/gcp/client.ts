import { supabase } from "@/integrations/supabase/client";

/**
 * Genesis Customer Psychology DNA — client.
 * Every engine MUST consult GCP before customer-affecting decisions.
 */
export type GcpAction =
  | "listModules"
  | "getModule"
  | "getConcepts"
  | "getVisitorProfile"
  | "upsertVisitorProfile"
  | "recordSignal"
  | "recordPrediction"
  | "recordLearning"
  | "consult"
  | "recommend";

export interface GcpRequest {
  action: GcpAction;
  engine?: string;
  payload?: Record<string, unknown>;
}

export async function gcp<T = unknown>(req: GcpRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gcp-api", { body: req });
  if (error) throw error;
  return data as T;
}

export const gcpApi = {
  listModules: () => gcp({ action: "listModules" }),
  getConcepts: (moduleKey: string) => gcp({ action: "getConcepts", payload: { moduleKey } }),
  getVisitorProfile: (visitorId: string) =>
    gcp({ action: "getVisitorProfile", payload: { visitorId } }),
  recordSignal: (signal: {
    visitor_id?: string;
    session_id?: string;
    signal_type: string;
    signal_value?: number;
    context?: Record<string, unknown>;
    source?: string;
  }) => gcp({ action: "recordSignal", payload: signal }),
  consult: (engine: string, query: Record<string, unknown>) =>
    gcp({ action: "consult", engine, payload: query }),
  recommend: (engine: string, kind: string, context: Record<string, unknown>) =>
    gcp({ action: "recommend", engine, payload: { kind, context } }),
};