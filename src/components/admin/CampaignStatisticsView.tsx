import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { 
  ArrowLeft, 
  Eye, 
  MousePointerClick, 
  Users, 
  TrendingUp,
  Clock,
  Mail,
  Loader2
} from "lucide-react";
import { format, subDays, startOfDay, eachDayOfInterval, eachHourOfInterval, subHours } from "date-fns";
import { nl } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, LineChart, Line, Tooltip, Legend } from "recharts";

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

interface Campaign {
  id: string;
  subject: string;
  content: string;
  target_preferences: Preferences;
  sent_count: number;
  open_count: number;
  click_count: number;
  unique_opens: number;
  unique_clicks: number;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface CampaignEvent {
  id: string;
  campaign_id: string;
  event_type: string;
  email: string;
  created_at: string;
  link_url: string | null;
}

interface CampaignStatisticsViewProps {
  campaign: Campaign;
  onBack: () => void;
}

const chartConfig = {
  opens: {
    label: "Opens",
    color: "hsl(var(--chart-1))",
  },
  clicks: {
    label: "Clicks",
    color: "hsl(var(--chart-2))",
  },
};

export function CampaignStatisticsView({ campaign, onBack }: CampaignStatisticsViewProps) {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  // Fetch campaign events
  const { data: events, isLoading } = useQuery({
    queryKey: ["campaign-events", campaign.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaign_events")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data as CampaignEvent[];
    },
  });

  // Calculate time series data
  const timeSeriesData = useMemo(() => {
    if (!events || events.length === 0) return [];

    const now = new Date();
    let intervals: Date[];
    let formatStr: string;

    if (timeRange === "24h") {
      intervals = eachHourOfInterval({
        start: subHours(now, 24),
        end: now,
      });
      formatStr = "HH:mm";
    } else if (timeRange === "7d") {
      intervals = eachDayOfInterval({
        start: subDays(now, 7),
        end: now,
      });
      formatStr = "EEE";
    } else {
      intervals = eachDayOfInterval({
        start: subDays(now, 30),
        end: now,
      });
      formatStr = "d MMM";
    }

    return intervals.map((interval) => {
      const startTime = startOfDay(interval);
      const endTime = timeRange === "24h" 
        ? new Date(interval.getTime() + 60 * 60 * 1000) // 1 hour
        : new Date(startTime.getTime() + 24 * 60 * 60 * 1000); // 1 day

      const opensInPeriod = events.filter((e) => {
        const eventTime = new Date(e.created_at);
        return e.event_type === "open" && eventTime >= interval && eventTime < endTime;
      }).length;

      const clicksInPeriod = events.filter((e) => {
        const eventTime = new Date(e.created_at);
        return e.event_type === "click" && eventTime >= interval && eventTime < endTime;
      }).length;

      return {
        time: format(interval, formatStr, { locale: nl }),
        fullTime: format(interval, "d MMM HH:mm", { locale: nl }),
        opens: opensInPeriod,
        clicks: clicksInPeriod,
      };
    });
  }, [events, timeRange]);

  // Calculate cumulative data
  const cumulativeData = useMemo(() => {
    if (!events || events.length === 0) return [];

    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let totalOpens = 0;
    let totalClicks = 0;
    const dataPoints: { time: string; opens: number; clicks: number }[] = [];

    sortedEvents.forEach((event) => {
      if (event.event_type === "open") totalOpens++;
      if (event.event_type === "click") totalClicks++;

      const timeStr = format(new Date(event.created_at), "d MMM HH:mm", { locale: nl });
      const existingPoint = dataPoints.find((p) => p.time === timeStr);
      
      if (existingPoint) {
        existingPoint.opens = totalOpens;
        existingPoint.clicks = totalClicks;
      } else {
        dataPoints.push({
          time: timeStr,
          opens: totalOpens,
          clicks: totalClicks,
        });
      }
    });

    return dataPoints;
  }, [events]);

  // Calculate link click statistics
  const linkStats = useMemo(() => {
    if (!events) return [];

    const clickEvents = events.filter((e) => e.event_type === "click" && e.link_url);
    const linkCounts = new Map<string, number>();

    clickEvents.forEach((event) => {
      if (event.link_url) {
        const count = linkCounts.get(event.link_url) || 0;
        linkCounts.set(event.link_url, count + 1);
      }
    });

    return Array.from(linkCounts.entries())
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [events]);

  // Calculate hourly distribution
  const hourlyDistribution = useMemo(() => {
    if (!events) return [];

    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      opens: 0,
      clicks: 0,
    }));

    events.forEach((event) => {
      const hour = new Date(event.created_at).getHours();
      if (event.event_type === "open") hours[hour].opens++;
      if (event.event_type === "click") hours[hour].clicks++;
    });

    return hours;
  }, [events]);

  const openRate = campaign.sent_count > 0 
    ? ((campaign.unique_opens / campaign.sent_count) * 100).toFixed(1) 
    : "0.0";
  const clickRate = campaign.unique_opens > 0 
    ? ((campaign.unique_clicks / campaign.unique_opens) * 100).toFixed(1) 
    : "0.0";
  const clickToSentRate = campaign.sent_count > 0
    ? ((campaign.unique_clicks / campaign.sent_count) * 100).toFixed(1)
    : "0.0";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{campaign.subject}</h2>
            {campaign.sent_at && (
              <p className="text-muted-foreground flex items-center gap-2 mt-1">
                <Clock className="h-4 w-4" />
                Verzonden op {format(new Date(campaign.sent_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
              </p>
            )}
          </div>
        </div>
        <Badge variant="default" className="bg-green-500">
          Verzonden
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Verzonden</p>
                <p className="text-2xl font-bold">{campaign.sent_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Eye className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Rate</p>
                <p className="text-2xl font-bold">{openRate}%</p>
                <p className="text-xs text-muted-foreground">{campaign.unique_opens} uniek / {campaign.open_count} totaal</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <MousePointerClick className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Click Rate</p>
                <p className="text-2xl font-bold">{clickRate}%</p>
                <p className="text-xs text-muted-foreground">{campaign.unique_clicks} uniek / {campaign.click_count} totaal</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CTR (van verzonden)</p>
                <p className="text-2xl font-bold">{clickToSentRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Opens & Clicks over Tijd</CardTitle>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 uur</SelectItem>
              <SelectItem value="7d">7 dagen</SelectItem>
              <SelectItem value="30d">30 dagen</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {timeSeriesData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <Mail className="h-8 w-8 mr-2 opacity-50" />
              Geen data beschikbaar
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="opens" name="Opens" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicks" name="Clicks" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Two column layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Cumulative Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cumulatieve Opens & Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            {cumulativeData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                Geen data beschikbaar
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-48 w-full">
                <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area 
                    type="monotone" 
                    dataKey="opens" 
                    name="Opens" 
                    stroke="hsl(var(--chart-1))" 
                    fill="hsl(var(--chart-1))" 
                    fillOpacity={0.2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="clicks" 
                    name="Clicks" 
                    stroke="hsl(var(--chart-2))" 
                    fill="hsl(var(--chart-2))" 
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Hourly Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activiteit per Uur</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-48 w-full">
              <LineChart data={hourlyDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis 
                  dataKey="hour" 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  interval={3}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="opens" 
                  name="Opens" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="clicks" 
                  name="Clicks" 
                  stroke="hsl(var(--chart-2))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Link Statistics */}
      {linkStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Meest Geklikte Links</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {linkStats.map((link, index) => {
                const percentage = campaign.click_count > 0 
                  ? ((link.count / campaign.click_count) * 100).toFixed(1) 
                  : "0";
                return (
                  <div key={link.url} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate block"
                      >
                        {link.url}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{link.count} clicks</span>
                      <Badge variant="secondary">{percentage}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recente Activiteit</CardTitle>
        </CardHeader>
        <CardContent>
          {events && events.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...events]
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 50)
                .map((event) => (
                  <div key={event.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    {event.event_type === "open" ? (
                      <Eye className="h-4 w-4 text-green-500" />
                    ) : (
                      <MousePointerClick className="h-4 w-4 text-purple-500" />
                    )}
                    <span className="text-sm text-muted-foreground flex-1 truncate">
                      {event.email}
                    </span>
                    {event.link_url && (
                      <span className="text-xs text-muted-foreground truncate max-w-48">
                        → {event.link_url}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(event.created_at), "d MMM HH:mm", { locale: nl })}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              Nog geen activiteit geregistreerd
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
