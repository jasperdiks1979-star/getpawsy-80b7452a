import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Users, CreditCard, X, Minimize2, Maximize2, TrendingUp, MapPin, Percent, Volume2, VolumeX, Vibrate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { safeString } from "@/lib/safe-render";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";

interface LiveStats {
  totalVisitors: number;
  todayVisitors: number;
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

type NotificationType = "sound" | "vibrate" | "off";

export const LiveCheckoutWidget = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
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
    todayVisitors: 0,
    browsing: 0,
    cart: 0,
    checkout: 0,
    recentCheckouts: [],
  });
  const [newCheckout, setNewCheckout] = useState(false);
  const [notificationType, setNotificationType] = useState<NotificationType>(() => {
    const saved = localStorage.getItem("live-widget-notification");
    return (saved as NotificationType) || "sound";
  });

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

  // Save notification preference
  useEffect(() => {
    localStorage.setItem("live-widget-notification", notificationType);
  }, [notificationType]);

  // Play checkout notification
  const playCheckoutNotification = useCallback(() => {
    if (notificationType === "sound") {
      // Create and play a "cha-ching" sound using Web Audio API
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // First tone (higher pitch)
        const oscillator1 = audioContext.createOscillator();
        const gainNode1 = audioContext.createGain();
        oscillator1.connect(gainNode1);
        gainNode1.connect(audioContext.destination);
        oscillator1.frequency.value = 1200;
        oscillator1.type = "sine";
        gainNode1.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator1.start(audioContext.currentTime);
        oscillator1.stop(audioContext.currentTime + 0.1);
        
        // Second tone (even higher, delayed)
        const oscillator2 = audioContext.createOscillator();
        const gainNode2 = audioContext.createGain();
        oscillator2.connect(gainNode2);
        gainNode2.connect(audioContext.destination);
        oscillator2.frequency.value = 1600;
        oscillator2.type = "sine";
        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime + 0.1);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator2.start(audioContext.currentTime + 0.1);
        oscillator2.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        console.log("Audio not supported");
      }
    } else if (notificationType === "vibrate") {
      // Vibrate pattern: short-pause-long
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 200]);
      }
    }
  }, [notificationType]);

  // Fetch initial stats - use 15 minute window to match LiveVisitorBadge
  const fetchStats = useCallback(async () => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    // Get start of today (midnight)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    
    // Fetch last 15 minutes data
    const { data, error } = await supabase
      .from("visitor_activity")
      .select("*")
      .gte("created_at", fifteenMinutesAgo)
      .order("created_at", { ascending: false });

    // Fetch today's unique visitors
    const { data: todayData } = await supabase
      .from("visitor_activity")
      .select("session_id")
      .gte("created_at", todayStart);

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

    // Count unique sessions today
    const todaySessions = new Set(todayData?.map(v => v.session_id) || []);

    setStats({
      totalVisitors: sessionMap.size,
      todayVisitors: todaySessions.size,
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
          
          // Trigger checkout animation and notification
          if (newActivity.activity_type === "checkout") {
            setNewCheckout(true);
            playCheckoutNotification();
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
  }, [isAdmin, fetchStats, playCheckoutNotification]);

  // Don't render for non-admins or on mobile checkout/cart pages
  const isCheckoutRoute = location.pathname === '/cart' || location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const shouldHideOnMobile = isMobile && isCheckoutRoute;
  
  if (!isAdmin || !isVisible || shouldHideOnMobile) return null;

  // Funnel data for donut chart
  const funnelData = [
    { name: "Browsen", value: stats.browsing, color: "#ef4444" },
    { name: "Wagen", value: stats.cart, color: "#f97316" },
    { name: "Checkout", value: stats.checkout, color: "#22c55e" },
  ];
  
  const totalFunnel = stats.browsing + stats.cart + stats.checkout;

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
              {/* Notification toggle */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                  >
                    {notificationType === "sound" && <Volume2 className="h-3 w-3 text-green-500" />}
                    {notificationType === "vibrate" && <Vibrate className="h-3 w-3 text-orange-500" />}
                    {notificationType === "off" && <VolumeX className="h-3 w-3 text-muted-foreground" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onClick={() => setNotificationType("sound")}>
                    <Volume2 className="h-4 w-4 mr-2 text-green-500" />
                    Geluid
                    {notificationType === "sound" && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNotificationType("vibrate")}>
                    <Vibrate className="h-4 w-4 mr-2 text-orange-500" />
                    Trillen
                    {notificationType === "vibrate" && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNotificationType("off")}>
                    <VolumeX className="h-4 w-4 mr-2" />
                    Uit
                    {notificationType === "off" && <span className="ml-auto">✓</span>}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                <div className="p-3 space-y-3">
                  {/* Top row: Live & Today visitors */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                      <Users className="w-4 h-4 text-blue-500" />
                      <div>
                        <div className="text-lg font-bold">{stats.totalVisitors}</div>
                        <div className="text-xs text-muted-foreground">Nu (15 min)</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/10 border border-blue-500/30">
                      <Users className="w-4 h-4 text-blue-600" />
                      <div>
                        <div className="text-lg font-bold text-blue-600">{stats.todayVisitors}</div>
                        <div className="text-xs text-muted-foreground">Vandaag</div>
                      </div>
                    </div>
                  </div>

                  {/* Funnel donut chart with legend */}
                  {totalFunnel > 0 && (
                    <div className="flex items-center gap-3 p-2 rounded-md bg-muted/20">
                      <div className="w-16 h-16 flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={funnelData}
                              cx="50%"
                              cy="50%"
                              innerRadius={18}
                              outerRadius={28}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {funnelData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1">
                        {funnelData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-muted-foreground">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold">{item.value}</span>
                              <span className="text-muted-foreground">
                                ({totalFunnel > 0 ? Math.round((item.value / totalFunnel) * 100) : 0}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conversion ratio */}
                  <div className="flex items-center gap-2 p-2 rounded-md bg-purple-500/10 border border-purple-500/30">
                    <Percent className="w-4 h-4 text-purple-500" />
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-purple-600">
                          {stats.todayVisitors > 0 
                            ? ((stats.checkout / stats.todayVisitors) * 100).toFixed(1) 
                            : "0.0"}%
                        </span>
                        <span className="text-xs text-muted-foreground">conversie vandaag</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stats.checkout} checkout{stats.checkout !== 1 ? 's' : ''} / {stats.todayVisitors} bezoeker{stats.todayVisitors !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
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
                              {safeString(checkout.city) || safeString(checkout.country) || "Onbekend"}
                            </span>
                          </div>
                          <span className="text-muted-foreground">
                            {formatTime(safeString(checkout.created_at))}
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
