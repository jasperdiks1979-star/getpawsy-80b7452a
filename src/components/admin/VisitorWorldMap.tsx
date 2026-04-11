import { useEffect, useRef, useState, useCallback } from "react";
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

interface VisitorActivity {
  id: string;
  session_id: string;
  activity_type: "browsing" | "cart" | "checkout";
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
  created_at: string;
  last_seen_at?: string;
  referrer_category?: string | null;
  utm_source?: string | null;
}

type SourceFilter = "all" | "pinterest" | "google" | "social" | "direct" | "organic" | "other";

const SOURCE_COLORS: Record<string, string> = {
  pinterest: "#E60023",
  google: "#4285F4",
  social: "#1DA1F2",
  direct: "#6B7280",
  email: "#F59E0B",
  paid: "#8B5CF6",
  organic: "#10B981",
  other: "#6B7280",
};

const SOURCE_LABELS: Record<string, string> = {
  all: "Alle bronnen",
  pinterest: "Pinterest",
  google: "Google",
  social: "Social Media",
  direct: "Direct",
  organic: "Organisch",
  other: "Overig",
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
type TimeRange = "live" | "15m" | "1h" | "2.5h" | "5h" | "24h" | "7d" | "30d";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; minutes: number }[] = [
  { value: "live", label: "Live (15 min)", minutes: 15 },
  { value: "15m", label: "Laatste 15 min", minutes: 15 },
  { value: "1h", label: "Laatste uur", minutes: 60 },
  { value: "2.5h", label: "Laatste 2,5 uur", minutes: 150 },
  { value: "5h", label: "Laatste 5 uur", minutes: 300 },
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
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [mapContainerReady, setMapContainerReady] = useState(false);
  const mapTokenRef = useRef<string | null>(null);
  const previousContainerRef = useRef<HTMLDivElement | null>(null);

  // Callback ref to handle map container changes between render modes
  const mapContainerCallback = useCallback((node: HTMLDivElement | null) => {
    if (node && node !== previousContainerRef.current) {
      // Container changed - need to reinitialize map
      previousContainerRef.current = node;
      (mapContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      
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
  const [mapProjection, setMapProjection] = useState<"globe" | "mercator">("globe");
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
  const [autoRotate, setAutoRotate] = useState(() => {
    const saved = localStorage.getItem("map-auto-rotate");
    return saved !== null ? saved === "true" : false;
  });
  const [showHotSpots, setShowHotSpots] = useState(() => {
    const saved = localStorage.getItem("map-hot-spots");
    return saved !== null ? saved === "true" : true;
  });
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
    queryKey: ["visitor-activities", timeRange],
    queryFn: async () => {
      const timeRangeMs = getTimeRangeMs();
      
      if (timeRange === "live") {
        // For LIVE mode: only show sessions with heartbeat in the last 60 seconds
        const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("visitor_activity")
          .select("*")
          .gte("last_seen_at", sixtySecondsAgo)
          .order("last_seen_at", { ascending: false });

        if (error) throw error;
        
        // Dedupe by session_id - keep only the latest activity per session
        const sessionMap = new Map<string, VisitorActivity>();
        (data || []).forEach((activity) => {
          const typedActivity = activity as unknown as VisitorActivity;
          if (!sessionMap.has(typedActivity.session_id)) {
            sessionMap.set(typedActivity.session_id, typedActivity);
          }
        });
        
        return Array.from(sessionMap.values());
      }
      
      // For historical modes: use created_at as before
      const { data, error } = await supabase
        .from("visitor_activity")
        .select("*")
        .gte("created_at", new Date(Date.now() - timeRangeMs).toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as VisitorActivity[];
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

  // Filter activities based on selected activity type
  const filteredActivities = displayActivities?.filter(a => 
    activityFilter === "all" || a.activity_type === activityFilter
  );

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
          const { data, error } = await supabase.functions.invoke("get-mapbox-token");
          
          if (error || !data?.token) {
            setMapError("Mapbox token niet geconfigureerd. Voeg MAPBOX_PUBLIC_TOKEN toe aan de secrets.");
            return;
          }
          token = data.token;
          mapTokenRef.current = token;
        }

        mapboxgl.accessToken = token;

        map.current = new mapboxgl.Map({
          container: mapContainerRef.current!,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: "globe",
          zoom: 1.5,
          center: [10, 30],
          pitch: 20,
          dragRotate: true,
          touchZoomRotate: true,
          touchPitch: true,
        });

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

  // Update heatmap layer
  useEffect(() => {
    if (!map.current || !mapLoaded || !filteredActivities) return;

    const mapInstance = map.current;

    // Remove existing heatmap layer and source if they exist
    if (mapInstance.getLayer("visitor-heatmap")) {
      mapInstance.removeLayer("visitor-heatmap");
    }
    if (mapInstance.getSource("visitor-heatmap-source")) {
      mapInstance.removeSource("visitor-heatmap-source");
    }

    if (showHeatmap) {
      // Hide markers when showing heatmap
      markersRef.current.forEach((marker) => {
        marker.getElement().style.display = "none";
      });

      // Create GeoJSON data for heatmap
      const geojsonData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: filteredActivities
          .filter((a) => a.latitude && a.longitude)
          .map((activity) => ({
            type: "Feature" as const,
            properties: {
              weight: ACTIVITY_WEIGHTS[activity.activity_type],
            },
            geometry: {
              type: "Point" as const,
              coordinates: [activity.longitude!, activity.latitude!],
            },
          })),
      };

      // Add heatmap source
      mapInstance.addSource("visitor-heatmap-source", {
        type: "geojson",
        data: geojsonData,
      });

      // Add heatmap layer
      mapInstance.addLayer({
        id: "visitor-heatmap",
        type: "heatmap",
        source: "visitor-heatmap-source",
        paint: {
          // Increase weight based on activity type
          "heatmap-weight": ["get", "weight"],
          // Increase intensity as zoom level increases
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 1,
            9, 3
          ],
          // Color ramp for heatmap - from cold to hot
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
          // Adjust radius based on zoom
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 15,
            9, 30
          ],
          // Transition from heatmap to circle layer at higher zoom
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7, 1,
            9, 0.5
          ],
        },
      });
    } else {
      // Show markers when heatmap is disabled
      markersRef.current.forEach((marker) => {
        marker.getElement().style.display = "block";
      });
    }
  }, [showHeatmap, filteredActivities, mapLoaded, activityFilter]);

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

      const color = ACTIVITY_COLORS[dominantType];
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
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 ${size}px ${color}80, 0 0 ${size * 2}px ${color}40;
        animation: pulse 2s ease-in-out infinite;
        display: ${showHeatmap ? "none" : "block"};
        position: relative;
      `;

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

      // Create popup content
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
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(popupContent);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [filteredActivities, mapLoaded, showHeatmap, activityFilter]);

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

  // Count activities by type (from filtered data)
  const counts = {
    browsing: filteredActivities?.filter(a => a.activity_type === "browsing").length || 0,
    cart: filteredActivities?.filter(a => a.activity_type === "cart").length || 0,
    checkout: filteredActivities?.filter(a => a.activity_type === "checkout").length || 0,
  };

  const totalVisitors = new Set(filteredActivities?.map(a => a.session_id)).size;

  // Get selected time range label
  const selectedTimeRangeLabel = TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label || "Laatste 24 uur";

  // Calculate top locations with conversion rates
  const topLocations = (() => {
    if (!filteredActivities) return { countries: [], cities: [], hotSpots: [], summary: { totalVisitors: 0, browsingOnly: 0, addedToCart: 0, completed: 0 } };

    // Track sessions by their highest activity level
    const sessionHighestActivity = new Map<string, "browsing" | "cart" | "checkout">();
    
    filteredActivities.forEach((activity) => {
      const current = sessionHighestActivity.get(activity.session_id);
      const activityRank = { browsing: 1, cart: 2, checkout: 3 };
      if (!current || activityRank[activity.activity_type] > activityRank[current]) {
        sessionHighestActivity.set(activity.session_id, activity.activity_type);
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

  // Export to CSV function
  const exportToCSV = () => {
    if (!activities || activities.length === 0) {
      return;
    }

    // Create CSV headers
    const headers = [
      "Datum/Tijd",
      "Sessie ID",
      "Activiteit",
      "Land",
      "Stad",
      "Breedtegraad",
      "Lengtegraad"
    ];

    // Create CSV rows
    const rows = (filteredActivities || []).map((activity) => [
      new Date(activity.created_at).toLocaleString("nl-NL"),
      activity.session_id,
      ACTIVITY_LABELS[activity.activity_type] || activity.activity_type,
      activity.country || "Onbekend",
      activity.city || "Onbekend",
      activity.latitude?.toString() || "",
      activity.longitude?.toString() || ""
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(";"))
    ].join("\n");

    // Add BOM for Excel compatibility with special characters
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bezoekers-${timeRange}-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
              disabled={!filteredActivities || filteredActivities.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
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
            {counts.browsing} browsen
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
