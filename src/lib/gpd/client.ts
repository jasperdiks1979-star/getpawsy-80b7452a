import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gpd-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "gpd-api error");
  return data.result as T;
}

export const GPD = {
  consult: (module_key?: string, limit = 25) => call("consult", { module_key, limit }),
  upsertProduct: (p: Record<string, unknown>) => call("upsertProduct", p),
  recordCommercial: (c: Record<string, unknown>) => call("recordCommercial", c),
  recordPriceChange: (p: Record<string, unknown>) => call("recordPriceChange", p),
  recordHealth: (h: Record<string, unknown>) => call("recordHealth", h),
  upsertIntent: (i: Record<string, unknown>) => call("upsertIntent", i),
  upsertCustomerFit: (items: unknown[]) => call("upsertCustomerFit", { items }),
  openOpportunity: (o: Record<string, unknown>) => call("openOpportunity", o),
  recordTrend: (t: Record<string, unknown>) => call("recordTrend", t),
  proposeBundle: (b: Record<string, unknown>) => call("proposeBundle", b),
  recommendPrice: (p: Record<string, unknown>) => call("recommendPrice", p),
  updateInventory: (i: Record<string, unknown>) => call("updateInventory", i),
  upsertCreativeMatch: (m: Record<string, unknown>) => call("upsertCreativeMatch", m),
  predict: (product_id: string, prediction_type = "revenue", features: Record<string, unknown> = {}) =>
    call("predict", { product_id, prediction_type, features }),
  addDiscovery: (d: Record<string, unknown>) => call("addDiscovery", d),
  recommend: (args: { kind?: string; product_id?: string; limit?: number }) => call("recommend", args),
  stats: () => call("stats"),
};