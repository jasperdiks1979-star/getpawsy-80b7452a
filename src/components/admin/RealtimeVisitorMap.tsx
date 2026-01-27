import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2, ExternalLink, Eye, ShoppingCart, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useVisitorLocations } from "@/hooks/useVisitorLocations";

const ACTIVITY_COLORS = {
  browsing: "#3b82f6", // blue
  cart: "#f97316", // orange
  checkout: "#22c55e", // green
};

export const RealtimeVisitorMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  
  const { locations, locationStats, isLoading } = useVisitorLocations(15000);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initMap = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-mapbox-token");
        
        if (error || !data?.token) {
          setMapError("Mapbox token niet geconfigureerd");
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

  // Update markers when locations change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new markers
    locations.forEach((location) => {
      const color = ACTIVITY_COLORS[location.activity_type];
      
      // Create marker element
      const el = document.createElement("div");
      el.className = "visitor-marker";
      el.style.cssText = `
        width: 14px;
        height: 14px;
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
  }, [locations, mapLoaded]);

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
            <CardDescription>Geografische locaties van actieve bezoekers (laatste 15 min)</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/live-map" className="flex items-center gap-1">
              Volledig scherm
              <ExternalLink className="w-3 h-3" />
            </Link>
          </Button>
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
            <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded-lg p-2 text-xs border">
              <div className="font-semibold">{locations.length} locaties</div>
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
