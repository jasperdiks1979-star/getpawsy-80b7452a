import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Users, Eye, ShoppingCart, CreditCard, MapPin } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface Stats {
  total: number;
  browsing: number;
  cart: number;
  checkout: number;
}

interface SparklineData {
  time: string;
  count: number;
}

export const LiveVisitorBadge = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, browsing: 0, cart: 0, checkout: 0 });
  const [sparklineData, setSparklineData] = useState<SparklineData[]>([]);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
    };

    checkAdmin();
  }, []);

  const fetchStats = useCallback(async () => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    const { data } = await supabase
      .from("visitor_activity")
      .select("session_id, activity_type")
      .gte("created_at", fifteenMinutesAgo);

    if (data) {
      const sessionMap = new Map<string, string>();
      data.forEach(v => {
        const current = sessionMap.get(v.session_id);
        if (!current || 
            (v.activity_type === "checkout") || 
            (v.activity_type === "cart" && current === "browsing")) {
          sessionMap.set(v.session_id, v.activity_type);
        }
      });

      let browsing = 0, cart = 0, checkout = 0;
      sessionMap.forEach(type => {
        if (type === "browsing") browsing++;
        else if (type === "cart") cart++;
        else if (type === "checkout") checkout++;
      });

      setStats({
        total: sessionMap.size,
        browsing,
        cart,
        checkout
      });
    }
  }, []);

  const fetchSparklineData = useCallback(async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data } = await supabase
      .from("visitor_activity")
      .select("session_id, created_at")
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: true });

    if (data) {
      // Group by 5-minute intervals (12 data points for 1 hour)
      const intervals: { [key: string]: Set<string> } = {};
      const now = Date.now();
      
      // Initialize all 12 intervals
      for (let i = 11; i >= 0; i--) {
        const intervalTime = new Date(now - i * 5 * 60 * 1000);
        const key = Math.floor(intervalTime.getTime() / (5 * 60 * 1000)).toString();
        intervals[key] = new Set();
      }

      // Fill with actual data
      data.forEach(v => {
        const timestamp = new Date(v.created_at).getTime();
        const key = Math.floor(timestamp / (5 * 60 * 1000)).toString();
        if (intervals[key]) {
          intervals[key].add(v.session_id);
        }
      });

      // Convert to array
      const sparkline = Object.entries(intervals)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([key, sessions]) => ({
          time: key,
          count: sessions.size
        }));

      setSparklineData(sparkline);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    fetchStats();
    fetchSparklineData();

    const channel = supabase
      .channel("visitor-badge-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_activity" },
        () => {
          fetchStats();
          fetchSparklineData();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      fetchStats();
      fetchSparklineData();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isAdmin, fetchStats, fetchSparklineData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => setIsOpen(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isOpen]);

  if (!isAdmin) return null;

  return (
    <div className="fixed top-20 right-4 z-50">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-full shadow-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              <span>{stats.total}</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs max-w-[220px]">
            <p className="font-medium">Actieve bezoekers (laatste 15 min)</p>
            <p className="text-muted-foreground mt-1">Bron: Eigen tracking — alleen productie-domein (getpawsy.pet)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isOpen && (
        <div 
          className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 min-w-[180px] z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Live Bezoekers</div>
          
          {/* Sparkline Chart */}
          {sparklineData.length > 0 && (
            <div className="mb-3 -mx-1">
              <div className="h-10 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#10b981" 
                      strokeWidth={1.5}
                      fill="url(#sparklineGradient)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-1">
                Laatste uur (per 5 min)
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Eye className="h-3.5 w-3.5" />
                <span>Browsing</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.browsing}</span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-orange-500">
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>Cart</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.cart}</span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-emerald-500">
                <CreditCard className="h-3.5 w-3.5" />
                <span>Checkout</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.checkout}</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            Laatste 15 min
          </div>

          <Link 
            to="/live-map" 
            className="mt-2 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium py-1.5 px-3 rounded-md transition-colors"
          >
            <MapPin className="h-3.5 w-3.5" />
            Live Map
          </Link>
        </div>
      )}
    </div>
  );
};
