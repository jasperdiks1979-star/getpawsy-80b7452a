import { supabase } from "@/integrations/supabase/client";

type Action =
  | "runCycle"
  | "captureHealth"
  | "computeReliability"
  | "runIntegrity"
  | "evaluateSlos"
  | "verifyJourneys"
  | "createIncident"
  | "resolveIncident"
  | "registerChange"
  | "queueHealing"
  | "status";

async function call<T = unknown>(action: Action, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("trpe-orchestrator", {
    body: { action, ...body },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "TRPE call failed");
  return data.result as T;
}

export const TRPE = {
  status: () => call("status"),
  runCycle: () => call("runCycle"),
  captureHealth: () => call("captureHealth"),
  computeReliability: () => call("computeReliability"),
  runIntegrity: () => call("runIntegrity"),
  evaluateSlos: () => call("evaluateSlos"),
  verifyJourneys: () => call("verifyJourneys"),
  queueHealing: (subsystem: string, trigger: string, action: string) =>
    call("queueHealing", { subsystem, trigger, action }),
  createIncident: (incident: Record<string, unknown>) => call("createIncident", { incident }),
  resolveIncident: (id: string, patch: Record<string, unknown> = {}) =>
    call("resolveIncident", { id, patch }),
  registerChange: (change: Record<string, unknown>) => call("registerChange", { change }),
};