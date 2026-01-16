import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  Users, 
  Eye, 
  TrendingUp, 
  Globe, 
  Smartphone, 
  Monitor,
  Clock,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertCircle,
  Activity,
  Zap,
  MousePointerClick,
  Loader2,
  Chrome,
  MapPin,
  Target,
  Percent,
  TrendingDown,
  DollarSign,
  Layers
} from "lucide-react";
import { motion } from "framer-motion";
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
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types for GA4 API responses
interface GA4Row {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

interface GA4Report {
  rows?: GA4Row[];
  totals?: GA4Row[];
}

interface GA4OverviewResponse {
  traffic?: GA4Report;
  topPages?: GA4Report;
  devices?: GA4Report;
  countries?: GA4Report;
  realtime?: GA4Report;
}

interface GA4RealtimeResponse {
  activeUsers?: GA4Report;
  activePages?: GA4Report;
}

interface GA4EcommerceResponse {
  transactions?: GA4Report;
  topProducts?: GA4Report;
}

interface GA4DemographicsResponse {
  browsers?: GA4Report;
  operatingSystems?: GA4Report;
  trafficSources?: GA4Report;
  cities?: GA4Report;
  ageGender?: GA4Report;
  landingPages?: GA4Report;
}

interface GA4ConversionsResponse {
  conversionEvents?: GA4Report;
  purchaseFunnel?: GA4Report;
  revenueByDate?: GA4Report;
  conversionsBySource?: GA4Report;
}

// Helper to parse GA4 response into usable format
const parseTrafficData = (report: GA4Report | undefined) => {
  if (!report?.rows) return [];
  
  const dayNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  
  return report.rows.map(row => {
    const dateStr = row.dimensionValues?.[0]?.value || '';
    const date = new Date(
      parseInt(dateStr.substring(0, 4)),
      parseInt(dateStr.substring(4, 6)) - 1,
      parseInt(dateStr.substring(6, 8))
    );
    
    return {
      date: dayNames[date.getDay()],
      fullDate: dateStr,
      users: parseInt(row.metricValues?.[0]?.value || '0'),
      pageViews: parseInt(row.metricValues?.[1]?.value || '0'),
      sessions: parseInt(row.metricValues?.[2]?.value || '0'),
      avgSessionDuration: parseFloat(row.metricValues?.[3]?.value || '0'),
      bounceRate: parseFloat(row.metricValues?.[4]?.value || '0'),
      newUsers: parseInt(row.metricValues?.[5]?.value || '0')
    };
  }).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
};

const parseTopPages = (report: GA4Report | undefined) => {
  if (!report?.rows) return [];
  
  return report.rows.slice(0, 5).map(row => ({
    page: row.dimensionValues?.[0]?.value || '/',
    views: parseInt(row.metricValues?.[0]?.value || '0'),
    avgTime: formatDuration(parseFloat(row.metricValues?.[1]?.value || '0'))
  }));
};

const parseDeviceData = (report: GA4Report | undefined) => {
  if (!report?.rows) return [];
  
  const colors: Record<string, string> = {
    mobile: "hsl(25, 65%, 45%)",
    desktop: "hsl(140, 25%, 45%)",
    tablet: "hsl(80, 25%, 45%)"
  };
  
  const total = report.rows.reduce((sum, row) => 
    sum + parseInt(row.metricValues?.[0]?.value || '0'), 0);
  
  return report.rows.map(row => {
    const name = row.dimensionValues?.[0]?.value || 'unknown';
    const value = parseInt(row.metricValues?.[0]?.value || '0');
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Math.round((value / total) * 100),
      color: colors[name.toLowerCase()] || "hsl(200, 25%, 45%)"
    };
  });
};

const parseCountryData = (report: GA4Report | undefined) => {
  if (!report?.rows) return [];
  
  const countryFlags: Record<string, string> = {
    'Netherlands': '🇳🇱',
    'Belgium': '🇧🇪',
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'United Kingdom': '🇬🇧',
    'United States': '🇺🇸',
    'Spain': '🇪🇸',
    'Italy': '🇮🇹',
    'Portugal': '🇵🇹',
    'Poland': '🇵🇱'
  };
  
  return report.rows.slice(0, 5).map(row => {
    const country = row.dimensionValues?.[0]?.value || 'Unknown';
    return {
      country,
      users: parseInt(row.metricValues?.[0]?.value || '0'),
      flag: countryFlags[country] || '🌍'
    };
  });
};

const parseActivePages = (report: GA4Report | undefined) => {
  if (!report?.rows) return [];
  
  return report.rows.slice(0, 5).map(row => ({
    page: row.dimensionValues?.[0]?.value || '/',
    activeUsers: parseInt(row.metricValues?.[0]?.value || '0')
  }));
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
};

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
  loading?: boolean;
}

const MetricCard = ({ title, value, change, icon, subtitle, loading }: MetricCardProps) => (
  <Card className="relative overflow-hidden">
    <CardContent className="p-6">
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
                {change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                <span>{Math.abs(change).toFixed(1)}% vs vorige week</span>
              </div>
            )}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            {icon}
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

interface AnalyticsDashboardProps {
  isConfigured?: boolean;
}

export const AnalyticsDashboard = ({ isConfigured = false }: AnalyticsDashboardProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [realtimeUsers, setRealtimeUsers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Data states
  const [trafficData, setTrafficData] = useState<ReturnType<typeof parseTrafficData>>([]);
  const [topPages, setTopPages] = useState<ReturnType<typeof parseTopPages>>([]);
  const [deviceData, setDeviceData] = useState<ReturnType<typeof parseDeviceData>>([]);
  const [countryData, setCountryData] = useState<ReturnType<typeof parseCountryData>>([]);
  const [activePages, setActivePages] = useState<ReturnType<typeof parseActivePages>>([]);
  const [overviewMetrics, setOverviewMetrics] = useState({
    activeUsers: 0,
    totalPageViews: 0,
    avgSessionDuration: "0m 00s",
    bounceRate: 0,
    newUsers: 0,
    returningUsers: 0,
    conversionRate: 0,
  });
  const [ecommerceData, setEcommerceData] = useState({
    transactions: 0,
    revenue: 0,
    avgOrderValue: 0,
    topProducts: [] as { name: string; sales: number; revenue: number }[]
  });
  const [realtimeHistory, setRealtimeHistory] = useState<{ time: string; users: number }[]>([]);
  
  // New demographics data states
  const [demographicsData, setDemographicsData] = useState({
    browsers: [] as { name: string; users: number; sessions: number }[],
    operatingSystems: [] as { name: string; users: number }[],
    trafficSources: [] as { channel: string; sessions: number; users: number; bounceRate: number; avgDuration: number }[],
    cities: [] as { city: string; users: number }[],
    ageGender: [] as { age: string; users: number }[],
    landingPages: [] as { page: string; sessions: number; bounceRate: number; avgDuration: number; conversions: number }[]
  });
  
  // New conversions data states
  const [conversionsData, setConversionsData] = useState({
    events: [] as { name: string; count: number; users: number }[],
    funnel: { sessions: 0, addToCarts: 0, checkouts: 0, purchases: 0, revenue: 0 },
    revenueByDate: [] as { date: string; revenue: number; purchases: number; transactions: number }[],
    conversionsBySource: [] as { channel: string; sessions: number; purchases: number; revenue: number }[]
  });

  const fetchOverviewData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data, error: fetchError } = await supabase.functions.invoke<GA4OverviewResponse>('ga4-analytics', {
        body: { reportType: 'overview' }
      });

      if (fetchError) throw fetchError;
      if (!data) throw new Error('No data received');

      // Parse traffic data
      const parsedTraffic = parseTrafficData(data.traffic);
      setTrafficData(parsedTraffic);

      // Calculate overview metrics from traffic data
      const totalUsers = parsedTraffic.reduce((sum, d) => sum + d.users, 0);
      const totalPageViews = parsedTraffic.reduce((sum, d) => sum + d.pageViews, 0);
      const totalNewUsers = parsedTraffic.reduce((sum, d) => sum + d.newUsers, 0);
      const avgDuration = parsedTraffic.length > 0 
        ? parsedTraffic.reduce((sum, d) => sum + d.avgSessionDuration, 0) / parsedTraffic.length 
        : 0;
      const avgBounce = parsedTraffic.length > 0
        ? parsedTraffic.reduce((sum, d) => sum + d.bounceRate, 0) / parsedTraffic.length
        : 0;

      // Get realtime users
      const realtimeValue = parseInt(data.realtime?.rows?.[0]?.metricValues?.[0]?.value || '0');
      setRealtimeUsers(realtimeValue);

      setOverviewMetrics({
        activeUsers: realtimeValue,
        totalPageViews,
        avgSessionDuration: formatDuration(avgDuration),
        bounceRate: avgBounce * 100,
        newUsers: totalNewUsers,
        returningUsers: totalUsers - totalNewUsers,
        conversionRate: 0,
      });

      // Parse other data
      setTopPages(parseTopPages(data.topPages));
      setDeviceData(parseDeviceData(data.devices));
      setCountryData(parseCountryData(data.countries));
      
      setError(null);
    } catch (err) {
      console.error('Error fetching GA4 data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics data';
      setError(errorMessage);
      toast.error('Fout bij ophalen analytics data', {
        description: errorMessage
      });
    }
  }, []);

  const fetchRealtimeData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fetchError } = await supabase.functions.invoke<GA4RealtimeResponse>('ga4-analytics', {
        body: { reportType: 'realtime' }
      });

      if (fetchError) throw fetchError;
      if (!data) return;

      const activeUserCount = parseInt(data.activeUsers?.rows?.[0]?.metricValues?.[0]?.value || '0');
      setRealtimeUsers(activeUserCount);
      
      // Update realtime history
      setRealtimeHistory(prev => {
        const now = new Date();
        const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;
        const newHistory = [...prev, { time: timeStr, users: activeUserCount }];
        return newHistory.slice(-6); // Keep last 6 data points
      });

      setActivePages(parseActivePages(data.activePages));
    } catch (err) {
      console.error('Error fetching realtime data:', err);
    }
  }, []);

  const fetchEcommerceData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fetchError } = await supabase.functions.invoke<GA4EcommerceResponse>('ga4-analytics', {
        body: { reportType: 'ecommerce' }
      });

      if (fetchError) throw fetchError;
      if (!data) return;

      const transactionRow = data.transactions?.rows?.[0];
      if (transactionRow) {
        setEcommerceData({
          transactions: parseInt(transactionRow.metricValues?.[0]?.value || '0'),
          revenue: parseFloat(transactionRow.metricValues?.[1]?.value || '0'),
          avgOrderValue: parseFloat(transactionRow.metricValues?.[2]?.value || '0'),
          topProducts: data.topProducts?.rows?.slice(0, 4).map(row => ({
            name: row.dimensionValues?.[0]?.value || 'Unknown',
            sales: parseInt(row.metricValues?.[1]?.value || '0'),
            revenue: parseFloat(row.metricValues?.[2]?.value || '0')
          })) || []
        });
      }
    } catch (err) {
      console.error('Error fetching e-commerce data:', err);
    }
  }, []);

  const fetchDemographicsData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fetchError } = await supabase.functions.invoke<GA4DemographicsResponse>('ga4-analytics', {
        body: { reportType: 'demographics' }
      });

      if (fetchError) throw fetchError;
      if (!data) return;

      setDemographicsData({
        browsers: data.browsers?.rows?.map(row => ({
          name: row.dimensionValues?.[0]?.value || 'Unknown',
          users: parseInt(row.metricValues?.[0]?.value || '0'),
          sessions: parseInt(row.metricValues?.[1]?.value || '0')
        })) || [],
        operatingSystems: data.operatingSystems?.rows?.map(row => ({
          name: row.dimensionValues?.[0]?.value || 'Unknown',
          users: parseInt(row.metricValues?.[0]?.value || '0')
        })) || [],
        trafficSources: data.trafficSources?.rows?.map(row => ({
          channel: row.dimensionValues?.[0]?.value || 'Unknown',
          sessions: parseInt(row.metricValues?.[0]?.value || '0'),
          users: parseInt(row.metricValues?.[1]?.value || '0'),
          bounceRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
          avgDuration: parseFloat(row.metricValues?.[3]?.value || '0')
        })) || [],
        cities: data.cities?.rows?.slice(0, 8).map(row => ({
          city: row.dimensionValues?.[0]?.value || 'Unknown',
          users: parseInt(row.metricValues?.[0]?.value || '0')
        })) || [],
        ageGender: data.ageGender?.rows?.map(row => ({
          age: row.dimensionValues?.[0]?.value || 'Unknown',
          users: parseInt(row.metricValues?.[0]?.value || '0')
        })) || [],
        landingPages: data.landingPages?.rows?.slice(0, 5).map(row => ({
          page: row.dimensionValues?.[0]?.value || '/',
          sessions: parseInt(row.metricValues?.[0]?.value || '0'),
          bounceRate: parseFloat(row.metricValues?.[1]?.value || '0') * 100,
          avgDuration: parseFloat(row.metricValues?.[2]?.value || '0'),
          conversions: parseInt(row.metricValues?.[3]?.value || '0')
        })) || []
      });
    } catch (err) {
      console.error('Error fetching demographics data:', err);
    }
  }, []);

  const fetchConversionsData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fetchError } = await supabase.functions.invoke<GA4ConversionsResponse>('ga4-analytics', {
        body: { reportType: 'conversions' }
      });

      if (fetchError) throw fetchError;
      if (!data) return;

      const funnelRow = data.purchaseFunnel?.rows?.[0];
      const dayNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

      setConversionsData({
        events: data.conversionEvents?.rows?.slice(0, 10).map(row => ({
          name: row.dimensionValues?.[0]?.value || 'Unknown',
          count: parseInt(row.metricValues?.[0]?.value || '0'),
          users: parseInt(row.metricValues?.[1]?.value || '0')
        })) || [],
        funnel: {
          sessions: parseInt(funnelRow?.metricValues?.[0]?.value || '0'),
          addToCarts: parseInt(funnelRow?.metricValues?.[1]?.value || '0'),
          checkouts: parseInt(funnelRow?.metricValues?.[2]?.value || '0'),
          purchases: parseInt(funnelRow?.metricValues?.[3]?.value || '0'),
          revenue: parseFloat(funnelRow?.metricValues?.[4]?.value || '0')
        },
        revenueByDate: data.revenueByDate?.rows?.map(row => {
          const dateStr = row.dimensionValues?.[0]?.value || '';
          const date = new Date(
            parseInt(dateStr.substring(0, 4)),
            parseInt(dateStr.substring(4, 6)) - 1,
            parseInt(dateStr.substring(6, 8))
          );
          return {
            date: dayNames[date.getDay()],
            revenue: parseFloat(row.metricValues?.[0]?.value || '0'),
            purchases: parseInt(row.metricValues?.[1]?.value || '0'),
            transactions: parseInt(row.metricValues?.[2]?.value || '0')
          };
        }) || [],
        conversionsBySource: data.conversionsBySource?.rows?.map(row => ({
          channel: row.dimensionValues?.[0]?.value || 'Unknown',
          sessions: parseInt(row.metricValues?.[0]?.value || '0'),
          purchases: parseInt(row.metricValues?.[1]?.value || '0'),
          revenue: parseFloat(row.metricValues?.[2]?.value || '0')
        })) || []
      });
    } catch (err) {
      console.error('Error fetching conversions data:', err);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;

    const loadData = async () => {
      setIsLoading(true);
      await fetchOverviewData();
      setIsLoading(false);
    };

    loadData();
  }, [isConfigured, fetchOverviewData]);

  // Realtime updates every 30 seconds
  useEffect(() => {
    if (!isConfigured || activeTab !== 'realtime') return;

    fetchRealtimeData();
    const interval = setInterval(fetchRealtimeData, 30000);

    return () => clearInterval(interval);
  }, [isConfigured, activeTab, fetchRealtimeData]);

  // Fetch e-commerce data when tab changes
  useEffect(() => {
    if (!isConfigured || activeTab !== 'ecommerce') return;
    fetchEcommerceData();
  }, [isConfigured, activeTab, fetchEcommerceData]);

  // Fetch demographics data when tab changes
  useEffect(() => {
    if (!isConfigured || activeTab !== 'demographics') return;
    fetchDemographicsData();
  }, [isConfigured, activeTab, fetchDemographicsData]);

  // Fetch conversions data when tab changes
  useEffect(() => {
    if (!isConfigured || activeTab !== 'conversions') return;
    fetchConversionsData();
  }, [isConfigured, activeTab, fetchConversionsData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchOverviewData();
    if (activeTab === 'realtime') await fetchRealtimeData();
    if (activeTab === 'ecommerce') await fetchEcommerceData();
    if (activeTab === 'demographics') await fetchDemographicsData();
    if (activeTab === 'conversions') await fetchConversionsData();
    setIsRefreshing(false);
    toast.success('Analytics data vernieuwd');
  };

  if (!isConfigured) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-primary/10 rounded-full mb-6">
            <BarChart3 className="w-12 h-12 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Google Analytics Koppeling</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Koppel je Google Analytics 4 account om realtime inzichten, 
            bezoekersstatistieken en e-commerce data te bekijken.
          </p>
          
          <div className="bg-muted/50 rounded-lg p-6 max-w-lg text-left space-y-4 mb-6">
            <h4 className="font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              Wat heb je nodig?
            </h4>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                <span>Een Google Cloud Project met de <strong>Analytics Data API</strong> ingeschakeld</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                <span>Een <strong>Service Account</strong> met Viewer toegang tot je GA4 property</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                <span>De <strong>JSON key</strong> van het service account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                <span>Je <strong>GA4 Property ID</strong> (te vinden in GA4 Admin → Property Settings)</span>
              </li>
            </ol>
          </div>

          <Badge variant="secondary" className="text-sm">
            Deel je credentials via de chat om de koppeling te voltooien
          </Badge>
        </CardContent>
      </Card>
    );
  }

  if (error && !isLoading) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-destructive/10 rounded-full mb-6">
            <AlertCircle className="w-12 h-12 text-destructive" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Fout bij laden analytics</h3>
          <p className="text-muted-foreground max-w-md mb-6">{error}</p>
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Realtime inzichten van je webshop</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-green-500 animate-pulse" />
            Live
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Overzicht
          </TabsTrigger>
          <TabsTrigger value="realtime" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Realtime
          </TabsTrigger>
          <TabsTrigger value="audience" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Publiek
          </TabsTrigger>
          <TabsTrigger value="demographics" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Demografie
          </TabsTrigger>
          <TabsTrigger value="conversions" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Conversies
          </TabsTrigger>
          <TabsTrigger value="ecommerce" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            E-commerce
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Actieve Gebruikers"
              value={overviewMetrics.activeUsers.toLocaleString()}
              icon={<Users className="w-5 h-5" />}
              subtitle="Nu actief"
              loading={isLoading}
            />
            <MetricCard
              title="Paginaweergaven"
              value={overviewMetrics.totalPageViews.toLocaleString()}
              icon={<Eye className="w-5 h-5" />}
              subtitle="Laatste 7 dagen"
              loading={isLoading}
            />
            <MetricCard
              title="Gem. Sessieduur"
              value={overviewMetrics.avgSessionDuration}
              icon={<Clock className="w-5 h-5" />}
              loading={isLoading}
            />
            <MetricCard
              title="Bounce Rate"
              value={`${overviewMetrics.bounceRate.toFixed(1)}%`}
              icon={<TrendingUp className="w-5 h-5" />}
              loading={isLoading}
            />
          </div>

          {/* Traffic Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Verkeer Overzicht</CardTitle>
              <CardDescription>Gebruikers en paginaweergaven van de afgelopen week</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trafficData}>
                      <defs>
                        <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(25, 65%, 45%)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(25, 65%, 45%)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPageViews" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(140, 25%, 45%)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(140, 25%, 45%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }} 
                      />
                      <Area
                        type="monotone"
                        dataKey="users"
                        stroke="hsl(25, 65%, 45%)"
                        fillOpacity={1}
                        fill="url(#colorUsers)"
                        name="Gebruikers"
                      />
                      <Area
                        type="monotone"
                        dataKey="pageViews"
                        stroke="hsl(140, 25%, 45%)"
                        fillOpacity={1}
                        fill="url(#colorPageViews)"
                        name="Paginaweergaven"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Pages */}
          <Card>
            <CardHeader>
              <CardTitle>Top Pagina's</CardTitle>
              <CardDescription>Meest bezochte pagina's vandaag</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : topPages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
              ) : (
                <div className="space-y-4">
                  {topPages.map((page, index) => (
                    <div key={page.page} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                        <span className="font-medium truncate max-w-[200px]">{page.page}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {page.views.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {page.avgTime}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Realtime Tab */}
        <TabsContent value="realtime" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Counter */}
            <Card className="lg:col-span-1">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <motion.div
                  key={realtimeUsers}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center"
                >
                  <div className="text-6xl font-bold text-primary mb-2">{realtimeUsers}</div>
                  <p className="text-muted-foreground">Gebruikers nu actief</p>
                </motion.div>
                <div className="flex items-center gap-2 mt-4">
                  <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">Live bijgewerkt (elke 30s)</span>
                </div>
              </CardContent>
            </Card>

            {/* Realtime Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Gebruikers per Minuut
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={realtimeHistory.length > 0 ? realtimeHistory : [{ time: 'Nu', users: realtimeUsers }]}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="users"
                        stroke="hsl(25, 65%, 45%)"
                        strokeWidth={2}
                        dot={{ fill: "hsl(25, 65%, 45%)" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Pages */}
          <Card>
            <CardHeader>
              <CardTitle>Actieve Pagina's</CardTitle>
              <CardDescription>Waar gebruikers nu zijn</CardDescription>
            </CardHeader>
            <CardContent>
              {activePages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Geen actieve pagina's</p>
              ) : (
                <div className="space-y-3">
                  {activePages.map((page) => (
                    <div key={page.page} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <MousePointerClick className="w-4 h-4 text-primary" />
                        <span className="font-medium truncate max-w-[300px]">{page.page}</span>
                      </div>
                      <Badge variant="secondary">{page.activeUsers} actief</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audience Tab */}
        <TabsContent value="audience" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Apparaten</CardTitle>
                <CardDescription>Verdeling per apparaattype</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : deviceData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
                ) : (
                  <>
                    <div className="h-64 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={deviceData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {deviceData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                      {deviceData.map((device) => (
                        <div key={device.name} className="flex items-center gap-2 text-sm">
                          {device.name.toLowerCase() === "mobile" && <Smartphone className="w-4 h-4" style={{ color: device.color }} />}
                          {device.name.toLowerCase() === "desktop" && <Monitor className="w-4 h-4" style={{ color: device.color }} />}
                          {device.name.toLowerCase() === "tablet" && <Smartphone className="w-4 h-4" style={{ color: device.color }} />}
                          <span>{device.name}: {device.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Countries */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Landen
                </CardTitle>
                <CardDescription>Top landen op basis van gebruikers</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-40 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : countryData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
                ) : (
                  <div className="space-y-4">
                    {countryData.map((country) => (
                      <div key={country.country} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{country.flag}</span>
                          <span className="font-medium">{country.country}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-32 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${(country.users / (countryData[0]?.users || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-16 text-right">
                            {country.users.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* User Types */}
          <Card>
            <CardHeader>
              <CardTitle>Nieuwe vs Terugkerende Gebruikers</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center p-6 bg-primary/5 rounded-lg">
                    <div className="text-4xl font-bold text-primary mb-2">
                      {overviewMetrics.newUsers.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground">Nieuwe Gebruikers</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {overviewMetrics.newUsers + overviewMetrics.returningUsers > 0
                        ? Math.round((overviewMetrics.newUsers / (overviewMetrics.newUsers + overviewMetrics.returningUsers)) * 100)
                        : 0}%
                    </p>
                  </div>
                  <div className="text-center p-6 bg-secondary/50 rounded-lg">
                    <div className="text-4xl font-bold text-secondary-foreground mb-2">
                      {overviewMetrics.returningUsers.toLocaleString()}
                    </div>
                    <p className="text-muted-foreground">Terugkerende Gebruikers</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {overviewMetrics.newUsers + overviewMetrics.returningUsers > 0
                        ? Math.round((overviewMetrics.returningUsers / (overviewMetrics.newUsers + overviewMetrics.returningUsers)) * 100)
                        : 0}%
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Demographics Tab */}
        <TabsContent value="demographics" className="space-y-6">
          {/* Traffic Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Verkeersbronnen
              </CardTitle>
              <CardDescription>Waar komen je bezoekers vandaan</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : demographicsData.trafficSources.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
              ) : (
                <div className="space-y-4">
                  {demographicsData.trafficSources.map((source, index) => {
                    const maxSessions = demographicsData.trafficSources[0]?.sessions || 1;
                    return (
                      <div key={source.channel} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                            <span className="font-medium">{source.channel}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{source.sessions.toLocaleString()} sessies</span>
                            <span className="text-xs">{source.bounceRate.toFixed(1)}% bounce</span>
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${(source.sessions / maxSessions) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Browsers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Chrome className="w-5 h-5" />
                  Browsers
                </CardTitle>
                <CardDescription>Meest gebruikte browsers</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : demographicsData.browsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={demographicsData.browsers.slice(0, 6)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis dataKey="name" type="category" className="text-xs" width={80} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px"
                          }} 
                        />
                        <Bar dataKey="users" fill="hsl(25, 65%, 45%)" radius={[0, 4, 4, 0]} name="Gebruikers" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Steden
                </CardTitle>
                <CardDescription>Top steden van bezoekers</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : demographicsData.cities.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
                ) : (
                  <div className="space-y-3">
                    {demographicsData.cities.map((city, index) => (
                      <div key={city.city} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                          <span className="font-medium">{city.city}</span>
                        </div>
                        <Badge variant="secondary">{city.users.toLocaleString()}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Operating Systems */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5" />
                Besturingssystemen
              </CardTitle>
              <CardDescription>Verdeling per OS</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : demographicsData.operatingSystems.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
              ) : (
                <div className="flex flex-wrap gap-4">
                  {demographicsData.operatingSystems.slice(0, 6).map((os) => (
                    <div key={os.name} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <span className="font-medium">{os.name}</span>
                      <Badge variant="outline">{os.users.toLocaleString()}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Landing Pages */}
          {demographicsData.landingPages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Landing Pages</CardTitle>
                <CardDescription>Pagina's waar bezoekers binnenkomen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {demographicsData.landingPages.map((page, index) => (
                    <div key={page.page} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                        <span className="font-medium truncate max-w-[250px]">{page.page}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{page.sessions.toLocaleString()} sessies</span>
                        <span>{page.bounceRate.toFixed(1)}% bounce</span>
                        <span>{formatDuration(page.avgDuration)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Conversions Tab */}
        <TabsContent value="conversions" className="space-y-6">
          {/* Conversion Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Conversie Funnel
              </CardTitle>
              <CardDescription>Van sessie tot aankoop</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold">{conversionsData.funnel.sessions.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground">Sessies</p>
                  </div>
                  <div className="text-center p-4 bg-muted/40 rounded-lg relative">
                    <div className="text-2xl font-bold">{conversionsData.funnel.addToCarts.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground">Add to Cart</p>
                    {conversionsData.funnel.sessions > 0 && (
                      <span className="text-xs text-primary">
                        {((conversionsData.funnel.addToCarts / conversionsData.funnel.sessions) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{conversionsData.funnel.checkouts.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground">Checkout</p>
                    {conversionsData.funnel.addToCarts > 0 && (
                      <span className="text-xs text-primary">
                        {((conversionsData.funnel.checkouts / conversionsData.funnel.addToCarts) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="text-center p-4 bg-primary/10 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{conversionsData.funnel.purchases.toLocaleString()}</div>
                    <p className="text-sm text-muted-foreground">Aankopen</p>
                    {conversionsData.funnel.checkouts > 0 && (
                      <span className="text-xs text-primary">
                        {((conversionsData.funnel.purchases / conversionsData.funnel.checkouts) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="text-center p-4 bg-green-500/10 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">€{conversionsData.funnel.revenue.toFixed(0)}</div>
                    <p className="text-sm text-muted-foreground">Omzet</p>
                    {conversionsData.funnel.sessions > 0 && (
                      <span className="text-xs text-green-600">
                        CR: {((conversionsData.funnel.purchases / conversionsData.funnel.sessions) * 100).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Omzet per Dag
              </CardTitle>
              <CardDescription>Omzet trend van de afgelopen week</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-72 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : conversionsData.revenueByDate.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Geen omzet data beschikbaar</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={conversionsData.revenueByDate}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(140, 40%, 45%)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(140, 40%, 45%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(value) => `€${value}`} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                        formatter={(value: number) => [`€${value.toFixed(2)}`, 'Omzet']}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(140, 40%, 45%)"
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        name="Omzet"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversions by Source */}
            <Card>
              <CardHeader>
                <CardTitle>Conversies per Kanaal</CardTitle>
                <CardDescription>Welke kanalen converteren het best</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : conversionsData.conversionsBySource.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Geen data beschikbaar</p>
                ) : (
                  <div className="space-y-3">
                    {conversionsData.conversionsBySource.slice(0, 6).map((source) => {
                      const conversionRate = source.sessions > 0 
                        ? ((source.purchases / source.sessions) * 100).toFixed(2) 
                        : '0.00';
                      return (
                        <div key={source.channel} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div>
                            <p className="font-medium">{source.channel}</p>
                            <p className="text-sm text-muted-foreground">{source.sessions.toLocaleString()} sessies</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">€{source.revenue.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">{conversionRate}% CR</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Events */}
            <Card>
              <CardHeader>
                <CardTitle>Top Events</CardTitle>
                <CardDescription>Meest getriggerde events</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : conversionsData.events.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Geen events data beschikbaar</p>
                ) : (
                  <div className="space-y-2">
                    {conversionsData.events.slice(0, 8).map((event) => (
                      <div key={event.name} className="flex items-center justify-between py-2 border-b border-muted last:border-0">
                        <span className="font-medium truncate max-w-[180px]">{event.name}</span>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{event.count.toLocaleString()}x</span>
                          <Badge variant="outline">{event.users} users</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* E-commerce Tab */}
        <TabsContent value="ecommerce" className="space-y-6">
          {/* E-commerce Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Transacties"
              value={ecommerceData.transactions}
              icon={<ShoppingCart className="w-5 h-5" />}
              subtitle="Vandaag"
              loading={isLoading}
            />
            <MetricCard
              title="Omzet"
              value={`€${ecommerceData.revenue.toFixed(2)}`}
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle="Vandaag"
              loading={isLoading}
            />
            <MetricCard
              title="Gem. Orderwaarde"
              value={`€${ecommerceData.avgOrderValue.toFixed(2)}`}
              icon={<BarChart3 className="w-5 h-5" />}
              loading={isLoading}
            />
            <MetricCard
              title="Actieve Gebruikers"
              value={realtimeUsers}
              icon={<Users className="w-5 h-5" />}
              subtitle="Nu actief"
              loading={isLoading}
            />
          </div>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle>Top Verkochte Producten</CardTitle>
              <CardDescription>Best presterende producten</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : ecommerceData.topProducts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Geen e-commerce data beschikbaar. Zorg ervoor dat Enhanced E-commerce is ingeschakeld in GA4.
                </p>
              ) : (
                <div className="space-y-4">
                  {ecommerceData.topProducts.map((product, index) => (
                    <div key={product.name} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl font-bold text-muted-foreground">#{index + 1}</span>
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.sales} verkocht</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-primary">€{product.revenue.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">omzet</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Verkeer Trend</CardTitle>
              <CardDescription>Sessies van de afgelopen week</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-72 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trafficData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }} 
                      />
                      <Bar dataKey="sessions" fill="hsl(25, 65%, 45%)" radius={[4, 4, 0, 0]} name="Sessies" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
