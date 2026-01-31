import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type ActivityType = "browsing" | "cart" | "checkout";

interface VisitorLocation {
  id: string;
  session_id: string;
  activity_type: ActivityType;
  latitude: number;
  longitude: number;
  country: string | null;
  city: string | null;
  created_at: string;
}

interface LocationStats {
  country: string;
  city: string | null;
  count: number;
  activities: {
    browsing: number;
    cart: number;
    checkout: number;
  };
}

export type TimeRange = "15m" | "1h" | "6h" | "24h" | "7d";

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const useVisitorLocations = (refreshInterval = 30000, timeRange: TimeRange = "15m") => {
  const [locations, setLocations] = useState<VisitorLocation[]>([]);
  const [locationStats, setLocationStats] = useState<LocationStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const cutoffTime = new Date(Date.now() - TIME_RANGE_MS[timeRange]).toISOString();

      // Get all visitor activities with location data in the last 15 minutes
      const { data, error: fetchError } = await supabase
        .from("visitor_activity")
        .select("id, session_id, activity_type, latitude, longitude, country, city, created_at")
        .gte("created_at", cutoffTime)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      // Filter valid locations and dedupe by session (keep latest activity per session)
      const sessionMap = new Map<string, VisitorLocation>();
      (data || []).forEach((row) => {
        if (row.latitude && row.longitude) {
          const existing = sessionMap.get(row.session_id);
          if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
            sessionMap.set(row.session_id, row as VisitorLocation);
          }
        }
      });

      const uniqueLocations = Array.from(sessionMap.values());
      setLocations(uniqueLocations);

      // Calculate location stats (group by country/city)
      const statsMap = new Map<string, LocationStats>();
      uniqueLocations.forEach((loc) => {
        const key = `${loc.country || "Unknown"}-${loc.city || ""}`;
        const existing = statsMap.get(key) || {
          country: loc.country || "Unknown",
          city: loc.city,
          count: 0,
          activities: { browsing: 0, cart: 0, checkout: 0 },
        };
        existing.count++;
        existing.activities[loc.activity_type]++;
        statsMap.set(key, existing);
      });

      // Sort by count descending
      const stats = Array.from(statsMap.values()).sort((a, b) => b.count - a.count);
      setLocationStats(stats);
      setError(null);
    } catch (err) {
      console.error("Error fetching visitor locations:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch locations");
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  // Initial fetch
  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Polling interval
  useEffect(() => {
    const interval = setInterval(fetchLocations, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchLocations, refreshInterval]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("visitor-locations-analytics")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visitor_activity",
        },
        () => {
          fetchLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLocations]);

  return {
    locations,
    locationStats,
    isLoading,
    error,
    refetch: fetchLocations,
  };
};
