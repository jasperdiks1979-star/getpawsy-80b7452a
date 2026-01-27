import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Clock } from "lucide-react";
import { useVisitorTrend } from "@/hooks/useVisitorTrend";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";

export const VisitorTrendChart = () => {
  const [timeRange, setTimeRange] = useState<"30" | "60">("60");
  const { trendData, isLoading } = useVisitorTrend(Number(timeRange), 5);

  const currentTotal = trendData.length > 0 ? trendData[trendData.length - 1]?.total || 0 : 0;
  const previousTotal = trendData.length > 1 ? trendData[trendData.length - 2]?.total || 0 : 0;
  const trend = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Bezoekers Trend
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Laatste {timeRange} minuten per 5-min interval
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold">{currentTotal}</div>
              <div className={`text-xs ${trend >= 0 ? "text-green-500" : "text-red-500"}`}>
                {trend >= 0 ? "+" : ""}{trend.toFixed(0)}% vs vorige interval
              </div>
            </div>
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(value) => value && setTimeRange(value as "30" | "60")}
              className="border rounded-lg"
            >
              <ToggleGroupItem value="30" size="sm" className="text-xs px-3">
                30 min
              </ToggleGroupItem>
              <ToggleGroupItem value="60" size="sm" className="text-xs px-3">
                60 min
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBrowsing" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCheckout" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                iconSize={10}
              />
              <Area
                type="monotone"
                dataKey="browsing"
                name="Browsen"
                stackId="1"
                stroke="#3b82f6"
                fill="url(#colorBrowsing)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="cart"
                name="Winkelwagen"
                stackId="1"
                stroke="#f97316"
                fill="url(#colorCart)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="checkout"
                name="Checkout"
                stackId="1"
                stroke="#22c55e"
                fill="url(#colorCheckout)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
