import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Magnet, 
  TrendingUp, 
  Users, 
  MousePointerClick, 
  Globe, 
  Target,
  BarChart3,
  PieChart
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { format, subDays, isAfter } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';

interface UTMData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
  landing_page?: string;
}

interface SubscriberWithUTM {
  id: string;
  email: string;
  subscribed_at: string;
  is_active: boolean;
  preferences: {
    utm_data?: UTMData;
    lead_magnet?: string;
  } | null;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
];

const chartConfig = {
  conversions: {
    label: 'Conversies',
    color: 'hsl(var(--chart-1))',
  },
  direct: {
    label: 'Direct',
    color: 'hsl(var(--chart-1))',
  },
  google: {
    label: 'Google',
    color: 'hsl(var(--chart-2))',
  },
  facebook: {
    label: 'Facebook',
    color: 'hsl(var(--chart-3))',
  },
  instagram: {
    label: 'Instagram',
    color: 'hsl(var(--chart-4))',
  },
  email: {
    label: 'Email',
    color: 'hsl(var(--chart-5))',
  },
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
}

const StatCard = ({ title, value, subtitle, icon: Icon, trend }: StatCardProps) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <Icon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className={`w-4 h-4 ${trend < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  </div>
);

export const LeadMagnetAnalytics = () => {
  const { data: subscribers, isLoading } = useQuery({
    queryKey: ['lead-magnet-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('id, email, subscribed_at, is_active, preferences')
        .order('subscribed_at', { ascending: false });
      
      if (error) throw error;
      return data as SubscriberWithUTM[];
    },
  });

  // Filter lead magnet signups (those with lead_magnet in preferences)
  const leadMagnetSignups = useMemo(() => {
    if (!subscribers) return [];
    return subscribers.filter(s => {
      const prefs = s.preferences as { lead_magnet?: string } | null;
      return prefs?.lead_magnet;
    });
  }, [subscribers]);

  // Calculate stats by source
  const sourceStats = useMemo(() => {
    if (!leadMagnetSignups.length) return [];
    
    const sourceCounts: Record<string, number> = {};
    
    leadMagnetSignups.forEach(sub => {
      const prefs = sub.preferences as { utm_data?: UTMData } | null;
      const source = prefs?.utm_data?.utm_source || 'direct';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });
    
    return Object.entries(sourceCounts)
      .map(([source, count]) => ({
        source: source.charAt(0).toUpperCase() + source.slice(1),
        conversions: count,
        percentage: Math.round((count / leadMagnetSignups.length) * 100),
      }))
      .sort((a, b) => b.conversions - a.conversions);
  }, [leadMagnetSignups]);

  // Calculate stats by medium
  const mediumStats = useMemo(() => {
    if (!leadMagnetSignups.length) return [];
    
    const mediumCounts: Record<string, number> = {};
    
    leadMagnetSignups.forEach(sub => {
      const prefs = sub.preferences as { utm_data?: UTMData } | null;
      const medium = prefs?.utm_data?.utm_medium || 'none';
      mediumCounts[medium] = (mediumCounts[medium] || 0) + 1;
    });
    
    return Object.entries(mediumCounts)
      .map(([medium, count]) => ({
        name: medium === 'none' ? 'Geen' : medium.charAt(0).toUpperCase() + medium.slice(1),
        value: count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [leadMagnetSignups]);

  // Calculate campaign stats
  const campaignStats = useMemo(() => {
    if (!leadMagnetSignups.length) return [];
    
    const campaignCounts: Record<string, number> = {};
    
    leadMagnetSignups.forEach(sub => {
      const prefs = sub.preferences as { utm_data?: UTMData } | null;
      const campaign = prefs?.utm_data?.utm_campaign;
      if (campaign) {
        campaignCounts[campaign] = (campaignCounts[campaign] || 0) + 1;
      }
    });
    
    return Object.entries(campaignCounts)
      .map(([campaign, count]) => ({
        campaign,
        conversions: count,
        percentage: Math.round((count / leadMagnetSignups.length) * 100),
      }))
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 10);
  }, [leadMagnetSignups]);

  // Daily conversions for the last 30 days
  const dailyConversions = useMemo(() => {
    if (!leadMagnetSignups.length) return [];
    
    const last30Days = subDays(new Date(), 30);
    const dailyCounts: Record<string, number> = {};
    
    // Initialize all days with 0
    for (let i = 0; i < 30; i++) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyCounts[date] = 0;
    }
    
    leadMagnetSignups
      .filter(sub => isAfter(new Date(sub.subscribed_at), last30Days))
      .forEach(sub => {
        const date = format(new Date(sub.subscribed_at), 'yyyy-MM-dd');
        if (dailyCounts[date] !== undefined) {
          dailyCounts[date]++;
        }
      });
    
    return Object.entries(dailyCounts)
      .map(([date, count]) => ({
        date: format(new Date(date), 'd MMM', { locale: nl }),
        conversions: count,
      }))
      .reverse();
  }, [leadMagnetSignups]);

  // Calculate week-over-week trend
  const weekTrend = useMemo(() => {
    if (!leadMagnetSignups.length) return 0;
    
    const thisWeek = leadMagnetSignups.filter(s => 
      isAfter(new Date(s.subscribed_at), subDays(new Date(), 7))
    ).length;
    
    const lastWeek = leadMagnetSignups.filter(s => {
      const date = new Date(s.subscribed_at);
      return isAfter(date, subDays(new Date(), 14)) && !isAfter(date, subDays(new Date(), 7));
    }).length;
    
    if (lastWeek === 0) return thisWeek > 0 ? 100 : 0;
    return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  }, [leadMagnetSignups]);

  // Recent signups with UTM data
  const recentSignups = useMemo(() => {
    return leadMagnetSignups.slice(0, 10).map(sub => {
      const prefs = sub.preferences as { utm_data?: UTMData; lead_magnet?: string } | null;
      return {
        email: sub.email,
        date: format(new Date(sub.subscribed_at), 'd MMM yyyy HH:mm', { locale: nl }),
        source: prefs?.utm_data?.utm_source || 'direct',
        medium: prefs?.utm_data?.utm_medium || '-',
        campaign: prefs?.utm_data?.utm_campaign || '-',
        lead_magnet: prefs?.lead_magnet || 'Onbekend',
      };
    });
  }, [leadMagnetSignups]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const totalSignups = leadMagnetSignups.length;
  const last7Days = leadMagnetSignups.filter(s => 
    isAfter(new Date(s.subscribed_at), subDays(new Date(), 7))
  ).length;
  const last30Days = leadMagnetSignups.filter(s => 
    isAfter(new Date(s.subscribed_at), subDays(new Date(), 30))
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Totaal Lead Magnet Signups"
          value={totalSignups}
          icon={Magnet}
        />
        <StatCard
          title="Laatste 7 Dagen"
          value={last7Days}
          trend={weekTrend}
          icon={TrendingUp}
        />
        <StatCard
          title="Laatste 30 Dagen"
          value={last30Days}
          icon={Users}
        />
        <StatCard
          title="Traffic Sources"
          value={sourceStats.length}
          subtitle="Unieke bronnen"
          icon={Globe}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversions by Source */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Conversies per Traffic Source
            </CardTitle>
            <CardDescription>
              Waar komen je leads vandaan?
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sourceStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Target className="w-12 h-12 mb-4 opacity-50" />
                <p>Nog geen UTM data beschikbaar</p>
                <p className="text-sm">Deel links met UTM parameters om tracking te starten</p>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis 
                      dataKey="source" 
                      type="category" 
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar 
                      dataKey="conversions" 
                      fill="hsl(var(--chart-1))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Medium Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Verdeling per Medium
            </CardTitle>
            <CardDescription>
              Welk type traffic converteert het beste?
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mediumStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <MousePointerClick className="w-12 h-12 mb-4 opacity-50" />
                <p>Nog geen medium data</p>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={mediumStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {mediumStats.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Dagelijkse Conversies (30 dagen)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyConversions.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <p>Geen data beschikbaar</p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyConversions}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    interval={4}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="conversions" 
                    fill="hsl(var(--chart-2))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Campaign Performance */}
      {campaignStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Campaign Performance
            </CardTitle>
            <CardDescription>
              Top 10 best presterende campagnes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {campaignStats.map((campaign, index) => (
                <div key={campaign.campaign} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{campaign.campaign}</p>
                    <div className="w-full bg-muted rounded-full h-2 mt-1">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${campaign.percentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{campaign.conversions}</p>
                    <p className="text-xs text-muted-foreground">{campaign.percentage}%</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Signups Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Recente Lead Magnet Signups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentSignups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Magnet className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nog geen lead magnet signups</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">E-mail</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Datum</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Bron</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Medium</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Campagne</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSignups.map((signup, index) => (
                    <tr key={index} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{signup.email}</td>
                      <td className="py-3 px-4 text-muted-foreground">{signup.date}</td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{signup.source}</Badge>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{signup.medium}</td>
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-32">{signup.campaign}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadMagnetAnalytics;
