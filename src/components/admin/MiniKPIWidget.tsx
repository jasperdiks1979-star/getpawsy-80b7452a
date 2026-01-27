import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  ShoppingCart,
  Activity,
  Wifi,
  WifiOff
} from "lucide-react";
import { format, subDays } from "date-fns";
import { useState, useEffect, useMemo, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Types
interface MiniKPI {
  label: string;
  value: string;
  trend: number;
  icon: React.ReactNode;
}

interface SnapshotData {
  active_users: number;
  revenue: number;
  purchases: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Constants
const STALE_TIME = 60000;
const RETRY_DELAY = 3000;
const DAYS_RANGE = 14;

// Utility functions
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

const sumMetric = (data: SnapshotData[], key: keyof SnapshotData) => 
  data.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);

const calcTrend = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

// Sub-components
const LiveIndicator = ({ status }: { status: ConnectionStatus }) => {
  const statusConfig = {
    connected: { text: 'Live updates actief', showPing: true },
    connecting: { text: 'Verbinden...', showPing: false },
    disconnected: { text: 'Opnieuw verbinden...', showPing: false }
  };

  const config = statusConfig[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center mr-1.5 cursor-default">
          {status === 'connected' ? (
            <Wifi className="h-3.5 w-3.5 text-green-500" />
          ) : status === 'connecting' ? (
            <Activity className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
          )}
          {config.showPing && (
            <span className="relative flex h-2 w-2 ml-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {config.text}
      </TooltipContent>
    </Tooltip>
  );
};

const KPIItem = ({ kpi, isLast }: { kpi: MiniKPI; isLast: boolean }) => {
  const isPositive = kpi.trend >= 0;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/50 rounded transition-colors cursor-default">
          <span className="text-muted-foreground">{kpi.icon}</span>
          <span className="text-sm font-medium tabular-nums">{kpi.value}</span>
          <span className={cn(
            "flex items-center text-xs",
            isPositive ? 'text-green-600' : 'text-red-600'
          )}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </span>
          {!isLast && <div className="h-4 w-px bg-border/50 ml-1" />}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div className="font-medium">{kpi.label}</div>
        <div className={isPositive ? 'text-green-600' : 'text-red-600'}>
          {isPositive ? '+' : ''}{kpi.trend.toFixed(1)}% vs vorige week
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

const LoadingSkeleton = () => (
  <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg animate-pulse">
    <div className="h-4 w-16 bg-muted rounded" />
    <div className="h-4 w-16 bg-muted rounded" />
    <div className="h-4 w-16 bg-muted rounded" />
  </div>
);

// Custom hook for KPI data
const useKPIData = () => {
  return useQuery({
    queryKey: ["mini-kpi-widget"],
    queryFn: async (): Promise<MiniKPI[]> => {
      const endDate = new Date();
      const startDate = subDays(endDate, DAYS_RANGE - 1);
      
      const { data: snapshots, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("report_date, active_users, revenue, purchases")
        .gte("report_date", format(startDate, 'yyyy-MM-dd'))
        .lte("report_date", format(endDate, 'yyyy-MM-dd'))
        .order("report_date", { ascending: true });

      if (error) throw error;

      // Build date map for quick lookup
      const dateMap = new Map(snapshots?.map(s => [s.report_date, s]));

      // Fill missing days with zeros
      const filledData: SnapshotData[] = Array.from({ length: DAYS_RANGE }, (_, i) => {
        const date = format(subDays(endDate, DAYS_RANGE - 1 - i), 'yyyy-MM-dd');
        const existing = dateMap.get(date);
        return {
          active_users: Number(existing?.active_users) || 0,
          revenue: Number(existing?.revenue) || 0,
          purchases: Number(existing?.purchases) || 0,
        };
      });

      const latestWeek = filledData.slice(-7);
      const previousWeek = filledData.slice(0, 7);

      const currentUsers = sumMetric(latestWeek, 'active_users');
      const previousUsers = sumMetric(previousWeek, 'active_users');
      
      const currentRevenue = sumMetric(latestWeek, 'revenue');
      const previousRevenue = sumMetric(previousWeek, 'revenue');
      
      const currentPurchases = sumMetric(latestWeek, 'purchases');
      const previousPurchases = sumMetric(previousWeek, 'purchases');

      return [
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
    },
    staleTime: STALE_TIME,
  });
};

// Custom hook for realtime subscription
const useRealtimeSubscription = (onUpdate: () => void) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    setStatus('connecting');
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
        onUpdate
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
          setStatus('disconnected');
          retryTimeoutId = setTimeout(() => channel.subscribe(), RETRY_DELAY);
        } else if (subscriptionStatus === 'CLOSED') {
          setStatus('disconnected');
        }
      });

    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      supabase.removeChannel(channel);
    };
  }, [onUpdate]);

  return status;
};

// Main component
export const MiniKPIWidget = () => {
  const { data: kpis, refetch, isLoading } = useKPIData();
  
  const handleUpdate = useCallback(() => {
    refetch();
  }, [refetch]);
  
  const connectionStatus = useRealtimeSubscription(handleUpdate);

  if (isLoading || !kpis) {
    return <LoadingSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/30 rounded-lg border border-border/50">
        <LiveIndicator status={connectionStatus} />
        
        {kpis.map((kpi, index) => (
          <KPIItem 
            key={kpi.label} 
            kpi={kpi} 
            isLast={index === kpis.length - 1} 
          />
        ))}
      </div>
    </TooltipProvider>
  );
};

export default MiniKPIWidget;
