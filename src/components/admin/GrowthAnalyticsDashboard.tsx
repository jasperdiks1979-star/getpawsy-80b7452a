import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  Percent,
  Smartphone,
  Monitor,
  RefreshCw,
  Calendar,
  Target,
  Users,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// Types
interface DailyMetrics {
  date: string;
  sessions: number;
  purchases: number;
  revenue: number;
  bundleItems: number;
  avgOrderValue: number;
}

interface DeviceSplit {
  device: string;
  sessions: number;
  revenue: number;
  conversionRate: number;
}

// Pastel colors for charts
const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
];

// KPI Tile Component
const KPITile = ({
  title,
  value,
  previousValue,
  format: formatType = 'number',
  icon,
  description,
}: {
  title: string;
  value: number;
  previousValue?: number;
  format?: 'currency' | 'percent' | 'number';
  icon: React.ReactNode;
  description?: string;
}) => {
  const formatValue = (val: number) => {
    switch (formatType) {
      case 'currency':
        return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'percent':
        return `${val.toFixed(2)}%`;
      default:
        return val.toLocaleString();
    }
  };

  const trend = previousValue !== undefined && previousValue > 0
    ? ((value - previousValue) / previousValue) * 100
    : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            {icon}
            <span className="text-sm font-medium">{title}</span>
          </div>
          {trend !== null && (
            <Badge variant={trend >= 0 ? 'default' : 'destructive'} className="text-xs">
              {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {Math.abs(trend).toFixed(1)}%
            </Badge>
          )}
        </div>
        <p className="text-2xl font-bold">{formatValue(value)}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
};

// Sparkline Mini Chart
const SparklineCard = ({
  title,
  data,
  dataKey,
  color,
}: {
  title: string;
  data: DailyMetrics[];
  dataKey: keyof DailyMetrics;
  color: string;
}) => {
  const latestValue = Number(data[data.length - 1]?.[dataKey]) || 0;
  const previousValue = Number(data[data.length - 2]?.[dataKey]) || 0;
  const trend = previousValue > 0 ? ((latestValue - previousValue) / previousValue) * 100 : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <span className="text-sm text-muted-foreground">{title}</span>
          <Badge variant={trend >= 0 ? 'secondary' : 'destructive'} className="text-xs">
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
          </Badge>
        </div>
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`sparkline-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                fill={`url(#sparkline-${dataKey})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const GrowthAnalyticsDashboard = () => {
  const [dateRange, setDateRange] = useState<'7' | '14' | '30'>('14');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'mobile' | 'desktop'>('all');

  // Calculate date range
  const endDate = new Date();
  const startDate = subDays(endDate, parseInt(dateRange));
  const previousStartDate = subDays(startDate, parseInt(dateRange));

  // Fetch visitor activity data
  const { data: activityData, isLoading, refetch } = useQuery({
    queryKey: ['growth-analytics', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitor_activity')
        .select('activity_type, order_value, product_quantity, device_type, created_at')
        .gte('created_at', format(startDate, 'yyyy-MM-dd'))
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  // Fetch previous period for comparison
  const { data: previousData } = useQuery({
    queryKey: ['growth-analytics-previous', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visitor_activity')
        .select('activity_type, order_value, product_quantity, device_type, created_at')
        .gte('created_at', format(previousStartDate, 'yyyy-MM-dd'))
        .lt('created_at', format(startDate, 'yyyy-MM-dd'));

      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  // Process daily metrics
  const dailyMetrics = useMemo<DailyMetrics[]>(() => {
    if (!activityData) return [];

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayActivities = activityData.filter(a => 
        format(new Date(a.created_at), 'yyyy-MM-dd') === dateStr &&
        (deviceFilter === 'all' || a.device_type === deviceFilter)
      );

      const sessions = dayActivities.filter(a => a.activity_type === 'view_item').length;
      const purchases = dayActivities.filter(a => a.activity_type === 'purchase');
      const revenue = purchases.reduce((sum, p) => sum + (Number(p.order_value) || 0), 0);
      const bundleItems = dayActivities
        .filter(a => a.activity_type === 'add_to_cart')
        .reduce((sum, a) => sum + (a.product_quantity || 1), 0);

      return {
        date: format(day, 'MMM d'),
        sessions,
        purchases: purchases.length,
        revenue,
        bundleItems,
        avgOrderValue: purchases.length > 0 ? revenue / purchases.length : 0,
      };
    });
  }, [activityData, startDate, endDate, deviceFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const sessions = dailyMetrics.reduce((sum, d) => sum + d.sessions, 0);
    const purchases = dailyMetrics.reduce((sum, d) => sum + d.purchases, 0);
    const revenue = dailyMetrics.reduce((sum, d) => sum + d.revenue, 0);
    const bundleItems = dailyMetrics.reduce((sum, d) => sum + d.bundleItems, 0);

    return {
      sessions,
      purchases,
      revenue,
      bundleItems,
      aov: purchases > 0 ? revenue / purchases : 0,
      conversionRate: sessions > 0 ? (purchases / sessions) * 100 : 0,
      bundleAttachRate: sessions > 0 ? (bundleItems / sessions) * 100 : 0,
      revenuePerSession: sessions > 0 ? revenue / sessions : 0,
    };
  }, [dailyMetrics]);

  // Calculate previous period totals
  const previousTotals = useMemo(() => {
    if (!previousData) return null;

    const sessions = previousData.filter(a => a.activity_type === 'view_item').length;
    const purchases = previousData.filter(a => a.activity_type === 'purchase');
    const revenue = purchases.reduce((sum, p) => sum + (Number(p.order_value) || 0), 0);

    return {
      sessions,
      purchases: purchases.length,
      revenue,
      aov: purchases.length > 0 ? revenue / purchases.length : 0,
      conversionRate: sessions > 0 ? (purchases.length / sessions) * 100 : 0,
      revenuePerSession: sessions > 0 ? revenue / sessions : 0,
    };
  }, [previousData]);

  // Device split data
  const deviceSplit = useMemo<DeviceSplit[]>(() => {
    if (!activityData) return [];

    const devices = ['mobile', 'desktop'];
    return devices.map(device => {
      const deviceActivities = activityData.filter(a => a.device_type === device);
      const sessions = deviceActivities.filter(a => a.activity_type === 'view_item').length;
      const purchases = deviceActivities.filter(a => a.activity_type === 'purchase');
      const revenue = purchases.reduce((sum, p) => sum + (Number(p.order_value) || 0), 0);

      return {
        device: device.charAt(0).toUpperCase() + device.slice(1),
        sessions,
        revenue,
        conversionRate: sessions > 0 ? (purchases.length / sessions) * 100 : 0,
      };
    });
  }, [activityData]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6" />
            Growth Analytics
          </h2>
          <p className="text-muted-foreground text-sm">
            AOV, Attach Rate, and Revenue Performance
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as '7' | '14' | '30')}>
            <SelectTrigger className="w-32">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="14">14 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deviceFilter} onValueChange={(v) => setDeviceFilter(v as 'all' | 'mobile' | 'desktop')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPITile
          title="Revenue per Session"
          value={totals.revenuePerSession}
          previousValue={previousTotals?.revenuePerSession}
          format="currency"
          icon={<Target className="w-4 h-4" />}
          description="Primary metric"
        />
        <KPITile
          title="Average Order Value"
          value={totals.aov}
          previousValue={previousTotals?.aov}
          format="currency"
          icon={<DollarSign className="w-4 h-4" />}
        />
        <KPITile
          title="Bundle Attach Rate"
          value={totals.bundleAttachRate}
          format="percent"
          icon={<Package className="w-4 h-4" />}
          description="Items per session"
        />
        <KPITile
          title="Conversion Rate"
          value={totals.conversionRate}
          previousValue={previousTotals?.conversionRate}
          format="percent"
          icon={<Percent className="w-4 h-4" />}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPITile
          title="Total Revenue"
          value={totals.revenue}
          previousValue={previousTotals?.revenue}
          format="currency"
          icon={<DollarSign className="w-4 h-4" />}
        />
        <KPITile
          title="Total Sessions"
          value={totals.sessions}
          previousValue={previousTotals?.sessions}
          icon={<Users className="w-4 h-4" />}
        />
        <KPITile
          title="Purchases"
          value={totals.purchases}
          previousValue={previousTotals?.purchases}
          icon={<ShoppingCart className="w-4 h-4" />}
        />
        <KPITile
          title="Bundle Items Added"
          value={totals.bundleItems}
          icon={<Package className="w-4 h-4" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
            <CardDescription>Daily revenue over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyMetrics}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AOV Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AOV Trend</CardTitle>
            <CardDescription>Average order value daily</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyMetrics}>
                  <defs>
                    <linearGradient id="aovGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'AOV']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgOrderValue"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    fill="url(#aovGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Device Split */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Mobile vs Desktop
          </CardTitle>
          <CardDescription>Performance comparison by device type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Device Chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceSplit}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="sessions"
                    nameKey="device"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {deviceSplit.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Device Stats */}
            <div className="space-y-4">
              {deviceSplit.map((device, idx) => (
                <div key={device.device} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {device.device === 'Mobile' ? (
                      <Smartphone className="w-5 h-5" style={{ color: CHART_COLORS[idx] }} />
                    ) : (
                      <Monitor className="w-5 h-5" style={{ color: CHART_COLORS[idx] }} />
                    )}
                    <div>
                      <p className="font-medium">{device.device}</p>
                      <p className="text-sm text-muted-foreground">
                        {device.sessions.toLocaleString()} sessions
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${device.revenue.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">
                      {device.conversionRate.toFixed(2)}% CVR
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sparkline Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SparklineCard
          title="Sessions"
          data={dailyMetrics}
          dataKey="sessions"
          color="hsl(var(--primary))"
        />
        <SparklineCard
          title="Purchases"
          data={dailyMetrics}
          dataKey="purchases"
          color="hsl(var(--chart-2))"
        />
        <SparklineCard
          title="Bundle Items"
          data={dailyMetrics}
          dataKey="bundleItems"
          color="hsl(var(--chart-3))"
        />
        <SparklineCard
          title="AOV"
          data={dailyMetrics}
          dataKey="avgOrderValue"
          color="hsl(var(--chart-4))"
        />
      </div>
    </div>
  );
};

export default GrowthAnalyticsDashboard;
