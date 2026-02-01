import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SessionStats {
  totalSessions: number;
  avgSessionDuration: number; // in seconds
  byDevice: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  byReferrer: {
    google: number;
    social: number;
    direct: number;
    email: number;
    paid: number;
    organic: number;
    other: number;
  };
  byBrowser: Record<string, number>;
  topPages: Array<{ page: string; views: number }>;
  topProducts: Array<{ id: string; name: string; views: number }>;
}

export type AdvancedTimeRange = "15m" | "1h" | "6h" | "24h" | "7d" | "30d";

const TIME_RANGE_MS: Record<AdvancedTimeRange, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const useAdvancedVisitorStats = (timeRange: AdvancedTimeRange = "24h") => {
  const [stats, setStats] = useState<SessionStats>({
    totalSessions: 0,
    avgSessionDuration: 0,
    byDevice: { mobile: 0, tablet: 0, desktop: 0 },
    byReferrer: { google: 0, social: 0, direct: 0, email: 0, paid: 0, organic: 0, other: 0 },
    byBrowser: {},
    topPages: [],
    topProducts: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const cutoffTime = new Date(Date.now() - TIME_RANGE_MS[timeRange]).toISOString();

      const { data, error: fetchError } = await supabase
        .from("visitor_activity")
        .select("session_id, activity_type, device_type, browser, referrer_category, page_path, product_id, product_name, created_at")
        .gte("created_at", cutoffTime)
        .order("created_at", { ascending: true });

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        setStats({
          totalSessions: 0,
          avgSessionDuration: 0,
          byDevice: { mobile: 0, tablet: 0, desktop: 0 },
          byReferrer: { google: 0, social: 0, direct: 0, email: 0, paid: 0, organic: 0, other: 0 },
          byBrowser: {},
          topPages: [],
          topProducts: [],
        });
        setError(null);
        return;
      }

      // Calculate session durations
      const sessionTimes = new Map<string, { first: Date; last: Date }>();
      const deviceCounts: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 };
      const referrerCounts: Record<string, number> = { google: 0, social: 0, direct: 0, email: 0, paid: 0, organic: 0, other: 0 };
      const browserCounts: Record<string, number> = {};
      const pageCounts: Record<string, number> = {};
      const productCounts: Record<string, { name: string; views: number }> = {};
      const countedSessions = new Set<string>();

      data.forEach((row) => {
        const time = new Date(row.created_at);
        const existing = sessionTimes.get(row.session_id);
        
        if (!existing) {
          sessionTimes.set(row.session_id, { first: time, last: time });
        } else {
          if (time < existing.first) existing.first = time;
          if (time > existing.last) existing.last = time;
        }

        // Count devices (once per session)
        if (!countedSessions.has(row.session_id)) {
          countedSessions.add(row.session_id);
          
          if (row.device_type && deviceCounts[row.device_type] !== undefined) {
            deviceCounts[row.device_type]++;
          }
          
          if (row.referrer_category && referrerCounts[row.referrer_category] !== undefined) {
            referrerCounts[row.referrer_category]++;
          }
          
          if (row.browser) {
            browserCounts[row.browser] = (browserCounts[row.browser] || 0) + 1;
          }
        }

        // Count pages
        if (row.page_path) {
          pageCounts[row.page_path] = (pageCounts[row.page_path] || 0) + 1;
        }

        // Count product views
        if (row.product_id && row.activity_type === 'product_view') {
          if (!productCounts[row.product_id]) {
            productCounts[row.product_id] = { name: row.product_name || 'Unknown', views: 0 };
          }
          productCounts[row.product_id].views++;
        }
      });

      // Calculate average session duration
      let totalDuration = 0;
      sessionTimes.forEach(({ first, last }) => {
        totalDuration += (last.getTime() - first.getTime()) / 1000;
      });
      const avgDuration = sessionTimes.size > 0 ? totalDuration / sessionTimes.size : 0;

      // Sort pages and products by views
      const topPages = Object.entries(pageCounts)
        .map(([page, views]) => ({ page, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      const topProducts = Object.entries(productCounts)
        .map(([id, { name, views }]) => ({ id, name, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      setStats({
        totalSessions: sessionTimes.size,
        avgSessionDuration: avgDuration,
        byDevice: deviceCounts as SessionStats['byDevice'],
        byReferrer: referrerCounts as SessionStats['byReferrer'],
        byBrowser: browserCounts,
        topPages,
        topProducts,
      });
      setError(null);
    } catch (err) {
      console.error("Error fetching advanced visitor stats:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Refresh every minute
  useEffect(() => {
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("advanced-visitor-stats")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visitor_activity",
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats,
  };
};
