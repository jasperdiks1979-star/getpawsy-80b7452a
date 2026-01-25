import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { nl } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface MetricDataPoint {
  date: string;
  LCP: number | null;
  FID: number | null;
  CLS: number | null;
  FCP: number | null;
  TTFB: number | null;
}

const METRIC_COLORS = {
  LCP: "hsl(var(--chart-1))",
  FID: "hsl(var(--chart-2))",
  CLS: "hsl(var(--chart-3))",
  FCP: "hsl(var(--chart-4))",
  TTFB: "hsl(var(--chart-5))",
};

const METRIC_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

const chartConfig = {
  LCP: { label: "LCP (ms)", color: METRIC_COLORS.LCP },
  FID: { label: "FID (ms)", color: METRIC_COLORS.FID },
  CLS: { label: "CLS", color: METRIC_COLORS.CLS },
  FCP: { label: "FCP (ms)", color: METRIC_COLORS.FCP },
  TTFB: { label: "TTFB (ms)", color: METRIC_COLORS.TTFB },
};

const PerformanceTrendsChart = memo(() => {
  const [timeRange, setTimeRange] = useState<"7" | "14" | "30">("7");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["LCP", "FID", "CLS"]);

  const { data: metricsData, isLoading } = useQuery({
    queryKey: ["performance-trends", timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), parseInt(timeRange));
      
      const { data, error } = await supabase
        .from("performance_metrics")
        .select("metric_name, metric_value, created_at")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const chartData = useMemo(() => {
    if (!metricsData?.length) return [];

    const days = parseInt(timeRange);
    const dateRange = eachDayOfInterval({
      start: subDays(new Date(), days - 1),
      end: new Date(),
    });

    // Group metrics by date
    const groupedByDate: Record<string, Record<string, number[]>> = {};
    
    dateRange.forEach(date => {
      const dateKey = format(date, "yyyy-MM-dd");
      groupedByDate[dateKey] = {
        LCP: [],
        FID: [],
        CLS: [],
        FCP: [],
        TTFB: [],
      };
    });

    metricsData.forEach(metric => {
      const dateKey = format(new Date(metric.created_at), "yyyy-MM-dd");
      if (groupedByDate[dateKey] && groupedByDate[dateKey][metric.metric_name]) {
        groupedByDate[dateKey][metric.metric_name].push(Number(metric.metric_value));
      }
    });

    // Calculate daily averages
    return dateRange.map(date => {
      const dateKey = format(date, "yyyy-MM-dd");
      const dayData = groupedByDate[dateKey];
      
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      
      return {
        date: format(date, "d MMM", { locale: nl }),
        fullDate: dateKey,
        LCP: avg(dayData.LCP),
        FID: avg(dayData.FID),
        CLS: avg(dayData.CLS),
        FCP: avg(dayData.FCP),
        TTFB: avg(dayData.TTFB),
      };
    });
  }, [metricsData, timeRange]);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics(prev => 
      prev.includes(metric) 
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const formatValue = (value: number | null, metric: string) => {
    if (value === null) return "N/A";
    if (metric === "CLS") return value.toFixed(3);
    return `${Math.round(value)}ms`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = chartData.some(d => 
    selectedMetrics.some(m => d[m as keyof MetricDataPoint] !== null)
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Core Web Vitals Trends</CardTitle>
          <CardDescription>Dagelijkse gemiddelden over tijd</CardDescription>
        </div>
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as "7" | "14" | "30")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dagen</SelectItem>
            <SelectItem value="14">14 dagen</SelectItem>
            <SelectItem value="30">30 dagen</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {/* Metric toggles */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(chartConfig).map(([key, config]) => (
            <button
              key={key}
              onClick={() => toggleMetric(key)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                selectedMetrics.includes(key)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {config.label}
            </button>
          ))}
        </div>

        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p>Nog geen performance data beschikbaar voor deze periode</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
                  tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}s` : `${value}`}
                />
                <ChartTooltip 
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium mb-1">{label}</div>
                        {payload.map((entry: any) => (
                          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-muted-foreground">
                              {chartConfig[entry.dataKey as keyof typeof chartConfig]?.label}:
                            </span>
                            <span className="font-medium">
                              {formatValue(entry.value, entry.dataKey)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {selectedMetrics.includes("LCP") && (
                  <Line
                    type="monotone"
                    dataKey="LCP"
                    stroke={METRIC_COLORS.LCP}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                {selectedMetrics.includes("FID") && (
                  <Line
                    type="monotone"
                    dataKey="FID"
                    stroke={METRIC_COLORS.FID}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                {selectedMetrics.includes("CLS") && (
                  <Line
                    type="monotone"
                    dataKey="CLS"
                    stroke={METRIC_COLORS.CLS}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    yAxisId="right"
                  />
                )}
                {selectedMetrics.includes("FCP") && (
                  <Line
                    type="monotone"
                    dataKey="FCP"
                    stroke={METRIC_COLORS.FCP}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                {selectedMetrics.includes("TTFB") && (
                  <Line
                    type="monotone"
                    dataKey="TTFB"
                    stroke={METRIC_COLORS.TTFB}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 0.5]}
                  tickFormatter={(value) => value.toFixed(2)}
                  hide={!selectedMetrics.includes("CLS")}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {/* Threshold legend */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Thresholds (Google standaard):</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
            {Object.entries(METRIC_THRESHOLDS).map(([metric, thresholds]) => (
              <div key={metric} className="space-y-0.5">
                <span className="font-medium">{metric}</span>
                <div className="text-muted-foreground">
                  <span className="text-green-600">Good</span>: &lt;{metric === "CLS" ? thresholds.good : `${thresholds.good}ms`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

PerformanceTrendsChart.displayName = "PerformanceTrendsChart";

export default PerformanceTrendsChart;
