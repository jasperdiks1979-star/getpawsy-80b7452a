import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useVisitorHeartbeat } from '@/hooks/useVisitorHeartbeat';

/**
 * Global visitor tracking component that tracks all page visits
 * Implements complete ecommerce funnel tracking:
 * 
 * - ViewItem (product_view) - PDP pages
 * - ViewCart (view_cart) - /cart page  
 * - BeginCheckout (checkout) - /checkout page
 * - Browsing - all other pages
 * 
 * Enhanced tracking includes:
 * - Device type (mobile/tablet/desktop)
 * - Browser detection
 * - Page path tracking
 * - Referrer categorization (google/social/direct/email/paid/organic/other)
 * - Screen dimensions
 * - UTM persistence across funnel
 * - Internal traffic filtering (Netherlands)
 * - Heartbeat for real-time presence detection
 */
export const GlobalVisitorTracker = () => {
  const location = useLocation();
  const { trackBrowsing, trackViewCart, trackCheckout } = useVisitorTracking();
  
  // Start heartbeat for real-time presence detection (every 30 seconds)
  useVisitorHeartbeat(30000);

  // Track on every route change
  useEffect(() => {
    const path = location.pathname;

    // Determine activity type based on current route
    if (path === '/checkout') {
      // BeginCheckout funnel event
      trackCheckout();
    } else if (path === '/cart') {
      // ViewCart funnel event
      trackViewCart();
    } else {
      // All other pages count as browsing with specific path
      // Note: product_view is tracked separately on PDP pages with product details
      trackBrowsing(path);
    }
  }, [location.pathname, trackBrowsing, trackViewCart, trackCheckout]);

  return null;
};
