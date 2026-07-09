import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OGIChannel {
  platform: string;
  is_organic: boolean;
  is_paid: boolean;
  sessions: number;
  visitors: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  revenue_cents: number;
  attribution_confidence_sum: number;
  attribution_confidence_n: number;
}

export interface OGIOrganicTotals {
  sessions: number;
  visitors: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  revenue_cents: number;
  conversion_rate: number;
  avg_attribution_confidence: number;
}

export interface OGIWindow {
  totals_all: OGIOrganicTotals & { page_views: number };
  organic: OGIOrganicTotals;
  attribution: Record<string, number>;
  channels: OGIChannel[];
  top_landing_pages?: Array<{
    path: string; sessions: number; product_views: number;
    add_to_cart: number; purchases: number; revenue_cents: number;
    conversion_rate: number;
  }>;
}

export interface OGIEnvelope {
  ok: boolean;
  generated_at: string;
  windows: { "24h": OGIWindow; "7d": OGIWindow; "30d": OGIWindow };
  deltas: {
    vs_yesterday: Record<string, number | null>;
    vs_7d_avg: Record<string, number | null>;
    vs_30d_avg: Record<string, number | null>;
  };
  leaderboard: { top_products: any[]; top_pins: any[] };
  funnel_24h: Array<{
    traffic_class: string; sessions: number; visitors: number;
    page_views: number; product_views: number; add_to_cart: number;
    checkout_started: number; purchases: number; revenue_cents: number;
    avg_attribution_confidence: number;
  }>;
  insights: Array<{ text: string; evidence: string; confidence: number; sample_size: number }>;
  recommendations: Array<{ text: string; evidence_source: string; confidence: number; sample_size: number; freshness: string }>;
  adapters: Record<string, { status: string; note?: string }>;
  seo_health: { status: string; note?: string };
  error?: string;
}

export function useOrganicGrowthIntelligence() {
  return useQuery<OGIEnvelope>({
    queryKey: ["organic-growth-intelligence"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("organic-growth-intelligence", { body: {} });
      if (error) throw new Error(error.message || "organic-growth-intelligence failed");
      if (!data?.ok) throw new Error(data?.error || "not ok");
      return data as OGIEnvelope;
    },
  });
}