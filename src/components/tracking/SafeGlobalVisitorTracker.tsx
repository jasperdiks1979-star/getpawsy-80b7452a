import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useVisitorHeartbeat } from '@/hooks/useVisitorHeartbeat';
import { fireMarketingAsync, MARKETING_FLAGS } from '@/lib/marketingClient';
import { MarketingErrorBoundary } from '@/components/error/MarketingErrorBoundary';
import { pushTrafficContext } from '@/lib/traffic';
import { resolveUtm, syncUtmToUrl } from '@/lib/utmNormalizer';
import { installUxSignals } from '@/lib/ux-signals';

/**
 * Safe Global Visitor Tracker — deferred gtag calls, never blocks rendering.
 * Now also pushes traffic context to dataLayer on every route change.
 */
const TrackerInner = () => {
  const location = useLocation();
  const { trackBrowsing, trackViewCart, trackCheckout } = useVisitorTracking();

  useVisitorHeartbeat(30000);

  useEffect(() => {
    // One-time install of rage / dead-click / scroll-depth / form-abandon
    // capture. Never throws — wraps its own listeners.
    try { installUxSignals(); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    const path = location.pathname;

    // Backfill the URL with inferred UTMs (e.g. TikTok ad clicks that
    // arrive with only `ttclid` / `ad=tt`) BEFORE firing GA4 page_view,
    // so `page_location` carries the correct utm_source / utm_medium and
    // GA4 stops bucketing paid TikTok traffic as `direct`.
    try {
      const resolved = resolveUtm({ search: window.location.search });
      syncUtmToUrl(resolved);
    } catch {
      /* non-fatal — never block render or analytics */
    }

    // Push traffic context to dataLayer (non-blocking, fires before page_view)
    pushTrafficContext(path);

    // Defer Google Analytics page_view — non-blocking
    if (MARKETING_FLAGS.GOOGLE_ENABLED) {
      fireMarketingAsync('gtag-pageview', () => {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'page_view', {
            page_location: window.location.href,
            page_path: path,
            page_title: document.title,
          });
        }
      }, 'google');
    }

    // Visitor tracking (internal analytics — always runs)
    if (path === '/checkout') {
      trackCheckout();
    } else if (path === '/cart') {
      trackViewCart();
    } else {
      trackBrowsing(path);
    }
  }, [location.pathname, trackBrowsing, trackViewCart, trackCheckout]);

  return null;
};

export const SafeGlobalVisitorTracker = () => (
  <MarketingErrorBoundary>
    <TrackerInner />
  </MarketingErrorBoundary>
);
