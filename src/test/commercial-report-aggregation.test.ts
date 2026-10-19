import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateCommercialProducts, aggregateCommercialHeatmap, aggregateOrganicWindow, type CommercialReportEvidence, type CommercialReportEvent } from '@/lib/commercial-report-aggregation';
import type { TruthSession } from '@/hooks/useAnalyticsTruth';
const human = { session_id: 'h', visitor_id: 'v', commercial_eligible_v3_strict: true, first_seen_at: '2026-10-19T01:00:00.000Z', has_product_view: true, has_add_to_cart: true, page_views: 2, utm_source: 'google', utm_medium: 'organic' } as TruthSession;
const event = (id: string, extra: Partial<CommercialReportEvent> = {}): CommercialReportEvent => ({ id, session_id: 'h', occurred_at: '2026-10-19T02:00:00.000Z', canonical_name: 'CANONICAL_ADD_TO_CART', product_id: 'tree', page_path: '/products/tree', order_id: null, ...extra });
const evidence = (events: CommercialReportEvent[]): CommercialReportEvidence => ({ sessions: [human], events, orders: [], since: '2026-10-19T00:00:00.000Z', until: '2026-10-20T00:00:00.000Z' });
describe('commercial report session contract', () => {
  it('two cart taps remain one product cart session; heatmap keeps explicitly separate raw events', () => {
    const e = evidence([event('1'), event('2'), event('2')]);
    expect(aggregateCommercialProducts(e)[0].add_to_carts).toBe(1);
    expect(aggregateCommercialHeatmap(e)[0]).toMatchObject({ event_count: 2, unique_sessions: 1 });
    expect(aggregateOrganicWindow(e).organic.add_to_cart).toBe(1);
  });
  it.each(['stored_is_bot', 'stored_is_internal', 'stored_technical_path', 'crawler_verified'])('%s vetoes stale human in all three readers', flag => {
    const e = { ...evidence([event('1')]), sessions: [{ ...human, [flag]: true }] };
    expect(aggregateCommercialProducts(e)).toEqual([]); expect(aggregateCommercialHeatmap(e)).toEqual([]);
    expect(aggregateOrganicWindow(e).totals_all.sessions).toBe(0);
  });
  it('UNKNOWN silence stays separate and never contributes commercial events', () => {
    const e = { ...evidence([event('1', { session_id: 'silent' })]), sessions: [{ ...human, session_id: 'silent', commercial_eligible_v3_strict: false, has_product_view: false, has_add_to_cart: false }] };
    expect(aggregateCommercialProducts(e)).toEqual([]);
    expect(aggregateOrganicWindow(e).attribution).toMatchObject({ unknown_sessions: 1, excluded_sessions: 0 });
  });
  it('two sessions belonging to one visitor do not masquerade as two people', () => {
    const e = { ...evidence([event('1'), event('2', { session_id: 'h2' })]), sessions: [human, { ...human, session_id: 'h2' }] };
    expect(aggregateOrganicWindow(e).organic).toMatchObject({ sessions: 2, visitors: 1, add_to_cart: 2 });
  });
  it('drops events outside snapshot and technical events', () => {
    expect(aggregateCommercialProducts(evidence([event('old', { occurred_at: '2026-10-18T00:00:00.000Z' }), event('technical', { technical_path: true }), event('future', { occurred_at: '2026-10-20T00:00:00.000Z' })]))).toEqual([]);
  });
  it('unpaid purchase events never become financial revenue', () => {
    expect(aggregateCommercialProducts(evidence([event('purchase', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'expired' })]))[0].revenue_cents).toBe(0);
  });
  it('repeated paid callbacks count the verified order amount once', () => {
    const e = { ...evidence([event('p1', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'paid' }), event('p2', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'paid' })]), orders: [{ order_id: 'paid', total_amount: 162.99, currency: 'USD', items: [{ id: 'tree', price: 162.99, quantity: 1 }] }] };
    expect(aggregateCommercialProducts(e)[0]).toMatchObject({ purchases: 1, revenue_cents: 16299 });
    expect(aggregateOrganicWindow(e).organic.revenue_cents).toBe(16299);
  });
  it('does not multiply an order total across multiple products', () => {
    const e = { ...evidence([event('p1', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'paid' }), event('p2', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'paid', product_id: 'bowl' })]), orders: [{ order_id: 'paid', total_amount: 200, currency: 'USD' }] };
    expect(() => aggregateCommercialProducts(e)).toThrow('allocation unavailable');
  });
  it('uses exact paid item subtotals for multiple products, not the whole order amount', () => {
    const e = { ...evidence([event('p1', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'paid' }), event('p2', { canonical_name: 'CANONICAL_PURCHASE', order_id: 'paid', product_id: 'bowl' })]), orders: [{ order_id: 'paid', total_amount: 190, currency: 'USD', items: JSON.stringify([{ id: 'tree', price: 162.99, quantity: 1 }, { id: 'bowl', price: 16.99, quantity: 1 }]) }] };
    expect(aggregateCommercialProducts(e).map(r => r.revenue_cents)).toEqual([16299, 1699]);
    expect(aggregateOrganicWindow(e).organic.revenue_cents).toBe(19000);
  });
  it('paid source evidence is not attributed as organic', () => {
    const e = { ...evidence([event('1')]), sessions: [{ ...human, utm_medium: 'cpc' }] };
    expect(aggregateOrganicWindow(e)).toMatchObject({ organic: { sessions: 0 }, attribution: { paid: 1 } });
  });
});

const mocks = vi.hoisted(() => ({ truth: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/read-commercial-funnel', () => ({ readCommercialFunnel: mocks.truth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
import { loadCommercialReportEvidence } from '@/lib/read-commercial-reports';
describe('bounded read-only evidence', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('refuses over 500 commercial sessions before event queries', async () => {
    mocks.truth.mockResolvedValue({ sessions: Array.from({ length: 501 }, (_, i) => ({ ...human, session_id: String(i) })), unknownSessions: [], excludedSessions: [] });
    await expect(loadCommercialReportEvidence(720)).rejects.toThrow('session budget'); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects truncated canonical evidence instead of falling back to aggregates', async () => {
    mocks.truth.mockResolvedValue({ sessions: [], load_shedding: { truncated_scans: ['canonical_events'] } });
    await expect(loadCommercialReportEvidence(720)).rejects.toThrow('incomplete'); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('reads only selected sessions within an explicit time window and propagates denied reads', async () => {
    const e = evidence([]);
    mocks.truth.mockResolvedValue({ sessions: [human], unknownSessions: [], excludedSessions: [], window: { since: e.since, until: e.until } });
    const q: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['select', 'in', 'gte', 'lt', 'order']) q[method] = vi.fn(() => q);
    q.range = vi.fn().mockResolvedValue({ data: null, error: new Error('denied') }); mocks.from.mockReturnValue(q);
    await expect(loadCommercialReportEvidence(720)).rejects.toThrow('denied');
    expect(mocks.from).toHaveBeenCalledWith('canonical_events'); expect(q.in).toHaveBeenCalledWith('session_id', ['h']);
    expect(q.gte).toHaveBeenCalledWith('occurred_at', e.since); expect(q.lt).toHaveBeenCalledWith('occurred_at', e.until);
  });
});