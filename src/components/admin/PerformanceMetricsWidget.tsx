import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ChevronRight, Gauge, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PerformanceMetricsWidgetProps {
  onNavigate?: () => void;
}

const getRatingColor = (rating: string) => {
  switch (rating) {
    case 'good':
      return 'bg-green-100 text-green-700 hover:bg-green-100';
    case 'needs-improvement':
      return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100';
    case 'poor':
      return 'bg-red-100 text-red-700 hover:bg-red-100';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getRatingIcon = (rating: string) => {
  switch (rating) {
    case 'good':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'needs-improvement':
      return <AlertTriangle className="h-3 w-3" />;
    case 'poor':
      return <XCircle className="h-3 w-3" />;
    default:
      return null;
  }
};

export const PerformanceMetricsWidget = ({ onNavigate }: PerformanceMetricsWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["performance-metrics-widget-stats"],
    queryFn: async () => {
      // Get metrics from last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { data: metrics, error } = await supabase
        .from("performance_metrics")
        .select("metric_name, metric_value, rating")
        .gte("created_at", oneDayAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate averages per metric
      const metricGroups: Record<string, { values: number[]; ratings: string[] }> = {};
      
      metrics?.forEach(m => {
        if (!metricGroups[m.metric_name]) {
          metricGroups[m.metric_name] = { values: [], ratings: [] };
        }
        metricGroups[m.metric_name].values.push(Number(m.metric_value));
        metricGroups[m.metric_name].ratings.push(m.rating);
      });

      // Get most common rating for each metric
      const getOverallRating = (ratings: string[]): string => {
        const counts: Record<string, number> = {};
        ratings.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      };

      const lcpData = metricGroups['LCP'];
      const fcpData = metricGroups['FCP'];
      const clsData = metricGroups['CLS'];

      // Calculate overall health
      const allRatings = metrics?.map(m => m.rating) || [];
      const goodCount = allRatings.filter(r => r === 'good').length;
      const totalCount = allRatings.length;
      const healthPercentage = totalCount > 0 ? Math.round((goodCount / totalCount) * 100) : 0;

      return {
        lcp: lcpData ? {
          avg: Math.round(lcpData.values.reduce((a, b) => a + b, 0) / lcpData.values.length),
          rating: getOverallRating(lcpData.ratings)
        } : null,
        fcp: fcpData ? {
          avg: Math.round(fcpData.values.reduce((a, b) => a + b, 0) / fcpData.values.length),
          rating: getOverallRating(fcpData.ratings)
        } : null,
        cls: clsData ? {
          avg: (clsData.values.reduce((a, b) => a + b, 0) / clsData.values.length).toFixed(3),
          rating: getOverallRating(clsData.ratings)
        } : null,
        totalSamples: totalCount,
        healthPercentage
      };
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  const hasData = stats && stats.totalSamples > 0;
  const isHealthy = (stats?.healthPercentage || 0) >= 75;

  return (
    <Card 
      className={`${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isHealthy ? (
              <Gauge className="h-4 w-4 text-green-500" />
            ) : (
              <Activity className="h-4 w-4 text-yellow-500" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Performance</p>
              {hasData ? (
                <p className="text-sm font-medium">
                  {stats.healthPercentage}% gezond
                </p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  Geen data
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {stats?.lcp && (
                <Badge variant="secondary" className={getRatingColor(stats.lcp.rating)}>
                  {getRatingIcon(stats.lcp.rating)}
                  <span className="ml-1">LCP {stats.lcp.avg}ms</span>
                </Badge>
              )}
              {stats?.cls && (
                <Badge variant="secondary" className={getRatingColor(stats.cls.rating)}>
                  {getRatingIcon(stats.cls.rating)}
                  <span className="ml-1">CLS {stats.cls.avg}</span>
                </Badge>
              )}
              {!hasData && (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">
                  Wachten op data
                </Badge>
              )}
            </div>
            {onNavigate && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PerformanceMetricsWidget;
