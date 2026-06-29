// Genesis V2.6 — Canonical Analytics SDK
// Single typed read-path for every dashboard. Every metric resolves to a canonical view.
// Never compute funnel/revenue/source metrics in React; call this SDK instead.

import { supabase } from "@/integrations/supabase/client";

export type CanonicalStage =
  | "CANONICAL_PAGE_VIEW"
  | "CANONICAL_PRODUCT_VIEW"
  | "CANONICAL_ADD_TO_CART"
  | "CANONICAL_CART"
  | "CANONICAL_CHECKOUT"
  | "CANONICAL_PURCHASE";

export const CANONICAL_STAGES: CanonicalStage[] = [
  "CANONICAL_PAGE_VIEW",
  "CANONICAL_PRODUCT_VIEW",
  "CANONICAL_ADD_TO_CART",
  "CANONICAL_CART",
  "CANONICAL_CHECKOUT",
  "CANONICAL_PURCHASE",
];

export const CANONICAL_STAGE_LABEL: Record<CanonicalStage, string> = {
  CANONICAL_PAGE_VIEW:    "Page view",
  CANONICAL_PRODUCT_VIEW: "Product view",
  CANONICAL_ADD_TO_CART:  "Add to cart",
  CANONICAL_CART:         "Cart open",
  CANONICAL_CHECKOUT:     "Checkout",
  CANONICAL_PURCHASE:     "Purchase",
};

export interface CanonicalFunnelRow { stage: CanonicalStage; count: number }
export interface CanonicalKpiRow {
  bucket: string;
  sessions: number;
  product_views: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
}
export interface CanonicalRevenueRow {
  order_id: string;
  paid_at: string;
  total_amount: number;
  currency: string | null;
  utm_source: string | null;
  country: string | null;
}
export interface CanonicalSourceRow {
  day: string;
  source: string;
  medium: string;
  sessions: number;
  purchases: number;
}
export interface CanonicalProductRow {
  day: string;
  product_id: string;
  product_views: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
}
export interface CanonicalHeatmapRow {
  day: string;
  page_path: string;
  stage: CanonicalStage;
  event_count: number;
  unique_sessions: number;
}
export interface ConsistencyAlertRow {
  id: string;
  alert_key: string;
  severity: string;
  metric: string;
  expected: number | null;
  actual: number | null;
  diff_pct: number | null;
  is_active: boolean;
  last_detected_at: string;
  resolved_at: string | null;
}

const since = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

/** Returns the full canonical funnel (counts per stage) over the last N hours. */
export async function getCanonicalFunnel(hours = 24 * 30): Promise<CanonicalFunnelRow[]> {
  const { data, error } = await supabase
    .from("canonical_events")
    .select("canonical_name")
    .gte("occurred_at", since(hours));
  if (error) throw error;
  const tally = new Map<CanonicalStage, number>();
  CANONICAL_STAGES.forEach((s) => tally.set(s, 0));
  (data ?? []).forEach((r: any) => {
    const n = r.canonical_name as CanonicalStage;
    if (tally.has(n)) tally.set(n, (tally.get(n) ?? 0) + 1);
  });
  return CANONICAL_STAGES.map((stage) => ({ stage, count: tally.get(stage) ?? 0 }));
}

/** Hourly KPI snapshots for the last N hours. */
export async function getCanonicalKpisHourly(hours = 48): Promise<CanonicalKpiRow[]> {
  const { data, error } = await supabase
    .from("canonical_kpis_hourly" as any)
    .select("*")
    .gte("bucket", since(hours))
    .order("bucket", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown) as CanonicalKpiRow[];
}

/** Verified Stripe-backed paid revenue, last N rows. */
export async function getCanonicalRevenue(limit = 50): Promise<CanonicalRevenueRow[]> {
  const { data, error } = await supabase
    .from("canonical_orders" as any)
    .select("order_id, paid_at, total_amount, currency, utm_source, country")
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown) as CanonicalRevenueRow[];
}

/** Per-source per-day rollup. */
export async function getCanonicalSources(days = 30): Promise<CanonicalSourceRow[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("canonical_sources" as any)
    .select("*")
    .gte("day", from)
    .order("day", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown) as CanonicalSourceRow[];
}

/** Per-product per-day rollup. */
export async function getCanonicalProducts(days = 30): Promise<CanonicalProductRow[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("canonical_products" as any)
    .select("*")
    .gte("day", from)
    .order("revenue_cents", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown) as CanonicalProductRow[];
}

/** Heatmap rollup by page_path × stage. */
export async function getCanonicalHeatmap(days = 7): Promise<CanonicalHeatmapRow[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("canonical_heatmap" as any)
    .select("*")
    .gte("day", from);
  if (error) throw error;
  return ((data ?? []) as unknown) as CanonicalHeatmapRow[];
}

/** Open consistency alerts surfaced by canonical_validate_consistency. */
export async function getConsistencyAlerts(): Promise<ConsistencyAlertRow[]> {
  const { data, error } = await supabase
    .from("canonical_consistency_alerts" as any)
    .select("id, alert_key, severity, metric, expected, actual, diff_pct, is_active, last_detected_at, resolved_at")
    .order("last_detected_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown) as ConsistencyAlertRow[];
}

/** Force an ingest + refresh + validate cycle. Admin-only via DB RPCs. */
export async function runCanonicalRefresh(): Promise<void> {
  await supabase.rpc("canonical_ingest_recent", { hours: 2 });
  await supabase.rpc("canonical_refresh_all");
  await supabase.rpc("canonical_validate_consistency");
}

/** Aggregate KPI snapshot for an executive scorecard. */
export interface CanonicalExecKpis {
  sessions: number;
  product_views: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue_eur: number;
  aov_eur: number;
  cvr_pct: number;
}
export async function getExecutiveKpis(hours = 24 * 30): Promise<CanonicalExecKpis> {
  const rows = await getCanonicalKpisHourly(hours);
  const sum = (k: keyof CanonicalKpiRow) =>
    rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);
  const sessions = sum("sessions");
  const purchases = sum("purchases");
  const revenue_eur = sum("revenue_cents") / 100;
  return {
    sessions,
    product_views: sum("product_views"),
    add_to_carts: sum("add_to_carts"),
    checkouts: sum("checkouts"),
    purchases,
    revenue_eur,
    aov_eur: purchases > 0 ? revenue_eur / purchases : 0,
    cvr_pct: sessions > 0 ? (purchases / sessions) * 100 : 0,
  };
}
