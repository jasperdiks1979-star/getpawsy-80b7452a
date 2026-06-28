import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gmd-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "gmd-api error");
  return data.result as T;
}

export const GMD = {
  consult: (module_key?: string, limit = 25) => call("consult", { module_key, limit }),
  recordTrend: (t: Record<string, unknown>) => call("recordTrend", t),
  recordSearchSignal: (s: Record<string, unknown>) => call("recordSearchSignal", s),
  upsertCategory: (c: Record<string, unknown>) => call("upsertCategory", c),
  recordCompetitorObservation: (o: Record<string, unknown>) => call("recordCompetitorObservation", o),
  recordPricingLandscape: (p: Record<string, unknown>) => call("recordPricingLandscape", p),
  recordEconomicSignal: (s: Record<string, unknown>) => call("recordEconomicSignal", s),
  addSeasonRecommendation: (r: Record<string, unknown>) => call("addSeasonRecommendation", r),
  upsertRegionalProfile: (p: Record<string, unknown>) => call("upsertRegionalProfile", p),
  recordSocialTrend: (t: Record<string, unknown>) => call("recordSocialTrend", t),
  openOpportunity: (o: Record<string, unknown>) => call("openOpportunity", o),
  recordRisk: (r: Record<string, unknown>) => call("recordRisk", r),
  forecast: (args: { forecast_type?: string; subject_key?: string; horizon_days?: number; features?: Record<string, unknown>; region_code?: string }) =>
    call("forecast", args),
  recommend: (args: { kind?: string; limit?: number; region_code?: string; season_key?: string; category_key?: string }) =>
    call("recommend", args),
  searchKnowledge: (q: string, limit = 20) => call("searchKnowledge", { q, limit }),
  logAssumption: (a: Record<string, unknown>) => call("logAssumption", a),
  retireAssumption: (id: string, reason?: string) => call("retireAssumption", { id, reason }),
  stats: () => call("stats"),
};