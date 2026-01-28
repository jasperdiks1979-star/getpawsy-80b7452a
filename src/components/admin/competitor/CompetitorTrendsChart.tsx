import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip,
  Legend
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";

interface TrendData {
  trend: string;
  count: number;
  percentage: number;
}

const TREND_COLORS = {
  rising: "#22C55E",
  stable: "#3B82F6",
  falling: "#EF4444",
  new: "#A855F7",
};

const TREND_LABELS = {
  rising: "Stijgend",
  stable: "Stabiel",
  falling: "Dalend",
  new: "Nieuw",
};

const TREND_ICONS: Record<string, React.ReactNode> = {
  rising: <TrendingUp className="h-4 w-4 text-green-500" />,
  stable: <Minus className="h-4 w-4 text-blue-500" />,
  falling: <TrendingDown className="h-4 w-4 text-red-500" />,
  new: <Sparkles className="h-4 w-4 text-purple-500" />,
};

export const CompetitorTrendsChart = () => {
  const { data: trendData, isLoading } = useQuery({
    queryKey: ["competitor-trend-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_products")
        .select("trend");
      
      if (error) throw error;

      // Count by trend
      const counts: Record<string, number> = {
        rising: 0,
        stable: 0,
        falling: 0,
        new: 0,
      };

      (data || []).forEach((p) => {
        const trend = p.trend || "stable";
        if (counts.hasOwnProperty(trend)) {
          counts[trend]++;
        } else {
          counts.stable++;
        }
      });

      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      const trends: TrendData[] = Object.entries(counts)
        .filter(([_, count]) => count > 0)
        .map(([trend, count]) => ({
          trend,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        }));

      return { trends, total };
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trend Analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!trendData || trendData.trends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Trend Analyse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Geen trend data beschikbaar</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = trendData.trends.map((t) => ({
    name: TREND_LABELS[t.trend as keyof typeof TREND_LABELS] || t.trend,
    value: t.count,
    percentage: t.percentage,
    trend: t.trend,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-500" />
          Trend Analyse
        </CardTitle>
        <CardDescription>
          Verdeling van product trends bij competitors ({trendData.total} producten)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="h-[180px] w-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={TREND_COLORS[entry.trend as keyof typeof TREND_COLORS] || "#666"} 
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} producten`, name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {trendData.trends.map((trend) => (
              <div
                key={trend.trend}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {TREND_ICONS[trend.trend]}
                  <span className="text-sm font-medium">
                    {TREND_LABELS[trend.trend as keyof typeof TREND_LABELS]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {trend.count}
                  </Badge>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {trend.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
