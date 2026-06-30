import { supabase } from "@/integrations/supabase/client";

/**
 * Genesis V3.6 — Closed-Loop Learning SDK.
 * Thin typed read-paths over gv36_* tables and views. No writes from the client.
 */

export type PersonaPerformanceRow = {
  persona_id: string;
  persona_name: string | null;
  impressions: number;
  saves: number;
  clicks: number;
  ctr_pct: number;
  save_rate_pct: number;
  atc: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
  aov_cents: number;
  confidence: number | null;
  evidence_count: number | null;
};

export type CreativePerformanceRow = {
  creative_id: string;
  product_id: string;
  persona_id: string | null;
  emotion_id: string | null;
  style_id: string | null;
  headline: string | null;
  cta: string | null;
  board_id: string | null;
  impressions: number;
  saves: number;
  clicks: number;
  ctr_pct: number;
  perf_score: number;
  purchases: number;
  revenue_cents: number;
  quality_score: number | null;
  ai_confidence: number | null;
  status: "winning" | "growing" | "stable" | "declining" | "needs_refresh" | "retire";
  created_at: string;
};

export type ComboRow = {
  id: string;
  persona_id: string | null;
  emotion_id: string | null;
  hook_id: string | null;
  style_id: string | null;
  board_id: string | null;
  product_id: string | null;
  impressions: number;
  saves: number;
  clicks: number;
  ctr: number;
  purchases: number;
  revenue_cents: number;
  aov_cents: number;
  confidence_wilson: number;
  sample_n: number;
  status: string;
  last_evaluated_at: string;
};

export async function fetchPersonaPerformance(limit = 20): Promise<PersonaPerformanceRow[]> {
  const { data, error } = await supabase
    .from("gv36_persona_performance_v" as never)
    .select("*")
    .order("revenue_cents", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PersonaPerformanceRow[];
}

export async function fetchCreativePerformance(limit = 50): Promise<CreativePerformanceRow[]> {
  const { data, error } = await supabase
    .from("gv36_creative_performance_v" as never)
    .select("*")
    .order("revenue_cents", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CreativePerformanceRow[];
}

export async function fetchTopCombos(limit = 25): Promise<ComboRow[]> {
  const { data, error } = await supabase
    .from("gv36_combo_performance" as never)
    .select("*")
    .order("confidence_wilson", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ComboRow[];
}

export async function fetchClosedLoopSummary(): Promise<{
  attribution_links: number;
  combos_evaluated: number;
  combos_winning: number;
  high_confidence: number;
  first_sale_memories: number;
}> {
  const [{ count: links }, { count: combos }, { count: winning }, { count: high }, { count: mem }] =
    await Promise.all([
      supabase.from("gv36_attribution_links" as never).select("pin_id", { count: "exact", head: true }),
      supabase.from("gv36_combo_performance" as never).select("id", { count: "exact", head: true }),
      supabase.from("gv36_combo_performance" as never).select("id", { count: "exact", head: true }).eq("status", "winning"),
      supabase.from("gv36_combo_performance" as never).select("id", { count: "exact", head: true }).gte("confidence_wilson", 0.9),
      supabase.from("gv36_first_sale_memory" as never).select("id", { count: "exact", head: true }),
    ]);
  return {
    attribution_links: links ?? 0,
    combos_evaluated: combos ?? 0,
    combos_winning: winning ?? 0,
    high_confidence: high ?? 0,
    first_sale_memories: mem ?? 0,
  };
}