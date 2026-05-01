import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { logUtmSession } from '@/lib/utm-session-logger';

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  utm_id?: string;
  gclid?: string; // Google Ads click ID
  fbclid?: string; // Facebook click ID
  referrer?: string;
  landing_page?: string;
}

const UTM_STORAGE_KEY = 'getpawsy_utm_params';

export function useUTMTracking() {
  const location = useLocation();
  const [utmParams, setUtmParams] = useState<UTMParams>({});

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);

    // Fire-and-forget: persist first UTM set for this session to the audit log.
    // Idempotent — safe to call on every navigation.
    logUtmSession();
    
    // Extract UTM parameters from URL
    const newUtmParams: UTMParams = {};
    
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'fbclid'];
    
    utmKeys.forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        newUtmParams[key as keyof UTMParams] = value;
      }
    });

    // Add referrer and landing page
    if (Object.keys(newUtmParams).length > 0) {
      newUtmParams.referrer = document.referrer || undefined;
      newUtmParams.landing_page = window.location.pathname + window.location.search;
      
      // Store in localStorage for session persistence
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({
        ...newUtmParams,
        timestamp: Date.now()
      }));
      
      setUtmParams(newUtmParams);
    } else {
      // Try to retrieve from localStorage if no UTM in current URL
      const stored = localStorage.getItem(UTM_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Only use stored UTM params if they're less than 30 days old
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          if (parsed.timestamp && Date.now() - parsed.timestamp < thirtyDaysMs) {
            const { timestamp, ...params } = parsed;
            setUtmParams(params);
          }
        } catch (e) {
          console.error('Failed to parse stored UTM params:', e);
        }
      }
    }
  }, [location.search]);

  return utmParams;
}

// Helper to get UTM params without React hook (for use in callbacks)
export function getStoredUTMParams(): UTMParams {
  const stored = localStorage.getItem(UTM_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      if (parsed.timestamp && Date.now() - parsed.timestamp < thirtyDaysMs) {
        const { timestamp, ...params } = parsed;
        return params;
      }
    } catch (e) {
      console.error('Failed to parse stored UTM params:', e);
    }
  }
  return {};
}

// Clear stored UTM params (e.g., after conversion)
export function clearStoredUTMParams(): void {
  localStorage.removeItem(UTM_STORAGE_KEY);
}
