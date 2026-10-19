import { splitCommercialSessions, commercialSessionCounters } from './commercial-funnel';
import { classifySource } from './trafficQualityClassifier';
import type { TruthSession } from '@/hooks/useAnalyticsTruth';
import type { CanonicalProductRow, CanonicalHeatmapRow, CanonicalStage } from './canonicalAnalytics';
import type { OGIWindow } from '@/hooks/useOrganicGrowthIntelligence';

export interface CommercialReportEvent {
  id: string; session_id: string | null; occurred_at: string;
  canonical_name: string; product_id: string | null; page_path: string | null;
  order_id: string | null; technical_path?: boolean;
}
export interface CommercialPaidOrder { order_id: string; total_amount: number; currency: string | null; items?: unknown }
export interface CommercialReportEvidence {
  sessions: TruthSession[]; events: CommercialReportEvent[]; orders: CommercialPaidOrder[];
  since: string; until: string;
}
const stages = new Set(['CANONICAL_PAGE_VIEW', 'CANONICAL_PRODUCT_VIEW', 'CANONICAL_ADD_TO_CART', 'CANONICAL_CART', 'CANONICAL_CHECKOUT', 'CANONICAL_PURCHASE']);
export function reportEvents(e: CommercialReportEvidence) {
  const ids = new Set(splitCommercialSessions(e.sessions).commercial.map(s => s.session_id));
  return [...new Map(e.events.filter(r => r.session_id && ids.has(r.session_id) &&
    !r.technical_path && r.occurred_at >= e.since && r.occurred_at < e.until && stages.has(r.canonical_name))
    .map(r => [r.id, r])).values()];
}
function paidRevenue(e: CommercialReportEvidence, events: CommercialReportEvent[]) {
  const ids = new Set(events.filter(r => r.canonical_name === 'CANONICAL_PURCHASE').map(r => r.order_id));
  const orders = [...new Map(e.orders.filter(o => ids.has(o.order_id)).map(o => [o.order_id, o])).values()];
  if (orders.some(o => o.currency?.toUpperCase() !== 'USD' || !Number.isFinite(Number(o.total_amount)))) {
    throw new Error('Commercial revenue currency/amount evidence unavailable');
  }
  return orders.reduce((n, o) => n + Math.round(Number(o.total_amount) * 100), 0);
}
export function aggregateCommercialProducts(e: CommercialReportEvidence): CanonicalProductRow[] {
  const events = [...new Map(reportEvents(e).filter(r => r.product_id)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .map(r => [JSON.stringify([r.product_id, r.session_id, r.canonical_name]), r])).values()];
  const groups = new Map<string, CommercialReportEvent[]>();
  for (const r of events) {
    const key = JSON.stringify([r.occurred_at.slice(0, 10), r.product_id]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map(rows => {
    const count = (stage: string) => new Set(rows.filter(r => r.canonical_name === stage).map(r => r.session_id)).size;
    // Product revenue is verified item subtotal, not an allocated shipping/tax-inclusive order total.
    const orderIds = new Set(rows.filter(r => r.canonical_name === 'CANONICAL_PURCHASE').map(r => r.order_id));
    let revenue = 0;
    for (const o of e.orders.filter(o => orderIds.has(o.order_id))) {
      let items: unknown = o.items;
      try { if (typeof items === 'string') items = JSON.parse(items); } catch { items = null; }
      if (!Array.isArray(items) || o.currency?.toUpperCase() !== 'USD') throw new Error('Product revenue allocation unavailable: verified order items required');
      const matching = items.filter(item => item && typeof item === 'object' && item.id === rows[0].product_id);
      if (!matching.length) throw new Error('Product revenue allocation unavailable: product not in paid items');
      for (const item of matching) {
        if (typeof item.price !== 'number' || typeof item.quantity !== 'number' || item.price < 0 || !Number.isFinite(item.price) || !Number.isInteger(item.quantity) || item.quantity < 1) {
          throw new Error('Product revenue allocation unavailable: invalid paid item');
        }
        revenue += Math.round(item.price * 100) * item.quantity;
      }
    }
    return { day: rows[0].occurred_at.slice(0, 10), product_id: String(rows[0].product_id),
      product_views: count('CANONICAL_PRODUCT_VIEW'), add_to_carts: count('CANONICAL_ADD_TO_CART'),
      checkouts: count('CANONICAL_CHECKOUT'), purchases: count('CANONICAL_PURCHASE'), revenue_cents: revenue };
  }).sort((a, b) => b.revenue_cents - a.revenue_cents || b.product_views - a.product_views);
}
export function aggregateCommercialHeatmap(e: CommercialReportEvidence): CanonicalHeatmapRow[] {
  const groups = new Map<string, CommercialReportEvent[]>();
  for (const r of reportEvents(e)) {
    const key = JSON.stringify([r.occurred_at.slice(0, 10), r.page_path || '(unknown)', r.canonical_name]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map(rows => ({ day: rows[0].occurred_at.slice(0, 10),
    page_path: rows[0].page_path || '(unknown)', stage: rows[0].canonical_name as CanonicalStage,
    event_count: rows.length, unique_sessions: new Set(rows.map(r => r.session_id)).size }));
}
export function commercialAcquisition(s: TruthSession) {
  const source = classifySource(s).source_class;
  return { platform: source.toLowerCase(), is_paid: ['OTHER_PAID', 'PINTEREST_PAID'].includes(source),
    is_organic: ['GOOGLE_ORGANIC', 'OTHER_SEARCH', 'PINTEREST_ORGANIC'].includes(source) };
}
export function aggregateOrganicWindow(e: CommercialReportEvidence): OGIWindow {
  const split = splitCommercialSessions(e.sessions);
  const events = reportEvents(e);
  const summarize = (sessions: TruthSession[]) => {
    const ids = new Set(sessions.map(s => s.session_id));
    const t = commercialSessionCounters(sessions);
    return { sessions: t.sessions, visitors: t.visitors, page_views: t.page_views,
      product_views: t.product_views, add_to_cart: t.add_to_cart, checkout_started: t.checkout_started,
      purchases: t.purchases, revenue_cents: paidRevenue(e, events.filter(r => r.session_id && ids.has(r.session_id))),
      conversion_rate: t.sessions ? t.purchases / t.sessions : 0, avg_attribution_confidence: 0 };
  };
  const channels = new Map<string, TruthSession[]>();
  for (const s of split.commercial) {
    const key = commercialAcquisition(s).platform;
    channels.set(key, [...(channels.get(key) ?? []), s]);
  }
  const organic = split.commercial.filter(s => commercialAcquisition(s).is_organic);
  const landing = new Map<string, TruthSession[]>();
  for (const s of organic) {
    let path = s.landing_page || s.page_path || '(unknown)';
    try { path = new URL(path, 'https://getpawsy.pet').pathname; } catch { path = '(unknown)'; }
    landing.set(path, [...(landing.get(path) ?? []), s]);
  }
  return { totals_all: summarize(split.commercial), organic: summarize(organic),
    attribution: { organic: organic.length, paid: split.commercial.filter(s => commercialAcquisition(s).is_paid).length,
      insufficient_data: split.commercial.filter(s => !commercialAcquisition(s).is_paid && !commercialAcquisition(s).is_organic).length,
      unknown_sessions: split.unknown.length, excluded_sessions: split.excluded.length },
    channels: [...channels.values()].map(s => ({ ...commercialAcquisition(s[0]), ...summarize(s),
      attribution_confidence_sum: 0, attribution_confidence_n: 0 })),
    top_landing_pages: [...landing.entries()].map(([path, s]) => ({ path, ...summarize(s) }))
      .sort((a, b) => b.sessions - a.sessions).slice(0, 15) };
}