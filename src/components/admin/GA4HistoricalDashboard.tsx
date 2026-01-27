import { memo, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Eye, 
  Clock, 
  Percent,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  DollarSign,
  ShoppingCart,
  BarChart3,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Loader2
} from "lucide-react";
import { format, subDays, differenceInDays, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import WeekOverWeekComparison from "./WeekOverWeekComparison";
import MonthOverMonthComparison from "./MonthOverMonthComparison";
import QuarterOverQuarterComparison from "./QuarterOverQuarterComparison";

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
  top_pages: unknown;
  devices: unknown;
  countries: unknown;
  traffic_sources: unknown;
  synced_at: string | null;
}

interface TopPage {
  page: string;
  views: number;
}

interface DeviceData {
  device: string;
  percentage: number;
}

interface CountryData {
  country: string;
  users: number;
}

interface TrafficSource {
  source: string;
  sessions: number;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const GA4HistoricalDashboard = memo(() => {
  const [timeRange, setTimeRange] = useState<"7" | "14" | "30" | "90">("30");
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  const { invokeFunction } = useAuthenticatedFetch();

  const { data: snapshots, isLoading, error, refetch } = useQuery({
    queryKey: ["ga4-historical-snapshots", timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), parseInt(timeRange));
      
      const { data, error } = await supabase
        .from("ga4_daily_snapshots")
        .select("*")
        .gte("report_date", format(startDate, "yyyy-MM-dd"))
        .order("report_date", { ascending: true });

      if (error) throw error;
      return data as GA4Snapshot[];
    },
  });

  // Process chart data
  const chartData = useMemo(() => {
    if (!snapshots?.length) return [];
    
    return snapshots.map(snapshot => ({
      date: format(parseISO(snapshot.report_date), "d MMM", { locale: nl }),
      fullDate: snapshot.report_date,
      users: snapshot.active_users || 0,
      newUsers: snapshot.new_users || 0,
      sessions: snapshot.sessions || 0,
      pageViews: snapshot.page_views || 0,
      avgDuration: snapshot.avg_session_duration || 0,
      bounceRate: snapshot.bounce_rate || 0,
      revenue: snapshot.revenue || 0,
      purchases: snapshot.purchases || 0,
    }));
  }, [snapshots]);

  // Calculate totals and averages
  const metrics = useMemo(() => {
    if (!chartData.length) return null;

    const totalUsers = chartData.reduce((sum, d) => sum + d.users, 0);
    const totalSessions = chartData.reduce((sum, d) => sum + d.sessions, 0);
    const totalPageViews = chartData.reduce((sum, d) => sum + d.pageViews, 0);
    const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
    const totalPurchases = chartData.reduce((sum, d) => sum + d.purchases, 0);
    const avgBounceRate = chartData.reduce((sum, d) => sum + d.bounceRate, 0) / chartData.length;
    const avgDuration = chartData.reduce((sum, d) => sum + d.avgDuration, 0) / chartData.length;

    // Calculate trend (compare first half vs second half)
    const midpoint = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, midpoint);
    const secondHalf = chartData.slice(midpoint);

    const firstHalfUsers = firstHalf.reduce((sum, d) => sum + d.users, 0);
    const secondHalfUsers = secondHalf.reduce((sum, d) => sum + d.users, 0);
    const usersTrend = firstHalfUsers > 0 ? ((secondHalfUsers - firstHalfUsers) / firstHalfUsers) * 100 : 0;

    const firstHalfRevenue = firstHalf.reduce((sum, d) => sum + d.revenue, 0);
    const secondHalfRevenue = secondHalf.reduce((sum, d) => sum + d.revenue, 0);
    const revenueTrend = firstHalfRevenue > 0 ? ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100 : 0;

    return {
      totalUsers,
      totalSessions,
      totalPageViews,
      totalRevenue,
      totalPurchases,
      avgBounceRate,
      avgDuration,
      usersTrend,
      revenueTrend,
      daysWithData: chartData.length,
    };
  }, [chartData]);

  // Aggregate device data
  const deviceData = useMemo(() => {
    if (!snapshots?.length) return [];

    const deviceTotals: Record<string, number> = {};
    let totalCount = 0;

    snapshots.forEach(snapshot => {
      if (snapshot.devices && Array.isArray(snapshot.devices)) {
        (snapshot.devices as DeviceData[]).forEach((d) => {
          deviceTotals[d.device] = (deviceTotals[d.device] || 0) + d.percentage;
          totalCount++;
        });
      }
    });

    return Object.entries(deviceTotals)
      .map(([name, value]) => ({
        name,
        value: Math.round(value / (totalCount / Object.keys(deviceTotals).length || 1)),
      }))
      .sort((a, b) => b.value - a.value);
  }, [snapshots]);

  // Aggregate country data
  const countryData = useMemo(() => {
    if (!snapshots?.length) return [];

    const countryTotals: Record<string, number> = {};

    snapshots.forEach(snapshot => {
      if (snapshot.countries && Array.isArray(snapshot.countries)) {
        (snapshot.countries as CountryData[]).forEach((c) => {
          countryTotals[c.country] = (countryTotals[c.country] || 0) + c.users;
        });
      }
    });

    return Object.entries(countryTotals)
      .map(([country, users]) => ({ country, users }))
      .sort((a, b) => b.users - a.users)
      .slice(0, 10);
  }, [snapshots]);

  // Aggregate traffic sources
  const trafficSourceData = useMemo(() => {
    if (!snapshots?.length) return [];

    const sourceTotals: Record<string, number> = {};

    snapshots.forEach(snapshot => {
      if (snapshot.traffic_sources && Array.isArray(snapshot.traffic_sources)) {
        (snapshot.traffic_sources as TrafficSource[]).forEach((s) => {
          sourceTotals[s.source] = (sourceTotals[s.source] || 0) + s.sessions;
        });
      }
    });

    return Object.entries(sourceTotals)
      .map(([source, sessions]) => ({ source, sessions }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8);
  }, [snapshots]);

  // Aggregate top pages
  const topPagesData = useMemo(() => {
    if (!snapshots?.length) return [];

    const pageTotals: Record<string, number> = {};

    snapshots.forEach(snapshot => {
      if (snapshot.top_pages && Array.isArray(snapshot.top_pages)) {
        (snapshot.top_pages as TopPage[]).forEach((p) => {
          pageTotals[p.page] = (pageTotals[p.page] || 0) + p.views;
        });
      }
    });

    return Object.entries(pageTotals)
      .map(([page, views]) => ({ page, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [snapshots]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await invokeFunction("sync-ga4-daily", {
        body: { manual: true }
      });

      if (error) throw error;

      toast.success("GA4 data succesvol gesynchroniseerd");
      queryClient.invalidateQueries({ queryKey: ["ga4-historical-snapshots"] });
      refetch();
    } catch (err) {
      console.error("Sync error:", err);
      toast.error("Fout bij synchroniseren", {
        description: err instanceof Error ? err.message : "Probeer het later opnieuw"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const TrendBadge = ({ value, suffix = "%" }: { value: number; suffix?: string }) => {
    if (Math.abs(value) < 0.5) {
      return (
        <Badge variant="secondary" className="text-xs">
          <Minus className="w-3 h-3 mr-1" />
          Stabiel
        </Badge>
      );
    }
    
    return value > 0 ? (
      <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 text-xs">
        <ArrowUpRight className="w-3 h-3 mr-1" />
        +{value.toFixed(1)}{suffix}
      </Badge>
    ) : (
      <Badge variant="destructive" className="bg-red-500/10 text-red-600 hover:bg-red-500/20 text-xs">
        <ArrowDownRight className="w-3 h-3 mr-1" />
        {value.toFixed(1)}{suffix}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-12 text-center">
          <p className="text-destructive mb-4">Fout bij laden historische data</p>
          <Button onClick={() => refetch()}>Opnieuw proberen</Button>
        </CardContent>
      </Card>
    );
  }

  const lastSync = snapshots?.[snapshots.length - 1]?.synced_at;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Historische Analytics
          </h2>
          <p className="text-muted-foreground">
            Dagelijkse trends en vergelijkingen over tijd
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as "7" | "14" | "30" | "90")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dagen</SelectItem>
              <SelectItem value="14">14 dagen</SelectItem>
              <SelectItem value="30">30 dagen</SelectItem>
              <SelectItem value="90">90 dagen</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Nu
          </Button>
        </div>
      </div>

      {/* Last sync info */}
      {lastSync && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          Laatste sync: {format(parseISO(lastSync), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
        </div>
      )}

      {/* Key Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Totaal Gebruikers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold">{metrics.totalUsers.toLocaleString()}</span>
                  <TrendBadge value={metrics.usersTrend} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.daysWithData} dagen data
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Paginaweergaven
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold">{metrics.totalPageViews.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(metrics.totalPageViews / metrics.daysWithData).toLocaleString()} per dag gem.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Omzet
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold">€{metrics.totalRevenue.toLocaleString()}</span>
                  <TrendBadge value={metrics.revenueTrend} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.totalPurchases} transacties
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Gem. Bounce Rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-bold">{metrics.avgBounceRate.toFixed(1)}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Gem. sessieduur: {formatDuration(metrics.avgDuration)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Week-over-Week Comparison */}
      <WeekOverWeekComparison />

      {/* Month-over-Month Comparison */}
      <MonthOverMonthComparison />

      {/* Quarter-over-Quarter Comparison */}
      <QuarterOverQuarterComparison />

      {/* Charts */}
      <Tabs defaultValue="traffic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="traffic">Verkeer</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="revenue">Omzet</TabsTrigger>
          <TabsTrigger value="sources">Bronnen</TabsTrigger>
        </TabsList>

        <TabsContent value="traffic">
          <Card>
            <CardHeader>
              <CardTitle>Gebruikers & Sessies</CardTitle>
              <CardDescription>Dagelijkse trends van bezoekers</CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                            <div className="font-medium mb-2">{label}</div>
                            {payload.map((entry: any) => (
                              <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-muted-foreground capitalize">
                                  {entry.dataKey === "users" ? "Gebruikers" : 
                                   entry.dataKey === "sessions" ? "Sessies" : entry.dataKey}:
                                </span>
                                <span className="font-medium">{entry.value.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="users"
                      name="Gebruikers"
                      stroke="hsl(var(--chart-1))"
                      fill="url(#colorUsers)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="sessions"
                      name="Sessies"
                      stroke="hsl(var(--chart-2))"
                      fill="url(#colorSessions)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  Geen data beschikbaar voor deze periode
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Paginaweergaven per Dag</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                            <div className="font-medium">{label}</div>
                            <div className="text-sm text-muted-foreground">
                              Weergaven: <span className="font-medium text-foreground">{payload[0].value?.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="pageViews" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bounce Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      tickLine={false} 
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                            <div className="font-medium">{label}</div>
                            <div className="text-sm text-muted-foreground">
                              Bounce Rate: <span className="font-medium text-foreground">{Number(payload[0].value).toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="bounceRate" 
                      stroke="hsl(var(--chart-4))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Dagelijkse Omzet</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(v) => `€${v}`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                            <div className="font-medium">{label}</div>
                            <div className="text-sm text-muted-foreground">
                              Omzet: <span className="font-medium text-foreground">€{Number(payload[0].value).toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--chart-5))"
                      fill="url(#colorRevenue)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transacties per Dag</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background p-3 shadow-sm">
                            <div className="font-medium">{label}</div>
                            <div className="text-sm text-muted-foreground">
                              Transacties: <span className="font-medium text-foreground">{payload[0].value}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="purchases" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sources">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Verkeersbronnen</CardTitle>
                <CardDescription>Totaal sessies per kanaal</CardDescription>
              </CardHeader>
              <CardContent>
                {trafficSourceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={trafficSourceData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis 
                        dataKey="source" 
                        type="category" 
                        tick={{ fontSize: 12 }} 
                        tickLine={false} 
                        axisLine={false}
                        width={100}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-lg border bg-background p-3 shadow-sm">
                              <div className="font-medium">{payload[0].payload.source}</div>
                              <div className="text-sm text-muted-foreground">
                                Sessies: <span className="font-medium text-foreground">{payload[0].value?.toLocaleString()}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="sessions" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Geen brondata beschikbaar
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Landen</CardTitle>
                <CardDescription>Gebruikers per land</CardDescription>
              </CardHeader>
              <CardContent>
                {countryData.length > 0 ? (
                  <div className="space-y-3">
                    {countryData.map((country, index) => {
                      const maxUsers = countryData[0].users;
                      const percentage = (country.users / maxUsers) * 100;
                      return (
                        <div key={country.country} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <Globe className="w-3 h-3 text-muted-foreground" />
                              {country.country}
                            </span>
                            <span className="font-medium">{country.users.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.5, delay: index * 0.05 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Geen landendata beschikbaar
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Top Pages */}
      {topPagesData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meest Bezochte Pagina's</CardTitle>
            <CardDescription>Totaal weergaven over geselecteerde periode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPagesData.map((page, index) => {
                const maxViews = topPagesData[0].views;
                const percentage = (page.views / maxViews) * 100;
                return (
                  <div key={page.page} className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground w-6 text-right">{index + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="truncate max-w-[300px]" title={page.page}>
                          {page.page}
                        </span>
                        <span className="font-medium ml-2 flex-shrink-0">{page.views.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-primary rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.5, delay: index * 0.03 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

GA4HistoricalDashboard.displayName = "GA4HistoricalDashboard";

export default GA4HistoricalDashboard;
