import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, differenceInDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  ShoppingCart,
  Percent,
  Trophy,
  Clock,
  Target,
  Zap,
  CheckCircle,
  AlertTriangle,
  Activity,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  fetchABTestMetrics,
  processMetrics,
  determineWinner,
  canAutoRollout,
  rolloutWinner,
  isTestRolledOut,
  getRolloutHistory,
  AB_TEST_CONFIG,
  type VariantMetrics,
  type ProcessedMetrics,
} from '@/lib/ab-test-analytics';

// KPI Card Component
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning';
}

const KPICard = ({ title, value, subtitle, trend, icon, variant = 'default' }: KPICardProps) => (
  <Card className={variant === 'success' ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : ''}>
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{title}</span>
        </div>
        {trend !== undefined && (
          <Badge variant={trend >= 0 ? 'default' : 'destructive'} className="text-xs">
            {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {Math.abs(trend).toFixed(1)}%
          </Badge>
        )}
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </CardContent>
  </Card>
);

// Variant Comparison Card
const VariantCard = ({ 
  metrics, 
  isWinner, 
  otherMetrics 
}: { 
  metrics: ProcessedMetrics; 
  isWinner: boolean;
  otherMetrics?: ProcessedMetrics;
}) => {
  const lift = otherMetrics 
    ? ((metrics.revenuePerSession - otherMetrics.revenuePerSession) / otherMetrics.revenuePerSession) * 100
    : 0;

  return (
    <Card className={isWinner ? 'border-green-500 bg-green-50/30 dark:bg-green-950/10' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Variant {metrics.variant}
            {isWinner && (
              <Badge className="bg-green-500">
                <Trophy className="w-3 h-3 mr-1" />
                Winner
              </Badge>
            )}
          </CardTitle>
          <Badge variant="outline">{metrics.sessions.toLocaleString()} sessions</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Revenue/Session</p>
            <p className="text-lg font-bold">${metrics.revenuePerSession.toFixed(2)}</p>
            {lift !== 0 && isWinner && (
              <Badge variant="secondary" className="mt-1 text-xs">
                +{lift.toFixed(1)}% vs other
              </Badge>
            )}
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">AOV</p>
            <p className="text-lg font-bold">${metrics.aov.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Conversion Rate</p>
            <p className="text-lg font-bold">{metrics.conversionRate.toFixed(2)}%</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Bundle Attach</p>
            <p className="text-lg font-bold">{metrics.bundleAttachRate.toFixed(2)}%</p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Add to Cart Rate</span>
            <span className="font-medium">{metrics.addToCartRate.toFixed(1)}%</span>
          </div>
          <Progress value={metrics.addToCartRate} className="h-2" />
          
          <div className="flex justify-between text-sm">
            <span>Checkout Rate</span>
            <span className="font-medium">{metrics.checkoutRate.toFixed(1)}%</span>
          </div>
          <Progress value={metrics.checkoutRate} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
};

// Test Status Card
const TestStatusCard = ({
  testName,
  daysSinceStart,
  canRollout,
  rolloutReason,
  winner,
  confidence,
  onRollout,
  isRollingOut,
}: {
  testName: string;
  daysSinceStart: number;
  canRollout: boolean;
  rolloutReason: string;
  winner: string | null;
  confidence: number;
  onRollout: () => void;
  isRollingOut: boolean;
}) => {
  const daysProgress = Math.min((daysSinceStart / AB_TEST_CONFIG.minDays) * 100, 100);
  const { rolledOut, winner: rolledOutWinner } = isTestRolledOut(testName);

  if (rolledOut) {
    return (
      <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div>
              <p className="font-semibold">Test Completed</p>
              <p className="text-sm text-muted-foreground">
                Winner: Variant {rolledOutWinner} rolled out to 100% traffic
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Test Status
          </CardTitle>
          <Badge variant={canRollout && winner ? 'default' : 'secondary'}>
            {canRollout && winner ? 'Ready for Rollout' : 'In Progress'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Duration
            </span>
            <span>{daysSinceStart} / {AB_TEST_CONFIG.minDays} days</span>
          </div>
          <Progress value={daysProgress} className="h-2" />
        </div>

        <div className="text-sm">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-3 h-3" />
            <span>Rollout Status</span>
          </div>
          <p className={`text-xs ${canRollout ? 'text-green-600' : 'text-muted-foreground'}`}>
            {rolloutReason}
          </p>
        </div>

        {winner && (
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-3 h-3 text-amber-500" />
              <span>Current Leader</span>
            </div>
            <p className="font-medium">
              Variant {winner} ({(confidence * 100).toFixed(0)}% confidence)
            </p>
          </div>
        )}

        {canRollout && winner && (
          <Button 
            onClick={onRollout} 
            disabled={isRollingOut}
            className="w-full"
          >
            {isRollingOut ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Rolling out...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Roll Out Winner
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export const ABTestDashboard = () => {
  const [activeTest, setActiveTest] = useState<'bundle' | 'messaging'>('bundle');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [isRollingOut, setIsRollingOut] = useState(false);

  // Calculate date range (last 14 days)
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const startDate = format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const daysSinceStart = differenceInDays(new Date(), subDays(new Date(), 14));

  // Fetch A/B test metrics
  const { data: rawMetrics, isLoading, refetch } = useQuery({
    queryKey: ['ab-test-metrics', activeTest, startDate, endDate],
    queryFn: () => fetchABTestMetrics(activeTest, startDate, endDate),
    staleTime: 60000,
  });

  // Process metrics
  const processedMetrics = useMemo(() => {
    if (!rawMetrics) return [];
    return rawMetrics.map(processMetrics);
  }, [rawMetrics]);

  // Determine winner
  const winnerData = useMemo(() => {
    return determineWinner(processedMetrics);
  }, [processedMetrics]);

  // Check rollout eligibility
  const rolloutStatus = useMemo(() => {
    return canAutoRollout(daysSinceStart, rawMetrics || []);
  }, [daysSinceStart, rawMetrics]);

  // Comparison chart data
  const chartData = useMemo(() => {
    return processedMetrics.map(m => ({
      variant: `Variant ${m.variant}`,
      'Revenue/Session': m.revenuePerSession,
      'AOV': m.aov,
      'Conversion %': m.conversionRate,
      'Bundle Attach %': m.bundleAttachRate,
    }));
  }, [processedMetrics]);

  // Handle rollout
  const handleRollout = async () => {
    if (!winnerData.winner) return;
    
    setIsRollingOut(true);
    const loser = processedMetrics.find(m => m.variant !== winnerData.winner)?.variant || '';
    
    const result = await rolloutWinner(
      activeTest === 'bundle' ? 'bundle_ab' : 'messaging_ab',
      winnerData.winner,
      loser
    );
    
    if (result.success) {
      toast.success(`Variant ${winnerData.winner} rolled out successfully!`);
      refetch();
    } else {
      toast.error(`Rollout failed: ${result.error}`);
    }
    
    setIsRollingOut(false);
  };

  // Rollout history
  const rolloutHistory = getRolloutHistory();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalSessions = rawMetrics?.reduce((sum, v) => sum + v.sessions, 0) || 0;
  const totalRevenue = rawMetrics?.reduce((sum, v) => sum + v.totalRevenue, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            A/B Test Analytics
          </h2>
          <p className="text-muted-foreground text-sm">
            Compare bundle strategies and measure impact on AOV
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={deviceFilter} onValueChange={(v: 'all' | 'mobile' | 'desktop') => setDeviceFilter(v)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Test Tabs */}
      <Tabs value={activeTest} onValueChange={(v) => setActiveTest(v as 'bundle' | 'messaging')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="bundle">Bundle A/B (FBT vs Volume)</TabsTrigger>
          <TabsTrigger value="messaging">Messaging A/B</TabsTrigger>
        </TabsList>

        <TabsContent value="bundle" className="space-y-6 mt-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Total Sessions"
              value={totalSessions.toLocaleString()}
              subtitle="Last 14 days"
              icon={<Users className="w-4 h-4" />}
            />
            <KPICard
              title="Total Revenue"
              value={`$${totalRevenue.toLocaleString()}`}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <KPICard
              title="Avg Revenue/Session"
              value={`$${(totalRevenue / Math.max(totalSessions, 1)).toFixed(2)}`}
              icon={<Target className="w-4 h-4" />}
            />
            <KPICard
              title="Statistical Confidence"
              value={`${(winnerData.confidence * 100).toFixed(0)}%`}
              subtitle={winnerData.confidence >= 0.95 ? 'Significant!' : 'Gathering data...'}
              icon={<Percent className="w-4 h-4" />}
              variant={winnerData.confidence >= 0.95 ? 'success' : 'default'}
            />
          </div>

          {/* Variant Comparison */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Test Status */}
            <TestStatusCard
              testName="bundle_ab"
              daysSinceStart={daysSinceStart}
              canRollout={rolloutStatus.canRollout}
              rolloutReason={rolloutStatus.reason}
              winner={winnerData.winner}
              confidence={winnerData.confidence}
              onRollout={handleRollout}
              isRollingOut={isRollingOut}
            />

            {/* Variant Cards */}
            {processedMetrics.map((metrics, idx) => (
              <VariantCard
                key={metrics.variant}
                metrics={metrics}
                isWinner={winnerData.winner === metrics.variant}
                otherMetrics={processedMetrics[idx === 0 ? 1 : 0]}
              />
            ))}
          </div>

          {/* Comparison Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metric Comparison</CardTitle>
              <CardDescription>Side-by-side variant performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="variant" type="category" width={100} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Revenue/Session" fill="hsl(var(--primary))" />
                    <Bar dataKey="Conversion %" fill="hsl(var(--chart-2))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messaging" className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Messaging A/B Test</h3>
              <p className="text-muted-foreground mb-4">
                This test compares discount-driven vs benefit-driven copy.
                <br />
                Activate after Bundle A/B test winner is determined.
              </p>
              <Badge variant="secondary">Pending Activation</Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rollout History */}
      {rolloutHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Rollout History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rolloutHistory.map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">{entry.test_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Winner: Variant {entry.winner_variant}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {new Date(entry.rolled_out_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ABTestDashboard;
