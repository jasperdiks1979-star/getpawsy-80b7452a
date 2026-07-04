import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Users, ShoppingCart, CreditCard, RefreshCw, Flame, MapPin, Calendar, Clock, Download, TrendingUp, BarChart3, ZoomIn, ZoomOut, RotateCcw, Filter, Volume2, VolumeX, Bell, BellOff, Map as MapIcon, Maximize2, Minimize2, X, Radio, RotateCw, ExternalLink, Target, Sparkles, Vibrate, Smartphone, BellRing } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PinterestTrafficWidget } from "./widgets/PinterestTrafficWidget";
import { mapPerfMark, resetMapPerf } from "@/lib/map-perf-tracker";
import { MapPerfDashboard } from "./MapPerfDashboard";
import { resolveCanonicalSource, CANONICAL_SOURCES, type CanonicalSource } from "@/lib/canonicalSource";
import { buildEnrichedBreakdown, buildPinterestDrilldown, type VisitorRow as AuditRow } from "@/lib/sourceAuditBreakdown";
import { DynamicSourceFilter, type DynamicSourceValue } from "./DynamicSourceFilter";
import { SOURCE_META } from "@/lib/canonicalSource";
import { useAnalyticsTruth, countersFromSessions } from "@/hooks/useAnalyticsTruth";
import {
  assertWorldMapRenderInvariant,
  buildWorldMapModel,
  markerFeaturesToGeoJson,
  type WorldMapMarkerFeature,
} from "@/lib/visitorWorldMapCanonicalFeatures";

function Stat({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "good" | "bad" | "warn" | "neutral" }) {
  const cls = tone === "good"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : tone === "bad"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-border bg-background/60 text-foreground";
  return (
    <div className={`rounded border px-1.5 py-1 ${cls}`}>
      <div className="text-[9px] uppercase opacity-70">{label}</div>
      <div className="text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function MiniList({ title, rows, empty }: { title: string; rows: Array<{ k: string; v: number }>; empty?: string }) {
  return (
    <div>
      <div className="font-medium text-[10px] mb-0.5">{title}</div>
      {rows.length === 0 ? (
        <div className="text-[10px] text-muted-foreground">{empty ?? "Geen data."}</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-2 border-b border-border/40 py-0.5">
              <span className="truncate" title={r.k}>{r.k || "(leeg)"}</span>
              <span className="tabular-nums text-muted-foreground">{r.v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface VisitorActivity {
  id: string;
  session_id: string;
  visitor_id?: string | null;
  activity_type: "browsing" | "cart" | "checkout" | "begin_checkout" | "product_view" | "add_to_cart" | "view_cart" | "purchase";
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
  created_at: string;
  last_seen_at?: string;
  referrer_category?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  page_path?: string | null;
}

// Full row shape returned by `select("*")` — used for the CSV export so we
// can include every measured dimension without widening the in-memory map
// activity type used elsewhere in this component.
interface VisitorActivityFull extends VisitorActivity {
  updated_at?: string | null;
  referrer?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  page_path?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  product_price?: number | null;
  product_quantity?: number | null;
  order_id?: string | null;
  order_value?: number | null;
  device_type?: string | null;
  browser?: string | null;
  screen_width?: number | null;
  screen_height?: number | null;
  is_internal?: boolean | null;
  visitor_id?: string | null;
}

type SourceFilter = DynamicSourceValue;
const SOURCE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE_META).map(([k, v]) => [k, v.color]),
);
const SOURCE_LABELS: Record<string, string> = {
  all: "All Sources",
  ...Object.fromEntries(Object.entries(SOURCE_META).map(([k, v]) => [k, v.label])),
};

const ACTIVITY_COLORS = {
  browsing: "#ef4444", // red
  cart: "#f97316", // orange
  checkout: "#22c55e", // green
};

const ACTIVITY_LABELS = {
  browsing: "Browsen",
  cart: "Winkelwagen",
  checkout: "Afrekenen",
};

// Activity weights for heatmap intensity
const ACTIVITY_WEIGHTS = {
  browsing: 1,
  cart: 2,
  checkout: 3,
};

// Time range options
type TimeRange = "live" | "15m" | "1h" | "2.5h" | "5h" | "10h" | "24h" | "7d" | "30d";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; minutes: number }[] = [
  { value: "live", label: "Live (15 min)", minutes: 15 },
  { value: "15m", label: "Laatste 15 min", minutes: 15 },
  { value: "1h", label: "Laatste uur", minutes: 60 },
  { value: "2.5h", label: "Laatste 2,5 uur", minutes: 150 },
  { value: "5h", label: "Laatste 5 uur", minutes: 300 },
  { value: "10h", label: "Laatste 10 uur", minutes: 600 },
  { value: "24h", label: "Laatste 24 uur", minutes: 24 * 60 },
  { value: "7d", label: "Laatste 7 dagen", minutes: 24 * 60 * 7 },
  { value: "30d", label: "Laatste 30 dagen", minutes: 24 * 60 * 30 },
];

export const VisitorWorldMap = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [renderedMapboxSourceFeatureCount, setRenderedMapboxSourceFeatureCount] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mapContainerReady, setMapContainerReady] = useState(false);
  const mapTokenRef = useRef<string | null>(null);
  const previousContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset perf marks once on mount (effect, not render — safe in StrictMode)
  useEffect(() => {
    resetMapPerf();
    mapPerfMark("start");
    mapPerfMark("chunk-loaded");
  }, []);

  // Callback ref to handle map container changes between render modes
  const mapContainerCallback = useCallback((node: HTMLDivElement | null) => {
    if (node && node !== previousContainerRef.current) {
      // Container changed - need to reinitialize map
      previousContainerRef.current = node;
      (mapContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      mapPerfMark("container-ready");
      
      // If we already have a map token and the map was previously loaded,
      // we need to recreate the map on the new container
      if (map.current && mapTokenRef.current) {
        // Destroy old map
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
      
      // Trigger reinitialization
      setMapContainerReady(prev => !prev);
    }
  }, []);
  const [timeRange, setTimeRange] = useState<TimeRange>("15m");
  const [liveActivities, setLiveActivities] = useState<VisitorActivity[]>([]);
  // Default to Mercator on mobile (loads ~2x faster than 3D globe)
  const [mapProjection, setMapProjection] = useState<"globe" | "mercator">(() => {
    if (typeof window === "undefined") return "globe";
    return window.innerWidth < 768 ? "mercator" : "globe";
  });
  const [activityFilter, setActivityFilter] = useState<"all" | "browsing" | "cart" | "checkout">("all");
  const [checkoutNotifications, setCheckoutNotifications] = useState(() => {
    const saved = localStorage.getItem("checkout-notifications-enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [cartNotifications, setCartNotifications] = useState(() => {
    const saved = localStorage.getItem("cart-notifications-enabled");
    return saved !== null ? saved === "true" : false;
  });
  const [notificationMode, setNotificationMode] = useState<"sound" | "vibrate" | "off">(() => {
    const saved = localStorage.getItem("notification-mode");
    return (saved as "sound" | "vibrate" | "off") || "sound";
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMinimal, setFullscreenMinimal] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showInactiveSources, setShowInactiveSources] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState(() => {
    const saved = localStorage.getItem("map-auto-rotate");
    return saved !== null ? saved === "true" : false;
  });
  const [showHotSpots, setShowHotSpots] = useState(() => {
    const saved = localStorage.getItem("map-hot-spots");
    return saved !== null ? saved === "true" : true;
  });
  // US-only is OFF by default — most rows have unresolved geo (TikTok in-app
  // browsers often block third-party IP-geo providers), so US-only would hide
  // valid traffic. Internal/test (NL) traffic is still excluded by default.
  const [usOnly, setUsOnly] = useState(() => localStorage.getItem("map-us-only") === "true");
  const [excludeInternal, setExcludeInternal] = useState(() => localStorage.getItem("map-exclude-internal") !== "false");
  useEffect(() => { localStorage.setItem("map-us-only", String(usOnly)); }, [usOnly]);
  useEffect(() => { localStorage.setItem("map-exclude-internal", String(excludeInternal)); }, [excludeInternal]);
  const spinIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const userInteractingRef = useRef(false);
  const hotSpotMarkersRef = useRef<mapboxgl.Marker[]>([]);
  
  // Push notifications hook
  const { 
    isSupported: pushSupported, 
    permission: pushPermission, 
    pushEnabled, 
    sendNotification, 
    togglePush 
  } = usePushNotifications();

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback((minimal: boolean = false) => {
    setIsFullscreen(prev => !prev);
    setFullscreenMinimal(minimal);
  }, []);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    if (isFullscreen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  // Resize map when fullscreen or fullscreenMinimal changes
  useEffect(() => {
    if (map.current && mapLoaded) {
      // Multiple resize calls to ensure the map renders correctly after DOM changes
      const resizeMap = () => {
        map.current?.resize();
      };
      
      // Immediate resize
      resizeMap();
      
      // Delayed resizes to catch DOM layout updates
      const timeouts = [50, 100, 200, 500].map(delay => 
        setTimeout(resizeMap, delay)
      );
      
      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [isFullscreen, fullscreenMinimal, mapLoaded]);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a pleasant "cha-ching" sound
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // First note
      oscillator1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator1.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
      oscillator1.type = "sine";
      
      // Second note (harmony)
      oscillator2.frequency.setValueAtTime(392, audioContext.currentTime); // G4
      oscillator2.frequency.setValueAtTime(523.25, audioContext.currentTime + 0.1); // C5
      oscillator2.type = "sine";
      
      // Envelope
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.12);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
      
      oscillator1.start(audioContext.currentTime);
      oscillator2.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.4);
      oscillator2.stop(audioContext.currentTime + 0.4);
    } catch (e) {
      console.log("Could not play notification sound:", e);
    }
  }, []);

  // Trigger vibration for mobile
  const triggerVibration = useCallback(() => {
    try {
      if ("vibrate" in navigator) {
        // Pattern: vibrate 200ms, pause 100ms, vibrate 200ms, pause 100ms, vibrate 300ms
        navigator.vibrate([200, 100, 200, 100, 300]);
      }
    } catch (e) {
      console.log("Vibration not supported:", e);
    }
  }, []);

  // Unified notification handler
  const triggerNotification = useCallback(() => {
    if (notificationMode === "sound") {
      playNotificationSound();
    } else if (notificationMode === "vibrate") {
      triggerVibration();
    }
    // If "off", do nothing
  }, [notificationMode, playNotificationSound, triggerVibration]);

  // Save notification preferences
  useEffect(() => {
    localStorage.setItem("checkout-notifications-enabled", String(checkoutNotifications));
  }, [checkoutNotifications]);

  useEffect(() => {
    localStorage.setItem("cart-notifications-enabled", String(cartNotifications));
  }, [cartNotifications]);

  useEffect(() => {
    localStorage.setItem("notification-mode", notificationMode);
  }, [notificationMode]);

  // Save hot spots preference
  useEffect(() => {
    localStorage.setItem("map-hot-spots", String(showHotSpots));
  }, [showHotSpots]);

  // Update map projection when toggle changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    map.current.setProjection(mapProjection);
    
    // Adjust view based on projection
    if (mapProjection === "mercator") {
      map.current.easeTo({
        pitch: 0,
        zoom: 1.2,
        duration: 500
      });
    } else {
      map.current.easeTo({
        pitch: 20,
        zoom: 1.5,
        duration: 500
      });
    }
  }, [mapProjection, mapLoaded]);

  // Clear live activities when switching away from live mode
  useEffect(() => {
    if (timeRange !== "live") {
      setLiveActivities([]);
    }
  }, [timeRange]);

  // Get the time range in milliseconds
  const getTimeRangeMs = () => {
    const option = TIME_RANGE_OPTIONS.find(o => o.value === timeRange);
    return (option?.minutes || 15) * 60 * 1000;
  };

  // Fetch visitor activities with time range
  const { data: activities, refetch, isLoading, isFetching } = useQuery({
    queryKey: ["visitor-activities", timeRange, usOnly, excludeInternal],
    queryFn: async () => {
      mapPerfMark("first-data-start");
      const timeRangeMs = getTimeRangeMs();
      
      if (timeRange === "live") {
        // For LIVE mode: only show sessions with heartbeat in the last 60 seconds
        const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
        let q = supabase
          .from("visitor_activity")
          .select("*")
          .gte("last_seen_at", sixtySecondsAgo)
          .order("last_seen_at", { ascending: false });
        if (excludeInternal) q = q.or("is_internal.is.null,is_internal.eq.false");
        if (usOnly) q = q.in("country", ["United States", "USA", "US"]);
        const { data, error } = await q;

        if (error) throw error;
        
        // Dedupe by session_id - keep only the latest activity per session
        const sessionMap = new Map<string, VisitorActivity>();
        (data || []).forEach((activity) => {
          const typedActivity = activity as unknown as VisitorActivity;
          if (!sessionMap.has(typedActivity.session_id)) {
            sessionMap.set(typedActivity.session_id, typedActivity);
          }
        });
        
        mapPerfMark("first-data-end");
        return Array.from(sessionMap.values());
      }
      
      // For historical modes: paginate to bypass the 1000-row Supabase cap
      const since = new Date(Date.now() - timeRangeMs).toISOString();
      const PAGE = 1000;
      const HARD_CAP = 20000;
      const all: VisitorActivity[] = [];
      let from = 0;
      while (from < HARD_CAP) {
        let q = supabase
          .from("visitor_activity")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (excludeInternal) q = q.or("is_internal.is.null,is_internal.eq.false");
        if (usOnly) q = q.in("country", ["United States", "USA", "US"]);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as VisitorActivity[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      mapPerfMark("first-data-end");
      return all;
    },
    // Live mode refreshes every 3 seconds for real-time feel
    refetchInterval: timeRange === "live" ? 3000 : timeRange === "15m" || timeRange === "1h" ? 10000 : 30000,
  });

  // Combine fetched activities with live activities (for live mode only)
  const displayActivities = timeRange === "live" 
    ? [...liveActivities, ...(activities || [])].filter((activity, index, self) => 
        index === self.findIndex(a => a.id === activity.id)
      )
    : activities;

  // RAW activities — unfiltered by `usOnly` / `excludeInternal`. Powers the
  // enriched source breakdown and Pinterest drilldown so the panel can
  // honestly explain why visible counts shift when toggles change.
  const { data: rawActivities } = useQuery({
    queryKey: ["visitor-activities-raw", timeRange],
    queryFn: async () => {
      const timeRangeMs = getTimeRangeMs();
      const since = new Date(Date.now() - timeRangeMs).toISOString();
      const { data, error } = await supabase
        .from("visitor_activity")
        .select("session_id,visitor_id,country,city,page_path,referrer,referrer_category,utm_source,utm_medium,utm_campaign,utm_content,is_internal,is_bot_suspect,bot_suspect_reason,traffic_quality,activity_type,device_type,browser,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
    refetchInterval: 60000,
  });

  // Helper to check if activity matches source filter
  const matchesSourceFilter = (a: VisitorActivity): boolean => {
    if (sourceFilter === "all") return true;
    const canonical = resolveCanonicalSource({
      utm_source: a.utm_source ?? null,
      utm_medium: a.utm_medium ?? null,
      utm_campaign: a.utm_campaign ?? null,
      referrer: a.referrer ?? null,
      referrer_category: a.referrer_category ?? null,
      page_path: a.page_path ?? null,
    });
    return canonical === sourceFilter;
  };

  // Filter activities based on selected activity type AND source
  // ------------------------------------------------------------------
  // PR-1 analytics-truth: the counter/badge/CSV/Summary path now derives
  // exclusively from `analytics-canonical` via `useAnalyticsTruth`. The
  // visitor_activity fetch above is retained ONLY to supply lat/lng and
  // activity_type for the map/heatmap animation. Its rows are intersected
  // with the truth session set below so map markers cannot drift from the
  // certified counter values.
  // ------------------------------------------------------------------
  const truthHoursRaw = getTimeRangeMs() / 3_600_000;
  const truthHours = Math.max(1, Math.round(truthHoursRaw)); // canonical fn floors sub-hour ranges to 1h
  const { data: truth } = useAnalyticsTruth({
    hours: truthHours,
    geo: usOnly ? "US" : "all",
    refetchIntervalMs: timeRange === "live" ? 10_000 : 60_000,
  });

  // Canonical map model — the SAME truth session list powers counters, CSV,
  // Summary, visible markers, and the heatmap source. `visitor_activity` is
  // no longer a marker truth source; it remains only for diagnostic audit
  // tables and realtime notification toasts.
  const mapModel = useMemo(
    () => buildWorldMapModel(truth?.sessions ?? [], { activityFilter, sourceFilter, usOnly, excludeInternal }),
    [truth, activityFilter, sourceFilter, usOnly, excludeInternal],
  );
  const sourceFilterSessions = mapModel.sourceFilterSessions;
  const truthSessions = mapModel.truthSessions;
  const markerFeatures = mapModel.markerFeatures;
  const heatmapFeatures = mapModel.heatmapFeatures;
  const mapDiagnostics = mapModel.diagnostics;

  const truthCounters = useMemo(() => countersFromSessions(truthSessions), [truthSessions]);
  const filteredActivities: WorldMapMarkerFeature[] | undefined = truth ? markerFeatures : displayActivities?.filter((a) => {
    if (!(activityFilter === "all" || a.activity_type === activityFilter)) return false;
    if (!matchesSourceFilter(a)) return false;
    return true;
  }).filter((a): a is VisitorActivity & { latitude: number; longitude: number } => (
    typeof a.latitude === "number" &&
    typeof a.longitude === "number" &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude)
  )).map((a) => ({ ...a, source: a.utm_source || a.referrer_category || "direct", is_internal: false }));

  // Subscribe to realtime updates with checkout notifications
  useEffect(() => {
    const channel = supabase
      .channel("visitor-activity-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "visitor_activity",
        },
        (payload) => {
          const newActivity = payload.new as VisitorActivity;
          const location = newActivity.city || newActivity.country || "Onbekende locatie";
          
          // In live mode, add activity to live activities list for instant display
          if (timeRange === "live") {
            setLiveActivities(prev => {
              // Keep only activities from last 15 minutes to match other components
              const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
              const filtered = prev.filter(a => a.created_at > fifteenMinutesAgo);
              return [newActivity, ...filtered];
            });
          }
          
          // Show notification for new checkouts
          if (newActivity.activity_type === "checkout" && checkoutNotifications) {
            triggerNotification();
            toast({
              title: "🎉 Nieuwe checkout!",
              description: `Een klant uit ${location} is aan het afrekenen`,
              duration: 5000,
            });
            // Send browser push notification
            if (pushEnabled) {
              sendNotification({
                title: "🎉 Nieuwe checkout!",
                body: `Een klant uit ${location} is aan het afrekenen`,
                tag: `checkout-${newActivity.id}`,
                requireInteraction: true,
              });
            }
          }
          
          // Show notification for new cart additions
          if (newActivity.activity_type === "cart" && cartNotifications) {
            triggerNotification();
            toast({
              title: "🛒 Nieuw in winkelwagen!",
              description: `Een klant uit ${location} heeft iets toegevoegd`,
              duration: 4000,
            });
            // Send browser push notification
            if (pushEnabled) {
              sendNotification({
                title: "🛒 Nieuw in winkelwagen!",
                body: `Een klant uit ${location} heeft iets toegevoegd`,
                tag: `cart-${newActivity.id}`,
              });
            }
          }
          
          if (timeRange !== "live") {
            refetch();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "visitor_activity",
        },
        () => {
          if (timeRange !== "live") {
            refetch();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, triggerNotification, checkoutNotifications, cartNotifications, notificationMode, timeRange, pushEnabled, sendNotification]);

  // Initialize map - triggers when container becomes ready
  useEffect(() => {
    if (!mapContainerRef.current || map.current) return;

    const initMap = async () => {
      try {
        // Use cached token or fetch new one
        let token = mapTokenRef.current;
        
        if (!token) {
          mapPerfMark("token-fetch-start");
          const { data, error } = await supabase.functions.invoke("get-mapbox-token");
          
          if (error || !data?.token) {
            console.error("[VisitorWorldMap] get-mapbox-token failed:", error);
            setMapError(
              "Map provider unavailable. Add MAPBOX_PUBLIC_TOKEN in Lovable Cloud → Settings → Secrets. " +
              "All other analytics on this dashboard continue to work."
            );
            return;
          }
          token = data.token;
          mapTokenRef.current = token;
          mapPerfMark("token-fetch-end");
        } else {
          mapPerfMark("token-fetch-start");
          mapPerfMark("token-fetch-end");
        }

        mapboxgl.accessToken = token;

        map.current = new mapboxgl.Map({
          container: mapContainerRef.current!,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: mapProjection,
          zoom: mapProjection === "mercator" ? 1.2 : 1.5,
          center: [10, 30],
          pitch: mapProjection === "mercator" ? 0 : 20,
          dragRotate: true,
          touchZoomRotate: true,
          touchPitch: true,
        });
        mapPerfMark("map-ctor");

        map.current.addControl(
          new mapboxgl.NavigationControl({
            visualizePitch: true,
          }),
          "top-right"
        );

        // Enable all touch and scroll interactions for mobile
        map.current.scrollZoom.enable();
        map.current.dragPan.enable();
        map.current.dragRotate.enable();
        map.current.touchZoomRotate.enable();
        map.current.touchPitch.enable();

        map.current.on("style.load", () => {
          mapPerfMark("style-load");
          map.current?.setFog({
            color: "rgb(20, 20, 30)",
            "high-color": "rgb(40, 40, 60)",
            "horizon-blend": 0.1,
          });
          setMapLoaded(true);
        });

        // Track user interaction
        map.current.on("mousedown", () => { userInteractingRef.current = true; });
        map.current.on("dragstart", () => { userInteractingRef.current = true; });
        map.current.on("mouseup", () => { userInteractingRef.current = false; });
        map.current.on("touchstart", () => { userInteractingRef.current = true; });
        map.current.on("touchend", () => { userInteractingRef.current = false; });
      } catch (err) {
        console.error("Map initialization error:", err);
        setMapError("Fout bij het laden van de kaart.");
      }
    };

    initMap();
  }, [mapContainerReady]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("map-auto-rotate", String(autoRotate));
    
    if (spinIntervalRef.current) {
      clearInterval(spinIntervalRef.current);
      spinIntervalRef.current = null;
    }

    if (autoRotate && map.current && mapLoaded) {
      const spinGlobe = () => {
        if (!map.current || userInteractingRef.current) return;
        const zoom = map.current.getZoom();
        if (zoom < 3) {
          const center = map.current.getCenter();
          center.lng -= 1;
          map.current.easeTo({ center, duration: 1000, easing: (n) => n });
        }
      };

      spinIntervalRef.current = setInterval(spinGlobe, 1000);
    }

    return () => {
      if (spinIntervalRef.current) {
        clearInterval(spinIntervalRef.current);
        spinIntervalRef.current = null;
      }
    };
  }, [autoRotate, mapLoaded]);

  // Update canonical Mapbox source/layers. Markers and heatmap points are both
  // generated from `analytics-canonical.sessions[]` with valid lat/lng — no
  // parallel `visitor_activity` visual truth.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    if (!mapInstance.isStyleLoaded()) {
      const onIdle = () => {
        setRenderedMapboxSourceFeatureCount(markerFeatures.length);
      };
      mapInstance.once("idle", onIdle);
      return;
    }
    const geojsonData = markerFeaturesToGeoJson(markerFeatures);
    const existingSource = mapInstance.getSource("visitor-map-source") as mapboxgl.GeoJSONSource | undefined;

    if (existingSource) {
      existingSource.setData(geojsonData);
    } else {
      mapInstance.addSource("visitor-map-source", {
        type: "geojson",
        data: geojsonData,
      });
    }

    if (!mapInstance.getLayer("visitor-heatmap")) {
      mapInstance.addLayer({
        id: "visitor-heatmap",
        type: "heatmap",
        source: "visitor-map-source",
        layout: { visibility: showHeatmap ? "visible" : "none" },
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0, 0, 255, 0)",
            0.1, "rgba(65, 105, 225, 0.5)",
            0.3, "rgba(0, 255, 255, 0.6)",
            0.5, "rgba(0, 255, 0, 0.7)",
            0.7, "rgba(255, 255, 0, 0.8)",
            0.9, "rgba(255, 165, 0, 0.9)",
            1, "rgba(255, 0, 0, 1)"
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 15, 9, 30],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.95, 7, 1, 9, 0.5],
        },
      });
    }

    if (!mapInstance.getLayer("visitor-markers")) {
      mapInstance.addLayer({
        id: "visitor-markers",
        type: "circle",
        source: "visitor-map-source",
        layout: { visibility: showHeatmap ? "none" : "visible" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 5, 2, 8, 6, 14],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.9,
          "circle-blur": 0.05,
        },
      });
    }

    mapInstance.setLayoutProperty("visitor-heatmap", "visibility", showHeatmap ? "visible" : "none");
    mapInstance.setLayoutProperty("visitor-markers", "visibility", showHeatmap ? "none" : "visible");
    markersRef.current.forEach((marker) => {
      marker.getElement().style.display = showHeatmap ? "none" : "block";
    });

    setRenderedMapboxSourceFeatureCount(geojsonData.features.length);
    const updateRenderedCount = () => {
      try {
        const rendered = mapInstance.querySourceFeatures("visitor-map-source").length;
        setRenderedMapboxSourceFeatureCount(rendered || geojsonData.features.length);
      } catch {
        setRenderedMapboxSourceFeatureCount(geojsonData.features.length);
      }
    };
    if (mapInstance.loaded()) updateRenderedCount();
    else mapInstance.once("idle", updateRenderedCount);
  }, [showHeatmap, markerFeatures, mapLoaded]);

  // Auto-fly map to show filtered visitors when source filter changes
  useEffect(() => {
    if (!map.current || !mapLoaded || markerFeatures.length === 0) return;
    if (sourceFilter === "all") return; // Don't auto-fly for "all"

    const withCoords = markerFeatures;

    // Calculate bounding box
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    withCoords.forEach(a => {
      if (a.latitude! < minLat) minLat = a.latitude!;
      if (a.latitude! > maxLat) maxLat = a.latitude!;
      if (a.longitude! < minLng) minLng = a.longitude!;
      if (a.longitude! > maxLng) maxLng = a.longitude!;
    });

    // Fly to the center of all filtered visitors
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    const span = Math.max(latSpan, lngSpan);
    const zoom = span < 1 ? 6 : span < 5 ? 4 : span < 20 ? 3 : 2;

    map.current.flyTo({
      center: [centerLng, centerLat],
      zoom,
      duration: 1500,
    });
  }, [sourceFilter, markerFeatures, mapLoaded]);

  // Keep canonical geo features in view after the canonical response loads.
  useEffect(() => {
    if (!map.current || !mapLoaded || markerFeatures.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    markerFeatures.forEach((feature) => bounds.extend([feature.longitude, feature.latitude]));
    if (bounds.isEmpty()) return;
    map.current.fitBounds(bounds, {
      padding: isFullscreen ? 80 : 60,
      maxZoom: markerFeatures.length === 1 ? 5 : 3.5,
      duration: 900,
    });
  }, [markerFeatures, mapLoaded, isFullscreen]);

  // Update markers when activities change
  useEffect(() => {
    if (!map.current || !mapLoaded || !filteredActivities) return;

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Group activities by location (rounded to 1 decimal for clustering)
    const locationGroups = new Map<string, VisitorActivity[]>();
    
    filteredActivities.forEach((activity) => {
      if (activity.latitude && activity.longitude) {
        const key = `${activity.latitude.toFixed(1)},${activity.longitude.toFixed(1)}`;
        if (!locationGroups.has(key)) {
          locationGroups.set(key, []);
        }
        locationGroups.get(key)!.push(activity);
      }
    });

    // Create markers for each location group
    locationGroups.forEach((groupActivities, key) => {
      const [lat, lng] = key.split(",").map(Number);
      
      // Determine the most "advanced" activity type at this location
      let dominantType: "browsing" | "cart" | "checkout" = "browsing";
      if (groupActivities.some(a => a.activity_type === "checkout")) {
        dominantType = "checkout";
      } else if (groupActivities.some(a => a.activity_type === "cart")) {
        dominantType = "cart";
      }

      // Check if any activity is from Pinterest
      const hasPinterest = groupActivities.some(a => 
        a.utm_source === "pinterest" || 
        (a.referrer_category === "social" && !a.utm_source)
      );
      const pinterestCount = groupActivities.filter(a => 
        a.utm_source === "pinterest" || 
        (a.referrer_category === "social" && !a.utm_source)
      ).length;

      // Determine marker color - use source color if filtering by source, otherwise activity color
      const color = sourceFilter !== "all" 
        ? (SOURCE_COLORS[sourceFilter] || ACTIVITY_COLORS[dominantType])
        : ACTIVITY_COLORS[dominantType];
      const count = groupActivities.length;
      const size = Math.min(12 + count * 2, 30);

      // Check if any activity at this location is checkout
      const hasCheckout = groupActivities.some(a => a.activity_type === "checkout");

      // Create custom marker element
      const el = document.createElement("div");
      el.className = "visitor-marker";
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: 2px solid ${hasPinterest && sourceFilter === "all" ? "#E60023" : "white"};
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 ${size}px ${color}80, 0 0 ${size * 2}px ${color}40;
        animation: pulse 2s ease-in-out infinite;
        display: ${showHeatmap ? "none" : "block"};
        position: relative;
      `;

      // Add Pinterest badge icon when source filter is "all" and has Pinterest traffic
      if (hasPinterest && sourceFilter === "all") {
        const pinterestBadge = document.createElement("div");
        pinterestBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>`;
        pinterestBadge.style.cssText = `
          position: absolute;
          top: -10px;
          left: -10px;
          width: 18px;
          height: 18px;
          background: #E60023;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;
        el.appendChild(pinterestBadge);
      }

      // Add shopping cart icon for checkout activities
      if (hasCheckout) {
        const cartIcon = document.createElement("div");
        cartIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`;
        cartIcon.style.cssText = `
          position: absolute;
          top: -8px;
          right: -8px;
          width: 18px;
          height: 18px;
          background: #22c55e;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          animation: bounce 1s ease-in-out infinite;
        `;
        el.appendChild(cartIcon);
      }

      // Add pulse and bounce animations
      if (!document.getElementById("marker-styles")) {
        const style = document.createElement("style");
        style.id = "marker-styles";
        style.textContent = `
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
        `;
        document.head.appendChild(style);
      }

      // Build source breakdown for popup
      const sourceBreakdown = new Map<string, number>();
      groupActivities.forEach(a => {
        const source = a.utm_source || a.referrer_category || "direct";
        sourceBreakdown.set(source, (sourceBreakdown.get(source) || 0) + 1);
      });

      // Create popup content with source info
      const popupContent = `
        <div style="padding: 8px; min-width: 150px;">
          <strong>${groupActivities[0].city || groupActivities[0].country || "Onbekend"}</strong>
          <div style="margin-top: 4px; font-size: 12px;">
            ${count} bezoeker${count > 1 ? "s" : ""}
          </div>
          <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
            ${Object.entries(ACTIVITY_COLORS).map(([type, c]) => {
              const typeCount = groupActivities.filter(a => a.activity_type === type).length;
              if (typeCount === 0) return "";
              return `<span style="background: ${c}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${typeCount} ${ACTIVITY_LABELS[type as keyof typeof ACTIVITY_LABELS]}</span>`;
            }).join("")}
          </div>
          ${hasPinterest ? `
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 4px; font-size: 11px;">
              <span style="background: #E60023; color: white; padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; gap: 3px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                ${pinterestCount} via Pinterest
              </span>
            </div>
          ` : ""}
          ${Array.from(sourceBreakdown.entries()).filter(([s]) => s !== "social" || !hasPinterest).length > 1 ? `
            <div style="margin-top: 4px; font-size: 10px; color: #888;">
              ${Array.from(sourceBreakdown.entries())
                .filter(([s]) => !(s === "social" && hasPinterest))
                .map(([source, cnt]) => `${SOURCE_LABELS[source] || source}: ${cnt}`)
                .join(" · ")}
            </div>
          ` : ""}
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(popupContent);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
    mapPerfMark("first-paint");
  }, [filteredActivities, mapLoaded, showHeatmap, activityFilter, sourceFilter]);

  // Update hot spot markers when data changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing hot spot markers
    hotSpotMarkersRef.current.forEach((marker) => marker.remove());
    hotSpotMarkersRef.current = [];

    if (!showHotSpots || showHeatmap) return;

    // Add hot spot markers after topLocations is calculated (we'll use a timeout to ensure calculation is done)
    const addHotSpotMarkers = () => {
      if (!filteredActivities || filteredActivities.length === 0) return;

      // Calculate hot spots inline for the effect
      const cityMap = new Map<string, { 
        sessions: Set<string>; 
        checkoutSessions: Set<string>;
        activities: VisitorActivity[];
      }>();

      filteredActivities.forEach((activity) => {
        const city = activity.city || "Onbekend";
        const country = activity.country || "Onbekend";
        if (city === "Onbekend") return;

        const cityKey = `${city}, ${country}`;
        if (!cityMap.has(cityKey)) {
          cityMap.set(cityKey, { 
            sessions: new Set(),
            checkoutSessions: new Set(),
            activities: []
          });
        }
        const cityStats = cityMap.get(cityKey)!;
        cityStats.sessions.add(activity.session_id);
        if (activity.activity_type === "checkout") cityStats.checkoutSessions.add(activity.session_id);
        if (activity.latitude && activity.longitude) cityStats.activities.push(activity);
      });

      const hotSpots = Array.from(cityMap.entries())
        .map(([name, stats]) => {
          const visitors = stats.sessions.size;
          const checkoutUsers = stats.checkoutSessions.size;
          const checkoutRate = visitors > 0 ? (checkoutUsers / visitors) * 100 : 0;
          
          const avgLat = stats.activities.length > 0 
            ? stats.activities.reduce((sum, a) => sum + (a.latitude || 0), 0) / stats.activities.length 
            : null;
          const avgLng = stats.activities.length > 0 
            ? stats.activities.reduce((sum, a) => sum + (a.longitude || 0), 0) / stats.activities.length 
            : null;
          
          return { name, visitors, checkoutUsers, checkoutRate, latitude: avgLat, longitude: avgLng };
        })
        .filter(spot => spot.visitors >= 2 && spot.checkoutRate > 0 && spot.latitude && spot.longitude)
        .sort((a, b) => b.checkoutRate - a.checkoutRate)
        .slice(0, 5);

      // Create hot spot markers with special styling
      hotSpots.forEach((spot, index) => {
        const size = 60 + (5 - index) * 10; // Larger for higher conversion
        const pulseSize = size * 2;
        
        const el = document.createElement("div");
        el.className = "hot-spot-marker";
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          position: relative;
          pointer-events: auto;
          cursor: pointer;
        `;

        // Outer pulsing ring
        const pulseRing = document.createElement("div");
        pulseRing.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          width: ${pulseSize}px;
          height: ${pulseSize}px;
          transform: translate(-50%, -50%);
          border: 3px solid rgba(34, 197, 94, 0.6);
          border-radius: 50%;
          animation: hotSpotPulse 2s ease-out infinite;
        `;
        el.appendChild(pulseRing);

        // Inner glowing circle
        const innerCircle = document.createElement("div");
        innerCircle.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          width: ${size * 0.6}px;
          height: ${size * 0.6}px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(34, 197, 94, 0.8) 0%, rgba(34, 197, 94, 0.3) 50%, transparent 70%);
          border-radius: 50%;
          box-shadow: 0 0 ${size}px rgba(34, 197, 94, 0.8), 0 0 ${size * 2}px rgba(34, 197, 94, 0.4);
        `;
        el.appendChild(innerCircle);

        // Center badge with conversion rate
        const badge = document.createElement("div");
        badge.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
          font-size: 11px;
          font-weight: bold;
          padding: 4px 8px;
          border-radius: 12px;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          gap: 4px;
        `;
        badge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>${spot.checkoutRate.toFixed(0)}%`;
        el.appendChild(badge);

        // Add hot spot animation styles
        if (!document.getElementById("hot-spot-styles")) {
          const style = document.createElement("style");
          style.id = "hot-spot-styles";
          style.textContent = `
            @keyframes hotSpotPulse {
              0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
              100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
            }
          `;
          document.head.appendChild(style);
        }

        // Create popup
        const popupContent = `
          <div style="padding: 10px; min-width: 180px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
              <span style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">🔥 HOT SPOT #${index + 1}</span>
            </div>
            <strong style="font-size: 14px;">${spot.name}</strong>
            <div style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div style="text-align: center; padding: 6px; background: rgba(34, 197, 94, 0.1); border-radius: 6px;">
                <div style="font-size: 18px; font-weight: bold; color: #22c55e;">${spot.checkoutRate.toFixed(1)}%</div>
                <div style="font-size: 10px; color: #666;">Conversie</div>
              </div>
              <div style="text-align: center; padding: 6px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
                <div style="font-size: 18px; font-weight: bold; color: #3b82f6;">${spot.visitors}</div>
                <div style="font-size: 10px; color: #666;">Bezoekers</div>
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #666; text-align: center;">
              ${spot.checkoutUsers} van ${spot.visitors} bezoekers geconverteerd
            </div>
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(popupContent);

        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([spot.longitude!, spot.latitude!])
          .setPopup(popup)
          .addTo(map.current!);

        hotSpotMarkersRef.current.push(marker);
      });
    };

    addHotSpotMarkers();
  }, [filteredActivities, mapLoaded, showHotSpots, showHeatmap]);

  // Counters — derived from truth.sessions when available, so badges here
  // ≡ CSV totals ≡ Summary totals ≡ Clean Analytics Panel. Fallback to the
  // legacy visitor_activity aggregation only while the canonical fetch is
  // still in flight, and warn so any regression is loud.
  const counts = truth
    ? {
        browsing: truthSessions.filter(
          (s) => !s.has_add_to_cart && !s.has_view_cart && !s.has_checkout,
        ).length,
        cart: truthSessions.filter(
          (s) => (s.has_add_to_cart || s.has_view_cart) && !s.has_checkout,
        ).length,
        checkout: truthSessions.filter((s) => s.has_checkout).length,
      }
    : {
        browsing: filteredActivities?.filter((a) => a.activity_type === "browsing").length || 0,
        cart: filteredActivities?.filter((a) => a.activity_type === "cart").length || 0,
        checkout: filteredActivities?.filter((a) => a.activity_type === "checkout").length || 0,
      };

  const totalVisitors = truth
    ? truthCounters.visitors
    : new Set(filteredActivities?.map((a) => a.session_id)).size;

  if (import.meta.env.DEV && truth && filteredActivities) {
    if (!assertWorldMapRenderInvariant(mapDiagnostics)) {
      // eslint-disable-next-line no-console
      console.warn(
        "[analytics-truth] canonical sessions have geo but produced no rendered map features",
        { ...mapDiagnostics, timeRange, usOnly, excludeInternal, sourceFilter },
      );
    }
  }

  // Enriched audit breakdown + Pinterest drilldown — unfiltered (raw) data so
  // the panel exposes internal/bot/preview traffic that the active toggles
  // are hiding from the map.
  const enrichedBreakdown = buildEnrichedBreakdown(rawActivities ?? []);
  const pinterestAudit = buildPinterestDrilldown(rawActivities ?? []);

  // Source classification breakdown — built from displayActivities (after
  // internal/US filters but BEFORE source filter), so it always tells the
  // truth about what classification each session got. Matches Attribution
  // Compare totals because both call resolveCanonicalSource().
  const sourceBreakdown = (() => {
    const map = new Map<CanonicalSource, { visitors: Set<string>; pageviews: number; cart: number; checkout: number; purchase: number }>();
    for (const s of CANONICAL_SOURCES) {
      map.set(s, { visitors: new Set(), pageviews: 0, cart: 0, checkout: 0, purchase: 0 });
    }
    (displayActivities ?? []).forEach((a) => {
      const canonical = resolveCanonicalSource({
        utm_source: a.utm_source ?? null,
        utm_medium: a.utm_medium ?? null,
        utm_campaign: a.utm_campaign ?? null,
        referrer: a.referrer ?? null,
        referrer_category: a.referrer_category ?? null,
        page_path: a.page_path ?? null,
      });
      const bucket = map.get(canonical)!;
      bucket.visitors.add(a.session_id);
      bucket.pageviews += 1;
      if (a.activity_type === "cart") bucket.cart += 1;
      else if (a.activity_type === "checkout" || a.activity_type === "begin_checkout") bucket.checkout += 1;
      else if (a.activity_type === "purchase") bucket.purchase += 1;
    });
    return CANONICAL_SOURCES.map((s) => {
      const b = map.get(s)!;
      return { source: s, visitors: b.visitors.size, pageviews: b.pageviews, cart: b.cart, checkout: b.checkout, purchase: b.purchase };
    });
  })();

  // Get selected time range label
  const selectedTimeRangeLabel = TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label || "Laatste 24 uur";

  // Calculate top locations with conversion rates
  const topLocations = (() => {
    if (!filteredActivities) return { countries: [], cities: [], hotSpots: [], summary: { totalVisitors: 0, browsingOnly: 0, addedToCart: 0, completed: 0 } };

    // Track sessions by their highest activity level
    const sessionHighestActivity = new Map<string, "browsing" | "cart" | "checkout">();
    
    filteredActivities.forEach((activity) => {
      const current = sessionHighestActivity.get(activity.session_id);
      const activityRank: Record<string, number> = { browsing: 1, product_view: 1, view_cart: 2, add_to_cart: 2, cart: 2, begin_checkout: 3, checkout: 3, purchase: 4 };
      const bucket: "browsing" | "cart" | "checkout" =
        activity.activity_type === "cart" || activity.activity_type === "add_to_cart" || activity.activity_type === "view_cart"
          ? "cart"
          : activity.activity_type === "checkout" || activity.activity_type === "begin_checkout" || activity.activity_type === "purchase"
            ? "checkout"
            : "browsing";
      if (!current || activityRank[activity.activity_type] > activityRank[current]) {
        sessionHighestActivity.set(activity.session_id, bucket);
      }
    });

    // Group by country with detailed conversion tracking
    const countryMap = new Map<string, { 
      sessions: Set<string>; 
      browsingSessions: Set<string>;
      cartSessions: Set<string>;
      checkoutSessions: Set<string>;
    }>();
    
    // Group by city with detailed conversion tracking
    const cityMap = new Map<string, { 
      country: string;
      sessions: Set<string>; 
      browsingSessions: Set<string>;
      cartSessions: Set<string>;
      checkoutSessions: Set<string>;
    }>();

    filteredActivities.forEach((activity) => {
      const country = activity.country || "Onbekend";
      const city = activity.city || "Onbekend";
      const sessionId = activity.session_id;

      // Country stats
      if (!countryMap.has(country)) {
        countryMap.set(country, { 
          sessions: new Set(), 
          browsingSessions: new Set(),
          cartSessions: new Set(),
          checkoutSessions: new Set()
        });
      }
      const countryStats = countryMap.get(country)!;
      countryStats.sessions.add(sessionId);
      if (activity.activity_type === "browsing") countryStats.browsingSessions.add(sessionId);
      if (activity.activity_type === "cart") countryStats.cartSessions.add(sessionId);
      if (activity.activity_type === "checkout") countryStats.checkoutSessions.add(sessionId);

      // City stats (skip unknown cities)
      if (city !== "Onbekend") {
        const cityKey = `${city}, ${country}`;
        if (!cityMap.has(cityKey)) {
          cityMap.set(cityKey, { 
            country, 
            sessions: new Set(),
            browsingSessions: new Set(),
            cartSessions: new Set(),
            checkoutSessions: new Set()
          });
        }
        const cityStats = cityMap.get(cityKey)!;
        cityStats.sessions.add(sessionId);
        if (activity.activity_type === "browsing") cityStats.browsingSessions.add(sessionId);
        if (activity.activity_type === "cart") cityStats.cartSessions.add(sessionId);
        if (activity.activity_type === "checkout") cityStats.checkoutSessions.add(sessionId);
      }
    });

    // Convert to sorted arrays with conversion rates
    const countries = Array.from(countryMap.entries())
      .map(([name, stats]) => {
        const visitors = stats.sessions.size;
        const cartUsers = stats.cartSessions.size;
        const checkoutUsers = stats.checkoutSessions.size;
        return {
          name,
          visitors,
          cartUsers,
          checkoutUsers,
          cartRate: visitors > 0 ? (cartUsers / visitors) * 100 : 0,
          checkoutRate: visitors > 0 ? (checkoutUsers / visitors) * 100 : 0,
          cartToCheckoutRate: cartUsers > 0 ? (checkoutUsers / cartUsers) * 100 : 0,
        };
      })
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10);

    const cities = Array.from(cityMap.entries())
      .map(([name, stats]) => {
        const visitors = stats.sessions.size;
        const cartUsers = stats.cartSessions.size;
        const checkoutUsers = stats.checkoutSessions.size;
        return {
          name,
          country: stats.country,
          visitors,
          cartUsers,
          checkoutUsers,
          cartRate: visitors > 0 ? (cartUsers / visitors) * 100 : 0,
          checkoutRate: visitors > 0 ? (checkoutUsers / visitors) * 100 : 0,
          cartToCheckoutRate: cartUsers > 0 ? (checkoutUsers / cartUsers) * 100 : 0,
        };
      })
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10);

    // Calculate overall summary
    let browsingOnly = 0;
    let addedToCart = 0;
    let completed = 0;
    sessionHighestActivity.forEach((level) => {
      if (level === "browsing") browsingOnly++;
      else if (level === "cart") addedToCart++;
      else if (level === "checkout") completed++;
    });

    // Calculate hot spots - cities with high conversion rates (min 3 visitors, checkout rate > 0)
    const hotSpots = Array.from(cityMap.entries())
      .map(([name, stats]) => {
        const visitors = stats.sessions.size;
        const checkoutUsers = stats.checkoutSessions.size;
        const checkoutRate = visitors > 0 ? (checkoutUsers / visitors) * 100 : 0;
        
        // Find average coordinates for this city
        const cityActivities = filteredActivities.filter(a => 
          a.city === name.split(", ")[0] && a.latitude && a.longitude
        );
        const avgLat = cityActivities.length > 0 
          ? cityActivities.reduce((sum, a) => sum + (a.latitude || 0), 0) / cityActivities.length 
          : null;
        const avgLng = cityActivities.length > 0 
          ? cityActivities.reduce((sum, a) => sum + (a.longitude || 0), 0) / cityActivities.length 
          : null;
        
        return {
          name,
          visitors,
          checkoutUsers,
          checkoutRate,
          latitude: avgLat,
          longitude: avgLng,
        };
      })
      .filter(spot => spot.visitors >= 2 && spot.checkoutRate > 0 && spot.latitude && spot.longitude)
      .sort((a, b) => b.checkoutRate - a.checkoutRate)
      .slice(0, 5);

    return { 
      countries, 
      cities, 
      hotSpots,
      summary: {
        totalVisitors: sessionHighestActivity.size,
        browsingOnly,
        addedToCart,
        completed
      }
    };
  })();

  // ---------------------------------------------------------------------------
  // Export to CSV — "alles wat we meten" voor de gekozen tijdsperiode.
  //
  // Strategie: we negeren `filteredActivities` (UI-filters) en halen één
  // verse, volledige snapshot op uit `visitor_activity` zonder kolom-pruning.
  // Per row voegen we session-level afgeleide velden toe (sessie-duur,
  // pageviews, terugkerend via visitor_id) zodat de CSV stand-alone leesbaar
  // is in Excel/Sheets/pandas zonder extra joins.
  // ---------------------------------------------------------------------------
  const [isExporting, setIsExporting] = useState(false);

  // ---------------------------------------------------------------------
  // CSV export — serializes the SAME truth-filtered session list that
  // powers the counters and badges. No parallel visitor_activity fetch.
  // Certification: Map counter cart === CSV cart === Summary cart ===
  // Clean Analytics Panel cart, for the same (timeRange, filters).
  // ---------------------------------------------------------------------
  const exportToCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      if (truthSessions.length === 0) {
        toast({ title: "Geen data", description: "Geen bezoekersactiviteit in deze periode.", duration: 3000 });
        return;
      }
      const headers = [
        "session_id", "visitor_id", "first_seen_at", "last_seen_at",
        "session_duration_seconds", "page_views",
        "country", "city", "latitude", "longitude",
        "source", "device", "utm_source", "utm_medium", "utm_campaign",
        "referrer", "page_path",
        "has_product_view", "has_add_to_cart", "has_view_cart",
        "has_checkout", "has_purchase", "order_value", "is_internal",
      ];
      const escape = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "string" ? v : String(v);
        if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows = truthSessions.map((s) => {
        const dur = Math.max(0, Math.round(
          (new Date(s.last_seen_at).getTime() - new Date(s.first_seen_at).getTime()) / 1000,
        ));
        return [
          s.session_id, s.visitor_id ?? "", s.first_seen_at, s.last_seen_at,
          dur, s.page_views,
          s.country ?? "", s.city ?? "", s.latitude ?? "", s.longitude ?? "",
          s.source, s.device ?? "", s.utm_source ?? "", s.utm_medium ?? "", s.utm_campaign ?? "",
          s.referrer ?? "", s.page_path ?? "",
          s.has_product_view, s.has_add_to_cart, s.has_view_cart,
          s.has_checkout, s.has_purchase, s.order_value, s.is_internal,
        ].map(escape).join(";");
      });
      const csvContent = [headers.join(";"), ...rows].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `bezoekers-${timeRange}-${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Export gereed",
        description: `${truthSessions.length} sessies · ${truthCounters.add_to_cart} ATC · ${truthCounters.checkout_started} checkout (canonical-truth)`,
        duration: 3000,
      });
    } catch (err) {
      console.error("CSV export error", err);
      toast({
        title: "Export mislukt",
        description: err instanceof Error ? err.message : "Onbekende fout",
        duration: 4000,
      });
    } finally {
      setIsExporting(false);
    }
  }, [timeRange, truthSessions, truthCounters]);

  // ---------------------------------------------------------------------------
  // Summary report — kort .md rapport met totalen per land, per bron en
  // gemiddelde sessieduur voor dezelfde periode als de CSV. Ontworpen om
  // direct in Slack/Notion te plakken zonder verdere bewerking.
  // ---------------------------------------------------------------------------
  const [isSummarizing, setIsSummarizing] = useState(false);

  // ---------------------------------------------------------------------
  // Summary export — iterates the SAME truth-filtered session list. Cart
  // and Checkout totals here are byte-identical to the counter badges and
  // to the CSV totals for the same filter selection.
  // ---------------------------------------------------------------------
  const exportSummary = useCallback(async () => {
    setIsSummarizing(true);
    try {
      if (truthSessions.length === 0) {
        toast({ title: "Geen data", description: "Geen bezoekersactiviteit in deze periode.", duration: 3000 });
        return;
      }
      type Bucket = { sessions: number; cart: number; checkout: number; revenue: number };
      const byCountry = new Map<string, Bucket>();
      const bySource = new Map<string, Bucket>();
      const durations: number[] = [];
      for (const s of truthSessions) {
        const dur = Math.max(0, Math.round(
          (new Date(s.last_seen_at).getTime() - new Date(s.first_seen_at).getTime()) / 1000,
        ));
        durations.push(dur);
        const country = s.country || "Onbekend";
        const c = byCountry.get(country) || { sessions: 0, cart: 0, checkout: 0, revenue: 0 };
        c.sessions++;
        if (s.has_add_to_cart || s.has_view_cart) c.cart++;
        if (s.has_checkout) c.checkout++;
        c.revenue += s.order_value;
        byCountry.set(country, c);
        const src = bySource.get(s.source) || { sessions: 0, cart: 0, checkout: 0, revenue: 0 };
        src.sessions++;
        if (s.has_add_to_cart || s.has_view_cart) src.cart++;
        if (s.has_checkout) src.checkout++;
        src.revenue += s.order_value;
        bySource.set(s.source, src);
      }
      const sortedDur = [...durations].sort((a, b) => a - b);
      const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
      const medianDuration = sortedDur.length
        ? sortedDur.length % 2
          ? sortedDur[(sortedDur.length - 1) / 2]
          : Math.round((sortedDur[sortedDur.length / 2 - 1] + sortedDur[sortedDur.length / 2]) / 2)
        : 0;
      const fmtDur = (sec: number) => {
        if (sec < 60) return `${sec}s`;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m < 60 ? `${m}m ${s}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
      };
      const fmtPct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
      const fmtRev = (n: number) => (n ? `$${n.toFixed(2)}` : "—");

      const periodLabel = TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label ?? timeRange;
      const sortedCountries = Array.from(byCountry.entries()).sort((a, b) => b[1].sessions - a[1].sessions);
      const sortedSources = Array.from(bySource.entries()).sort((a, b) => b[1].sessions - a[1].sessions);

      const lines: string[] = [];
      lines.push(`# Bezoekersrapport — ${periodLabel}`);
      lines.push("");
      lines.push(`_Gegenereerd: ${new Date().toLocaleString("nl-NL")} · Bron: analytics-canonical (truth envelope)_`);
      lines.push("");
      lines.push("## Totalen");
      lines.push("");
      lines.push(`- Sessies: **${truthCounters.sessions}**`);
      lines.push(`- Unieke bezoekers: **${truthCounters.visitors}**`);
      lines.push(`- Pageviews: ${truthCounters.page_views}`);
      lines.push(`- Add to Cart: **${truthCounters.add_to_cart}** (${fmtPct(truthCounters.add_to_cart, truthCounters.sessions)})`);
      lines.push(`- View Cart: ${truthCounters.view_cart}`);
      lines.push(`- Checkout gestart: **${truthCounters.checkout_started}** (${fmtPct(truthCounters.checkout_started, truthCounters.sessions)})`);
      lines.push(`- Purchases: **${truthCounters.purchases}**`);
      lines.push(`- Omzet: ${fmtRev(truthCounters.revenue)}`);
      lines.push(`- Gem. sessieduur: **${fmtDur(avgDuration)}** (mediaan ${fmtDur(medianDuration)})`);
      lines.push("");
      lines.push("## Top landen");
      lines.push("");
      lines.push("| Land | Sessies | Cart | Checkout | CR | Omzet |");
      lines.push("|------|--------:|-----:|---------:|---:|------:|");
      for (const [country, v] of sortedCountries.slice(0, 25)) {
        lines.push(`| ${country} | ${v.sessions} | ${v.cart} | ${v.checkout} | ${fmtPct(v.checkout, v.sessions)} | ${fmtRev(v.revenue)} |`);
      }
      lines.push("");
      lines.push("## Verkeersbronnen");
      lines.push("");
      lines.push("| Bron | Sessies | Cart | Checkout | CR | Omzet |");
      lines.push("|------|--------:|-----:|---------:|---:|------:|");
      for (const [source, v] of sortedSources) {
        lines.push(`| ${source} | ${v.sessions} | ${v.cart} | ${v.checkout} | ${fmtPct(v.checkout, v.sessions)} | ${fmtRev(v.revenue)} |`);
      }
      lines.push("");

      const md = lines.join("\n");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `bezoekers-samenvatting-${timeRange}-${new Date().toISOString().split("T")[0]}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Samenvatting gereed",
        description: `${truthCounters.sessions} sessies · ATC ${truthCounters.add_to_cart} · checkout ${truthCounters.checkout_started} (canonical-truth)`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Summary export error", err);
      toast({
        title: "Samenvatting mislukt",
        description: err instanceof Error ? err.message : "Onbekende fout",
        duration: 4000,
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [timeRange, truthSessions, truthCounters]);

  // Minimal fullscreen mode - only map with floating close button
  if (isFullscreen && fullscreenMinimal) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        {/* Floating controls */}
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toggleFullscreen(false)}
            className="bg-background/90 backdrop-blur-sm shadow-lg"
          >
            <X className="w-4 h-4 mr-2" />
            Sluiten
          </Button>
        </div>
        
        {/* Live Visitor Counter - Prominent Red Display (Fullscreen Minimal) */}
        <div className="absolute top-4 left-4 z-20 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-3 shadow-lg border border-red-500/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Users className="w-6 h-6 text-red-500" />
              {timeRange === "live" && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-red-500 tabular-nums leading-none" style={{ fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace", textShadow: "0 0 10px rgba(239, 68, 68, 0.5)" }}>
                {totalVisitors}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {timeRange === "live" ? "Nu online" : "Bezoekers"}
              </div>
            </div>
          </div>
          {counts.checkout > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-green-500" />
              <span className="text-green-500 font-semibold text-sm">{counts.checkout} aan het afrekenen</span>
            </div>
          )}
        </div>

        {/* Map Container with Error Handling */}
        {mapError ? (
          <div className="w-full h-full flex items-center justify-center bg-muted/50">
            <div className="text-center text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="mb-4">{mapError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleFullscreen(false)}
              >
                Terug
              </Button>
            </div>
          </div>
        ) : (
          <div ref={mapContainerCallback} className="w-full h-full" />
        )}

        {/* Performance dashboard overlay */}
        <MapPerfDashboard />

        {/* Custom Zoom Controls */}
        <div className="absolute bottom-8 left-4 flex flex-col gap-1 z-10">
          <Button
            variant="secondary"
            size="icon"
            className="h-12 w-12 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
            onClick={() => map.current?.zoomIn({ duration: 300 })}
            title="Inzoomen"
          >
            <ZoomIn className="w-5 h-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-12 w-12 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
            onClick={() => map.current?.zoomOut({ duration: 300 })}
            title="Uitzoomen"
          >
            <ZoomOut className="w-5 h-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-12 w-12 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background mt-1"
            onClick={() => {
              map.current?.flyTo({
                center: [10, 30],
                zoom: 1.5,
                pitch: 20,
                duration: 1000
              });
            }}
            title="Reset weergave"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className={`h-12 w-12 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background mt-1 ${autoRotate ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setAutoRotate(!autoRotate)}
            title={autoRotate ? "Stop rotatie" : "Start rotatie"}
          >
            <RotateCw className={`w-5 h-5 ${autoRotate ? "text-blue-500 animate-spin" : ""}`} style={{ animationDuration: autoRotate ? "3s" : "0s" }} />
          </Button>
        </div>
        
        {/* Quick toggles */}
        <div className="absolute bottom-8 right-4 flex gap-2 z-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowHotSpots(!showHotSpots)}
            className={`bg-background/90 backdrop-blur-sm shadow-md ${showHotSpots ? "ring-2 ring-green-500" : ""}`}
          >
            <Sparkles className={`w-4 h-4 ${showHotSpots ? "text-green-500" : ""}`} />
            <span className="ml-2">Hot Spots</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`bg-background/90 backdrop-blur-sm shadow-md ${showHeatmap ? "ring-2 ring-orange-500" : ""}`}
          >
            {showHeatmap ? <Flame className="w-4 h-4 text-orange-500" /> : <MapPin className="w-4 h-4" />}
            <span className="ml-2">{showHeatmap ? "Heatmap" : "Markers"}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMapProjection(mapProjection === "globe" ? "mercator" : "globe")}
            className="bg-background/90 backdrop-blur-sm shadow-md"
          >
            {mapProjection === "globe" ? <Globe className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
            <span className="ml-2">{mapProjection === "globe" ? "Bol" : "Plat"}</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className={`overflow-hidden transition-all duration-300 ${
      isFullscreen 
        ? "fixed inset-0 z-50 rounded-none border-0 flex flex-col" 
        : ""
    }`}>
      <CardHeader className={`pb-2 ${isFullscreen ? "shrink-0" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Bezoekers Wereldkaart
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Time Range Selector */}
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
              <SelectTrigger className={`w-[160px] h-9 ${timeRange === "live" ? "border-green-500 bg-green-500/10" : ""}`}>
                {timeRange === "live" ? (
                  <Radio className="w-4 h-4 mr-2 text-green-500 animate-pulse" />
                ) : (
                  <Calendar className="w-4 h-4 mr-2" />
                )}
                <SelectValue placeholder="Periode" />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.value === "live" && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                      )}
                      {option.value === "1h" && <Clock className="w-3 h-3" />}
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Activity Type Filter */}
            <Select value={activityFilter} onValueChange={(value) => setActivityFilter(value as "all" | "browsing" | "cart" | "checkout")}>
              <SelectTrigger className="w-[150px] h-9">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    Alle activiteiten
                  </div>
                </SelectItem>
                <SelectItem value="browsing">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS.browsing }} />
                    Browsen
                  </div>
                </SelectItem>
                <SelectItem value="cart">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS.cart }} />
                    Winkelwagen
                  </div>
                </SelectItem>
                <SelectItem value="checkout">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS.checkout }} />
                    Afrekenen
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Source/Referrer Filter */}
            <DynamicSourceFilter
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v)}
              rows={sourceFilterSessions.map((a) => ({
                utm_source: a.utm_source ?? null,
                utm_medium: a.utm_medium ?? null,
                utm_campaign: a.utm_campaign ?? null,
                referrer: a.referrer ?? null,
                referrer_category: null,
                page_path: a.page_path ?? null,
              }))}
              showInactive={showInactiveSources}
              onShowInactiveChange={setShowInactiveSources}
            />

            {/* Source classification breakdown — canonical resolver, transparent counts */}
            <details className="ml-2 text-xs border border-border rounded-md bg-background/70" data-testid="source-breakdown">
              <summary className="cursor-pointer px-2 py-1.5 select-none font-medium">
                Bron-classificatie ({sourceBreakdown.filter(r => r.visitors > 0).length})
              </summary>
              <div className="p-2 max-h-72 overflow-auto">
                <table className="w-full text-[11px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left pr-2">Bron</th>
                      <th className="text-right pr-2">Visitors</th>
                      <th className="text-right pr-2">Pageviews</th>
                      <th className="text-right pr-2">Cart</th>
                      <th className="text-right pr-2">Checkout</th>
                      <th className="text-right">Purchase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceBreakdown.map(r => (
                      <tr key={r.source} data-source={r.source} className={r.source === "pinterest" ? "text-[#E60023] font-medium" : ""}>
                        <td className="pr-2 capitalize">{r.source}</td>
                        <td className="text-right pr-2">{r.visitors}</td>
                        <td className="text-right pr-2">{r.pageviews}</td>
                        <td className="text-right pr-2">{r.cart}</td>
                        <td className="text-right pr-2">{r.checkout}</td>
                        <td className="text-right">{r.purchase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Toont sessies ná internal/US-only filters, vóór bron-filter. Gebruikt dezelfde canonical resolver als Attribution Compare en Visitor Timeline.
                </p>
              </div>
            </details>

            {/* Enriched breakdown — raw / unfiltered, exposes internal/bot/preview splits */}
            <details className="ml-2 text-xs border border-amber-500/40 rounded-md bg-amber-500/5" data-testid="source-audit-breakdown">
              <summary className="cursor-pointer px-2 py-1.5 select-none font-medium">
                Bron-audit (verrijkt, ongefilterd)
              </summary>
              <div className="p-2 max-h-80 overflow-auto space-y-3">
                <table className="w-full text-[11px]">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left pr-2">Bron</th>
                      <th className="text-right pr-2" title="Unieke sessies">Tot</th>
                      <th className="text-right pr-2" title="Externe schone bezoekers">Clean</th>
                      <th className="text-right pr-2" title="Eigen admin/test verkeer">Intern</th>
                      <th className="text-right pr-2" title="Bots / crawlers">Bot</th>
                      <th className="text-right pr-2" title="Preview / prefetch">Prefetch</th>
                      <th className="text-right pr-2">US</th>
                      <th className="text-right">Non-US</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedBreakdown.filter(r => r.visitors > 0).map(r => (
                      <tr key={r.source} data-source={r.source} className={r.source === "pinterest" ? "text-[#E60023] font-medium" : ""}>
                        <td className="pr-2 capitalize">{r.source}</td>
                        <td className="text-right pr-2">{r.visitors}</td>
                        <td className="text-right pr-2">{r.external_clean}</td>
                        <td className="text-right pr-2">{r.internal}</td>
                        <td className="text-right pr-2">{r.bot}</td>
                        <td className="text-right pr-2">{r.preview_prefetch}</td>
                        <td className="text-right pr-2">{r.us}</td>
                        <td className="text-right">{r.non_us}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pinterest drilldown */}
                <div className="border-t border-border pt-2" data-testid="pinterest-drilldown">
                  <div className="font-semibold text-[11px] mb-1 text-[#E60023]">Pinterest drill-down</div>
                  {pinterestAudit.totals.visitors === 0 ? (
                    <p className="text-[10px] text-muted-foreground">Geen Pinterest-verkeer in het geselecteerde tijdsbereik.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-2 text-[10px] mb-2">
                        <Stat label="Clean ext." value={pinterestAudit.totals.external_clean} tone={pinterestAudit.totals.external_clean ? "good" : "bad"} />
                        <Stat label="Intern" value={pinterestAudit.totals.internal} tone={pinterestAudit.totals.internal ? "warn" : "neutral"} />
                        <Stat label="Bot" value={pinterestAudit.totals.bot} tone={pinterestAudit.totals.bot ? "warn" : "neutral"} />
                        <Stat label="Prefetch" value={pinterestAudit.totals.preview_prefetch} tone={pinterestAudit.totals.preview_prefetch ? "warn" : "neutral"} />
                        <Stat label="US" value={pinterestAudit.totals.us} tone={pinterestAudit.totals.us ? "good" : "bad"} />
                        <Stat label="Non-US" value={pinterestAudit.totals.non_us} />
                        <Stat label="Pageviews" value={pinterestAudit.totals.pageviews} />
                        <Stat label="ATC" value={pinterestAudit.funnel.add_to_cart} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-[10px]">
                        <MiniList title="Landen" rows={pinterestAudit.byCountry.map(r => ({ k: r.country, v: r.visitors }))} />
                        <MiniList title="Campaign" rows={pinterestAudit.byCampaign.map(r => ({ k: r.campaign, v: r.visitors }))} />
                        <MiniList title="Pin ID" rows={pinterestAudit.byPinId.map(r => ({ k: r.pin_id, v: r.visitors }))} empty="Geen pin_id in landing-URL." />
                        <MiniList title="Landing page" rows={pinterestAudit.byLanding.map(r => ({ k: r.path, v: r.visitors }))} />
                      </div>
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        Funnel: view {pinterestAudit.funnel.product_view} → cart {pinterestAudit.funnel.add_to_cart} → checkout {pinterestAudit.funnel.begin_checkout} → purchase {pinterestAudit.funnel.purchase}
                      </div>
                      {pinterestAudit.warnings.length > 0 && (
                        <ul className="mt-2 space-y-1" data-testid="pinterest-warnings">
                          {pinterestAudit.warnings.map((w, i) => (
                            <li key={i} className="text-[10px] text-amber-700 dark:text-amber-300 border border-amber-500/40 rounded px-2 py-1 bg-amber-500/10">
                              ⚠ {w}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Negeert ‘Exclude internal/test’ en ‘US only’ — laat zien wat de filters verbergen.
                </p>
              </div>
            </details>

            {/* Map Projection Toggle */}
            <div className="flex items-center gap-2 px-2">
              <Switch
                id="projection-toggle"
                checked={mapProjection === "mercator"}
                onCheckedChange={(checked) => setMapProjection(checked ? "mercator" : "globe")}
              />
              <Label htmlFor="projection-toggle" className="flex items-center gap-1.5 cursor-pointer">
                {mapProjection === "globe" ? (
                  <Globe className="w-4 h-4" />
                ) : (
                  <MapIcon className="w-4 h-4" />
                )}
                <span className="text-sm">
                  {mapProjection === "globe" ? "Bol" : "Plat"}
                </span>
              </Label>
            </div>

            {/* Heatmap Toggle */}
            <div className="flex items-center gap-2 px-2 border-l border-border">
              <Switch
                id="heatmap-toggle"
                checked={showHeatmap}
                onCheckedChange={setShowHeatmap}
              />
              <Label htmlFor="heatmap-toggle" className="flex items-center gap-1.5 cursor-pointer">
                {showHeatmap ? (
                  <Flame className="w-4 h-4 text-orange-500" />
                ) : (
                  <MapPin className="w-4 h-4" />
                )}
                <span className="text-sm">
                  {showHeatmap ? "Heatmap" : "Markers"}
                </span>
              </Label>
            </div>

            {/* Hot Spots Toggle */}
            <div className="flex items-center gap-2 px-2 border-l border-border">
              <Switch
                id="hotspots-toggle"
                checked={showHotSpots}
                onCheckedChange={setShowHotSpots}
                disabled={showHeatmap}
              />
              <Label htmlFor="hotspots-toggle" className="flex items-center gap-1.5 cursor-pointer">
                <Sparkles className={`w-4 h-4 ${showHotSpots && !showHeatmap ? "text-green-500" : "text-muted-foreground"}`} />
                <span className="text-sm">Hot Spots</span>
              </Label>
            </div>

            {/* Auto-Rotate Toggle */}
            <div className="flex items-center gap-2 px-2 border-l border-border">
              <Switch
                id="auto-rotate-toggle"
                checked={autoRotate}
                onCheckedChange={setAutoRotate}
                disabled={mapProjection === "mercator"}
              />
              <Label htmlFor="auto-rotate-toggle" className="flex items-center gap-1.5 cursor-pointer">
                <RotateCw className={`w-4 h-4 ${autoRotate ? "text-blue-500 animate-spin" : "text-muted-foreground"}`} style={{ animationDuration: autoRotate ? "3s" : "0s" }} />
                <span className="text-sm">Roteer</span>
              </Label>
            </div>

            {/* Notification Toggles */}
            <div className="flex items-center gap-3 px-2 border-l border-border">
              {/* Checkout Notifications */}
              <div className="flex items-center gap-1.5">
                <Switch
                  id="checkout-notifications"
                  checked={checkoutNotifications}
                  onCheckedChange={setCheckoutNotifications}
                />
                <Label htmlFor="checkout-notifications" className="flex items-center gap-1 cursor-pointer text-xs">
                  <CreditCard className={`w-3 h-3 ${checkoutNotifications ? "text-green-500" : "text-muted-foreground"}`} />
                  Checkout
                </Label>
              </div>
              
              {/* Cart Notifications */}
              <div className="flex items-center gap-1.5">
                <Switch
                  id="cart-notifications"
                  checked={cartNotifications}
                  onCheckedChange={setCartNotifications}
                />
                <Label htmlFor="cart-notifications" className="flex items-center gap-1 cursor-pointer text-xs">
                  <ShoppingCart className={`w-3 h-3 ${cartNotifications ? "text-orange-500" : "text-muted-foreground"}`} />
                  Wagen
                </Label>
              </div>
              
              {/* Notification Mode Selector */}
              <div className="flex items-center gap-2 border-l border-border pl-3">
                <Select value={notificationMode} onValueChange={(value) => setNotificationMode(value as "sound" | "vibrate" | "off")}>
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sound">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3 h-3 text-green-500" />
                        <span>Geluid</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="vibrate">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-3 h-3 text-blue-500" />
                        <span>Trillen</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="off">
                      <div className="flex items-center gap-2">
                        <VolumeX className="w-3 h-3 text-muted-foreground" />
                        <span>Uit</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Browser Push Notifications Toggle */}
              {pushSupported && (
                <div className="flex items-center gap-1.5 border-l border-border pl-3">
                  <Switch
                    id="push-notifications"
                    checked={pushEnabled}
                    onCheckedChange={(checked) => togglePush(checked)}
                  />
                  <Label 
                    htmlFor="push-notifications" 
                    className="flex items-center gap-1 cursor-pointer text-xs"
                    title={
                      pushPermission === "denied" 
                        ? "Push notificaties geblokkeerd in browser" 
                        : pushEnabled 
                          ? "Browser push notificaties actief" 
                          : "Schakel browser push notificaties in"
                    }
                  >
                    {pushEnabled ? (
                      <BellRing className="w-3 h-3 text-purple-500" />
                    ) : (
                      <BellOff className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className="hidden sm:inline">Push</span>
                  </Label>
                </div>
              )}
            </div>

            {/* Export Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={isExporting}
              title="Exporteer alle bezoekersdata van deze periode (incl. paginabezoeken, sessieduur, terugkerende bezoekers, traffic-bron, device, UTM, orderwaarde)"
            >
              {isExporting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {isExporting ? "Exporteren…" : "Export CSV"}
            </Button>

            {/* Summary Report Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={exportSummary}
              disabled={isSummarizing}
              title="Download samenvatting (totalen per land + bron, gemiddelde sessieduur) voor dezelfde periode"
            >
              {isSummarizing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="w-4 h-4 mr-2" />
              )}
              {isSummarizing ? "Genereren…" : "Samenvatting"}
            </Button>

            {/* Fullscreen Toggle */}
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleFullscreen(false)}
                title={isFullscreen ? "Sluiten (ESC)" : "Fullscreen met controls"}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
                <span className="hidden sm:inline ml-2">{isFullscreen ? "Sluiten" : "Volledig"}</span>
              </Button>
              {!isFullscreen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleFullscreen(true)}
                  title="Alleen kaart fullscreen"
                  className="px-2"
                >
                  <Globe className="w-4 h-4" />
                </Button>
              )}
              {!isFullscreen && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  title="Open als losse pagina"
                  className="px-2"
                >
                  <Link to="/live-map" target="_blank">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </Button>
              )}
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await refetch();
                toast({
                  title: "Vernieuwd",
                  description: "Kaart data is bijgewerkt",
                });
              }}
              disabled={isLoading || isFetching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${(isLoading || isFetching) ? "animate-spin" : ""}`} />
              Vernieuwen
            </Button>
          </div>
        </div>

        {/* Clean-data filters */}
        <div className="flex flex-wrap items-center gap-4 mt-3 px-1 py-2 rounded-md border border-dashed">
          <div className="flex items-center gap-2">
            <Switch id="map-us-only" checked={usOnly} onCheckedChange={setUsOnly} />
            <Label htmlFor="map-us-only" className="text-xs">US-only</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="map-exclude-internal" checked={excludeInternal} onCheckedChange={setExcludeInternal} />
            <Label htmlFor="map-exclude-internal" className="text-xs">Exclude internal/test</Label>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Defaults ON. Toggle OFF to see global / raw traffic for debugging.
          </span>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {selectedTimeRangeLabel}
          </Badge>
          {activityFilter !== "all" && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Filter className="w-3 h-3" />
              {ACTIVITY_LABELS[activityFilter]}
            </Badge>
          )}
          <Badge variant="outline" className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {totalVisitors} unieke bezoekers
          </Badge>
          <Badge 
            variant="outline" 
            className="flex items-center gap-1"
            style={{ borderColor: ACTIVITY_COLORS.browsing, color: ACTIVITY_COLORS.browsing }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS.browsing }} />
            {counts.browsing} pageviews
          </Badge>
          <Badge 
            variant="outline" 
            className="flex items-center gap-1"
            style={{ borderColor: ACTIVITY_COLORS.cart, color: ACTIVITY_COLORS.cart }}
          >
            <ShoppingCart className="w-3 h-3" />
            {counts.cart} winkelwagen
          </Badge>
          <Badge 
            variant="outline" 
            className="flex items-center gap-1"
            style={{ borderColor: ACTIVITY_COLORS.checkout, color: ACTIVITY_COLORS.checkout }}
          >
            <CreditCard className="w-3 h-3" />
            {counts.checkout} afrekenen
          </Badge>
        </div>
        <div
          className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mt-3 text-[11px]"
          data-testid="world-map-render-diagnostics"
          data-canonical-sessions={mapDiagnostics.canonicalSessions}
          data-sessions-with-geo={mapDiagnostics.sessionsWithGeo}
          data-marker-features={mapDiagnostics.markerFeatures}
          data-heatmap-features={mapDiagnostics.heatmapFeatures}
          data-sessions-without-geo={mapDiagnostics.sessionsWithoutGeo}
          data-filtered-us-only={mapDiagnostics.filteredOutByUsOnly}
          data-filtered-internal-test={mapDiagnostics.filteredOutByInternalTest}
          data-rendered-mapbox-source-features={renderedMapboxSourceFeatureCount}
          data-testid-canonical-source="analytics-canonical"
        >
          <Stat label="Canonical sessions" value={mapDiagnostics.canonicalSessions} />
          <Stat label="Sessions with geo" value={mapDiagnostics.sessionsWithGeo} tone={mapDiagnostics.sessionsWithGeo ? "good" : "warn"} />
          <Stat label="Marker features" value={mapDiagnostics.markerFeatures} tone={mapDiagnostics.markerFeatures ? "good" : "warn"} />
          <Stat label="Heatmap features" value={mapDiagnostics.heatmapFeatures} tone={mapDiagnostics.heatmapFeatures ? "good" : "warn"} />
          <Stat label="Sessions without geo" value={mapDiagnostics.sessionsWithoutGeo} />
          <Stat label="US-only filtered" value={mapDiagnostics.filteredOutByUsOnly} />
          <Stat label="Internal/test filtered" value={mapDiagnostics.filteredOutByInternalTest} />
          <Stat label="Mapbox source" value={renderedMapboxSourceFeatureCount} tone={renderedMapboxSourceFeatureCount ? "good" : "warn"} />
        </div>
        {showHeatmap && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Intensiteit:</span>
            <div className="flex items-center h-3 rounded overflow-hidden">
              <div className="w-6 h-full" style={{ background: "rgba(65, 105, 225, 0.8)" }} />
              <div className="w-6 h-full" style={{ background: "rgba(0, 255, 255, 0.8)" }} />
              <div className="w-6 h-full" style={{ background: "rgba(0, 255, 0, 0.8)" }} />
              <div className="w-6 h-full" style={{ background: "rgba(255, 255, 0, 0.8)" }} />
              <div className="w-6 h-full" style={{ background: "rgba(255, 165, 0, 0.8)" }} />
              <div className="w-6 h-full" style={{ background: "rgba(255, 0, 0, 0.9)" }} />
            </div>
            <span>Laag → Hoog</span>
          </div>
        )}
      </CardHeader>
      <CardContent className={`p-0 ${isFullscreen ? "flex-1 overflow-hidden" : ""}`}>
        <div className={`flex flex-col lg:flex-row ${isFullscreen ? "h-full" : ""}`}>
          {/* Map Container */}
          <div className="flex-1 min-w-0 relative">
            {/* Live Visitor Counter - Prominent Red Display */}
            <div className="absolute top-4 right-4 z-20 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-3 shadow-lg border border-red-500/50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Users className="w-6 h-6 text-red-500" />
                  {timeRange === "live" && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-red-500 tabular-nums leading-none" style={{ fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace", textShadow: "0 0 10px rgba(239, 68, 68, 0.5)" }}>
                    {totalVisitors}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {timeRange === "live" ? "Nu online" : "Bezoekers"}
                  </div>
                </div>
              </div>
              {counts.checkout > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-green-500" />
                  <span className="text-green-500 font-semibold text-sm">{counts.checkout} aan het afrekenen</span>
                </div>
              )}
            </div>

            {mapError ? (
              <div className={`${isFullscreen ? "h-full" : "h-[500px]"} flex items-center justify-center bg-muted/50`}>
                <div className="text-center text-muted-foreground">
                  <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{mapError}</p>
                </div>
              </div>
            ) : (
              <>
                <div ref={mapContainerCallback} className={`${isFullscreen ? "h-full" : "h-[500px]"} w-full`} />
                {/* Custom Zoom Controls */}
                <div className="absolute bottom-4 left-4 flex flex-col gap-1 z-10">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
                    onClick={() => map.current?.zoomIn({ duration: 300 })}
                    title="Inzoomen"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background"
                    onClick={() => map.current?.zoomOut({ duration: 300 })}
                    title="Uitzoomen"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md hover:bg-background mt-1"
                    onClick={() => {
                      map.current?.flyTo({
                        center: [10, 30],
                        zoom: 1.5,
                        pitch: 20,
                        duration: 1000
                      });
                    }}
                    title="Reset weergave"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
                {/* Zoom hint */}
                <div className="absolute bottom-4 right-4 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded shadow-sm z-10">
                  Scroll of pinch om te zoomen
                </div>
              </>
            )}
          </div>

          {/* Top Locations & Conversion Sidebar */}
          <div className={`lg:w-96 border-t lg:border-t-0 lg:border-l border-border bg-muted/30 ${isFullscreen ? "h-full overflow-hidden" : ""}`}>
            <div className={`p-4 space-y-4 overflow-y-auto ${isFullscreen ? "h-full" : "max-h-[500px]"}`}>
              
              {/* Conversion Summary */}
              <div className="bg-background rounded-lg p-3 border border-border">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Conversie Overzicht
                </h4>
                <div className="space-y-2">
                  {/* Funnel visualization */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ACTIVITY_COLORS.browsing }} />
                        Bezoekers
                      </span>
                      <span className="font-medium">{topLocations.summary.totalVisitors}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ 
                          width: '100%',
                          backgroundColor: ACTIVITY_COLORS.browsing 
                        }} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <ShoppingCart className="w-3 h-3" style={{ color: ACTIVITY_COLORS.cart }} />
                        Winkelwagen
                      </span>
                      <span className="font-medium">
                        {topLocations.summary.addedToCart + topLocations.summary.completed}
                        <span className="text-muted-foreground ml-1">
                          ({topLocations.summary.totalVisitors > 0 
                            ? ((topLocations.summary.addedToCart + topLocations.summary.completed) / topLocations.summary.totalVisitors * 100).toFixed(1) 
                            : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ 
                          width: topLocations.summary.totalVisitors > 0 
                            ? `${((topLocations.summary.addedToCart + topLocations.summary.completed) / topLocations.summary.totalVisitors * 100)}%`
                            : '0%',
                          backgroundColor: ACTIVITY_COLORS.cart 
                        }} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="w-3 h-3" style={{ color: ACTIVITY_COLORS.checkout }} />
                        Afgerekend
                      </span>
                      <span className="font-medium">
                        {topLocations.summary.completed}
                        <span className="text-muted-foreground ml-1">
                          ({topLocations.summary.totalVisitors > 0 
                            ? (topLocations.summary.completed / topLocations.summary.totalVisitors * 100).toFixed(1) 
                            : 0}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full" 
                        style={{ 
                          width: topLocations.summary.totalVisitors > 0 
                            ? `${(topLocations.summary.completed / topLocations.summary.totalVisitors * 100)}%`
                            : '0%',
                          backgroundColor: ACTIVITY_COLORS.checkout 
                        }} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Countries with Conversion */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Top Landen
                  <span className="text-xs font-normal text-muted-foreground">(conversie %)</span>
                </h4>
                {topLocations.countries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Geen data beschikbaar</p>
                ) : (
                  <div className="space-y-1">
                    {topLocations.countries.map((country, index) => (
                      <div
                        key={country.name}
                        className="py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-muted-foreground w-4">
                              {index + 1}.
                            </span>
                            <span className="text-sm truncate">{country.name}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {country.visitors}
                          </Badge>
                        </div>
                        {/* Conversion bar */}
                        <div className="mt-1 ml-6 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex">
                            <div 
                              className="h-full" 
                              style={{ 
                                width: `${country.cartRate}%`,
                                backgroundColor: ACTIVITY_COLORS.cart 
                              }} 
                            />
                            <div 
                              className="h-full" 
                              style={{ 
                                width: `${country.checkoutRate}%`,
                                backgroundColor: ACTIVITY_COLORS.checkout 
                              }} 
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-10 text-right">
                            {country.checkoutRate.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pinterest Traffic Widget */}
              <PinterestTrafficWidget />

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Top Cities with Conversion */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Top Steden
                  <span className="text-xs font-normal text-muted-foreground">(conversie %)</span>
                </h4>
                {topLocations.cities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Geen data beschikbaar</p>
                ) : (
                  <div className="space-y-1">
                    {topLocations.cities.map((city, index) => (
                      <div
                        key={city.name}
                        className="py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs font-medium text-muted-foreground w-4">
                              {index + 1}.
                            </span>
                            <div className="min-w-0">
                              <span className="text-sm truncate block">{city.name.split(',')[0]}</span>
                              <span className="text-[10px] text-muted-foreground truncate block">
                                {city.country}
                              </span>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {city.visitors}
                          </Badge>
                        </div>
                        {/* Conversion bar */}
                        <div className="mt-1 ml-6 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex">
                            <div 
                              className="h-full" 
                              style={{ 
                                width: `${city.cartRate}%`,
                                backgroundColor: ACTIVITY_COLORS.cart 
                              }} 
                            />
                            <div 
                              className="h-full" 
                              style={{ 
                                width: `${city.checkoutRate}%`,
                                backgroundColor: ACTIVITY_COLORS.checkout 
                              }} 
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-10 text-right">
                            {city.checkoutRate.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
