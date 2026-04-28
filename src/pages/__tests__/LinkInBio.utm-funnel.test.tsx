/**
 * End-to-end UTM consistency test for the TikTok funnel (/go).
 *
 * Asserts that when a user lands on /go?utm_campaign=hook1&... ALL FOUR
 * funnel events report utm_campaign=hook1 and the outbound /products URL
 * preserves the same UTMs:
 *   1. lp_view              (page entry)
 *   2. lp_cta_impression    (primary CTA visible)
 *   3. lp_cta_click         (CTA wrapper click)
 *   4. tiktok_deep_link_click (anchor click → outbound nav)
 *
 * Regression guard for the URL-UTM-overrides-hardcoded-props fix in
 * TikTokDeepLinkButton.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LinkInBio from '../LinkInBio';

const trackEventSpy = vi.fn();
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEventSpy(...args),
}));

/** Synchronous IntersectionObserver mock so CTA-impression events fire on observe(). */
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

function PdpProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="pdp-pathname">{location.pathname}</span>
      <span data-testid="pdp-search">{location.search}</span>
    </div>
  );
}

const LANDING_URL =
  '/go?utm_source=tiktok&utm_medium=paid&utm_campaign=hook1&utm_content=ad_v3&ad=tt';

function renderFunnel() {
  return render(
    <MemoryRouter initialEntries={[LANDING_URL]}>
      <Routes>
        <Route path="/go" element={<LinkInBio />} />
        <Route path="/products/:slug" element={<PdpProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TikTok funnel /go — UTM consistency end-to-end', () => {
  beforeEach(() => {
    trackEventSpy.mockReset();
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  it('preserves utm_campaign=hook1 across all four funnel events and outbound URL', () => {
    renderFunnel();

    // Find the primary CTA (multiple may exist; first is the above-the-fold one).
    const links = screen.getAllByRole('link', { name: /get yours now/i });
    const link = links[0];

    act(() => {
      fireEvent.click(link);
    });

    // 1. Outbound URL preserves UTMs from the landing page
    expect(screen.getByTestId('pdp-pathname').textContent).toBe(
      '/products/automatic-cat-litter-box-self-cleaning-app-control',
    );
    const search = screen.getByTestId('pdp-search').textContent || '';
    expect(search).toContain('utm_source=tiktok');
    expect(search).toContain('utm_medium=paid');
    expect(search).toContain('utm_campaign=hook1');
    expect(search).toContain('utm_content=ad_v3');
    expect(search).toContain('ad=tt');

    // 2. All four funnel events report utm_campaign=hook1
    const calls = trackEventSpy.mock.calls;
    const byName = (name: string) =>
      calls
        .filter(([n]) => n === name)
        .map(([, p]) => (p || {}) as Record<string, unknown>);

    for (const evt of ['lp_view', 'lp_cta_impression', 'lp_cta_click', 'tiktok_deep_link_click']) {
      const payloads = byName(evt);
      expect(payloads.length, `${evt} should have fired at least once`).toBeGreaterThan(0);
      for (const payload of payloads) {
        expect(payload.utm_campaign, `${evt}.utm_campaign`).toBe('hook1');
        expect(payload.utm_source, `${evt}.utm_source`).toBe('tiktok');
      }
    }

    // tiktok_deep_link_click also propagates utm_content + outbound URL
    const deepLink = byName('tiktok_deep_link_click')[0];
    expect(deepLink.utm_content).toBe('ad_v3');
    expect(deepLink.utm_medium).toBe('paid');
    expect(deepLink.link_url as string).toContain('utm_campaign=hook1');
    expect(deepLink.link_url as string).toContain('utm_content=ad_v3');
  });
});
