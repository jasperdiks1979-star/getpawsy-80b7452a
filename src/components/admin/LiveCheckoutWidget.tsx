import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Users, CreditCard, X, Minimize2, Maximize2, TrendingUp, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

interface LiveStats {
  totalVisitors: number;
  browsing: number;
  cart: number;
  checkout: number;
  recentCheckouts: Array<{
    id: string;
    city: string | null;
    country: string | null;
    created_at: string;
  }>;
}

export const LiveCheckoutWidget = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    const saved = localStorage.getItem("live-widget-visible");
    return saved !== null ? saved === "true" : true;
  });
  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = localStorage.getItem("live-widget-minimized");
    return saved !== null ? saved === "true" : false;
  });
  const [stats, setStats] = useState<LiveStats>({
    totalVisitors: 0,
    browsing: 0,
    cart: 0,
    checkout: 0,
    recentCheckouts: [],
  });
  const [newCheckout, setNewCheckout] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
    };

    checkAdmin();
  }, [user]);

  // Save preferences
  useEffect(() => {
    localStorage.setItem("live-widget-visible", String(isVisible));
  }, [isVisible]);

  useEffect(() => {
    localStorage.setItem("live-widget-minimized", String(isMinimized));
  }, [isMinimized]);

  // Fetch initial stats
  const fetchStats = useCallback(async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("visitor_activity")
      .select("*")
      .gte("created_at", fiveMinutesAgo)
      .order("created_at", { ascending: false });

    if (error || !data) return;

    const sessionMap = new Map<string, string>();
    data.forEach((activity) => {
      const existing = sessionMap.get(activity.session_id);
      if (!existing || activity.activity_type === "checkout" || 
          (activity.activity_type === "cart" && existing !== "checkout")) {
        sessionMap.set(activity.session_id, activity.activity_type);
      }
    });

    const counts = { browsing: 0, cart: 0, checkout: 0 };
    sessionMap.forEach((type) => {
      if (type === "browsing") counts.browsing++;
      else if (type === "cart") counts.cart++;
      else if (type === "checkout") counts.checkout++;
    });

    const recentCheckouts = data
      .filter((a) => a.activity_type === "checkout")
      .slice(0, 3)
      .map((a) => ({
        id: a.id,
        city: a.city,
        country: a.country,
        created_at: a.created_at,
      }));

    setStats({
      totalVisitors: sessionMap.size,
      ...counts,
      recentCheckouts,
    });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchStats();
  }, [isAdmin, fetchStats]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("live-widget-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "visitor_activity",
        },
        (payload) => {
          const newActivity = payload.new as any;
          
          // Trigger checkout animation
          if (newActivity.activity_type === "checkout") {
            setNewCheckout(true);
            setTimeout(() => setNewCheckout(false), 2000);
          }
          
          // Refetch stats
          fetchStats();
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isAdmin, fetchStats]);

  // Don't render for non-admins
  if (!isAdmin || !isVisible) return null;

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s geleden`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m geleden`;
    return `${Math.floor(diff / 3600)}u geleden`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className={`fixed bottom-4 right-4 z-50 ${
          isMinimized ? "w-auto" : "w-72"
        }`}
      >
        <div
          className={`bg-background/95 backdrop-blur-lg border border-border rounded-lg shadow-2xl overflow-hidden ${
            newCheckout ? "ring-2 ring-green-500 ring-offset-2 ring-offset-background" : ""
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">Live Stats</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? (
                  <Maximize2 className="h-3 w-3" />
                ) : (
                  <Minimize2 className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsVisible(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <AnimatePresence>
            {!isMinimized && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Stats Grid */}
                <div className="p-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <Users className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-lg font-bold">{stats.totalVisitors}</div>
                      <div className="text-xs text-muted-foreground">Bezoekers</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div>
                      <div className="text-lg font-bold">{stats.browsing}</div>
                      <div className="text-xs text-muted-foreground">Browsen</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                    <ShoppingCart className="w-4 h-4 text-orange-500" />
                    <div>
                      <div className="text-lg font-bold">{stats.cart}</div>
                      <div className="text-xs text-muted-foreground">Wagen</div>
                    </div>
                  </div>
                  <motion.div 
                    className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/30"
                    animate={newCheckout ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <CreditCard className="w-4 h-4 text-green-500" />
                    <div>
                      <div className="text-lg font-bold text-green-600">{stats.checkout}</div>
                      <div className="text-xs text-muted-foreground">Checkout</div>
                    </div>
                  </motion.div>
                </div>

                {/* Recent Checkouts */}
                {stats.recentCheckouts.length > 0 && (
                  <div className="px-3 pb-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Recente checkouts
                    </div>
                    <div className="space-y-1">
                      {stats.recentCheckouts.map((checkout) => (
                        <div
                          key={checkout.id}
                          className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30"
                        >
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-green-500" />
                            <span className="truncate max-w-[120px]">
                              {checkout.city || checkout.country || "Onbekend"}
                            </span>
                          </div>
                          <span className="text-muted-foreground">
                            {formatTime(checkout.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="px-3 pb-3">
                  <Link to="/live-map" target="_blank">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      <MapPin className="w-3 h-3 mr-1" />
                      Bekijk op kaart
                    </Button>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Minimized View */}
          {isMinimized && (
            <div className="px-3 py-2 flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">
                <Users className="w-3 h-3 mr-1" />
                {stats.totalVisitors}
              </Badge>
              <Badge 
                variant="outline" 
                className="text-xs border-green-500/50 text-green-600"
              >
                <CreditCard className="w-3 h-3 mr-1" />
                {stats.checkout}
              </Badge>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
