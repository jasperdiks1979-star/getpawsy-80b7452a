import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';

/**
 * Global visitor tracking component that tracks all page visits
 * Add this to your app layout to ensure every visitor is tracked
 * regardless of which page they land on
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
      // All other pages count as browsing
      trackBrowsing();
    }
  }, [location.pathname, trackBrowsing, trackCart, trackCheckout]);

  return null;
};
