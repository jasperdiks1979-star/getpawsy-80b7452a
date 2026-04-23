import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shape of the successful response from `log-crawler-visit`.
 * The edge function returns `sampled: false` (with `success: true`) when the
 * configured `crawler_visit_sample_rate` caused the ping to be dropped before
 * the DB insert. That is NOT an error — the request was accepted, we just
 * chose not to persist it. Callers must treat this as success.
 */
type LogCrawlerVisitResponse = {
  success: boolean;
  isGooglebot?: boolean;
  botType?: string | null;
  verified?: boolean;
  spoofed?: boolean;
  sampled?: boolean;
  sampleRate?: number;
};

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

        const response = (data ?? {}) as LogCrawlerVisitResponse;

        // Sampled-out is a normal, successful outcome — not an error. The
        // server already returned 200; we just log a debug line so it's
        // visible during local development / dashboard tuning.
        if (response.success === true && response.sampled === false) {
          console.debug(
            `[crawler-tracking] sampled out (rate=${
              response.sampleRate ?? 'unknown'
            }) for ${pageUrl}`,
          );
        }

        // Log to console if it's a verified Googlebot (for debugging).
        if (response.isGooglebot) {
          console.log(`🤖 Googlebot detected: ${response.botType ?? 'unknown'}`);
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
