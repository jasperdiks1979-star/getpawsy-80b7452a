import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Users, ShoppingCart, CreditCard, RefreshCw, Flame, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface VisitorActivity {
  id: string;
  session_id: string;
  activity_type: "browsing" | "cart" | "checkout";
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  city: string | null;
  created_at: string;
}

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

export const VisitorWorldMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Fetch visitor activities
  const { data: activities, refetch, isLoading } = useQuery({
    queryKey: ["visitor-activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_activity")
        .select("*")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as VisitorActivity[];
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("visitor-activity-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visitor_activity",
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initMap = async () => {
      try {
        // Fetch the Mapbox token from edge function
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        
        if (error || !data?.token) {
          setMapError("Mapbox token niet geconfigureerd. Voeg MAPBOX_PUBLIC_TOKEN toe aan de secrets.");
          return;
        }

        mapboxgl.accessToken = data.token;

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: "globe",
          zoom: 1.5,
          center: [10, 30],
          pitch: 20,
        });

        map.current.addControl(
          new mapboxgl.NavigationControl({
            visualizePitch: true,
          }),
          "top-right"
        );

        map.current.scrollZoom.disable();

        map.current.on("style.load", () => {
          map.current?.setFog({
            color: "rgb(20, 20, 30)",
            "high-color": "rgb(40, 40, 60)",
            "horizon-blend": 0.1,
          });
          setMapLoaded(true);
        });

        // Slow rotation animation
        const secondsPerRevolution = 360;
        let userInteracting = false;

        function spinGlobe() {
          if (!map.current) return;
          const zoom = map.current.getZoom();
          if (!userInteracting && zoom < 3) {
            const distancePerSecond = 360 / secondsPerRevolution;
            const center = map.current.getCenter();
            center.lng -= distancePerSecond;
            map.current.easeTo({ center, duration: 1000, easing: (n) => n });
          }
        }

        map.current.on("mousedown", () => { userInteracting = true; });
        map.current.on("dragstart", () => { userInteracting = true; });
        map.current.on("mouseup", () => { userInteracting = false; spinGlobe(); });
        map.current.on("touchend", () => { userInteracting = false; spinGlobe(); });
        map.current.on("moveend", spinGlobe);

        spinGlobe();
      } catch (err) {
        console.error("Map initialization error:", err);
        setMapError("Fout bij het laden van de kaart.");
      }
    };

    initMap();

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update heatmap layer
  useEffect(() => {
    if (!map.current || !mapLoaded || !activities) return;

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
        features: activities
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
  }, [showHeatmap, activities, mapLoaded]);

  // Update markers when activities change
  useEffect(() => {
    if (!map.current || !mapLoaded || !activities) return;

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Group activities by location (rounded to 1 decimal for clustering)
    const locationGroups = new Map<string, VisitorActivity[]>();
    
    activities.forEach((activity) => {
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
      `;

      // Add pulse animation
      if (!document.getElementById("marker-styles")) {
        const style = document.createElement("style");
        style.id = "marker-styles";
        style.textContent = `
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
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
  }, [activities, mapLoaded, showHeatmap]);

  // Count activities by type
  const counts = {
    browsing: activities?.filter(a => a.activity_type === "browsing").length || 0,
    cart: activities?.filter(a => a.activity_type === "cart").length || 0,
    checkout: activities?.filter(a => a.activity_type === "checkout").length || 0,
  };

  const totalVisitors = new Set(activities?.map(a => a.session_id)).size;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Live Bezoekers Wereldkaart
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Vernieuwen
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
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
      <CardContent className="p-0">
        {mapError ? (
          <div className="h-[500px] flex items-center justify-center bg-muted/50">
            <div className="text-center text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{mapError}</p>
            </div>
          </div>
        ) : (
          <div ref={mapContainer} className="h-[500px] w-full" />
        )}
      </CardContent>
    </Card>
  );
};
