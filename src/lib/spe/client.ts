import { supabase } from "@/integrations/supabase/client";

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("spe-api", { body: { action, ...payload } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "spe-api error");
  return data.result as T;
}

export const SPE = {
  createObjective: (p: Record<string, unknown>) => call("createObjective", p),
  listObjectives: (p: Record<string, unknown> = {}) => call("listObjectives", p),
  prioritizeInitiatives: () => call("prioritizeInitiatives"),
  generateInitiatives: (count = 5) => call("generateInitiatives", { count }),
  generateRoadmap: (horizon: "quarter" | "year" = "quarter") => call("generateRoadmap", { horizon }),
  planQuarter: () => call("planQuarter"),
  planYear: () => call("planYear"),
  forecastObjectives: (horizons: string[] = ["30d","90d","1y"]) => call("forecastObjectives", { horizons }),
  analyzeRisks: () => call("analyzeRisks"),
  generateScenarios: (horizon = "90d") => call("generateScenarios", { horizon }),
  recommendInvestments: (budget_usd = 5000) => call("recommendInvestments", { budget_usd }),
  approveInvestment: (id: string, approved_by = "human", decision: "approved" | "rejected" = "approved") =>
    call("approveInvestment", { id, approved_by, decision }),
  scoreMaturity: () => call("scoreMaturity"),
  mapCapabilities: () => call("mapCapabilities"),
  planResources: (resources?: string[]) => call("planResources", { resources }),
  generateExecutiveBrief: (cadence: "daily"|"weekly"|"monthly"|"quarterly"|"annual" = "daily") =>
    call("generateExecutiveBrief", { cadence }),
  addDependency: (p: Record<string, unknown>) => call("addDependency", p),
  criticalPath: () => call("criticalPath"),
  searchStrategy: (q: string, limit = 25) => call("searchStrategy", { q, limit }),
  stats: () => call("stats"),
};