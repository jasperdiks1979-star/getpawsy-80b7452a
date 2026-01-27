import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TrendDataPoint {
  time: string;
  timestamp: Date;
  browsing: number;
  cart: number;
  checkout: number;
  total: number;
}

export const useVisitorTrend = (minutes = 60, intervalMinutes = 5) => {
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrendData = useCallback(async () => {
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() - minutes * 60 * 1000);

      const { data, error } = await supabase
        .from("visitor_activity")
        .select("session_id, activity_type, created_at")
        .gte("created_at", startTime.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Group by 5-minute intervals
      const intervals: Map<string, TrendDataPoint> = new Map();
      
      // Initialize all intervals
      for (let i = 0; i <= minutes; i += intervalMinutes) {
        const intervalTime = new Date(startTime.getTime() + i * 60 * 1000);
        // Round to nearest interval
        intervalTime.setMinutes(Math.floor(intervalTime.getMinutes() / intervalMinutes) * intervalMinutes);
        intervalTime.setSeconds(0);
        intervalTime.setMilliseconds(0);
        
        const key = intervalTime.toISOString();
        if (!intervals.has(key)) {
          intervals.set(key, {
            time: intervalTime.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }),
            timestamp: intervalTime,
            browsing: 0,
            cart: 0,
            checkout: 0,
            total: 0,
          });
        }
      }

      // Count unique sessions per interval
      const sessionsByInterval = new Map<string, Set<string>>();
      const activityByInterval = new Map<string, Map<string, string>>(); // interval -> session -> activity_type

      (data || []).forEach((row) => {
        const rowTime = new Date(row.created_at);
        rowTime.setMinutes(Math.floor(rowTime.getMinutes() / intervalMinutes) * intervalMinutes);
        rowTime.setSeconds(0);
        rowTime.setMilliseconds(0);
        const key = rowTime.toISOString();

        if (!sessionsByInterval.has(key)) {
          sessionsByInterval.set(key, new Set());
          activityByInterval.set(key, new Map());
        }

        sessionsByInterval.get(key)!.add(row.session_id);
        
        // Keep highest priority activity (checkout > cart > browsing)
        const currentActivity = activityByInterval.get(key)!.get(row.session_id);
        const priority: Record<string, number> = { browsing: 1, cart: 2, checkout: 3 };
        if (!currentActivity || priority[row.activity_type] > priority[currentActivity]) {
          activityByInterval.get(key)!.set(row.session_id, row.activity_type);
        }
      });

      // Calculate counts per interval
      activityByInterval.forEach((sessions, key) => {
        const interval = intervals.get(key);
        if (interval) {
          sessions.forEach((activityType) => {
            if (activityType === "browsing") interval.browsing++;
            else if (activityType === "cart") interval.cart++;
            else if (activityType === "checkout") interval.checkout++;
            interval.total++;
          });
        }
      });

      // Convert to sorted array
      const sortedData = Array.from(intervals.values())
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      setTrendData(sortedData);
    } catch (err) {
      console.error("Error fetching visitor trend:", err);
    } finally {
      setIsLoading(false);
    }
  }, [minutes, intervalMinutes]);

  // Initial fetch
  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  // Refresh every minute
  useEffect(() => {
    const interval = setInterval(fetchTrendData, 60000);
    return () => clearInterval(interval);
  }, [fetchTrendData]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("visitor-trend-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visitor_activity",
        },
        () => {
          fetchTrendData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTrendData]);

  return {
    trendData,
    isLoading,
    refetch: fetchTrendData,
  };
};
