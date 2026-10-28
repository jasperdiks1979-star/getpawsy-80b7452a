import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPartial, foldEvents } from '../../supabase/functions/_shared/canonicalIngest';
import { cciSourceDedupKey } from '../../supabase/functions/_shared/canonicalDedup';

vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'test-project');
vi.mock('@/lib/analytics', () => ({ trackAddToCart: vi.fn(), trackRemoveFromCart: vi.fn(), trackGoogleAdsAddToCart: vi.fn() }));
vi.mock('@/lib/analyticsFunnel', () => ({ recordFunnelStep: vi.fn() }));
vi.mock('@/lib/funnelEvents', () => ({ fireUserAddToCart: vi.fn(), fireUserRemoveFromCart: vi.fn(), fireCartRestored: vi.fn() }));
vi.mock('@/lib/marketingClient', () => ({ fireMarketingAsync: vi.fn() }));
vi.mock('@/hooks/useVisitorTracking', () => ({ trackVisitorEvent: vi.fn() }));
vi.mock('@/lib/pinterestTracker', () => ({ trackPinterestEvent: vi.fn() }));
vi.mock('@/lib/pinterest-conversion-intel', () => ({ enqueueCapiEvent: vi.fn() }));
vi.mock('@/lib/tiktok-pixel', () => ({ ttTrackAddToCart: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(async () => ({ data: [{ variants: [] }], error: null })), from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } }));

import { CartProvider, useCart } from '@/contexts/CartContext';
import { trackCci } from '@/lib/cci';
const beacon = vi.fn(() => true);
class PayloadBlob { _text: string; constructor(parts: string[]) { this._text = parts.join(''); } }
const readBodies = (): Array<Record<string, any>> => beacon.mock.calls.map(call => JSON.parse(((call as unknown[])[1] as PayloadBlob)._text));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); beacon.mockClear();
  window.history.replaceState({}, '', '/products');
  sessionStorage.setItem('utm_source', 'pinterest');
  sessionStorage.setItem('utm_medium', 'social');
  sessionStorage.setItem('utm_campaign', 'oct28');
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
  vi.stubGlobal('Blob', PayloadBlob);
});

describe('October 28 shared add tracking', () => {
  it('quick add, repeat add, cart and checkout retain one session and do not duplicate source rows', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <CartProvider>{children}</CartProvider>;
    const { result, unmount } = renderHook(() => useCart(), { wrapper });
    const item = { id: '11111111-2222-4333-8444-555555555555', name: 'Bed', price: 39, image: '/bed.jpg' };
    act(() => { result.current.addItem(item); result.current.addItem(item); });
    await waitFor(() => expect(readBodies().filter(r => r.event_name === 'add_to_cart_success')).toHaveLength(2));
    expect(result.current.items[0].quantity).toBe(2);
    trackCci('cart_open'); trackCci('checkout_loaded');
    const rows = readBodies();
    expect(rows.map(r => r.event_name)).toEqual(['add_to_cart_success', 'add_to_cart_success', 'cart_open', 'checkout_loaded']);
    expect(new Set(rows.map(r => r.session_id)).size).toBe(1);
    expect(rows[0]).toMatchObject({ product_id: item.id, source: 'pinterest', meta: { quantity: 1, price: 39, utm_first_source: 'pinterest' } });
    const stages = ['CANONICAL_ADD_TO_CART', 'CANONICAL_ADD_TO_CART', 'CANONICAL_CART', 'CANONICAL_CHECKOUT'];
    const canonical = rows.map((r, i) => ({ ...r, source_system: 'cci', source_event_id: String(i), canonical_name: stages[i], occurred_at: '2026-10-28T08:00:00Z', atc_qty: r.meta.quantity }));
    const p = emptyPartial('', '');
    foldEvents(p, [...canonical, ...canonical], () => 'pinterest');
    expect(p.sessions[rows[0].session_id]).toMatchObject({ has_add_to_cart: true, has_view_cart: true, has_checkout: true });
    const keys = canonical.map(r => cciSourceDedupKey({ id: r.source_event_id, session_id: r.session_id, canonical: r.canonical_name as 'CANONICAL_CART', product_id: r.product_id ?? null }));
    expect(new Set(keys).size).toBe(4);
    unmount();
  });
  it('caller metadata preserves persisted content attribution and click identifiers', () => {
    window.history.replaceState({}, '', '/products?utm_content=guide-cat-beds');
    sessionStorage.setItem('gp_epik', 'real-test-click-id');
    trackCci('add_to_cart_success', { product_id: 'p', meta: { quantity: 1 } });
    expect(readBodies()[0].meta).toMatchObject({ quantity: 1, utm_content: 'guide-cat-beds', epik: 'real-test-click-id' });
  });
});