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
export interface CanonicalSessionRow {
  session_id: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  device: string | null;
  reached_page_view: boolean;
  reached_product_view: boolean;
  reached_add_to_cart: boolean;
  reached_cart: boolean;
  reached_checkout: boolean;
  reached_purchase: boolean;
  order_id: string | null;
  stripe_session_id: string | null;
}
export interface CanonicalOrderRow {
  order_id: string;
  stripe_session_id: string | null;
  ga_client_id: string | null;
  total_amount: number;
  currency: string | null;
  status: string | null;
  paid_at: string;
  session_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  device: string | null;
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

/** Canonical classification — matches FunnelDashboard / TrafficPerformance buckets. */
export type CanonicalSource =
  | 'tiktok' | 'pinterest' | 'google' | 'meta' | 'email'
  | 'direct' | 'referral' | 'other';

export function classifyCanonicalSource(s: string | null | undefined): CanonicalSource {
  if (!s) return 'direct';
  const v = s.toLowerCase();
  if (v.includes('tiktok')) return 'tiktok';
  if (v.includes('pinterest')) return 'pinterest';
  if (v.includes('google')) return 'google';
  if (v.includes('facebook') || v.includes('meta') || v.includes('instagram')) return 'meta';
  if (v.includes('email') || v.includes('newsletter') || v.includes('klaviyo')) return 'email';
  if (v === 'direct') return 'direct';
  if (v === 'referral') return 'referral';
  return 'other';
}

export interface CanonicalSessionFilters {
  hours?: number;
  source?: CanonicalSource | 'all';
  device?: 'all' | 'mobile' | 'desktop' | 'tablet' | 'unknown';
  country?: string | null;
  usOnly?: boolean;
}

/**
 * Read raw session-level rows from `canonical_funnel`.
 * Excludes test/internal sessions implicitly (canonical layer never ingests qa=true rows).
 */
export async function getCanonicalFunnelSessions(opts: CanonicalSessionFilters = {}): Promise<CanonicalSessionRow[]> {
  const hours = opts.hours ?? 24 * 30;
  let q = supabase
    .from('canonical_funnel' as any)
    .select('*')
    .gte('last_seen_at', since(hours))
    .limit(50000);
  if (opts.usOnly) q = q.eq('country', 'US');
  if (opts.country) q = q.eq('country', opts.country);
  const { data, error } = await q;
  if (error) throw error;
  let rows = ((data ?? []) as unknown) as CanonicalSessionRow[];
  if (opts.source && opts.source !== 'all') {
    rows = rows.filter((r) => classifyCanonicalSource(r.utm_source) === opts.source);
  }
  if (opts.device && opts.device !== 'all') {
    rows = rows.filter((r) => (r.device ?? 'unknown') === opts.device);
  }
  return rows;
}

/** Read canonical_orders within a time window, optionally filtered by classified source. */
export async function getCanonicalOrders(opts: { hours?: number; source?: CanonicalSource | 'all'; usOnly?: boolean } = {}): Promise<CanonicalOrderRow[]> {
  const hours = opts.hours ?? 24 * 30;
  let q = supabase
    .from('canonical_orders' as any)
    .select('*')
    .gte('paid_at', since(hours))
    .order('paid_at', { ascending: false })
    .limit(10000);
  if (opts.usOnly) q = q.eq('country', 'US');
  const { data, error } = await q;
  if (error) throw error;
  let rows = ((data ?? []) as unknown) as CanonicalOrderRow[];
  if (opts.source && opts.source !== 'all') {
    rows = rows.filter((r) => classifyCanonicalSource(r.utm_source) === opts.source);
  }
  return rows;
}

/** Canonical event counts grouped by canonical_name for a window (uses canonical_events directly). */
export async function getCanonicalEventCounts(hours = 24): Promise<Record<CanonicalStage, number>> {
  const out: Record<CanonicalStage, number> = {
    CANONICAL_PAGE_VIEW: 0, CANONICAL_PRODUCT_VIEW: 0, CANONICAL_ADD_TO_CART: 0,
    CANONICAL_CART: 0, CANONICAL_CHECKOUT: 0, CANONICAL_PURCHASE: 0,
  };
  const { data, error } = await supabase
    .from('canonical_events')
    .select('canonical_name')
    .gte('occurred_at', since(hours))
    .limit(100000);
  if (error) throw error;
  for (const r of (data ?? []) as { canonical_name: CanonicalStage }[]) {
    if (r.canonical_name in out) out[r.canonical_name as CanonicalStage]++;
  }
  return out;
}

/**
 * Aggregate session-level rows into a funnel summary.
 * Counts are based on canonical session `reached_*` flags — identical to canonical_funnel definitions.
 */
export function summarizeCanonicalSessions(sessions: CanonicalSessionRow[]) {
  let pv = 0, prod = 0, atc = 0, cart = 0, ck = 0, pur = 0;
  for (const s of sessions) {
    if (s.reached_page_view) pv++;
    if (s.reached_product_view) prod++;
    if (s.reached_add_to_cart) atc++;
    if (s.reached_cart) cart++;
    if (s.reached_checkout) ck++;
    if (s.reached_purchase) pur++;
  }
  return { sessions: sessions.length, page_views: pv, product_views: prod, add_to_carts: atc, carts: cart, checkouts: ck, purchases: pur };
}

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
