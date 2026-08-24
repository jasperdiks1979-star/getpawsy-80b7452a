// useTrafficClassSplit — canonical acquisition split (24h) reader.
//
// TRUTH REPAIR: reads `canonical_acquisition_funnel_24h`, which is built on
// the v2 commercial predicate (`canonical_sessions_commercial_v2`), NOT on the
// legacy `classified_channel → organic` fallback. UNKNOWN / bot / internal /
// technical sessions are excluded from business KPIs and their funnel events
// are not joined at all.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  COMMERCIAL_BUCKETS,
  ORGANIC_BUCKETS,
  type AcquisitionBucket,
} from "@/lib/commercialInclusion";

export type { AcquisitionBucket };

export interface AcquisitionRow {
  acquisition_bucket: AcquisitionBucket;
  commercial_included: boolean;
  sessions: number;
  visitors: number;
  page_views: number;
  product_views: number;
  add_to_cart: number;
  checkout_started: number;
  purchases: number;
  revenue_cents: number;
}

export interface TrafficClassSplit {
  byBucket: Record<AcquisitionBucket, AcquisitionRow | null>;
  organic: AcquisitionRow;   // ORGANIC_SEARCH + PINTEREST_ORGANIC + OTHER_ORGANIC_SOCIAL
  paid: AcquisitionRow;
  direct: AcquisitionRow;
  referral: AcquisitionRow;
  /** Commercial-included total = the ONE denominator for every KPI. */
  commercial: AcquisitionRow;
  /** Excluded (never in KPIs). */
  unknownExcluded: AcquisitionRow;
  internalExcluded: AcquisitionRow;
  botExcluded: AcquisitionRow;
  technicalExcluded: AcquisitionRow;
  rawSessions: number;
}

export const EMPTY_ACQ_ROW = (bucket: AcquisitionBucket, commercial = true): AcquisitionRow => ({
  acquisition_bucket: bucket,
  commercial_included: commercial,
  sessions: 0,
  visitors: 0,
  page_views: 0,
  product_views: 0,
  add_to_cart: 0,
  checkout_started: 0,
  purchases: 0,
  revenue_cents: 0,
});

export function addRows(a: AcquisitionRow, b: AcquisitionRow | null): AcquisitionRow {
  if (!b) return a;
  return {
    acquisition_bucket: a.acquisition_bucket,
    commercial_included: a.commercial_included,
    sessions: a.sessions + b.sessions,
    visitors: a.visitors + b.visitors,
    page_views: a.page_views + b.page_views,
    product_views: a.product_views + b.product_views,
    add_to_cart: a.add_to_cart + b.add_to_cart,
    checkout_started: a.checkout_started + b.checkout_started,
    purchases: a.purchases + b.purchases,
    revenue_cents: a.revenue_cents + b.revenue_cents,
  };
}

const ALL_BUCKETS: AcquisitionBucket[] = [
  "ORGANIC_SEARCH", "PINTEREST_ORGANIC", "OTHER_ORGANIC_SOCIAL",
  "REFERRAL", "DIRECT", "PAID", "UNKNOWN", "INTERNAL", "BOT", "TECHNICAL",
];

/** Pure reducer — exported so regression tests can exercise it without network. */
export function buildSplit(rows: AcquisitionRow[]): TrafficClassSplit {
  const byBucket = {} as Record<AcquisitionBucket, AcquisitionRow | null>;
  for (const b of ALL_BUCKETS) byBucket[b] = null;
  let rawSessions = 0;
  for (const r of rows) {
    if (!r?.acquisition_bucket) continue;
    // Excluded buckets can never carry funnel events — enforce defensively so
    // a stale view definition cannot leak crawler ATC/checkout into the UI.
    const safe: AcquisitionRow = COMMERCIAL_BUCKETS.includes(r.acquisition_bucket) && r.commercial_included
      ? r
      : { ...r, commercial_included: false, page_views: 0, product_views: 0, add_to_cart: 0, checkout_started: 0, purchases: 0, revenue_cents: 0 };
    byBucket[r.acquisition_bucket] = addRows(
      byBucket[r.acquisition_bucket] ?? EMPTY_ACQ_ROW(r.acquisition_bucket, safe.commercial_included),
      safe,
    );
    rawSessions += r.sessions;
  }
  const sum = (buckets: AcquisitionBucket[], label: AcquisitionBucket, commercial: boolean) =>
    buckets.reduce((acc, b) => addRows(acc, byBucket[b]), EMPTY_ACQ_ROW(label, commercial));

  return {
    byBucket,
    organic: sum(ORGANIC_BUCKETS, "ORGANIC_SEARCH", true),
    paid: byBucket.PAID ?? EMPTY_ACQ_ROW("PAID"),
    direct: byBucket.DIRECT ?? EMPTY_ACQ_ROW("DIRECT"),
    referral: byBucket.REFERRAL ?? EMPTY_ACQ_ROW("REFERRAL"),
    commercial: sum(COMMERCIAL_BUCKETS, "ORGANIC_SEARCH", true),
    unknownExcluded: byBucket.UNKNOWN ?? EMPTY_ACQ_ROW("UNKNOWN", false),
    internalExcluded: byBucket.INTERNAL ?? EMPTY_ACQ_ROW("INTERNAL", false),
    botExcluded: byBucket.BOT ?? EMPTY_ACQ_ROW("BOT", false),
    technicalExcluded: byBucket.TECHNICAL ?? EMPTY_ACQ_ROW("TECHNICAL", false),
    rawSessions,
  };
}

export function useTrafficClassSplit(opts?: { enabled?: boolean; refetchIntervalMs?: number }) {
  return useQuery<TrafficClassSplit>({
    queryKey: ["canonical-acquisition-funnel-24h"],
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: opts?.refetchIntervalMs ?? 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canonical_acquisition_funnel_24h" as never)
        .select("*");
      if (error) throw new Error(error.message);
      return buildSplit((data ?? []) as unknown as AcquisitionRow[]);
    },
  });
}

export function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function convRate(row: AcquisitionRow | null): number {
  if (!row || row.sessions === 0) return 0;
  return row.purchases / row.sessions;
}
