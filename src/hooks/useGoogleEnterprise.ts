import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GEIPEnvelope {
  ok: boolean;
  generated_at: string;
  gateway: Record<string, { ok: boolean; blocker?: string }>;
  readiness: {
    gsc_days: number; gsc_target: number;
    ga4_days: number; ga4_target: number;
    url_inspections: number; url_inspections_target: number;
    pagespeed_runs: number; pagespeed_runs_target: number;
    organic_growth_ready: boolean; copilot_ready: boolean;
  } | null;
  connections: Array<{ surface: string; status: string; blocker?: string; last_ok_at?: string; last_check_at?: string }>;
  sync_runs: Array<{ source: string; started_at: string; finished_at?: string; status: string; blocker?: string; rows_ingested?: number; error?: string }>;
  health: {
    latest: any | null;
    series: Array<{ captured_at: string; overall: number }>;
  };
  alerts: Array<{ id: string; source: string; severity: string; code: string; title: string; detail?: string; created_at: string }>;
  gsc: {
    totals: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
    top_queries: Array<{ dimension_value: string; clicks: number; impressions: number; ctr: number; position: number }>;
    top_pages: Array<{ dimension_value: string; clicks: number; impressions: number; ctr: number; position: number }>;
    coverage: any[];
  };
  ga4: { by_channel: Record<string, { sessions: number; purchases: number; revenue_cents: number }>; rows: number };
  indexation: { url_inspection: Array<{ url: string; verdict?: string; coverage_state?: string; indexing_state?: string; inspected_at: string }> };
  merchant: { aggregate: { total: number; approved: number; disapproved: number; pending: number }; issues: any[] };
  pagespeed: Array<{ url: string; strategy: string; performance?: number; lcp_ms?: number; cls?: number; inp_ms?: number; captured_at: string }>;
  technical_seo: any[];
  ai_search: any[];
  opportunities: Array<{ id: string; kind: string; target_url?: string; expected_traffic_lift?: number; expected_revenue_cents?: number; confidence: number; evidence?: any }>;
}

export function useGoogleEnterprise() {
  return useQuery<GEIPEnvelope>({
    queryKey: ["geip-envelope"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("geip-envelope", { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error("geip-envelope not ok");
      return data as GEIPEnvelope;
    },
  });
}

export async function runGeipSync(source: string) {
  const fn = `geip-sync-${source}`;
  const { data, error } = await supabase.functions.invoke(fn, { body: {} });
  if (error) throw error;
  return data;
}

export async function askGeipCopilot(question: string) {
  const { data, error } = await supabase.functions.invoke("geip-copilot", { body: { question } });
  if (error) throw error;
  return data;
}

export async function runGeipHealthScore() {
  const { data, error } = await supabase.functions.invoke("geip-health-score", { body: {} });
  if (error) throw error;
  return data;
}

export async function runGeipAlerts() {
  const { data, error } = await supabase.functions.invoke("geip-alerts", { body: {} });
  if (error) throw error;
  return data;
}

export async function runGeipOrganicGrowth() {
  const { data, error } = await supabase.functions.invoke("geip-organic-growth", { body: {} });
  if (error) throw error;
  return data;
}