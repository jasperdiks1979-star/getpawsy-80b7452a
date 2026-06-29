// Genesis V3.3 — Market Intelligence SDK
// Typed read-paths over the EXISTING Market Intelligence stack.
// Never duplicates Canonical Analytics, Product Intelligence, or Pinterest Growth —
// reads only from real production tables/views.

import { supabase } from "@/integrations/supabase/client";

export interface MiTrend {
  id: string;
  trend_type: string;
  term: string;
  market: string;
  source: string;
  score: number;
  momentum: number;
  season: string | null;
  category: string | null;
  first_seen: string;
  last_seen: string;
}

export interface MiOpportunity {
  id: string;
  type: string;
  title: string;
  evidence: Record<string, unknown>;
  score: number;
  status: string;
  created_at: string;
}

export interface MiSignal {
  id: string;
  trend_id: string | null;
  source: string;
  value: number | null;
  meta: Record<string, unknown> | null;
  captured_at: string;
}

export interface MiCompetitorInsight {
  id: string;
  competitor: string;
  product_handle: string | null;
  title: string | null;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  image_url: string | null;
  insights: Record<string, unknown> | null;
  captured_at: string;
}

export interface MiRecommendation {
  id: string;
  target_type: string;
  target_id: string | null;
  action: string;
  reasoning: string | null;
  confidence: number | null;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface FirstSalePlanRow {
  product_id: string;
  title: string | null;
  handle: string | null;
  price: number | null;
  pi_classification: string | null;
  pin_classification: string | null;
  revenue_cents: number;
  purchases: number;
  add_to_carts: number;
  product_views: number;
  pi_score: number;
  pi_confidence: number;
  pi_pinterest_score: number;
  pi_seo_score: number;
  pin_growth_score: number;
  predicted_opportunity: number;
  pin_confidence: number;
  pin_saturation: number;
  lane_probability: number;
  lane_revenue: number;
  lane_pinterest: number;
  lane_google: number;
  lane_impulse: number;
  lane_urgency: number;
  composite_score: number;
  min_confidence: number;
  expected_revenue_eur: number;
}

export interface AutopilotAction {
  id: string;
  kind: string;
  product_id: string | null;
  priority: string;
  confidence: number | null;
  ai_credit_cost: number | null;
  expected_revenue_eur: number | null;
  expected_roi: number | null;
  status: string;
  invoked_function: string | null;
  created_at: string;
  executed_at: string | null;
  outcome_metrics: Record<string, unknown> | null;
}

const top = <T>(rows: T[] | null) => rows ?? [];

export async function fetchTrends(limit = 50): Promise<MiTrend[]> {
  const { data, error } = await supabase
    .from("mi_trends")
    .select("id,trend_type,term,market,source,score,momentum,season,category,first_seen,last_seen")
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as MiTrend[]);
}

export async function fetchEmergingTrends(limit = 20): Promise<MiTrend[]> {
  const { data, error } = await supabase
    .from("mi_trends")
    .select("id,trend_type,term,market,source,score,momentum,season,category,first_seen,last_seen")
    .order("momentum", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as MiTrend[]);
}

export async function fetchSignals(limit = 100): Promise<MiSignal[]> {
  const { data, error } = await supabase
    .from("mi_trend_signals")
    .select("id,trend_id,source,value,meta,captured_at")
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as MiSignal[]);
}

export async function fetchOpportunities(limit = 50): Promise<MiOpportunity[]> {
  const { data, error } = await supabase
    .from("mi_opportunities")
    .select("id,type,title,evidence,score,status,created_at")
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as MiOpportunity[]);
}

export async function fetchCompetitorInsights(limit = 50): Promise<MiCompetitorInsight[]> {
  const { data, error } = await supabase
    .from("market_competitor_insights")
    .select("id,competitor,product_handle,title,price,rating,review_count,image_url,insights,captured_at")
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as MiCompetitorInsight[]);
}

export async function fetchRecommendations(limit = 50): Promise<MiRecommendation[]> {
  const { data, error } = await supabase
    .from("market_ai_recommendations")
    .select("id,target_type,target_id,action,reasoning,confidence,status,payload,created_at")
    .eq("status", "pending")
    .order("confidence", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as MiRecommendation[]);
}

export async function fetchFirstSalePlan(limit = 25): Promise<FirstSalePlanRow[]> {
  const { data, error } = await supabase
    .from("gv3_mi_first_sale_plan_v" as never)
    .select("*")
    .order("composite_score", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as FirstSalePlanRow[]);
}

export async function fetchRecentAutopilotActions(limit = 20): Promise<AutopilotAction[]> {
  const { data, error } = await supabase
    .from("autopilot_actions")
    .select("id,kind,product_id,priority,confidence,ai_credit_cost,expected_revenue_eur,expected_roi,status,invoked_function,created_at,executed_at,outcome_metrics")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return top(data as unknown as AutopilotAction[]);
}

export async function promoteRecommendationToAutopilot(rec: MiRecommendation): Promise<void> {
  const confidence = rec.confidence ?? 0;
  const priority = confidence >= 0.85 ? "critical" : confidence >= 0.7 ? "high" : "medium";
  const { error } = await supabase.from("autopilot_actions").insert({
    kind: `mi_${rec.action}`,
    product_id: rec.target_type === "product" ? rec.target_id : null,
    priority,
    confidence,
    status: "queued",
    invocation_payload: { source: "market_intelligence", recommendation_id: rec.id, ...(rec.payload ?? {}) },
  });
  if (error) throw error;
  await supabase.from("market_ai_recommendations").update({ status: "queued" }).eq("id", rec.id);
}

export interface MiHealth {
  trends: number;
  signals_24h: number;
  opportunities_open: number;
  competitor_obs: number;
  recommendations_pending: number;
  avg_recommendation_confidence: number | null;
}

export async function fetchMarketHealth(): Promise<MiHealth> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [trends, signals, opps, comp, recs] = await Promise.all([
    supabase.from("mi_trends").select("id", { count: "exact", head: true }),
    supabase.from("mi_trend_signals").select("id", { count: "exact", head: true }).gte("captured_at", since),
    supabase.from("mi_opportunities").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("market_competitor_insights").select("id", { count: "exact", head: true }),
    supabase.from("market_ai_recommendations").select("confidence").eq("status", "pending").limit(500),
  ]);
  const confidences = (recs.data ?? []).map((r: { confidence: number | null }) => r.confidence).filter((x): x is number => typeof x === "number");
  const avg = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
  return {
    trends: trends.count ?? 0,
    signals_24h: signals.count ?? 0,
    opportunities_open: opps.count ?? 0,
    competitor_obs: comp.count ?? 0,
    recommendations_pending: recs.data?.length ?? 0,
    avg_recommendation_confidence: avg,
  };
}