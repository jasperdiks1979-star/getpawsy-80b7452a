import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

import { PRODUCTION_DOMAINS } from '@/lib/constants';

// Check if we're on a production domain
const isProductionDomain = (): boolean => {
  const hostname = window.location.hostname;
  return PRODUCTION_DOMAINS.includes(hostname);
};

// Get session ID from session storage
const getSessionId = (): string | null => {
  return sessionStorage.getItem("visitor_session_id");
};

/**
 * Hook that sends periodic heartbeats to keep the visitor session alive
 * This enables real-time presence detection on the map
 */
export const useVisitorHeartbeat = (intervalMs = 30000) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(true);

  const sendHeartbeat = useCallback(async () => {
    // Only send heartbeat on production domains
    if (!isProductionDomain()) return;

    const sessionId = getSessionId();
    if (!sessionId) return;

    try {
      // Call the database function to update last_seen_at
      await supabase.rpc('update_session_heartbeat', {
        p_session_id: sessionId
      });
    } catch (error) {
      // Silently fail - heartbeat is non-critical
      console.debug("Heartbeat failed:", error);
    }
  }, []);

  useEffect(() => {
    // Only run on production
    if (!isProductionDomain()) return;

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval for periodic heartbeats
    intervalRef.current = setInterval(() => {
      if (isActiveRef.current) {
        sendHeartbeat();
      }
    }, intervalMs);

    // Handle visibility change - pause heartbeat when tab is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActiveRef.current = false;
      } else {
        isActiveRef.current = true;
        // Send immediate heartbeat when tab becomes visible again
        sendHeartbeat();
      }
    };

    // Handle page unload - stop heartbeat
    const handleBeforeUnload = () => {
      isActiveRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sendHeartbeat, intervalMs]);

  return { sendHeartbeat };
};
