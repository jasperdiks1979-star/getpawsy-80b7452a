import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("roe-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "roe-api error");
  return data.result as T;
}

export const ROE = {
  ingestSnapshot: (p: Record<string, unknown>) => call("ingestSnapshot", p),
  recomputeRevenueTree: (snapshot_date?: string) => call("recomputeRevenueTree", { snapshot_date }),
  findBottleneck: (horizon_days = 14) => call("findBottleneck", { horizon_days }),
  marginalValue: (lever: string, delta_pct: number, baseline_snapshot_date?: string) =>
    call("marginalValue", { lever, delta_pct, baseline_snapshot_date }),
  rankPortfolio: (products: Record<string, unknown>[], snapshot_date?: string) =>
    call("rankPortfolio", { products, snapshot_date }),
  recommendInvestment: (available_resources?: string[], snapshot_date?: string) =>
    call("recommendInvestment", { available_resources, snapshot_date }),
  simulate: (scenario: string, intervention: Record<string, unknown> = {}) =>
    call("simulate", { scenario, intervention }),
  predictRevenue: (horizon: "daily"|"weekly"|"monthly" = "daily", days = 14) =>
    call("predictRevenue", { horizon, days }),
  recordUnitEconomics: (p: Record<string, unknown>) => call("recordUnitEconomics", p),
  recommendPricing: (p: Record<string, unknown>) => call("recommendPricing", p),
  approvePricing: (id: string, approved_by = "human", decision: "approved"|"rejected" = "approved") =>
    call("approvePricing", { id, approved_by, decision }),
  recommendScaling: (p: Record<string, unknown>) => call("recommendScaling", p),
  calculateEnterpriseValue: (snapshot_date?: string) => call("calculateEnterpriseValue", { snapshot_date }),
  searchRevenueKnowledge: (q: string, limit = 25) => call("searchRevenueKnowledge", { q, limit }),
  stats: () => call("stats"),
};