import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useVisitorHeartbeat } from '@/hooks/useVisitorHeartbeat';
import { fireMarketingAsync, MARKETING_FLAGS } from '@/lib/marketingClient';
import { MarketingErrorBoundary } from '@/components/error/MarketingErrorBoundary';

/**
 * Safe Global Visitor Tracker — deferred gtag calls, never blocks rendering.
 */
const TrackerInner = () => {
  const location = useLocation();
  const { trackBrowsing, trackViewCart, trackCheckout } = useVisitorTracking();

  useVisitorHeartbeat(30000);

  useEffect(() => {
    const path = location.pathname;

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
