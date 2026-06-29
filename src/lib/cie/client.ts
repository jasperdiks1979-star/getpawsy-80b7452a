import { supabase } from "@/integrations/supabase/client";

export type CieAction = "cycle" | "funnel" | "revenue" | "confidence";

export async function runCie(action: CieAction = "cycle", payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("cie-orchestrator", {
    body: { action, ...payload },
  });
  if (error) throw error;
  return data;
}

export async function fetchHealthSnapshots(limit = 24) {
  const { data, error } = await supabase
    .from("cie_health_snapshots")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchConfidence() {
  const { data, error } = await supabase
    .from("cie_confidence_scores")
    .select("*")
    .order("metric");
  if (error) throw error;
  return data ?? [];
}

export async function fetchFunnelSnapshots(limit = 24) {
  const { data, error } = await supabase
    .from("cie_funnel_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchIncidents(limit = 50) {
  const { data, error } = await supabase
    .from("cie_incidents")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchRevenueTruth(limit = 24) {
  const { data, error } = await supabase
    .from("cie_revenue_truth")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAttributionIncidents(limit = 50) {
  const { data, error } = await supabase
    .from("cie_attribution_incidents")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function fetchSyntheticRuns(limit = 20) {
  const { data, error } = await supabase
    .from("cie_synthetic_runs")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function syncGa4(days = 1) {
  const { data, error } = await supabase.functions.invoke("cie-ga4-adapter", {
    body: { days },
  });
  if (error) throw error;
  return data;
}

export async function syncPinterest(days = 1) {
  const { data, error } = await supabase.functions.invoke("cie-pinterest-adapter", {
    body: { days },
  });
  if (error) throw error;
  return data;
}

export async function syncTikTok(days = 1) {
  const { data, error } = await supabase.functions.invoke("cie-tiktok-adapter", {
    body: { days },
  });
  if (error) throw error;
  return data;
}

export async function syncMeta(days = 1) {
  const { data, error } = await supabase.functions.invoke("cie-meta-adapter", {
    body: { days },
  });
  if (error) throw error;
  return data;
}

export async function runAutoRepair(opts: { hours?: number; dry_run?: boolean } = {}) {
  const { data, error } = await supabase.functions.invoke("cie-auto-repair", { body: opts });
  if (error) throw error;
  return data;
}

export async function fetchAutoRepairs(limit = 25) {
  const { data, error } = await supabase
    .from("cie_auto_repairs")
    .select("*")
    .order("applied_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function runSyntheticNightly() {
  const { data, error } = await supabase.functions.invoke("cie-synthetic-nightly", { body: {} });
  if (error) throw error;
  return data;
}

export async function fetchMetricMismatches() {
  const { data, error } = await supabase
    .from("cie_metric_mismatches")
    .select("*")
    .order("metric");
  if (error) throw error;
  return data ?? [];
}