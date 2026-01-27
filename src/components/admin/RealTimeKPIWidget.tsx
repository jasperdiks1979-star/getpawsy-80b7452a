import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  Eye, 
  ShoppingCart,
  Activity,
  Percent,
  RefreshCw,
  Wifi,
  WifiOff
} from "lucide-react";
import { 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { format, subDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

// Types
interface KPIData {
  label: string;
  value: string | number;
  trend: number;
  sparklineData: { value: number }[];
  icon: React.ReactNode;
  color: string;
  format?: 'currency' | 'number' | 'percent' | 'duration';
}

interface SnapshotData {
  report_date: string;
  active_users: number;
  page_views: number;
  sessions: number;
  revenue: number;
  purchases: number;
  bounce_rate: number;
  avg_session_duration: number;
  new_users: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Constants
const STALE_TIME = 60000;
const RETRY_DELAY = 3000;
const DAYS_RANGE = 14;

interface KPIData {
  label: string;
  value: string | number;
  previousValue?: number;
  trend: number;
  sparklineData: { value: number }[];
  icon: React.ReactNode;
  color: string;
  format?: 'currency' | 'number' | 'percent' | 'duration';
}

const formatValue = (value: number, formatType?: string): string => {
  switch (formatType) {
    case 'currency':
      return `€${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'duration':
      const minutes = Math.floor(value / 60);
      const seconds = Math.floor(value % 60);
      return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    default:
      return value.toLocaleString('nl-NL');
  }
};

const SparklineChart = ({ data, color, isPositive }: { data: { value: number }[]; color: string; isPositive: boolean }) => {
  const gradientId = `gradient-${color.replace('#', '')}`;
  
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={true}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const KPICard = ({ kpi, index }: { kpi: KPIData; index: number }) => {
  const isPositive = kpi.trend >= 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="flex flex-col"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div 
            className="p-1.5 rounded-md bg-muted" 
            style={{ color: kpi.color }}
          >
            {kpi.icon}
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {kpi.label}
          </span>
        </div>
        <div className={cn(
          "flex items-center gap-0.5 text-xs font-medium",
          isPositive ? 'text-green-600' : 'text-red-600'
        )}>
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span className="tabular-nums">{Math.abs(kpi.trend).toFixed(1)}%</span>
        </div>
      </div>
      
      <div className="text-xl font-bold mb-2 tabular-nums">{kpi.value}</div>
      
      <div className="h-10 -mx-1">
        <SparklineChart 
          data={kpi.sparklineData} 
          color={kpi.color} 
          isPositive={isPositive} 
        />
      </div>
    </motion.div>
  );
};

const ConnectionBadge = ({ status }: { status: ConnectionStatus }) => {
  if (status === 'connected') {
    return (
      <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">
        <Wifi className="h-3 w-3 mr-1" />
        <span className="relative flex h-2 w-2 mr-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
        Live
      </Badge>
    );
  }
  
  if (status === 'connecting') {
    return (
      <Badge variant="secondary" className="text-xs">
        <Activity className="h-3 w-3 mr-1 animate-pulse" />
        Verbinden...
      </Badge>
    );
  }
  
  return (
    <Badge variant="destructive" className="text-xs">
      <WifiOff className="h-3 w-3 mr-1" />
      Opnieuw verbinden...
    </Badge>
  );
};

const LoadingSkeleton = () => (
  <Card>
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-8" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export const RealTimeKPIWidget = () => {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  const { data: kpiData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["realtime-kpi-widget"],
    queryFn: async (): Promise<KPIData[]> => {
      const endDate = new Date();
      const startDate = subDays(endDate, DAYS_RANGE - 1);
      
      const { data: snapshots, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("*")
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
          report_date: date,
          active_users: Number(existing?.active_users) || 0,
          page_views: Number(existing?.page_views) || 0,
          sessions: Number(existing?.sessions) || 0,
          revenue: Number(existing?.revenue) || 0,
          purchases: Number(existing?.purchases) || 0,
          bounce_rate: Number(existing?.bounce_rate) || 0,
          avg_session_duration: Number(existing?.avg_session_duration) || 0,
          new_users: Number(existing?.new_users) || 0,
        };
      });

      // Calculate metrics and trends
      const latestWeek = filledData.slice(-7);
      const previousWeek = filledData.slice(0, 7);

      const sumMetric = (data: SnapshotData[], key: keyof SnapshotData) => 
        data.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);
      
      const avgMetric = (data: SnapshotData[], key: keyof SnapshotData) => {
        const nonZeroData = data.filter(d => Number(d[key]) > 0);
        if (nonZeroData.length === 0) return 0;
        return sumMetric(nonZeroData, key) / nonZeroData.length;
      };

      const calcTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const currentUsers = sumMetric(latestWeek, 'active_users');
      const previousUsers = sumMetric(previousWeek, 'active_users');
      
      const currentRevenue = sumMetric(latestWeek, 'revenue');
      const previousRevenue = sumMetric(previousWeek, 'revenue');
      
      const currentPageViews = sumMetric(latestWeek, 'page_views');
      const previousPageViews = sumMetric(previousWeek, 'page_views');
      
      const currentPurchases = sumMetric(latestWeek, 'purchases');
      const previousPurchases = sumMetric(previousWeek, 'purchases');
      
      const currentBounceRate = avgMetric(latestWeek, 'bounce_rate');
      const previousBounceRate = avgMetric(previousWeek, 'bounce_rate');
      
      const currentSessionDuration = avgMetric(latestWeek, 'avg_session_duration');
      const previousSessionDuration = avgMetric(previousWeek, 'avg_session_duration');

      // Conversion rate calculation
      const currentSessions = sumMetric(latestWeek, 'sessions');
      const previousSessions = sumMetric(previousWeek, 'sessions');
      const currentConversionRate = currentSessions > 0 ? (currentPurchases / currentSessions) * 100 : 0;
      const previousConversionRate = previousSessions > 0 ? (previousPurchases / previousSessions) * 100 : 0;

      // New users
      const currentNewUsers = sumMetric(latestWeek, 'new_users');
      const previousNewUsers = sumMetric(previousWeek, 'new_users');

      const kpis: KPIData[] = [
        {
          label: 'Actieve Gebruikers',
          value: formatValue(currentUsers, 'number'),
          trend: calcTrend(currentUsers, previousUsers),
          sparklineData: filledData.map(d => ({ value: Number(d.active_users) || 0 })),
          icon: <Users className="h-4 w-4" />,
          color: '#3b82f6',
          format: 'number'
        },
        {
          label: 'Omzet',
          value: formatValue(currentRevenue, 'currency'),
          trend: calcTrend(currentRevenue, previousRevenue),
          sparklineData: filledData.map(d => ({ value: Number(d.revenue) || 0 })),
          icon: <DollarSign className="h-4 w-4" />,
          color: '#10b981',
          format: 'currency'
        },
        {
          label: 'Paginaweergaven',
          value: formatValue(currentPageViews, 'number'),
          trend: calcTrend(currentPageViews, previousPageViews),
          sparklineData: filledData.map(d => ({ value: Number(d.page_views) || 0 })),
          icon: <Eye className="h-4 w-4" />,
          color: '#8b5cf6',
          format: 'number'
        },
        {
          label: 'Transacties',
          value: formatValue(currentPurchases, 'number'),
          trend: calcTrend(currentPurchases, previousPurchases),
          sparklineData: filledData.map(d => ({ value: Number(d.purchases) || 0 })),
          icon: <ShoppingCart className="h-4 w-4" />,
          color: '#f59e0b',
          format: 'number'
        },
        {
          label: 'Conversie',
          value: formatValue(currentConversionRate, 'percent'),
          trend: calcTrend(currentConversionRate, previousConversionRate),
          sparklineData: latestWeek.map((d, i) => {
            const sessions = Number(d.sessions) || 0;
            const purchases = Number(d.purchases) || 0;
            return { value: sessions > 0 ? (purchases / sessions) * 100 : 0 };
          }),
          icon: <Percent className="h-4 w-4" />,
          color: '#ec4899',
          format: 'percent'
        },
        {
          label: 'Bounce Rate',
          value: formatValue(currentBounceRate, 'percent'),
          // For bounce rate, a decrease is positive
          trend: -calcTrend(currentBounceRate, previousBounceRate),
          sparklineData: filledData.map(d => ({ value: Number(d.bounce_rate) || 0 })),
          icon: <Activity className="h-4 w-4" />,
          color: '#ef4444',
          format: 'percent'
        },
        {
          label: 'Sessieduur',
          value: formatValue(currentSessionDuration, 'duration'),
          trend: calcTrend(currentSessionDuration, previousSessionDuration),
          sparklineData: filledData.map(d => ({ value: Number(d.avg_session_duration) || 0 })),
          icon: <Activity className="h-4 w-4" />,
          color: '#06b6d4',
          format: 'duration'
        },
        {
          label: 'Nieuwe Gebruikers',
          value: formatValue(currentNewUsers, 'number'),
          trend: calcTrend(currentNewUsers, previousNewUsers),
          sparklineData: filledData.map(d => ({ value: Number(d.new_users) || 0 })),
          icon: <Users className="h-4 w-4" />,
          color: '#14b8a6',
          format: 'number'
        },
      ];

      return kpis;
    },
    staleTime: 60000,
    // Removed polling - now using realtime subscriptions
  });

  // Update last updated time
  useEffect(() => {
    if (!isFetching) {
      setLastUpdated(new Date());
    }
  }, [isFetching]);

  // Realtime subscription for instant updates
  useEffect(() => {
    setConnectionStatus('connecting');
    let retryTimeoutId: NodeJS.Timeout | null = null;

    const channel = supabase
      .channel('kpi-realtime-updates')
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
          retryTimeoutId = setTimeout(() => channel.subscribe(), RETRY_DELAY);
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    return () => {
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Real-Time KPI's</CardTitle>
            <Badge variant="outline" className="text-xs">
              {DAYS_RANGE} dagen trend
            </Badge>
            <ConnectionBadge status={connectionStatus} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {format(lastUpdated, 'HH:mm', { locale: nl })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {kpiData?.map((kpi, index) => (
            <KPICard key={kpi.label} kpi={kpi} index={index} />
          ))}
        </div>
        
        {(!kpiData || kpiData.length === 0 || kpiData.every(k => k.value === '0' || k.value === '€0,00' || k.value === '0,0%')) && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>Nog geen data beschikbaar. De widget toont trends zodra er data is.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RealTimeKPIWidget;
