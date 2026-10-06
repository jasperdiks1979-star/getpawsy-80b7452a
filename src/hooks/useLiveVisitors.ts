import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hasValidGeo } from "@/lib/commercialLivePresence";

type ActivityType = "browsing" | "cart" | "checkout";

interface LiveVisitorStats {
  total: number;
  browsing: number;
  cart: number;
  checkout: number;
  /** Raw forensic count incl. bot-suspect/internal/no-geo sessions. */
  rawTotal: number;
}

interface ActivityBreakdown {
  type: ActivityType;
  count: number;
  label: string;
}

export const useLiveVisitors = (refreshInterval = 30000) => {
  const [stats, setStats] = useState<LiveVisitorStats>({
    total: 0,
    browsing: 0,
    cart: 0,
    checkout: 0,
    rawTotal: 0,
  });
  const [breakdown, setBreakdown] = useState<ActivityBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveVisitors = useCallback(async () => {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      // Get unique sessions with their latest activity in the last 15 minutes
      const { data, error: fetchError } = await supabase
        .from("visitor_activity")
        .select("session_id, activity_type, is_internal, is_bot_suspect, country")
        .gte("created_at", fifteenMinutesAgo)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      // Get unique sessions by their latest activity
      // Shopper count excludes internal / bot-suspect sessions and browsing-only
      // sessions without valid geo. Raw rows are untouched (rawTotal).
      const rawIds = new Set<string>();
      const sessionMap = new Map<string, ActivityType>();
      const excluded = new Set<string>();
      data?.forEach((row) => {
        rawIds.add(row.session_id);
        const r = row as typeof row & { is_internal?: boolean | null; is_bot_suspect?: boolean | null; country?: string | null };
        if (r.is_internal === true || r.is_bot_suspect === true) excluded.add(row.session_id);
        if (!sessionMap.has(row.session_id)) {
          sessionMap.set(row.session_id, row.activity_type as ActivityType);
        }
        if (row.activity_type === "browsing" && !hasValidGeo(r.country) && !excluded.has(row.session_id)) {
          // provisional; cleared below if any later/earlier row shows cart/checkout
          excluded.add(`nogeo:${row.session_id}`);
        }
      });
      for (const id of Array.from(sessionMap.keys())) {
        const t = sessionMap.get(id);
        if (excluded.has(id) || (t === "browsing" && excluded.has(`nogeo:${id}`))) sessionMap.delete(id);
      }

      // Count by activity type
      let browsing = 0;
      let cart = 0;
      let checkout = 0;

      sessionMap.forEach((activityType) => {
        switch (activityType) {
          case "browsing":
            browsing++;
            break;
          case "cart":
            cart++;
            break;
          case "checkout":
            checkout++;
            break;
        }
      });

      const total = browsing + cart + checkout;

      setStats({ total, browsing, cart, checkout, rawTotal: rawIds.size });
      setBreakdown([
        { type: "browsing", count: browsing, label: "Browsen" },
        { type: "cart", count: cart, label: "Winkelwagen" },
        { type: "checkout", count: checkout, label: "Checkout" },
      ]);
      setError(null);
    } catch (err) {
      console.error("Error fetching live visitors:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch live visitors");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchLiveVisitors();
  }, [fetchLiveVisitors]);

  // Polling interval
  useEffect(() => {
    const interval = setInterval(fetchLiveVisitors, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchLiveVisitors, refreshInterval]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("live-visitors-analytics")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visitor_activity",
        },
        () => {
          // Refetch on any change
          fetchLiveVisitors();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLiveVisitors]);

  return {
    stats,
    breakdown,
    isLoading,
    error,
    refetch: fetchLiveVisitors,
  };
};
