import { useQuery } from "@tanstack/react-query";
import { readCommercialReportEvidence } from '@/lib/read-commercial-reports';
import { aggregateOrganicWindow, aggregateCommercialProducts, commercialAcquisition } from '@/lib/commercial-report-aggregation';
import { splitCommercialSessions } from '@/lib/commercial-funnel';

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
    staleTime: 900_000,
    refetchInterval: 900_000,
    queryFn: async () => {
      return readOrganicGrowthIntelligence();
    },
  });
}

/** One bounded 30-day read; all smaller windows are subsets of the same snapshot. */
export async function readOrganicGrowthIntelligence(): Promise<OGIEnvelope> {
  const evidence = await readCommercialReportEvidence(720);
  const window = (hours: number) => {
    const since = new Date(new Date(evidence.until).getTime() - hours * 3600_000).toISOString();
    return aggregateOrganicWindow({ ...evidence, since,
      sessions: evidence.sessions.filter(s => s.first_seen_at >= since),
      events: evidence.events.filter(e => e.occurred_at >= since) });
  };
  const windows = { '24h': window(24), '7d': window(168), '30d': window(720) };
  const organicSessions = splitCommercialSessions(evidence.sessions).commercial.filter(s => commercialAcquisition(s).is_organic);
  const organicIds = new Set(organicSessions.map(s => s.session_id));
  const products = aggregateCommercialProducts({ ...evidence, sessions: organicSessions });
  const top = new Map<string, { product_id: string; organic_sessions: number; organic_product_views: number; organic_purchases: number; organic_revenue_cents: number }>();
  for (const p of products) {
    const row = top.get(p.product_id) ?? { product_id: p.product_id, organic_sessions: 0, organic_product_views: 0, organic_purchases: 0, organic_revenue_cents: 0 };
    row.organic_product_views += p.product_views; row.organic_purchases += p.purchases; row.organic_revenue_cents += p.revenue_cents;
    top.set(p.product_id, row);
  }
  for (const p of top.values()) p.organic_sessions = new Set(evidence.events.filter(e => e.product_id === p.product_id && e.session_id && organicIds.has(e.session_id) && !e.technical_path).map(e => e.session_id)).size;
  return { ok: true, generated_at: evidence.until, windows,
    // No legacy event-derived recommendations or invented attribution confidence.
    deltas: { vs_yesterday: {}, vs_7d_avg: {}, vs_30d_avg: {} },
    leaderboard: { top_products: [...top.values()].sort((a, b) => b.organic_sessions - a.organic_sessions).slice(0, 10), top_pins: [] },
    funnel_24h: [{ traffic_class: 'COMMERCIAL', ...windows['24h'].totals_all }],
    insights: [], recommendations: [],
    adapters: {
      commercial_session_contract: { status: 'verified', note: 'Distinct commercial sessions; UNKNOWN and excluded are separate. Heatmap event_count is diagnostic only.' },
      attribution_confidence: { status: 'unavailable', note: 'No calibrated attribution confidence in the canonical session envelope; 0 means unavailable, not measured confidence.' },
      pin_attribution: { status: 'unavailable', note: 'Verified per-session pin identity unavailable; legacy pin aggregates are not used.' },
      historical_comparison: { status: 'unavailable', note: 'No previous-window evidence loaded; deltas and automated recommendations withheld.' },
    },
    seo_health: { status: 'unavailable', note: 'No indexing/ranking evidence in the commercial session snapshot.' } };
}