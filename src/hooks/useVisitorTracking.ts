import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type ActivityType = "browsing" | "cart" | "checkout";

interface GeoLocation {
  latitude: number;
  longitude: number;
  country?: string;
  city?: string;
}

// Generate a unique session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem("visitor_session_id");
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem("visitor_session_id", sessionId);
  }
  return sessionId;
};

export const useVisitorTracking = () => {
  const locationRef = useRef<GeoLocation | null>(null);
  const lastActivityRef = useRef<ActivityType | null>(null);
  const sessionId = useRef<string>(getSessionId());

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
    // Don't track duplicate consecutive activities
    if (lastActivityRef.current === activityType) return;
    lastActivityRef.current = activityType;

    try {
      const location = await fetchLocation();
      
      const { error } = await supabase
        .from("visitor_activity")
        .insert({
          session_id: sessionId.current,
          activity_type: activityType,
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          country: location?.country || null,
          city: location?.city || null,
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
