import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  MousePointerClick, 
  ShoppingCart, 
  TrendingUp,
  Sparkles,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Target
} from "lucide-react";
import { motion } from "framer-motion";
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
  LineChart,
  Line,
  Legend
} from "recharts";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { format, subDays } from "date-fns";

interface DidYouMeanMetrics {
  impressions: number;
  categoryClicks: number;
  productClicks: number;
  viewAllClicks: number;
  categoryClickRate: number;
  productClickRate: number;
  totalEngagementRate: number;
}

interface TopSearchTerm {
  term: string;
  impressions: number;
  clicks: number;
  clickRate: number;
}

interface CategorySuggestion {
  category: string;
  impressions: number;
  clicks: number;
  clickRate: number;
}

interface DailyTrend {
  date: string;
  impressions: number;
  clicks: number;
  clickRate: number;
}

interface DidYouMeanAnalyticsProps {
  startDate?: string;
  endDate?: string;
}

const COLORS = ['hsl(25, 65%, 45%)', 'hsl(140, 35%, 45%)', 'hsl(200, 45%, 50%)', 'hsl(280, 35%, 55%)', 'hsl(45, 65%, 50%)'];

export const DidYouMeanAnalytics = ({ startDate, endDate }: DidYouMeanAnalyticsProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { invokeFunction } = useAuthenticatedFetch();
  
  const [metrics, setMetrics] = useState<DidYouMeanMetrics>({
    impressions: 0,
    categoryClicks: 0,
    productClicks: 0,
    viewAllClicks: 0,
    categoryClickRate: 0,
    productClickRate: 0,
    totalEngagementRate: 0
  });
  
  const [topSearchTerms, setTopSearchTerms] = useState<TopSearchTerm[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const dateParams = {
        startDate: startDate || format(subDays(new Date(), 7), 'yyyy-MM-dd'),
        endDate: endDate || format(new Date(), 'yyyy-MM-dd')
      };
      
      const { data, error } = await invokeFunction<{
        metrics: DidYouMeanMetrics;
        topSearchTerms: TopSearchTerm[];
        categorySuggestions: CategorySuggestion[];
        dailyTrends: DailyTrend[];
      }>('ga4-analytics', {
        body: { reportType: 'didyoumean', ...dateParams }
      });

      if (error) throw error;
      if (!data) return;

      setMetrics(data.metrics || {
        impressions: 0,
        categoryClicks: 0,
        productClicks: 0,
        viewAllClicks: 0,
        categoryClickRate: 0,
        productClickRate: 0,
        totalEngagementRate: 0
      });
      setTopSearchTerms(data.topSearchTerms || []);
      setCategorySuggestions(data.categorySuggestions || []);
      setDailyTrends(data.dailyTrends || []);
    } catch (err) {
      console.error('Error fetching Did You Mean analytics:', err);
    }
  }, [invokeFunction, startDate, endDate]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    };
    load();
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const clickDistribution = [
    { name: 'Category', value: metrics.categoryClicks, color: COLORS[0] },
    { name: 'Product', value: metrics.productClicks, color: COLORS[1] },
    { name: 'View All', value: metrics.viewAllClicks, color: COLORS[2] }
  ].filter(d => d.value > 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Did You Mean Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Track how users interact with search suggestions
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Impressions</p>
                  <p className="text-2xl font-bold">{metrics.impressions.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Times shown</p>
                </div>
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Clicks</p>
                  <p className="text-2xl font-bold">
                    {(metrics.categoryClicks + metrics.productClicks + metrics.viewAllClicks).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Interactions</p>
                </div>
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <MousePointerClick className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Engagement Rate</p>
                  <p className="text-2xl font-bold">{metrics.totalEngagementRate.toFixed(1)}%</p>
                  <div className="flex items-center gap-1 mt-1">
                    {metrics.totalEngagementRate >= 5 ? (
                      <ArrowUpRight className="w-3 h-3 text-green-600" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 text-amber-600" />
                    )}
                    <span className={`text-xs ${metrics.totalEngagementRate >= 5 ? 'text-green-600' : 'text-amber-600'}`}>
                      {metrics.totalEngagementRate >= 5 ? 'Good' : 'Can improve'}
                    </span>
                  </div>
                </div>
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Product Clicks</p>
                  <p className="text-2xl font-bold">{metrics.productClicks.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics.productClickRate.toFixed(1)}% CTR
                  </p>
                </div>
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <ShoppingCart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trends Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Daily Engagement Trends
            </CardTitle>
            <CardDescription>Impressions and clicks over time</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="impressions" 
                    stroke="hsl(200, 45%, 50%)" 
                    strokeWidth={2}
                    dot={false}
                    name="Impressions"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="clicks" 
                    stroke="hsl(140, 35%, 45%)" 
                    strokeWidth={2}
                    dot={false}
                    name="Clicks"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Click Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MousePointerClick className="w-4 h-4" />
              Click Distribution
            </CardTitle>
            <CardDescription>Where users click in suggestions</CardDescription>
          </CardHeader>
          <CardContent>
            {clickDistribution.length > 0 ? (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={clickDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {clickDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {clickDistribution.map((item) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.value} clicks
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No click data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Search Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4" />
              Top Search Terms
            </CardTitle>
            <CardDescription>Most common searches triggering suggestions</CardDescription>
          </CardHeader>
          <CardContent>
            {topSearchTerms.length > 0 ? (
              <div className="space-y-3">
                {topSearchTerms.slice(0, 8).map((term, index) => (
                  <div key={term.term} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                        {index + 1}
                      </Badge>
                      <span className="text-sm font-medium truncate max-w-[200px]">
                        {term.term}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {term.impressions} views
                      </span>
                      <Badge variant={term.clickRate >= 10 ? "default" : "secondary"}>
                        {term.clickRate.toFixed(1)}% CTR
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No search term data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Suggestions Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              Category Performance
            </CardTitle>
            <CardDescription>How category suggestions perform</CardDescription>
          </CardHeader>
          <CardContent>
            {categorySuggestions.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categorySuggestions.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis 
                    dataKey="category" 
                    type="category" 
                    width={100} 
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="clicks" fill="hsl(25, 65%, 45%)" radius={[0, 4, 4, 0]} name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DidYouMeanAnalytics;
