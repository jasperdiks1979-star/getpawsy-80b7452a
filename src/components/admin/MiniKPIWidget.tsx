import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  ShoppingCart,
  Activity
} from "lucide-react";
import { format, subDays } from "date-fns";
import { useState, useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MiniKPI {
  label: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
}

const formatCompactValue = (value: number, type: 'currency' | 'number'): string => {
  if (type === 'currency') {
    if (value >= 1000) {
      return `€${(value / 1000).toFixed(1)}k`;
    }
    return `€${value.toFixed(0)}`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
};

export const MiniKPIWidget = () => {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const { data: kpis, refetch, isLoading } = useQuery({
    queryKey: ["mini-kpi-widget"],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = subDays(endDate, 13);
      
      const { data: snapshots, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("report_date, active_users, revenue, purchases")
        .gte("report_date", format(startDate, 'yyyy-MM-dd'))
        .lte("report_date", format(endDate, 'yyyy-MM-dd'))
        .order("report_date", { ascending: true });

      if (error) throw error;

      const dateMap = new Map();
      snapshots?.forEach(s => dateMap.set(s.report_date, s));

      interface SnapshotData {
        active_users: number;
        revenue: number;
        purchases: number;
      }

      const filledData: SnapshotData[] = [];
      for (let i = 0; i < 14; i++) {
        const date = format(subDays(endDate, 13 - i), 'yyyy-MM-dd');
        const existing = dateMap.get(date);
        filledData.push({
          active_users: Number(existing?.active_users) || 0,
          revenue: Number(existing?.revenue) || 0,
          purchases: Number(existing?.purchases) || 0,
        });
      }

      const latestWeek = filledData.slice(-7);
      const previousWeek = filledData.slice(0, 7);

      const sumMetric = (data: SnapshotData[], key: keyof SnapshotData) => 
        data.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);

      const calcTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const currentUsers = sumMetric(latestWeek, 'active_users');
      const previousUsers = sumMetric(previousWeek, 'active_users');
      
      const currentRevenue = sumMetric(latestWeek, 'revenue');
      const previousRevenue = sumMetric(previousWeek, 'revenue');
      
      const currentPurchases = sumMetric(latestWeek, 'purchases');
      const previousPurchases = sumMetric(previousWeek, 'purchases');

      const miniKpis: MiniKPI[] = [
        {
          label: 'Gebruikers',
          value: formatCompactValue(currentUsers, 'number'),
          trend: calcTrend(currentUsers, previousUsers),
          icon: <Users className="h-3.5 w-3.5" />,
        },
        {
          label: 'Omzet',
          value: formatCompactValue(currentRevenue, 'currency'),
          trend: calcTrend(currentRevenue, previousRevenue),
          icon: <DollarSign className="h-3.5 w-3.5" />,
        },
        {
          label: 'Orders',
          value: formatCompactValue(currentPurchases, 'number'),
          trend: calcTrend(currentPurchases, previousPurchases),
          icon: <ShoppingCart className="h-3.5 w-3.5" />,
        },
      ];

      return miniKpis;
    },
    staleTime: 60000,
  });

  // Realtime subscription
  useEffect(() => {
    setConnectionStatus('connecting');
    let retryTimeoutId: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel('mini-kpi-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ga4_daily_snapshots',
        },
        () => refetch()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('disconnected');
          retryTimeoutId = setTimeout(() => channel.subscribe(), 3000);
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (isLoading || !kpis) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg animate-pulse">
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
        <div className="h-4 w-16 bg-muted rounded" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/30 rounded-lg border border-border/50">
        {/* Live indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center mr-1">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              {connectionStatus === 'connected' && (
                <span className="relative flex h-2 w-2 ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {connectionStatus === 'connected' ? 'Live updates actief' : 
             connectionStatus === 'connecting' ? 'Verbinden...' : 'Opnieuw verbinden...'}
          </TooltipContent>
        </Tooltip>

        {/* KPI items */}
        {kpis.map((kpi, index) => (
          <Tooltip key={kpi.label}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/50 rounded transition-colors cursor-default">
                <span className="text-muted-foreground">{kpi.icon}</span>
                <span className="text-sm font-medium">{kpi.value}</span>
                <span className={`flex items-center text-xs ${kpi.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {kpi.trend >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                </span>
                {index < kpis.length - 1 && (
                  <div className="h-4 w-px bg-border/50 ml-1" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="font-medium">{kpi.label}</div>
              <div className={kpi.trend >= 0 ? 'text-green-600' : 'text-red-600'}>
                {kpi.trend >= 0 ? '+' : ''}{kpi.trend.toFixed(1)}% vs vorige week
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

export default MiniKPIWidget;
