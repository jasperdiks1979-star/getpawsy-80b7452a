import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The ONE typed reader for the canonical analytics service. Every dashboard
// (World Map, Clean Analytics, Funnel Health, Sales Commander) MUST read
// through this hook. No dashboard may compute its own visitors / add_to_cart /
// checkout / purchase / revenue numbers.

export type CanonicalStage =
  | "CANONICAL_PAGE_VIEW"
  | "CANONICAL_PRODUCT_VIEW"
  | "CANONICAL_ADD_TO_CART"
  | "CANONICAL_CART"
  | "CANONICAL_CHECKOUT"
  | "CANONICAL_PURCHASE";

export interface CanonicalFunnelResponse {
  ok: boolean;
  window: { hours: number; since: string; until: string };
  filter: { geo: "US" | "all"; clean: boolean; source: string };
  totals: {
    visitors: number;
    sessions: number;
    page_views: number;
    product_views: number;
    add_to_cart: number;
    view_cart: number;
    checkout_started: number;
    purchases: number;
    revenue: number;
    currency: string;
    conversion_rate: number;
    human_visitors?: number;
    raw_sessions_all?: number;
  };
  funnel: Array<{ stage: CanonicalStage; count: number }>;
  countries: Array<{
    country: string;
    visitors: number;
    sessions: number;
    page_views: number;
    add_to_cart: number;
    checkout_started: number;
    purchases: number;
  }>;
  sources: Array<{ source: string; sessions: number }>;
  sample_event: any;
  generated_at: string;
  cached?: boolean;
  error?: string;
}

export interface UseCanonicalFunnelOptions {
  hours?: number;
  geo?: "US" | "all";
  refetchIntervalMs?: number;
  enabled?: boolean;
}

export function useCanonicalFunnel(opts: UseCanonicalFunnelOptions = {}) {
  const hours = opts.hours ?? 24;
  const geo = opts.geo ?? "all";
  return useQuery({
    queryKey: ["canonical-funnel", hours, geo],
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: opts.refetchIntervalMs ?? 60_000,
    queryFn: async (): Promise<CanonicalFunnelResponse> => {
      const { data, error } = await supabase.functions.invoke("analytics-canonical", {
        body: { hours, geo },
      });
      if (error) throw new Error(error.message || "analytics-canonical failed");
      if (!data?.ok) throw new Error(data?.error || "analytics-canonical returned not ok");
      return data as CanonicalFunnelResponse;
    },
  });
}