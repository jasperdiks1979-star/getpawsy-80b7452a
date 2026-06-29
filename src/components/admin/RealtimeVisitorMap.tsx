import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2, ExternalLink, Eye, ShoppingCart, Target, Settings2, Flame, Move, Maximize2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useVisitorLocations, TimeRange } from "@/hooks/useVisitorLocations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { getCanonicalFunnelSessions, summarizeCanonicalSessions, type CanonicalSessionRow } from "@/lib/canonicalAnalytics";

const ACTIVITY_COLORS = {
  browsing: "#3b82f6", // blue
  cart: "#f97316", // orange
  checkout: "#22c55e", // green
};

interface MapConfig {
  heatmapMode: boolean;
  markerSize: number;
  autoFocus: boolean;
  timeRange: TimeRange;
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "15m": "15 minuten",
  "1h": "1 uur",
  "6h": "6 uur",
  "24h": "24 uur",
  "7d": "7 dagen",
};

const STORAGE_KEY = "visitor-map-config";

const getStoredConfig = (): MapConfig => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...{ heatmapMode: false, markerSize: 14, autoFocus: true, timeRange: "24h" as TimeRange }, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("Failed to parse stored map config:", e);
  }
  return { heatmapMode: false, markerSize: 14, autoFocus: true, timeRange: "24h" as TimeRange };
};

export const RealtimeVisitorMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [config, setConfig] = useState<MapConfig>(getStoredConfig);
  
  const { locations, locationStats, isLoading } = useVisitorLocations(15000, config.timeRange);

  // Canonical funnel totals for the same time window — keeps map badges aligned with Funnel/Traffic dashboards.
  const [canonicalTotals, setCanonicalTotals] = useState<{ sessions: number; atc: number; checkout: number; purchase: number } | null>(null);
  useEffect(() => {
    const hours =
      config.timeRange === "15m" ? 1 :
      config.timeRange === "1h" ? 1 :
      config.timeRange === "6h" ? 6 :
      config.timeRange === "24h" ? 24 :
      24 * 7;
    let cancelled = false;
    (async () => {
      try {
        const sess: CanonicalSessionRow[] = await getCanonicalFunnelSessions({ hours });
        if (cancelled) return;
        const s = summarizeCanonicalSessions(sess);
        setCanonicalTotals({ sessions: s.sessions, atc: s.add_to_carts, checkout: s.checkouts, purchase: s.purchases });
      } catch {
        if (!cancelled) setCanonicalTotals(null);
      }
    })();
    return () => { cancelled = true; };
  }, [config.timeRange]);

  // Persist config to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // Auto-focus on active regions
  const focusOnActiveRegions = useCallback(() => {
    if (!map.current || locations.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    locations.forEach((loc) => {
      bounds.extend([loc.longitude, loc.latitude]);
    });

    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 8,
      duration: 1000,
    });
  }, [locations]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initMap = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        
        if (error || !data?.token) {
          // Most common cause is the caller not yet being flagged as admin
          // in user_roles (function returns 401/403), not a missing token.
          // The rest of the analytics dashboard keeps working regardless.
          setMapError(
            "Map provider unavailable. The rest of the dashboard keeps working. " +
            "If you are signed in as an admin and still see this, refresh once."
          );
          return;
        }

        mapboxgl.accessToken = data.token;

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: "mercator",
          zoom: 1,
          center: [5, 50], // Center on Netherlands
          interactive: true,
        });

        map.current.on("load", () => {
          setMapLoaded(true);
        });
      } catch (err) {
        console.error("Map initialization error:", err);
        setMapError("Fout bij laden kaart");
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
    if (!map.current || !mapLoaded) return;

    const sourceId = "visitor-heatmap-source";
    const layerId = "visitor-heatmap-layer";

    // Remove existing heatmap layer and source
    if (map.current.getLayer(layerId)) {
      map.current.removeLayer(layerId);
    }
    if (map.current.getSource(sourceId)) {
      map.current.removeSource(sourceId);
    }

    if (config.heatmapMode && locations.length > 0) {
      // Create GeoJSON data
      const geojsonData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: locations.map((loc) => ({
          type: "Feature",
          properties: {
            intensity: loc.activity_type === "checkout" ? 3 : loc.activity_type === "cart" ? 2 : 1,
          },
          geometry: {
            type: "Point",
            coordinates: [loc.longitude, loc.latitude],
          },
        })),
      };

      map.current.addSource(sourceId, {
        type: "geojson",
        data: geojsonData,
      });

      map.current.addLayer({
        id: layerId,
        type: "heatmap",
        source: sourceId,
        paint: {
          "heatmap-weight": ["get", "intensity"],
          "heatmap-intensity": 1,
          "heatmap-radius": 30,
          "heatmap-opacity": 0.7,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "#3b82f6",
            0.4, "#8b5cf6",
            0.6, "#f97316",
            0.8, "#ef4444",
            1, "#22c55e",
          ],
        },
      });
    }
  }, [locations, mapLoaded, config.heatmapMode]);

  // Update markers when locations change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Don't show markers in heatmap mode
    if (config.heatmapMode) return;

    // Add new markers
    locations.forEach((location) => {
      const color = ACTIVITY_COLORS[location.activity_type];
      const size = config.markerSize;
      
      // Create marker element
      const el = document.createElement("div");
      el.className = "visitor-marker";
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 8px ${color}80;
        animation: pulse 2s infinite;
      `;

      // Add marker with popup
      const popup = new mapboxgl.Popup({ offset: 15 }).setHTML(`
        <div style="padding: 8px; font-size: 12px;">
          <strong>${location.city || "Onbekend"}</strong>
          ${location.country ? `<br/>${location.country}` : ""}
          <br/>
          <span style="color: ${color}; font-weight: 500;">
            ${location.activity_type === "browsing" ? "Browsen" : 
              location.activity_type === "cart" ? "Winkelwagen" : "Checkout"}
          </span>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [locations, mapLoaded, config.heatmapMode, config.markerSize]);

  // Auto-focus effect
  useEffect(() => {
    if (config.autoFocus && mapLoaded && locations.length > 0) {
      focusOnActiveRegions();
    }
  }, [config.autoFocus, mapLoaded, locations, focusOnActiveRegions]);

  // Add pulse animation style
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  if (mapError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Live Bezoekerskaart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            <p>{mapError}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Live Bezoekerskaart
            </CardTitle>
            <CardDescription>Geografische locaties van actieve bezoekers ({TIME_RANGE_LABELS[config.timeRange]})</CardDescription>
          </div>
        <div className="flex items-center gap-1">
            {/* Time Range Selector */}
            <Select
              value={config.timeRange}
              onValueChange={(value) => setConfig((prev) => ({ ...prev, timeRange: value as TimeRange }))}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <Clock className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIME_RANGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Settings2 className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Kaart Instellingen</h4>
                  
                  {/* Heatmap Mode */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="heatmap-mode" className="flex items-center gap-2 text-sm">
                      <Flame className="w-4 h-4 text-orange-500" />
                      Heatmap modus
                    </Label>
                    <Switch
                      id="heatmap-mode"
                      checked={config.heatmapMode}
                      onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, heatmapMode: checked }))}
                    />
                  </div>
                  
                  {/* Marker Size */}
                  {!config.heatmapMode && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm">
                        <Move className="w-4 h-4 text-blue-500" />
                        Marker grootte: {config.markerSize}px
                      </Label>
                      <Slider
                        value={[config.markerSize]}
                        onValueChange={([value]) => setConfig((prev) => ({ ...prev, markerSize: value }))}
                        min={8}
                        max={24}
                        step={2}
                        className="w-full"
                      />
                    </div>
                  )}
                  
                  {/* Auto Focus */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-focus" className="flex items-center gap-2 text-sm">
                      <Maximize2 className="w-4 h-4 text-green-500" />
                      Auto-focus
                    </Label>
                    <Switch
                      id="auto-focus"
                      checked={config.autoFocus}
                      onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, autoFocus: checked }))}
                    />
                  </div>
                  
                  {/* Manual Focus Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={focusOnActiveRegions}
                    disabled={locations.length === 0}
                  >
                    <Maximize2 className="w-3 h-3 mr-1" />
                    Focus op actieve regio's
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/live-map" className="flex items-center gap-1">
                Volledig scherm
                <ExternalLink className="w-3 h-3" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Browsen</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span>Winkelwagen</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span>Checkout</span>
          </div>
        </div>

        {/* Map */}
        <div className="relative">
          <div ref={mapContainer} className="h-[280px] w-full" />
          
          {(isLoading || !mapLoaded) && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {/* Stats overlay */}
          {mapLoaded && locations.length > 0 && (
            <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-lg p-2 text-xs border space-y-1">
              <div className="font-semibold">{locations.length} locaties</div>
              {canonicalTotals && (
                <div className="text-muted-foreground flex items-center gap-2">
                  <span title="Canonical sessions">{canonicalTotals.sessions}s</span>
                  <span className="text-orange-600" title="Canonical add-to-cart sessions">
                    <ShoppingCart className="inline w-2.5 h-2.5 mr-0.5" />{canonicalTotals.atc}
                  </span>
                  <span className="text-green-600" title="Canonical checkout sessions">
                    <Target className="inline w-2.5 h-2.5 mr-0.5" />{canonicalTotals.checkout}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Location stats */}
        {locationStats.length > 0 && (
          <div className="p-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Top Locaties</div>
            <div className="space-y-1.5 max-h-24 overflow-y-auto">
              {locationStats.slice(0, 5).map((stat, index) => (
                <div key={`${stat.country}-${stat.city}-${index}`} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">
                    {stat.city ? `${stat.city}, ` : ""}{stat.country}
                  </span>
                  <div className="flex items-center gap-2">
                    {stat.activities.browsing > 0 && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-0.5 px-1">
                        <Eye className="w-2.5 h-2.5" />
                        {stat.activities.browsing}
                      </Badge>
                    )}
                    {stat.activities.cart > 0 && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-0.5 px-1 border-orange-500/50 text-orange-600">
                        <ShoppingCart className="w-2.5 h-2.5" />
                        {stat.activities.cart}
                      </Badge>
                    )}
                    {stat.activities.checkout > 0 && (
                      <Badge variant="outline" className="h-5 text-[10px] gap-0.5 px-1 border-green-500/50 text-green-600">
                        <Target className="w-2.5 h-2.5" />
                        {stat.activities.checkout}
                      </Badge>
                    )}
                    <span className="text-muted-foreground w-4 text-right">{stat.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {locations.length === 0 && mapLoaded && !isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Geen locatiedata beschikbaar
          </div>
        )}
      </CardContent>
    </Card>
  );
};
