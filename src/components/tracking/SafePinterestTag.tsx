import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fireMarketingAsync, MARKETING_FLAGS } from '@/lib/marketingClient';
import { MarketingErrorBoundary } from '@/components/error/MarketingErrorBoundary';

/**
 * Safe Pinterest Tag — deferred, non-blocking, wrapped in error boundary.
 * Replaces the old PinterestTag that ran at boot.
 */
const PinterestTagInner = () => {
  const location = useLocation();

  // Defer Pinterest initialization until after first paint
  useEffect(() => {
    if (!MARKETING_FLAGS.PINTEREST_ENABLED) return;

    fireMarketingAsync('pinterest-init', async () => {
      const { initPinterestTag, isProductionDomain } = await import('@/hooks/usePinterestTracking');
      if (isProductionDomain()) {
        initPinterestTag();
      }
    }, 'pinterest');
  }, []);

  // Track page visits on route change — deferred
  useEffect(() => {
    if (!MARKETING_FLAGS.PINTEREST_ENABLED) return;

    fireMarketingAsync('pinterest-pagevisit', async () => {
      const { trackPinterestEvent, isProductionDomain } = await import('@/hooks/usePinterestTracking');
      if (!isProductionDomain()) return;

      trackPinterestEvent('pagevisit');

      const path = location.pathname;
      if (path.startsWith('/category/')) {
        const categorySlug = path.replace('/category/', '');
        trackPinterestEvent('viewcategory', { product_category: categorySlug });
      } else if (path.startsWith('/collections/')) {
        const categorySlug = path.replace('/collections/', '').split('/')[0];
        if (categorySlug) {
          trackPinterestEvent('viewcategory', { product_category: categorySlug });
        }
      }
    }, 'pinterest');
  }, [location.pathname]);

  return null;
};

export const SafePinterestTag = () => (
  <MarketingErrorBoundary>
    <PinterestTagInner />
  </MarketingErrorBoundary>
);
