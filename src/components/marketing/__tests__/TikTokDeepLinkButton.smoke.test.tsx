/**
 * End-to-end smoke test for the TikTok deep-link button.
 *
 * Verifies the full deep-link contract:
 *   1. The button renders an <a> pointing at /products/{slug} with the exact
 *      UTM + ad params required by useTikTokLanding().
 *   2. Clicking it actually navigates the in-memory router.
 *   3. After navigation, useTikTokLanding() at the destination route returns
 *      isTikTok === true — i.e. the PDP would activate the TikTok variant.
 *   4. Click fires the tiktok_deep_link_click analytics event with the exact
 *      URL the user follows.
 *
 * This is the strongest end-to-end signal we can get without Playwright —
 * it covers the click → route → variant-trigger chain in one render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TikTokDeepLinkButton } from '../TikTokDeepLinkButton';
import { useTikTokLanding } from '@/hooks/useTikTokLanding';

// Capture trackEvent calls without touching gtag.
const trackEventSpy = vi.fn();
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEventSpy(...args),
}));

/** Probe component that exposes the destination route's pathname + search +
 *  the resolved isTikTok flag from useTikTokLanding(). Rendered at the PDP
 *  route so we can assert what a real visitor would see. */
function PdpProbe() {
  const location = useLocation();
  const { isTikTok } = useTikTokLanding();
  return (
    <div>
      <span data-testid="pdp-pathname">{location.pathname}</span>
      <span data-testid="pdp-search">{location.search}</span>
      <span data-testid="pdp-is-tiktok">{isTikTok ? 'yes' : 'no'}</span>
    </div>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <TikTokDeepLinkButton
              label="Shop the Litter Box"
              campaign="tt_smoke_test"
              content="smoke_primary"
            />
          }
        />
        <Route path="/products/:slug" element={<PdpProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TikTokDeepLinkButton — end-to-end smoke', () => {
  beforeEach(() => {
    trackEventSpy.mockReset();
  });

  it('renders an anchor pointing at the litter box PDP with TikTok UTMs', () => {
    renderApp();
    const link = screen.getByRole('link', { name: /shop the litter box/i });
    const href = link.getAttribute('href') || '';

    // Plural /products/{slug} is mandatory per project routing rule.
    expect(href).toMatch(
      /^\/products\/automatic-cat-litter-box-self-cleaning-app-control\?/,
    );

    const url = new URL(href, 'https://example.test');
    expect(url.searchParams.get('utm_source')).toBe('tiktok');
    expect(url.searchParams.get('utm_medium')).toBe('social');
    expect(url.searchParams.get('utm_campaign')).toBe('tt_smoke_test');
    expect(url.searchParams.get('utm_content')).toBe('smoke_primary');
    expect(url.searchParams.get('ad')).toBe('tt');
  });

  it('navigates to the PDP and activates the TikTok variant on click', () => {
    renderApp();
    const link = screen.getByRole('link', { name: /shop the litter box/i });

    act(() => {
      fireEvent.click(link);
    });

    // 1) Routed to the correct PDP slug
    expect(screen.getByTestId('pdp-pathname').textContent).toBe(
      '/products/automatic-cat-litter-box-self-cleaning-app-control',
    );

    // 2) Search string carries every TikTok param
    const search = screen.getByTestId('pdp-search').textContent || '';
    expect(search).toContain('utm_source=tiktok');
    expect(search).toContain('utm_campaign=tt_smoke_test');
    expect(search).toContain('utm_content=smoke_primary');
    expect(search).toContain('ad=tt');

    // 3) useTikTokLanding() at the destination resolves to true → PDP variant fires
    expect(screen.getByTestId('pdp-is-tiktok').textContent).toBe('yes');
  });

  it('fires tiktok_deep_link_click with the exact destination URL on click', () => {
    renderApp();
    const link = screen.getByRole('link', { name: /shop the litter box/i });

    act(() => {
      fireEvent.click(link);
    });

    expect(trackEventSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = trackEventSpy.mock.calls[0];
    expect(eventName).toBe('tiktok_deep_link_click');
    expect(payload).toMatchObject({
      product_slug: 'automatic-cat-litter-box-self-cleaning-app-control',
      utm_source: 'tiktok',
      utm_campaign: 'tt_smoke_test',
      utm_content: 'smoke_primary',
      ad: 'tt',
      placement: 'smoke_primary',
    });
    expect((payload as { link_url: string }).link_url).toMatch(
      /^\/products\/automatic-cat-litter-box-self-cleaning-app-control\?/,
    );
  });
});