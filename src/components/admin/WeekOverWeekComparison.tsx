import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus,
  TrendingUp,
  Users,
  Eye,
  Clock,
  ShoppingCart,
  DollarSign,
  BarChart2,
  Percent
} from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface GA4Snapshot {
  id: string;
  report_date: string;
  active_users: number | null;
  new_users: number | null;
  sessions: number | null;
  page_views: number | null;
  avg_session_duration: number | null;
  bounce_rate: number | null;
  revenue: number | null;
  purchases: number | null;
}

interface MetricRow {
  key: string;
  label: string;
  icon: React.ElementType;
  thisWeek: number;
  lastWeek: number;
  change: number;
  changePercent: number;
  format: (value: number) => string;
  higherIsBetter: boolean;
}

const WeekOverWeekComparison = memo(() => {
  // Get data for last 14 days to cover both weeks
  const { data: snapshots, isLoading, error } = useQuery({
    queryKey: ["ga4-week-comparison"],
    queryFn: async () => {
      const startDate = subDays(new Date(), 14);
      
      const { data, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("*")
        .gte("report_date", format(startDate, "yyyy-MM-dd"))
        .order("report_date", { ascending: true });

      if (error) throw error;
      return data as GA4Snapshot[];
    },
  });

  const weekData = useMemo(() => {
    if (!snapshots?.length) return null;

    // Calculate week boundaries (Monday to Sunday)
    const today = new Date();
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subDays(thisWeekStart, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });

    // Filter snapshots by week
    const thisWeekData = snapshots.filter(s => {
      const date = parseISO(s.report_date);
      return date >= thisWeekStart && date <= thisWeekEnd;
    });

    const lastWeekData = snapshots.filter(s => {
      const date = parseISO(s.report_date);
      return date >= lastWeekStart && date <= lastWeekEnd;
    });

    // Helper to sum metrics
    const sumMetric = (data: GA4Snapshot[], key: keyof GA4Snapshot) => 
      data.reduce((sum, d) => sum + (Number(d[key]) || 0), 0);

    // Helper to average metrics
    const avgMetric = (data: GA4Snapshot[], key: keyof GA4Snapshot) => {
      if (data.length === 0) return 0;
      return sumMetric(data, key) / data.length;
    };

    // Calculate metrics for both weeks
    const thisWeekMetrics = {
      users: sumMetric(thisWeekData, "active_users"),
      newUsers: sumMetric(thisWeekData, "new_users"),
      sessions: sumMetric(thisWeekData, "sessions"),
      pageViews: sumMetric(thisWeekData, "page_views"),
      avgDuration: avgMetric(thisWeekData, "avg_session_duration"),
      bounceRate: avgMetric(thisWeekData, "bounce_rate"),
      revenue: sumMetric(thisWeekData, "revenue"),
      purchases: sumMetric(thisWeekData, "purchases"),
    };

    const lastWeekMetrics = {
      users: sumMetric(lastWeekData, "active_users"),
      newUsers: sumMetric(lastWeekData, "new_users"),
      sessions: sumMetric(lastWeekData, "sessions"),
      pageViews: sumMetric(lastWeekData, "page_views"),
      avgDuration: avgMetric(lastWeekData, "avg_session_duration"),
      bounceRate: avgMetric(lastWeekData, "bounce_rate"),
      revenue: sumMetric(lastWeekData, "revenue"),
      purchases: sumMetric(lastWeekData, "purchases"),
    };

    return {
      thisWeek: thisWeekMetrics,
      lastWeek: lastWeekMetrics,
      thisWeekDays: thisWeekData.length,
      lastWeekDays: lastWeekData.length,
      thisWeekRange: `${format(thisWeekStart, "d MMM", { locale: nl })} - ${format(thisWeekEnd, "d MMM", { locale: nl })}`,
      lastWeekRange: `${format(lastWeekStart, "d MMM", { locale: nl })} - ${format(lastWeekEnd, "d MMM", { locale: nl })}`,
    };
  }, [snapshots]);

  const metrics = useMemo((): MetricRow[] | null => {
    if (!weekData) return null;

    const { thisWeek, lastWeek } = weekData;

    const calculateChange = (current: number, previous: number) => {
      const change = current - previous;
      const changePercent = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
      return { change, changePercent };
    };

    const formatNumber = (v: number) => v.toLocaleString("nl-NL");
    const formatCurrency = (v: number) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatPercent = (v: number) => `${v.toFixed(1)}%`;
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return [
      {
        key: "users",
        label: "Actieve Gebruikers",
        icon: Users,
        thisWeek: thisWeek.users,
        lastWeek: lastWeek.users,
        ...calculateChange(thisWeek.users, lastWeek.users),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "newUsers",
        label: "Nieuwe Gebruikers",
        icon: Users,
        thisWeek: thisWeek.newUsers,
        lastWeek: lastWeek.newUsers,
        ...calculateChange(thisWeek.newUsers, lastWeek.newUsers),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "sessions",
        label: "Sessies",
        icon: BarChart2,
        thisWeek: thisWeek.sessions,
        lastWeek: lastWeek.sessions,
        ...calculateChange(thisWeek.sessions, lastWeek.sessions),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "pageViews",
        label: "Paginaweergaven",
        icon: Eye,
        thisWeek: thisWeek.pageViews,
        lastWeek: lastWeek.pageViews,
        ...calculateChange(thisWeek.pageViews, lastWeek.pageViews),
        format: formatNumber,
        higherIsBetter: true,
      },
      {
        key: "avgDuration",
        label: "Gem. Sessieduur",
        icon: Clock,
        thisWeek: thisWeek.avgDuration,
        lastWeek: lastWeek.avgDuration,
        ...calculateChange(thisWeek.avgDuration, lastWeek.avgDuration),
        format: formatDuration,
        higherIsBetter: true,
      },
      {
        key: "bounceRate",
        label: "Bounce Rate",
        icon: Percent,
        thisWeek: thisWeek.bounceRate,
        lastWeek: lastWeek.bounceRate,
        ...calculateChange(thisWeek.bounceRate, lastWeek.bounceRate),
        format: formatPercent,
        higherIsBetter: false,
      },
      {
        key: "revenue",
        label: "Omzet",
        icon: DollarSign,
        thisWeek: thisWeek.revenue,
        lastWeek: lastWeek.revenue,
        ...calculateChange(thisWeek.revenue, lastWeek.revenue),
        format: formatCurrency,
        higherIsBetter: true,
      },
      {
        key: "purchases",
        label: "Transacties",
        icon: ShoppingCart,
        thisWeek: thisWeek.purchases,
        lastWeek: lastWeek.purchases,
        ...calculateChange(thisWeek.purchases, lastWeek.purchases),
        format: formatNumber,
        higherIsBetter: true,
      },
    ];
  }, [weekData]);

  const ChangeBadge = ({ value, higherIsBetter }: { value: number; higherIsBetter: boolean }) => {
    const isPositive = value > 0;
    const isGood = higherIsBetter ? isPositive : !isPositive;
    
    if (Math.abs(value) < 0.5) {
      return (
        <Badge variant="secondary" className="text-xs font-medium">
          <Minus className="w-3 h-3 mr-1" />
          0%
        </Badge>
      );
    }
    
    return (
      <Badge 
        variant="secondary"
        className={cn(
          "text-xs font-medium",
          isGood 
            ? "bg-green-500/10 text-green-600 hover:bg-green-500/20" 
            : "bg-red-500/10 text-red-600 hover:bg-red-500/20"
        )}
      >
        {isPositive ? (
          <ArrowUpRight className="w-3 h-3 mr-1" />
        ) : (
          <ArrowDownRight className="w-3 h-3 mr-1" />
        )}
        {isPositive ? "+" : ""}{value.toFixed(1)}%
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !weekData || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Week-over-Week Vergelijking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Niet genoeg data beschikbaar voor week-over-week vergelijking
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Week-over-Week Vergelijking
        </CardTitle>
        <CardDescription>
          Vergelijk de prestaties van deze week ({weekData.thisWeekRange}) met vorige week ({weekData.lastWeekRange})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Metric</TableHead>
                <TableHead className="text-right">
                  <div className="flex flex-col items-end">
                    <span>Deze Week</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {weekData.thisWeekDays} dagen data
                    </span>
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex flex-col items-end">
                    <span>Vorige Week</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {weekData.lastWeekDays} dagen data
                    </span>
                  </div>
                </TableHead>
                <TableHead className="text-right">Verschil</TableHead>
                <TableHead className="text-right w-[120px]">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <TableRow key={metric.key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{metric.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {metric.format(metric.thisWeek)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {metric.format(metric.lastWeek)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={cn(
                        metric.change > 0 
                          ? (metric.higherIsBetter ? "text-green-600" : "text-red-600")
                          : metric.change < 0 
                            ? (metric.higherIsBetter ? "text-red-600" : "text-green-600")
                            : "text-muted-foreground"
                      )}>
                        {metric.change > 0 ? "+" : ""}{metric.format(metric.change)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChangeBadge 
                        value={metric.changePercent} 
                        higherIsBetter={metric.higherIsBetter}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {metrics.filter(m => Math.abs(m.changePercent) >= 10).length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <TrendingUp className="w-4 h-4 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Significante Veranderingen</p>
                <p className="text-muted-foreground">
                  {metrics
                    .filter(m => Math.abs(m.changePercent) >= 10)
                    .map(m => {
                      const isPositive = m.changePercent > 0;
                      const isGood = m.higherIsBetter ? isPositive : !isPositive;
                      return (
                        <span key={m.key} className="inline-block mr-2">
                          <span className={isGood ? "text-green-600" : "text-red-600"}>
                            {m.label}: {isPositive ? "+" : ""}{m.changePercent.toFixed(0)}%
                          </span>
                        </span>
                      );
                    })}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

WeekOverWeekComparison.displayName = "WeekOverWeekComparison";

export default WeekOverWeekComparison;
