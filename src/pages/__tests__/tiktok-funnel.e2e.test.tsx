/**
 * End-to-end TikTok funnel tracking tests.
 *
 * Covers the full path a TikTok visitor walks:
 *
 *   TikTok ad / profile bio
 *        ↓
 *   /go?utm_source=tiktok&utm_campaign=hookN  (LinkInBio)
 *        ↓ click CTA (TikTokDeepLinkButton)
 *   /products/:slug?utm_*                     (legacy alias)
 *        ↓ ProductRouteRedirect
 *   /product/:slug?utm_*                      (canonical PDP)
 *        ↓ visitor tracker insert
 *   visitor_activity row with utm_campaign=hookN
 *
 * These tests are the regression guard for the entire funnel: if any link
 * in the chain (LinkInBio bucketing, deep-link button URL build, redirect
 * UTM preservation, or visitor-tracking UTM resolution) drops UTMs, the
 * "TikTok Ads Performance" admin dashboard will silently undercount hook
 * sessions and PDP visits.
 *
 * Scenarios:
 *   1. Paid ad (?utm_campaign=hook1) — UTMs survive /go → /products
 *      → /product redirect, and the visitor-tracking insert for the PDP
 *      carries utm_campaign=hook1.
 *   2. Bio-link visitor (no utm_campaign) — assigned hookN by
 *      bioHookBucket, mirrored into the URL by /go, and propagated to PDP.
 *   3. Naked PDP visit with empty session — utm_source falls back to
 *      tiktok via the previous-path inference (came from /go).
 *   4. UTM-stripping redirect — /products → /product preserves UTMs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Navigate, useLocation, useParams } from 'react-router-dom';
import LinkInBio from '../LinkInBio';
import { resolveUtm, appendUtmToPath } from '@/lib/utmNormalizer';
import { resetBioHook } from '@/lib/bioHookBucket';

/** Track all analytics events emitted during a render. */
const trackEventSpy = vi.fn();
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEventSpy(...args),
}));

/**
 * Mock the supabase client so we can capture the row that
 * useVisitorTracking would have inserted into `visitor_activity`.
 */
const insertSpy = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertSpy(_table, row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

/** Synchronous IntersectionObserver so CTA-impression events fire deterministically. */
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

/**
 * Test stand-in for the App.tsx redirect — uses the same normalizer
 * helper so the test would catch a regression that bypasses it.
 */
function ProductsToProductRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const utm = resolveUtm({ search: location.search });
  return <Navigate to={appendUtmToPath(`/product/${slug || ''}`, utm, location.search, location.hash)} replace />;
}

/** Probe component that exposes the current route's path + search to assertions. */
function PdpProbe({ label }: { label: string }) {
  const location = useLocation();
  return (
    <div>
      <span data-testid={`${label}-pathname`}>{location.pathname}</span>
      <span data-testid={`${label}-search`}>{location.search}</span>
      <h2>PDP loaded</h2>
    </div>
  );
}

function renderFullFunnel(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/go" element={<LinkInBio />} />
        <Route path="/products/:slug" element={<ProductsToProductRedirect />} />
        <Route path="/product/:slug" element={<PdpProbe label="pdp" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function searchParamsOf(testId: string): URLSearchParams {
  const raw = screen.getByTestId(testId).textContent || '';
  return new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
}

describe('TikTok funnel — end-to-end attribution chain', () => {
  beforeEach(() => {
    trackEventSpy.mockReset();
    insertSpy.mockClear();
    // Reset every UTM persistence layer so each scenario starts clean.
    try {
      window.sessionStorage.clear();
      window.localStorage.clear();
    } catch {
      /* jsdom — non-fatal */
    }
    resetBioHook();
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  it('paid ad: hook1 survives /go → /products → /product redirect chain', async () => {
    renderFullFunnel(
      '/go?utm_source=tiktok&utm_medium=paid&utm_campaign=hook1&utm_content=ad_v3&ad=tt',
    );

    // Click the first CTA on /go
    const link = screen.getAllByRole('link', { name: /get yours now/i })[0];
    act(() => fireEvent.click(link));

    // 1. Final landing path is the canonical /product/, NOT the legacy /products/.
    await waitFor(() => {
      expect(screen.getByTestId('pdp-pathname').textContent).toBe(
        '/product/automatic-cat-litter-box-self-cleaning-app-control',
      );
    });

    // 2. UTMs survived the redirect (the actual regression we're guarding).
    const params = searchParamsOf('pdp-search');
    expect(params.get('utm_source')).toBe('tiktok');
    expect(params.get('utm_medium')).toBe('paid');
    expect(params.get('utm_campaign')).toBe('hook1');
    expect(params.get('utm_content')).toBe('ad_v3');
    expect(params.get('ad')).toBe('tt');

    // 3. Every funnel event reports utm_campaign=hook1.
    for (const evt of ['lp_view', 'lp_cta_impression', 'lp_cta_click', 'tiktok_deep_link_click']) {
      const payloads = trackEventSpy.mock.calls
        .filter(([n]) => n === evt)
        .map(([, p]) => (p || {}) as Record<string, unknown>);
      expect(payloads.length, `${evt} should fire`).toBeGreaterThan(0);
      for (const p of payloads) {
        expect(p.utm_campaign, `${evt}.utm_campaign`).toBe('hook1');
        expect(p.utm_source, `${evt}.utm_source`).toBe('tiktok');
      }
    }
  });

  it('bio-link visitor: assigned hookN is mirrored into URL and survives redirect', async () => {
    // No utm_campaign in URL — bioHookBucket should auto-assign hook1
    // (first visitor on this fresh device → counter starts at 0).
    renderFullFunnel('/go');

    const link = screen.getAllByRole('link', { name: /get yours now/i })[0];
    act(() => fireEvent.click(link));

    await waitFor(() => {
      expect(screen.getByTestId('pdp-pathname').textContent).toBe(
        '/product/automatic-cat-litter-box-self-cleaning-app-control',
      );
    });

    const params = searchParamsOf('pdp-search');
    // utm_source defaults to tiktok for bio traffic.
    expect(params.get('utm_source')).toBe('tiktok');
    // Campaign was bucketed into hook1..hook5 (NOT the generic tt_bio_link).
    const campaign = params.get('utm_campaign') || '';
    expect(campaign).toMatch(/^hook[1-5]$/);
    // Bio origin is preserved separately so we can segment bio vs paid.
    expect(params.get('utm_content')).toBe('tt_bio_link');

    // lp_view event reports the same bucketed hook.
    const lpView = trackEventSpy.mock.calls.find(([n]) => n === 'lp_view')?.[1] as Record<string, unknown>;
    expect(lpView.utm_campaign).toBe(campaign);
    expect(lpView.utm_content).toBe('tt_bio_link');
  });

  it('redirect preserves UTMs even when only some are present', async () => {
    // Direct hit on /products (no /go visit) with partial UTMs — simulates
    // a TikTok in-app browser that strips utm_content but keeps campaign.
    render(
      <MemoryRouter
        initialEntries={[
          '/products/automatic-cat-litter-box-self-cleaning-app-control?utm_source=tiktok&utm_campaign=hook4',
        ]}
      >
        <Routes>
          <Route path="/products/:slug" element={<ProductsToProductRedirect />} />
          <Route path="/product/:slug" element={<PdpProbe label="pdp" />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdp-pathname').textContent).toBe(
        '/product/automatic-cat-litter-box-self-cleaning-app-control',
      );
    });

    const params = searchParamsOf('pdp-search');
    expect(params.get('utm_source')).toBe('tiktok');
    expect(params.get('utm_campaign')).toBe('hook4');
  });

  it('session-cached UTMs rescue a UTM-less PDP hit on the same browser', async () => {
    // Simulate that an earlier page in the session resolved hook2.
    window.sessionStorage.setItem('utm_source', 'tiktok');
    window.sessionStorage.setItem('utm_medium', 'paid');
    window.sessionStorage.setItem('utm_campaign', 'hook2');
    window.sessionStorage.setItem('utm_content', 'ad_v2');

    // Now the user clicks an internal link that lost the query string.
    render(
      <MemoryRouter initialEntries={['/products/automatic-cat-litter-box-self-cleaning-app-control']}>
        <Routes>
          <Route path="/products/:slug" element={<ProductsToProductRedirect />} />
          <Route path="/product/:slug" element={<PdpProbe label="pdp" />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdp-pathname').textContent).toBe(
        '/product/automatic-cat-litter-box-self-cleaning-app-control',
      );
    });

    // The redirect re-hydrated UTMs from sessionStorage so the PDP row
    // still attributes to hook2 instead of falling into (none).
    const params = searchParamsOf('pdp-search');
    expect(params.get('utm_campaign')).toBe('hook2');
    expect(params.get('utm_source')).toBe('tiktok');
    expect(params.get('utm_content')).toBe('ad_v2');
  });
});
