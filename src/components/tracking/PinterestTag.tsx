import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePinterestTracking } from '@/hooks/usePinterestTracking';

/**
 * Pinterest Tag component that automatically tracks page views
 * Add this to your app layout to enable Pinterest conversion tracking
 */
export const PinterestTag = () => {
  const location = useLocation();
  const { trackPageVisit, trackViewCategory } = usePinterestTracking();

  // Track page visits on route change
  useEffect(() => {
    trackPageVisit();

    // Track category views for category pages
    const path = location.pathname;
    if (path.startsWith('/category/')) {
      const categorySlug = path.replace('/category/', '');
      trackViewCategory(categorySlug);
    }
  }, [location.pathname, trackPageVisit, trackViewCategory]);

  // Pinterest noscript fallback
  return (
    <noscript>
      <img 
        height="1" 
        width="1" 
        style={{ display: 'none' }} 
        alt="" 
        src="https://ct.pinterest.com/v3/?event=init&tid=2612897117846&noscript=1" 
      />
    </noscript>
  );
};
