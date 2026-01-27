import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to track page visits and detect Googlebot/crawlers
 * Add this to pages you want to monitor for Google crawler visits
 */
export const useCrawlerTracking = (pageName?: string) => {
  useEffect(() => {
    const trackVisit = async () => {
      try {
        const pageUrl = pageName || window.location.pathname;
        const userAgent = navigator.userAgent;
        const referrer = document.referrer;

        const { data, error } = await supabase.functions.invoke('log-crawler-visit', {
          body: {
            pageUrl,
            userAgent,
            referrer,
          },
        });

        if (error) {
          console.error('Crawler tracking error:', error);
          return;
        }

        // Log to console if it's a Googlebot (for debugging)
        if (data?.isGooglebot) {
          console.log(`🤖 Googlebot detected: ${data.botType}`);
        }
      } catch (error) {
        // Silently fail - don't interrupt user experience
        console.error('Crawler tracking failed:', error);
      }
    };

    // Small delay to not block page rendering
    const timeoutId = setTimeout(trackVisit, 100);
    
    return () => clearTimeout(timeoutId);
  }, [pageName]);
};
