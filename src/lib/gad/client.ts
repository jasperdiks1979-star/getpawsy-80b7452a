import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gad-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "gad-api error");
  return data.result as T;
}

export const GAD = {
  consult: (module_key?: string, limit = 25) => call("consult", { module_key, limit }),
  recordEvent: (e: Record<string, unknown>) => call("recordEvent", e),
  recordMetric: (m: Record<string, unknown>) => call("recordMetric", m),
  validateTruth: (v: Record<string, unknown>) => call("validateTruth", v),
  reportAnomaly: (a: Record<string, unknown>) => call("reportAnomaly", a),
  recordAttribution: (items: unknown[]) => call("recordAttribution", { items }),
  recordForecast: (f: Record<string, unknown>) => call("recordForecast", f),
  resolveForecast: (id: string, actual_value: number) => call("resolveForecast", { id, actual_value }),
  auditDecision: (d: Record<string, unknown>) => call("auditDecision", d),
  resolveDecision: (p: Record<string, unknown>) => call("resolveDecision", p),
  stats: () => call("stats"),
};