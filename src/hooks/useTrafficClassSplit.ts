// useTrafficClassSplit — canonical Organic/Paid/Total split (24h) reader.
//
// Reads the `canonical_traffic_class_funnel_24h` view created by the traffic
// classification migration. Every dashboard tile that shows Organic vs Paid
// vs Total MUST consume this hook — never re-aggregate from raw events.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TrafficClass = "organic" | "paid" | "internal" | "bot" | "unknown";

export interface TrafficClassRow {
  traffic_class: TrafficClass;
  sessions: number;
  visitors: number;
  page_views: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  revenue_cents: number;
  avg_attribution_confidence: number | null;
}

export interface TrafficClassSplit {
  byClass: Record<TrafficClass, TrafficClassRow | null>;
  organic: TrafficClassRow | null;
  paid: TrafficClassRow | null;
  internal: TrafficClassRow | null;
  bot: TrafficClassRow | null;
  unknown: TrafficClassRow | null;
  totalReal: TrafficClassRow; // organic + paid (business KPI baseline)
  totalAll: TrafficClassRow;  // every class summed
}

const EMPTY_ROW = (cls: TrafficClass): TrafficClassRow => ({
  traffic_class: cls,
  sessions: 0,
  visitors: 0,
  page_views: 0,
  product_views: 0,
  add_to_cart: 0,
  checkout_started: 0,
  purchases: 0,
  revenue_cents: 0,
  avg_attribution_confidence: null,
});

function addRows(a: TrafficClassRow, b: TrafficClassRow | null): TrafficClassRow {
  if (!b) return a;
  return {
    traffic_class: a.traffic_class,
    sessions: a.sessions + b.sessions,
    visitors: a.visitors + b.visitors,
    page_views: a.page_views + b.page_views,
    product_views: a.product_views + b.product_views,
    add_to_cart: a.add_to_cart + b.add_to_cart,
    checkout_started: a.checkout_started + b.checkout_started,
    purchases: a.purchases + b.purchases,
    revenue_cents: a.revenue_cents + b.revenue_cents,
    avg_attribution_confidence: null,
  };
}

export function useTrafficClassSplit(opts?: { enabled?: boolean; refetchIntervalMs?: number }) {
  return useQuery<TrafficClassSplit>({
    queryKey: ["traffic-class-split-24h"],
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: opts?.refetchIntervalMs ?? 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canonical_traffic_class_funnel_24h" as never)
        .select("*");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as TrafficClassRow[];
      const byClass: Record<TrafficClass, TrafficClassRow | null> = {
        organic: null, paid: null, internal: null, bot: null, unknown: null,
      };
      for (const r of rows) {
        if (r?.traffic_class && byClass[r.traffic_class] === null) {
          byClass[r.traffic_class] = r;
        }
      }
      const totalReal = addRows(addRows(EMPTY_ROW("organic"), byClass.organic), byClass.paid);
      const totalAll = (["organic","paid","internal","bot","unknown"] as TrafficClass[])
        .reduce((acc, c) => addRows(acc, byClass[c]), EMPTY_ROW("organic"));
      return {
        byClass,
        organic: byClass.organic,
        paid: byClass.paid,
        internal: byClass.internal,
        bot: byClass.bot,
        unknown: byClass.unknown,
        totalReal,
        totalAll,
      };
    },
  });
}

export function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function convRate(row: TrafficClassRow | null): number {
  if (!row || row.sessions === 0) return 0;
  return row.purchases / row.sessions;
}