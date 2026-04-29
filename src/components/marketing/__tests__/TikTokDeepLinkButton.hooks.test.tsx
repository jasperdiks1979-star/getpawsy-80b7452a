/**
 * Hook-attribution test for TikTokDeepLinkButton.
 *
 * The TikTok ads campaign uses 5 hook URLs:
 *   /go?utm_source=tiktok&utm_medium=paid&utm_campaign=hook{N}&utm_content=video_{N}&ad=tt
 *
 * This test guarantees that when a visitor arrives via one of those URLs,
 * the deep-link CTA on the landing page propagates the EXACT utm_campaign
 * (hook1..hook5) into both the destination URL and the
 * `tiktok_deep_link_click` analytics payload — overriding the hardcoded
 * fallback `campaign` prop. If this regresses, the admin "TikTok Ads
 * Performance" dashboard would silently roll all hooks into one bucket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TikTokDeepLinkButton } from '../TikTokDeepLinkButton';

const trackEventSpy = vi.fn();
vi.mock('@/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEventSpy(...args),
}));

function renderAt(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route
          path="/go"
          element={
            <TikTokDeepLinkButton
              label="Get Yours Today"
              campaign="tt_litterbox_FALLBACK"
              content="lp_primary_FALLBACK"
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TikTokDeepLinkButton — hook attribution (hook1..hook5)', () => {
  beforeEach(() => {
    trackEventSpy.mockReset();
    // Reset session-cached UTMs — the central utmNormalizer reads
    // sessionStorage as a higher priority than the fallback `campaign`
    // prop, so leaked state from earlier tests would mask the organic
    // fallback path.
    try {
      window.sessionStorage.clear();
    } catch {
      /* jsdom — non-fatal */
    }
  });

  for (const n of [1, 2, 3, 4, 5]) {
    const hook = `hook${n}`;
    const video = `video_${n}`;
    const landing = `/go?utm_source=tiktok&utm_medium=paid&utm_campaign=${hook}&utm_content=${video}&ad=tt`;

    it(`carries utm_campaign=${hook} from URL into href + analytics`, () => {
      renderAt(landing);
      const link = screen.getByRole('link', { name: /get yours today/i });
      const href = link.getAttribute('href') || '';

      // 1) URL contains the real ad-level utm_campaign, NOT the fallback prop.
      const url = new URL(href, 'https://example.test');
      expect(url.searchParams.get('utm_campaign')).toBe(hook);
      expect(url.searchParams.get('utm_content')).toBe(video);
      expect(url.searchParams.get('utm_medium')).toBe('paid');
      expect(url.searchParams.get('utm_source')).toBe('tiktok');
      expect(url.searchParams.get('ad')).toBe('tt');
      expect(href).not.toContain('tt_litterbox_FALLBACK');

      // 2) Click event mirrors the URL params exactly.
      act(() => fireEvent.click(link));
      expect(trackEventSpy).toHaveBeenCalledTimes(1);
      const [, payload] = trackEventSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload.utm_campaign).toBe(hook);
      expect(payload.utm_content).toBe(video);
      expect(payload.utm_source).toBe('tiktok');
      expect(payload.ad).toBe('tt');
    });
  }

  it('falls back to the prop campaign for organic visits with no UTMs', () => {
    renderAt('/go');
    const link = screen.getByRole('link', { name: /get yours today/i });
    const url = new URL(link.getAttribute('href') || '', 'https://example.test');
    expect(url.searchParams.get('utm_campaign')).toBe('tt_litterbox_FALLBACK');
    expect(url.searchParams.get('utm_content')).toBe('lp_primary_FALLBACK');
  });
});