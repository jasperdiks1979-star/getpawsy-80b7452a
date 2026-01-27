import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Bot, Globe, TrendingUp, Calendar, ArrowLeft, RefreshCw, Activity, CalendarDays, Settings } from 'lucide-react';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { GooglebotNotificationSettings } from '@/components/admin/GooglebotNotificationSettings';
import { DateRange } from 'react-day-picker';

interface CrawlerVisit {
  id: string;
  page_url: string;
  user_agent: string;
  is_googlebot: boolean;
  bot_type: string | null;
  ip_address: string | null;
  referrer: string | null;
  created_at: string;
}

const CHART_COLORS = [
  'hsl(142, 76%, 36%)', // emerald
  'hsl(217, 91%, 60%)', // blue
  'hsl(262, 83%, 58%)', // violet
  'hsl(25, 95%, 53%)',  // orange
  'hsl(173, 80%, 40%)', // teal
  'hsl(340, 82%, 52%)', // rose
  'hsl(47, 96%, 53%)',  // amber
];

const chartConfig = {
  googlebot: { label: 'Googlebot', color: 'hsl(142, 76%, 36%)' },
  other: { label: 'Andere Bots', color: 'hsl(217, 91%, 60%)' },
  visits: { label: 'Bezoeken', color: 'hsl(262, 83%, 58%)' },
};

const CrawlerAnalytics = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const { data: visits, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['crawler-analytics', dateRange?.from, dateRange?.to],
    queryFn: async () => {
      const fromDate = dateRange?.from || subDays(new Date(), 30);
      const toDate = dateRange?.to || new Date();
      
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const { data, error } = await supabase
        .from('crawler_visits')
        .select('*')
        .gte('created_at', startOfDay(fromDate).toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CrawlerVisit[];
    },
  });

  const analytics = useMemo(() => {
    if (!visits?.length) return null;

    const fromDate = dateRange?.from || subDays(new Date(), 30);
    const toDate = dateRange?.to || new Date();
    const days = eachDayOfInterval({ start: fromDate, end: toDate });

    // Daily visits
    const dailyData = days.map(day => {
      const dayStart = startOfDay(day);
      const dayVisits = visits.filter(v => {
        const visitDate = startOfDay(new Date(v.created_at));
        return visitDate.getTime() === dayStart.getTime();
      });

      return {
        date: format(day, 'dd MMM', { locale: nl }),
        fullDate: format(day, 'd MMMM', { locale: nl }),
        googlebot: dayVisits.filter(v => v.is_googlebot).length,
        other: dayVisits.filter(v => !v.is_googlebot && v.bot_type).length,
        total: dayVisits.length,
      };
    });

    // Page visits distribution
    const pageVisits: Record<string, number> = {};
    visits.forEach(v => {
      pageVisits[v.page_url] = (pageVisits[v.page_url] || 0) + 1;
    });
    const pageData = Object.entries(pageVisits)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Bot types distribution
    const botTypes: Record<string, number> = {};
    visits.forEach(v => {
      const type = v.bot_type || 'Onbekend';
      botTypes[type] = (botTypes[type] || 0) + 1;
    });
    const botData = Object.entries(botTypes)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Summary stats
    const googlebotVisits = visits.filter(v => v.is_googlebot);
    const lastGooglebotVisit = googlebotVisits.length > 0 
      ? googlebotVisits[googlebotVisits.length - 1] 
      : null;

    return {
      dailyData,
      pageData,
      botData,
      totalVisits: visits.length,
      googlebotCount: googlebotVisits.length,
      otherBotsCount: visits.filter(v => !v.is_googlebot && v.bot_type).length,
      uniquePages: Object.keys(pageVisits).length,
      lastGooglebotVisit,
    };
  }, [visits, dateRange]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                Crawler Analytics
              </h1>
              <p className="text-muted-foreground">
                Inzicht in bezoeken van zoekmachine crawlers
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Vernieuwen
            </Button>

            <div className="flex items-center gap-1 border rounded-md p-1">
              {[
                { days: 7, label: '7d' },
                { days: 14, label: '14d' },
                { days: 30, label: '30d' },
                { days: 90, label: '90d' },
              ].map(({ days, label }) => {
                const isActive = dateRange?.from && dateRange?.to &&
                  Math.round((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) === days - 1 &&
                  startOfDay(dateRange.to).getTime() === startOfDay(new Date()).getTime();
                
                return (
                  <Button
                    key={days}
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDateRange({
                      from: subDays(new Date(), days - 1),
                      to: new Date(),
                    })}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[220px] justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "d MMM", { locale: nl })} - {format(dateRange.to, "d MMM yyyy", { locale: nl })}
                      </>
                    ) : (
                      format(dateRange.from, "d MMMM yyyy", { locale: nl })
                    )
                  ) : (
                    <span>Selecteer periode</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={nl}
                  className="pointer-events-auto"
                  disabled={(date) => date > new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Totaal Bezoeken</CardDescription>
              <CardTitle className="text-3xl">{analytics?.totalVisits || 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                {dateRange?.from && dateRange?.to ? (
                  `${format(dateRange.from, "d MMM", { locale: nl })} - ${format(dateRange.to, "d MMM", { locale: nl })}`
                ) : (
                  'Geselecteerde periode'
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-emerald-600 dark:text-emerald-400">Googlebot Bezoeken</CardDescription>
              <CardTitle className="text-3xl text-emerald-700 dark:text-emerald-300">{analytics?.googlebotCount || 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                {analytics?.totalVisits ? Math.round((analytics.googlebotCount / analytics.totalVisits) * 100) : 0}% van totaal
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Andere Bots</CardDescription>
              <CardTitle className="text-3xl">{analytics?.otherBotsCount || 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                Bing, Yahoo, etc.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unieke Pagina's</CardDescription>
              <CardTitle className="text-3xl">{analytics?.uniquePages || 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Bezochte URL's
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Last Googlebot Visit Highlight */}
        {analytics?.lastGooglebotVisit && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">Laatste Googlebot bezoek:</span>
                </div>
                <span className="text-muted-foreground">
                  {format(new Date(analytics.lastGooglebotVisit.created_at), "d MMMM yyyy 'om' HH:mm:ss", { locale: nl })}
                </span>
                <code className="text-xs bg-muted px-2 py-1 rounded">{analytics.lastGooglebotVisit.page_url}</code>
                {analytics.lastGooglebotVisit.bot_type && (
                  <Badge variant="default" className="bg-emerald-500">
                    {analytics.lastGooglebotVisit.bot_type}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">Tijdlijn</TabsTrigger>
            <TabsTrigger value="pages">Pagina's</TabsTrigger>
            <TabsTrigger value="bots">Bot Types</TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-1" />
              Instellingen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle>Bezoekfrequentie over Tijd</CardTitle>
                <CardDescription>
                  Dagelijkse crawler bezoeken 
                  {dateRange?.from && dateRange?.to && (
                    <> van {format(dateRange.from, "d MMMM", { locale: nl })} t/m {format(dateRange.to, "d MMMM yyyy", { locale: nl })}</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics?.dailyData && analytics.dailyData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[400px] w-full">
                    <AreaChart data={analytics.dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorGooglebot" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.1}/>
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
                        allowDecimals={false}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="googlebot" 
                        name="Googlebot"
                        stroke="hsl(142, 76%, 36%)" 
                        fillOpacity={1} 
                        fill="url(#colorGooglebot)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="other" 
                        name="Andere Bots"
                        stroke="hsl(217, 91%, 60%)" 
                        fillOpacity={1} 
                        fill="url(#colorOther)" 
                      />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Geen data beschikbaar voor deze periode
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pages">
            <Card>
              <CardHeader>
                <CardTitle>Meest Bezochte Pagina's</CardTitle>
                <CardDescription>Top 10 pagina's die door crawlers zijn bezocht</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics?.pageData && analytics.pageData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[400px] w-full">
                    <BarChart 
                      data={analytics.pageData} 
                      layout="vertical"
                      margin={{ top: 10, right: 30, left: 100, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis 
                        type="category" 
                        dataKey="page" 
                        tick={{ fontSize: 11 }}
                        width={90}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar 
                        dataKey="count" 
                        name="Bezoeken"
                        fill="hsl(262, 83%, 58%)" 
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Geen data beschikbaar voor deze periode
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bots">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Bot Type Verdeling</CardTitle>
                  <CardDescription>Overzicht van verschillende crawler types</CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics?.botData && analytics.botData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[350px] w-full">
                      <PieChart>
                        <Pie
                          data={analytics.botData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={120}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {analytics.botData.map((_, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={CHART_COLORS[index % CHART_COLORS.length]} 
                            />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                      Geen data beschikbaar voor deze periode
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bot Types Lijst</CardTitle>
                  <CardDescription>Gedetailleerd overzicht per bot type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics?.botData?.map((bot, index) => (
                      <div 
                        key={bot.name} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="font-medium">{bot.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{bot.value} bezoeken</Badge>
                          <span className="text-sm text-muted-foreground">
                            ({analytics?.totalVisits ? Math.round((bot.value / analytics.totalVisits) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!analytics?.botData || analytics.botData.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        Geen bot data beschikbaar voor deze periode
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <GooglebotNotificationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CrawlerAnalytics;
