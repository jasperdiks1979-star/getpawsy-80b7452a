import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type ActivityType = "browsing" | "cart" | "checkout";

interface GeoLocation {
  latitude: number;
  longitude: number;
  country?: string;
  city?: string;
}

interface UTMParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

// Production domains where tracking should be active
const PRODUCTION_DOMAINS = [
  'getpawsy.pet',
  'www.getpawsy.pet',
  'getpawsy.lovable.app',
];

// Check if we're on a production domain
const isProductionDomain = (): boolean => {
  const hostname = window.location.hostname;
  return PRODUCTION_DOMAINS.includes(hostname);
};

// Generate a unique session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem("visitor_session_id");
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem("visitor_session_id", sessionId);
  }
  return sessionId;
};

// Extract UTM parameters from URL, with Pinterest auto-detection
const getUTMParams = (): UTMParams => {
  const params = new URLSearchParams(window.location.search);
  
  // Check for Pinterest-specific parameters
  // Pinterest adds epik parameter for tracking
  const hasPinterestParam = params.has('epik') || params.has('pin_id');
  
  // Auto-detect Pinterest as source if their params are present
  let utm_source = params.get('utm_source');
  if (!utm_source && hasPinterestParam) {
    utm_source = 'pinterest';
  }
  
  return {
    utm_source,
    utm_medium: params.get('utm_medium') || (hasPinterestParam ? 'social' : null),
    utm_campaign: params.get('utm_campaign') || (hasPinterestParam ? 'pinterest_auto' : null),
  };
};

// Get full referrer URL for better tracking
const getReferrer = (): string | null => {
  if (!document.referrer) return null;
  return document.referrer;
};

export const useVisitorTracking = () => {
  const locationRef = useRef<GeoLocation | null>(null);
  const lastActivityRef = useRef<ActivityType | null>(null);
  const sessionId = useRef<string>(getSessionId());
  const utmParamsRef = useRef<UTMParams>(getUTMParams());
  const referrerRef = useRef<string | null>(getReferrer());

  // Fetch approximate location using IP geolocation
  const fetchLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (locationRef.current) return locationRef.current;

    try {
      // Use a free IP geolocation API
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) throw new Error("Failed to fetch location");
      
      const data = await response.json();
      
      if (data.latitude && data.longitude) {
        locationRef.current = {
          latitude: data.latitude,
          longitude: data.longitude,
          country: data.country_name,
          city: data.city,
        };
        return locationRef.current;
      }
    } catch (error) {
      console.error("Error fetching location:", error);
    }
    
    return null;
  }, []);

  // Track visitor activity
  const trackActivity = useCallback(async (activityType: ActivityType) => {
    // Only track on production domains
    if (!isProductionDomain()) {
      console.log('[Visitor Tracking] Skipped - not a production domain');
      return;
    }

    // Don't track duplicate consecutive activities
    if (lastActivityRef.current === activityType) return;
    lastActivityRef.current = activityType;

    try {
      const location = await fetchLocation();
      const utmParams = utmParamsRef.current;
      const referrer = referrerRef.current;
      
      const { error } = await supabase
        .from("visitor_activity")
        .insert({
          session_id: sessionId.current,
          activity_type: activityType,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          country: location?.country || null,
          city: location?.city || null,
          referrer: referrer,
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
        });

      if (error) {
        console.error("Error tracking activity:", error);
      }
    } catch (error) {
      console.error("Error tracking activity:", error);
    }
  }, [fetchLocation]);

  // Track browsing activity on mount
  useEffect(() => {
    trackActivity("browsing");
  }, [trackActivity]);

  return {
    trackActivity,
    trackBrowsing: () => trackActivity("browsing"),
    trackCart: () => trackActivity("cart"),
    trackCheckout: () => trackActivity("checkout"),
  };
};
