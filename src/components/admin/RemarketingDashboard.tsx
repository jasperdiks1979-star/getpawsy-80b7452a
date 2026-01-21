import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Mail, 
  MousePointerClick, 
  Eye, 
  ShoppingCart, 
  TrendingUp, 
  Calendar,
  Target,
  Percent
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface RemarketingEmail {
  id: string;
  order_id: string;
  customer_email: string;
  email_type: string;
  product_upsold: string;
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
  converted_at: string | null;
}

const EMAIL_TYPE_CONFIG = {
  day_14: {
    label: 'Dag 14 - Pet Carrier',
    color: '#FF6B35',
    product: 'Pet Carrier Backpack',
    discount: '10%',
  },
  day_21: {
    label: 'Dag 21 - GPS Fence',
    color: '#2D5A27',
    product: 'GPS Dog Fence',
    discount: '15%',
  },
  day_30: {
    label: 'Dag 30 - Bundle Deal',
    color: '#8B5CF6',
    product: 'Bundle Deal',
    discount: '20%',
  },
};

const StatCard = memo(({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  color = 'primary' 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ElementType;
  trend?: number;
  color?: string;
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-full bg-${color}/10`}>
          <Icon className={`h-6 w-6 text-${color}`} />
        </div>
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          <TrendingUp className={`h-4 w-4 ${trend >= 0 ? 'text-green-500' : 'text-red-500 rotate-180'}`} />
          <span className={`text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}% vs vorige week
          </span>
        </div>
      )}
    </CardContent>
  </Card>
));
StatCard.displayName = 'StatCard';

const EmailTypeCard = memo(({ 
  type, 
  stats, 
  config 
}: { 
  type: string; 
  stats: { sent: number; opened: number; clicked: number; converted: number };
  config: typeof EMAIL_TYPE_CONFIG[keyof typeof EMAIL_TYPE_CONFIG];
}) => {
  const openRate = stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : '0';
  const clickRate = stats.opened > 0 ? ((stats.clicked / stats.opened) * 100).toFixed(1) : '0';
  const conversionRate = stats.clicked > 0 ? ((stats.converted / stats.clicked) * 100).toFixed(1) : '0';

  return (
    <Card className="overflow-hidden">
      <div className="h-2" style={{ backgroundColor: config.color }} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{config.label}</CardTitle>
          <Badge variant="outline" style={{ borderColor: config.color, color: config.color }}>
            {config.discount} korting
          </Badge>
        </div>
        <CardDescription>{config.product}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-2xl font-bold">{stats.sent}</p>
            <p className="text-xs text-muted-foreground">Verzonden</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.opened}</p>
            <p className="text-xs text-muted-foreground">Geopend</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.clicked}</p>
            <p className="text-xs text-muted-foreground">Geklikt</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
            <p className="text-xs text-muted-foreground">Conversies</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Open Rate</span>
              <span className="font-medium">{openRate}%</span>
            </div>
            <Progress value={parseFloat(openRate)} className="h-2" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Click Rate</span>
              <span className="font-medium">{clickRate}%</span>
            </div>
            <Progress value={parseFloat(clickRate)} className="h-2" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Conversion Rate</span>
              <span className="font-medium">{conversionRate}%</span>
            </div>
            <Progress value={parseFloat(conversionRate)} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
EmailTypeCard.displayName = 'EmailTypeCard';

const DashboardSkeleton = memo(() => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
));
DashboardSkeleton.displayName = 'DashboardSkeleton';

export const RemarketingDashboard = memo(() => {
  const { data: emails, isLoading } = useQuery({
    queryKey: ['remarketing-emails'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_emails')
        .select('*')
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return data as RemarketingEmail[];
    },
  });

  const stats = useMemo(() => {
    if (!emails) return null;

    const byType: Record<string, { sent: number; opened: number; clicked: number; converted: number }> = {
      day_14: { sent: 0, opened: 0, clicked: 0, converted: 0 },
      day_21: { sent: 0, opened: 0, clicked: 0, converted: 0 },
      day_30: { sent: 0, opened: 0, clicked: 0, converted: 0 },
    };

    let totalSent = 0;
    let totalOpened = 0;
    let totalClicked = 0;
    let totalConverted = 0;

    // Last 7 days for trend
    const weekAgo = subDays(new Date(), 7);
    const twoWeeksAgo = subDays(new Date(), 14);
    let thisWeekSent = 0;
    let lastWeekSent = 0;

    // Daily data for chart
    const dailyData: Record<string, { date: string; sent: number; opened: number; clicked: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyData[date] = { date: format(subDays(new Date(), i), 'd MMM', { locale: nl }), sent: 0, opened: 0, clicked: 0 };
    }

    emails.forEach((email) => {
      const type = email.email_type as keyof typeof byType;
      if (byType[type]) {
        byType[type].sent++;
        if (email.opened_at) byType[type].opened++;
        if (email.clicked_at) byType[type].clicked++;
        if (email.converted_at) byType[type].converted++;
      }

      totalSent++;
      if (email.opened_at) totalOpened++;
      if (email.clicked_at) totalClicked++;
      if (email.converted_at) totalConverted++;

      const sentDate = new Date(email.sent_at);
      if (sentDate >= weekAgo) thisWeekSent++;
      else if (sentDate >= twoWeeksAgo) lastWeekSent++;

      const dateKey = format(sentDate, 'yyyy-MM-dd');
      if (dailyData[dateKey]) {
        dailyData[dateKey].sent++;
        if (email.opened_at) dailyData[dateKey].opened++;
        if (email.clicked_at) dailyData[dateKey].clicked++;
      }
    });

    const weekTrend = lastWeekSent > 0 
      ? Math.round(((thisWeekSent - lastWeekSent) / lastWeekSent) * 100)
      : thisWeekSent > 0 ? 100 : 0;

    return {
      byType,
      totals: { sent: totalSent, opened: totalOpened, clicked: totalClicked, converted: totalConverted },
      weekTrend,
      dailyData: Object.values(dailyData),
      pieData: Object.entries(byType).map(([key, value]) => ({
        name: EMAIL_TYPE_CONFIG[key as keyof typeof EMAIL_TYPE_CONFIG]?.label || key,
        value: value.sent,
        color: EMAIL_TYPE_CONFIG[key as keyof typeof EMAIL_TYPE_CONFIG]?.color || '#888',
      })),
    };
  }, [emails]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Geen remarketing data beschikbaar</p>
        </CardContent>
      </Card>
    );
  }

  const overallOpenRate = stats.totals.sent > 0 
    ? ((stats.totals.opened / stats.totals.sent) * 100).toFixed(1) 
    : '0';
  const overallClickRate = stats.totals.opened > 0 
    ? ((stats.totals.clicked / stats.totals.opened) * 100).toFixed(1) 
    : '0';
  const overallConversionRate = stats.totals.clicked > 0 
    ? ((stats.totals.converted / stats.totals.clicked) * 100).toFixed(1) 
    : '0';

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Totaal Verzonden"
          value={stats.totals.sent}
          subtitle="Remarketing emails"
          icon={Mail}
          trend={stats.weekTrend}
        />
        <StatCard
          title="Open Rate"
          value={`${overallOpenRate}%`}
          subtitle={`${stats.totals.opened} geopend`}
          icon={Eye}
        />
        <StatCard
          title="Click Rate"
          value={`${overallClickRate}%`}
          subtitle={`${stats.totals.clicked} geklikt`}
          icon={MousePointerClick}
        />
        <StatCard
          title="Conversies"
          value={stats.totals.converted}
          subtitle={`${overallConversionRate}% conversion rate`}
          icon={ShoppingCart}
        />
      </div>

      {/* Email Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(EMAIL_TYPE_CONFIG).map(([type, config]) => (
          <EmailTypeCard
            key={type}
            type={type}
            stats={stats.byType[type] || { sent: 0, opened: 0, clicked: 0, converted: 0 }}
            config={config}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Dagelijkse Prestaties (30 dagen)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="sent" name="Verzonden" fill="#FF6B35" radius={[4, 4, 0, 0]} />
                <Bar dataKey="opened" name="Geopend" fill="#2D5A27" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicked" name="Geklikt" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Verdeling per Email Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Funnel Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Conversie Funnel
          </CardTitle>
          <CardDescription>
            Van verzonden email naar aankoop
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            {[
              { label: 'Verzonden', value: stats.totals.sent, color: 'bg-blue-500' },
              { label: 'Geopend', value: stats.totals.opened, color: 'bg-yellow-500' },
              { label: 'Geklikt', value: stats.totals.clicked, color: 'bg-orange-500' },
              { label: 'Geconverteerd', value: stats.totals.converted, color: 'bg-green-500' },
            ].map((step, index, arr) => (
              <div key={step.label} className="flex-1 relative">
                <div className="text-center">
                  <div className={`${step.color} text-white rounded-lg p-4 mb-2`}>
                    <p className="text-2xl font-bold">{step.value}</p>
                  </div>
                  <p className="text-sm font-medium">{step.label}</p>
                  {index < arr.length - 1 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {step.value > 0 
                        ? `${((arr[index + 1].value / step.value) * 100).toFixed(1)}%` 
                        : '0%'
                      } →
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

RemarketingDashboard.displayName = 'RemarketingDashboard';
