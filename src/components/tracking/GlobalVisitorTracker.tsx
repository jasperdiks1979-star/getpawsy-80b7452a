import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';

/**
 * Global visitor tracking component that tracks all page visits
 * Add this to your app layout to ensure every visitor is tracked
 * regardless of which page they land on
 * 
 * Enhanced tracking includes:
 * - Device type (mobile/tablet/desktop)
 * - Browser detection
 * - Page path tracking
 * - Referrer categorization (google/social/direct/email/paid/organic/other)
 * - Screen dimensions
 */
export const GlobalVisitorTracker = () => {
  const location = useLocation();
  const { trackBrowsing, trackCart, trackCheckout } = useVisitorTracking();

  // Track on every route change
  useEffect(() => {
    const path = location.pathname;

    // Determine activity type based on current route
    if (path === '/checkout') {
      trackCheckout();
    } else if (path === '/cart') {
      trackCart();
    } else {
      // All other pages count as browsing with specific path
      trackBrowsing(path);
    }
  }, [location.pathname, trackBrowsing, trackCart, trackCheckout]);

  return null;
};
