import { describe, it, expect, beforeEach, vi } from 'vitest';

// Captured inserts for assertions
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

// Default: not a bot, high quality. Tests override per-case via vi.mocked.
vi.mock('@/lib/botDetection', () => ({
  getBotClassification: vi.fn(() => ({
    is_bot: false,
    bot_reason: null,
    traffic_quality_score: 90,
  })),
  recordEventTimingSample: vi.fn(),
}));

vi.mock('@/lib/attribution', () => ({
  getFirstTouch: () => null,
  getLastTouch: () => null,
  classifySource: () => ({ source: 'direct', medium: 'none', campaign: null }),
}));

vi.mock('@/lib/geoClassify', () => ({
  ensureGeoClassified: vi.fn(),
  getCachedUsTier: () => 'us',
  getCachedGeoCountry: () => 'US',
}));

vi.mock('@/lib/deviceClassify', () => ({
  getDeviceClassification: vi.fn(() => ({
    device: 'mobile',
    os_family: 'ios',
    browser_family: 'safari',
    in_app_browser: null,
    device_confidence: 95,
  })),
}));

import {
  fireUserAddToCart,
  fireCheckoutClick,
  fireCheckoutError,
} from '@/lib/funnelEvents';
import { getBotClassification } from '@/lib/botDetection';

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  inserts.length = 0;
  sessionStorage.clear();
  vi.mocked(getBotClassification).mockReturnValue({
    is_bot: false,
    bot_reason: null,
    traffic_quality_score: 90,
  } as never);
});

describe('fireUserAddToCart', () => {
  it('fires when product_id is present and classifies as verified_user', async () => {
    fireUserAddToCart({
      product_id: 'prod_1',
      qty: 1,
      price: 29.99,
      source_component: 'pdp_main_cta',
    });
    await flush();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('lp_funnel_events');
    expect(inserts[0].row.event_name).toBe('add_to_cart');
    expect(inserts[0].row.product_id).toBe('prod_1');
    expect(inserts[0].row.classification).toBe('verified_user');
    expect(inserts[0].row.degraded).toBe(false);
    expect(inserts[0].row.qa).toBe(false);
  });

  it('falls back to slug and flags degraded when product_id missing', async () => {
    fireUserAddToCart({
      product_id: '',
      slug: 'cozy-cat-tree',
      qty: 2,
      price: 49,
      source_component: 'pdp_main_cta',
    });
    await flush();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row.degraded).toBe(true);
    expect(inserts[0].row.product_id).toBeNull();
    expect((inserts[0].row.raw_payload as Record<string, unknown>).slug).toBe('cozy-cat-tree');
  });

  it('skips entirely when both product_id and slug are missing', async () => {
    fireUserAddToCart({
      product_id: '',
      qty: 1,
      price: 10,
      source_component: 'pdp_main_cta',
    });
    await flush();
    expect(inserts).toHaveLength(0);
  });

  it('dedupes within 10s window for the same product+session', async () => {
    fireUserAddToCart({
      product_id: 'prod_dedupe',
      qty: 1,
      price: 10,
      source_component: 'pdp_main_cta',
    });
    fireUserAddToCart({
      product_id: 'prod_dedupe',
      qty: 1,
      price: 10,
      source_component: 'pdp_main_cta',
    });
    await flush();
    expect(inserts).toHaveLength(1);
  });

  it('skips when classified as bot', async () => {
    vi.mocked(getBotClassification).mockReturnValue({
      is_bot: true,
      bot_reason: 'ua_match',
      traffic_quality_score: 0,
    } as never);
    fireUserAddToCart({
      product_id: 'prod_bot',
      qty: 1,
      price: 10,
      source_component: 'pdp_main_cta',
    });
    await flush();
    expect(inserts).toHaveLength(0);
  });

  it('QA mode bypasses bot filter and dedupe, tags classification=qa', async () => {
    vi.mocked(getBotClassification).mockReturnValue({
      is_bot: true,
      bot_reason: 'ua_match',
      traffic_quality_score: 0,
    } as never);
    fireUserAddToCart({
      product_id: 'prod_qa',
      qty: 1,
      price: 10,
      source_component: 'qa_admin_sim',
      qa: true,
    });
    fireUserAddToCart({
      product_id: 'prod_qa',
      qty: 1,
      price: 10,
      source_component: 'qa_admin_sim',
      qa: true,
    });
    await flush();
    expect(inserts.length).toBeGreaterThanOrEqual(2);
    expect(inserts[0].row.qa).toBe(true);
    expect(inserts[0].row.classification).toBe('qa');
  });
});

describe('fireCheckout*', () => {
  it('fires checkout_click and writes to checkout_funnel_events', async () => {
    fireCheckoutClick({ source_component: 'cart_proceed_button', value: 49.99 });
    await flush();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('checkout_funnel_events');
    expect(inserts[0].row.step).toBe('checkout_click');
    expect(inserts[0].row.classification).toBe('verified_user');
  });

  it('checkout_error keeps error_reason field intact', async () => {
    fireCheckoutError({
      source_component: 'checkout_page',
      error_reason: 'stripe_session_failed',
    });
    await flush();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row.step).toBe('checkout_error');
    expect(inserts[0].row.error_reason).toBe('stripe_session_failed');
  });

  it('checkout_click dedupes within the 10s window', async () => {
    fireCheckoutClick({ source_component: 'cart_proceed_button' });
    fireCheckoutClick({ source_component: 'cart_proceed_button' });
    await flush();
    expect(inserts).toHaveLength(1);
  });
});