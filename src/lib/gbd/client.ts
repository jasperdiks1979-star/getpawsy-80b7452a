import { supabase } from "@/integrations/supabase/client";

/**
 * Genesis Business DNA client — the only sanctioned way for any engine or UI
 * to consult the permanent knowledge layer. Never duplicate knowledge.
 */
async function call<T = unknown>(action: string, args: Record<string, unknown> = {}, engine = "ui") {
  const { data, error } = await supabase.functions.invoke("gbd-api", {
    body: { action, engine, ...args },
  });
  if (error) throw error;
  return data as T;
}

export const gbd = {
  identity: () => call("getBusinessIdentity"),
  customer: () => call("getCustomerProfile"),
  pricing: () => call("getPricingStrategy"),
  brand: () => call("getBrandGuidelines"),
  psychology: () => call("getPsychologyProfile"),
  marketing: () => call("getMarketingStrategy"),
  product: () => call("getProductKnowledge"),
  competitive: () => call("getCompetitiveLandscape"),
  objectives: () => call("getBusinessObjectives"),
  search: (query: string, limit = 25) => call("searchKnowledge", { query, limit }),
  listModules: () => call("listModules"),
  moduleStatus: (module_key: string) => call("getModuleStatus", { module_key }),
  recordLearning: (input: Record<string, unknown>, engine: string) =>
    call("recordLearning", input, engine),
};

export type GbdModule = {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  completeness: number;
  confidence: number;
  current_version: number;
  updated_at: string;
};