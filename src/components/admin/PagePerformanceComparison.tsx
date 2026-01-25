import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { subDays } from "date-fns";

interface PageMetrics {
  page: string;
  avgLCP: number;
  avgFCP: number;
  avgTTFB: number;
  avgCLS: number;
  sampleCount: number;
  overallRating: "good" | "needs-improvement" | "poor";
}

const METRIC_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  CLS: { good: 0.1, poor: 0.25 },
};

const chartConfig = {
  avgLCP: { label: "LCP (ms)", color: "hsl(var(--chart-1))" },
  avgFCP: { label: "FCP (ms)", color: "hsl(var(--chart-2))" },
  avgTTFB: { label: "TTFB (ms)", color: "hsl(var(--chart-3))" },
};

const getPageLabel = (url: string): string => {
  if (!url) return "Onbekend";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path === "/" || path === "") return "Homepage";
    // Clean up the path for display
    return path.replace(/^\//, "").replace(/-/g, " ").slice(0, 30) || "Homepage";
  } catch {
    return url.slice(0, 30);
  }
};

const getRating = (metric: string, value: number): "good" | "needs-improvement" | "poor" => {
  const thresholds = METRIC_THRESHOLDS[metric as keyof typeof METRIC_THRESHOLDS];
  if (!thresholds) return "needs-improvement";
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
};

const getBarColor = (value: number, metric: string): string => {
  const rating = getRating(metric, value);
  if (rating === "good") return "hsl(142, 76%, 36%)";
  if (rating === "needs-improvement") return "hsl(38, 92%, 50%)";
  return "hsl(0, 84%, 60%)";
};

const PagePerformanceComparison = memo(() => {
  const [timeRange, setTimeRange] = useState<"7" | "14" | "30">("7");
  const [sortBy, setSortBy] = useState<"slowest" | "fastest" | "samples">("slowest");
  const [metric, setMetric] = useState<"LCP" | "FCP" | "TTFB">("LCP");

  const { data: rawMetrics, isLoading } = useQuery({
    queryKey: ["page-performance-comparison", timeRange],
    queryFn: async () => {
      const startDate = subDays(new Date(), parseInt(timeRange));
      
      const { data, error } = await supabase
        .from("performance_metrics")
        .select("metric_name, metric_value, page_url")
        .gte("created_at", startDate.toISOString())
        .not("page_url", "is", null);

      if (error) throw error;
      return data;
    },
  });

  const pageMetrics = useMemo((): PageMetrics[] => {
    if (!rawMetrics?.length) return [];

    // Group by page URL
    const grouped: Record<string, { LCP: number[]; FCP: number[]; TTFB: number[]; CLS: number[] }> = {};

    rawMetrics.forEach((m) => {
      const pageKey = m.page_url || "unknown";
      if (!grouped[pageKey]) {
        grouped[pageKey] = { LCP: [], FCP: [], TTFB: [], CLS: [] };
      }
      if (grouped[pageKey][m.metric_name as keyof typeof grouped[string]]) {
        grouped[pageKey][m.metric_name as keyof typeof grouped[string]].push(Number(m.metric_value));
      }
    });

    // Calculate averages per page
    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const pages: PageMetrics[] = Object.entries(grouped).map(([url, metrics]) => {
      const avgLCP = avg(metrics.LCP);
      const avgFCP = avg(metrics.FCP);
      const avgTTFB = avg(metrics.TTFB);
      const avgCLS = avg(metrics.CLS);
      const sampleCount = Math.max(metrics.LCP.length, metrics.FCP.length, metrics.TTFB.length, metrics.CLS.length);

      // Determine overall rating based on LCP (most important metric)
      const lcpRating = getRating("LCP", avgLCP);
      
      return {
        page: url,
        avgLCP,
        avgFCP,
        avgTTFB,
        avgCLS,
        sampleCount,
        overallRating: lcpRating,
      };
    });

    // Sort based on selection
    return pages
      .filter((p) => p.sampleCount >= 1)
      .sort((a, b) => {
        if (sortBy === "slowest") {
          const metricKey = `avg${metric}` as keyof PageMetrics;
          return (b[metricKey] as number) - (a[metricKey] as number);
        }
        if (sortBy === "fastest") {
          const metricKey = `avg${metric}` as keyof PageMetrics;
          return (a[metricKey] as number) - (b[metricKey] as number);
        }
        return b.sampleCount - a.sampleCount;
      })
      .slice(0, 10); // Top 10 pages
  }, [rawMetrics, sortBy, metric]);

  const chartData = useMemo(() => {
    return pageMetrics.map((p) => ({
      page: getPageLabel(p.page),
      fullUrl: p.page,
      value: metric === "LCP" ? p.avgLCP : metric === "FCP" ? p.avgFCP : p.avgTTFB,
      sampleCount: p.sampleCount,
      rating: p.overallRating,
    }));
  }, [pageMetrics, metric]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5 text-primary" />
              Pagina Performance Vergelijking
            </CardTitle>
            <CardDescription>Vergelijk laadtijden tussen verschillende pagina's</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={metric} onValueChange={(v) => setMetric(v as "LCP" | "FCP" | "TTFB")}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LCP">LCP</SelectItem>
                <SelectItem value="FCP">FCP</SelectItem>
                <SelectItem value="TTFB">TTFB</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "slowest" | "fastest" | "samples")}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slowest">Langzaamst</SelectItem>
                <SelectItem value="fastest">Snelst</SelectItem>
                <SelectItem value="samples">Meeste data</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as "7" | "14" | "30")}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dagen</SelectItem>
                <SelectItem value="14">14 dagen</SelectItem>
                <SelectItem value="30">30 dagen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nog geen performance data per pagina beschikbaar</p>
              <p className="text-sm mt-1">Data wordt verzameld terwijl bezoekers de site gebruiken</p>
            </div>
          </div>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`)}
                  />
                  <YAxis
                    type="category"
                    dataKey="page"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-background p-3 shadow-lg">
                          <div className="font-medium mb-2 text-sm truncate max-w-[250px]">
                            {data.page}
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">{metric}:</span>
                              <span className="font-mono font-semibold">
                                {data.value >= 1000 ? `${(data.value / 1000).toFixed(2)}s` : `${Math.round(data.value)}ms`}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Samples:</span>
                              <span>{data.sampleCount}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.value, metric)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Page Details Table */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">Detail per pagina</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Pagina</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">LCP</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">FCP</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">TTFB</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Samples</th>
                      <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageMetrics.map((page, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 truncate max-w-[200px]" title={page.page}>
                          {getPageLabel(page.page)}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {page.avgLCP >= 1000 ? `${(page.avgLCP / 1000).toFixed(2)}s` : `${Math.round(page.avgLCP)}ms`}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {page.avgFCP >= 1000 ? `${(page.avgFCP / 1000).toFixed(2)}s` : `${Math.round(page.avgFCP)}ms`}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {page.avgTTFB >= 1000 ? `${(page.avgTTFB / 1000).toFixed(2)}s` : `${Math.round(page.avgTTFB)}ms`}
                        </td>
                        <td className="py-2 text-right">{page.sampleCount}</td>
                        <td className="py-2 text-center">
                          {page.overallRating === "good" && (
                            <Badge variant="outline" className="text-green-600 border-green-600/30">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Goed
                            </Badge>
                          )}
                          {page.overallRating === "needs-improvement" && (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600/30">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Matig
                            </Badge>
                          )}
                          {page.overallRating === "poor" && (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Slecht
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: "hsl(142, 76%, 36%)" }} />
                <span>Goed (&lt;{METRIC_THRESHOLDS[metric].good}ms)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: "hsl(38, 92%, 50%)" }} />
                <span>Matig</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: "hsl(0, 84%, 60%)" }} />
                <span>Slecht (&gt;{METRIC_THRESHOLDS[metric].poor}ms)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

PagePerformanceComparison.displayName = "PagePerformanceComparison";

export default PagePerformanceComparison;
