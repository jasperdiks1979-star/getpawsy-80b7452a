// useLivePresence — Stage 4 live presence engine for Visitor World Map Pro.
//
// Reads `visitor_activity` rows with `last_seen_at` inside the last 120s
// heartbeat window, then subscribes to postgres_changes so new heartbeats
// arrive within seconds without a full refetch. Polling every 5s is retained
// as an authoritative fallback so the panel stays fresh even if realtime
// disconnects.
//
// This hook owns ONLY presence data. It never mutates business KPIs and
// cross-references canonical funnel flags exclusively via the caller's
// `useAnalyticsTruth` response — see `buildLivePresenceModel` for the
// isolation contract.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LiveVisitorActivityRow, LiveConnectionDiagnostics } from "@/lib/liveVisitorTimeline";
import { LIVE_HEARTBEAT_TTL_SECONDS } from "@/lib/liveVisitorTimeline";
import {
  applyLiveFilters,
  type LiveActivityFilter,
  type LiveSourceFilter,
} from "@/lib/liveMapLayer";

const LIVE_WINDOW_MS = LIVE_HEARTBEAT_TTL_SECONDS * 1000;
const POLL_INTERVAL_MS = 5_000;

export interface UseLivePresenceOptions {
  enabled: boolean;
  usOnly?: boolean;
  excludeInternal?: boolean;
  excludeBots?: boolean;
  source?: LiveSourceFilter;
  activity?: LiveActivityFilter;
}

export interface UseLivePresenceResult {
  rows: LiveVisitorActivityRow[];
  isLoading: boolean;
  error: Error | null;
  diagnostics: LiveConnectionDiagnostics;
  refetch: () => void;
}

export function useLivePresence(opts: UseLivePresenceOptions): UseLivePresenceResult {
  const {
    enabled,
    usOnly = false,
    excludeInternal = true,
    excludeBots = true,
    source = "all",
    activity = "all",
  } = opts;

  const [wsStatus, setWsStatus] = useState<LiveConnectionDiagnostics["websocketStatus"]>(
    enabled ? "connecting" : "disabled",
  );
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [droppedHeartbeats, setDroppedHeartbeats] = useState(0);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Live row buffer — new realtime rows are merged in and stale rows evicted.
  const [liveRows, setLiveRows] = useState<LiveVisitorActivityRow[]>([]);
  const bufferRef = useRef<Map<string, LiveVisitorActivityRow>>(new Map());

  const query = useQuery<LiveVisitorActivityRow[]>({
    queryKey: ["live-presence", usOnly, excludeInternal, excludeBots],
    enabled,
    staleTime: POLL_INTERVAL_MS,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    queryFn: async () => {
      const since = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
      let q = supabase
        .from("visitor_activity")
        .select(
          "id,session_id,visitor_id,activity_type,page_path,product_name,product_id,product_category,order_id,order_value,country,city,device_type,browser,screen_width,screen_height,referrer,referrer_category,utm_source,utm_medium,utm_campaign,utm_term,utm_content,is_bot_suspect,bot_suspect_reason,traffic_quality,geo_confidence,latitude,longitude,is_internal,created_at,last_seen_at",
        )
        .gte("last_seen_at", since)
        .order("last_seen_at", { ascending: false })
        .limit(500);
      if (excludeInternal) q = q.eq("is_internal", false);
      if (excludeBots) q = q.or("is_bot_suspect.is.null,is_bot_suspect.eq.false");
      if (usOnly) q = q.eq("country", "US");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as LiveVisitorActivityRow[];
    },
  });

  // Prime the buffer whenever the poll returns.
  useEffect(() => {
    if (!query.data) return;
    const map = new Map<string, LiveVisitorActivityRow>();
    for (const row of query.data) {
      const key = row.id ?? `${row.session_id}:${row.last_seen_at ?? row.created_at}`;
      map.set(key, row);
    }
    bufferRef.current = map;
    setLiveRows(Array.from(map.values()));
  }, [query.data]);

  // Realtime subscription — websocket first, poll always on as safety net.
  useEffect(() => {
    if (!enabled) {
      setWsStatus("disabled");
      return;
    }
    setWsStatus("connecting");
    const channel = supabase
      .channel(`live-presence-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_activity" },
        (payload) => {
          const row = payload.new as LiveVisitorActivityRow;
          const receivedAt = Date.now();
          if (row?.last_seen_at) {
            const sent = new Date(row.last_seen_at).getTime();
            if (Number.isFinite(sent)) setLatencyMs(Math.max(0, receivedAt - sent));
            setLastHeartbeatAt(row.last_seen_at);
          }
          if (excludeInternal && row?.is_internal) return;
          if (excludeBots && row?.is_bot_suspect) return;
          if (usOnly && row?.country !== "US") return;
          const key = row.id ?? `${row.session_id}:${row.last_seen_at ?? row.created_at}`;
          bufferRef.current.set(key, row);
          setLiveRows(Array.from(bufferRef.current.values()));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "visitor_activity" },
        (payload) => {
          const row = payload.new as LiveVisitorActivityRow;
          const receivedAt = Date.now();
          if (row?.last_seen_at) {
            const sent = new Date(row.last_seen_at).getTime();
            if (Number.isFinite(sent)) setLatencyMs(Math.max(0, receivedAt - sent));
            setLastHeartbeatAt(row.last_seen_at);
          }
          if (excludeInternal && row?.is_internal) return;
          if (excludeBots && row?.is_bot_suspect) return;
          if (usOnly && row?.country !== "US") return;
          const key = row.id ?? `${row.session_id}:${row.last_seen_at ?? row.created_at}`;
          bufferRef.current.set(key, row);
          setLiveRows(Array.from(bufferRef.current.values()));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setWsStatus("open");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setWsStatus("error");
          setReconnectAttempts((n) => n + 1);
        } else if (status === "CLOSED") setWsStatus("closed");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, usOnly, excludeInternal, excludeBots]);

  // Evict stale heartbeats every second so the visible list matches the
  // canonical 120s live window between polls.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - LIVE_WINDOW_MS;
      let dropped = 0;
      for (const [key, row] of bufferRef.current) {
        const seen = new Date(row.last_seen_at || row.created_at).getTime();
        if (!Number.isFinite(seen) || seen < cutoff) {
          bufferRef.current.delete(key);
          dropped += 1;
        }
      }
      if (dropped > 0) {
        setDroppedHeartbeats((n) => n + dropped);
        setLiveRows(Array.from(bufferRef.current.values()));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  const diagnostics = useMemo<LiveConnectionDiagnostics>(() => {
    const now = Date.now();
    const lastMs = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : null;
    return {
      transport: !enabled
        ? "offline"
        : wsStatus === "open"
        ? "websocket"
        : "polling",
      websocketStatus: wsStatus,
      lastHeartbeatAt,
      lastHeartbeatAgeMs: lastMs ? Math.max(0, now - lastMs) : null,
      droppedHeartbeats,
      reconnectAttempts,
      latencyMs,
      geoLookupFailures: liveRows.filter((r) => r.latitude == null || r.longitude == null).length,
    };
  }, [enabled, wsStatus, lastHeartbeatAt, droppedHeartbeats, reconnectAttempts, latencyMs, liveRows]);

  // Source/activity filters live in the client so toolbar changes reshape the
  // buffer without a refetch and the WebSocket stays coherent.
  const filteredRows = useMemo(
    () => applyLiveFilters(liveRows, { source, activity }),
    [liveRows, source, activity],
  );

  return {
    rows: filteredRows,
    isLoading: query.isLoading,
    error: (query.error as Error) ?? null,
    diagnostics,
    refetch: () => query.refetch(),
  };
}