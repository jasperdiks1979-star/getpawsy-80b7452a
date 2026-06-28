import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("aicos-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "aicos-api error");
  return data.result as T;
}

export const AICOS = {
  stats: () => call<any>("stats"),
  listDepartments: () => call<any[]>("listDepartments"),
  listEmployees: () => call<any[]>("listEmployees"),
  listTasks: (p: Record<string, unknown> = {}) => call<any[]>("listTasks", p),
  listMessages: (p: Record<string, unknown> = {}) => call<any[]>("listMessages", p),
  listIncidents: () => call<any[]>("listIncidents"),
  listPolicies: () => call<any[]>("listPolicies"),
  listResources: () => call<any[]>("listResources"),
  createObjective: (p: Record<string, unknown>) => call<any>("createObjective", p),
  createTask: (p: Record<string, unknown>) => call<any>("createTask", p),
  sendMessage: (p: Record<string, unknown>) => call<any>("sendMessage", p),
  setPolicy: (code: string) => call<any>("setPolicy", { code }),
  runWorkflow: (p: Record<string, unknown>) => call<any>("runWorkflow", p),
  advanceWorkflow: (p: Record<string, unknown>) => call<any>("advanceWorkflow", p),
  escalateIncident: (p: Record<string, unknown>) => call<any>("escalateIncident", p),
  resolveIncident: (p: Record<string, unknown>) => call<any>("resolveIncident", p),
  recordMemory: (p: Record<string, unknown>) => call<any>("recordMemory", p),
  searchMemory: (q: string, limit = 25) => call<any[]>("searchMemory", { q, limit }),
  propagateKnowledge: (p: Record<string, unknown>) => call<any>("propagateKnowledge", p),
  snapshotTwin: (p: Record<string, unknown> = {}) => call<any>("snapshotTwin", p),
  computeHealth: () => call<any>("computeHealth"),
  updateEmployeeHeartbeat: (p: Record<string, unknown>) => call<any>("updateEmployeeHeartbeat", p),
};