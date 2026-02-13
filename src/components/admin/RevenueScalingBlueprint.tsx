import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import {
  RefreshCw, TrendingUp, Target, DollarSign, Zap, ListChecks,
  ChevronRight, ArrowUpRight, ArrowDownRight, Minus, Crosshair, Shield, Flame,
} from 'lucide-react';
import {
  generatePhases, generateScalingTargets, generateRevenueMatrix,
  generateWeeklyLoop, generateSuccessMetrics, generate12MonthProjections,
  type ScalingPhase, type ScalingTarget, type RevenueMatrixItem,
  type WeeklyLoopAction, type SuccessMetric, type MonthlyProjection,
} from '@/lib/seo-revenue-scaling';

function MetricCard({ label, value, trend, delta, color }: SuccessMetric) {
  const cls = color === 'green' ? 'text-emerald-600 dark:text-emerald-400'
    : color === 'yellow' ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  return (
    <Card className="min-w-0">
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <div className="flex items-end gap-2 mt-1">
          <span className={`text-2xl font-bold ${cls}`}>{value}</span>
          <TrendIcon className={`h-4 w-4 mb-1 ${cls}`} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{delta}</p>
      </CardContent>
    </Card>
  );
}

const matrixLabels: Record<string, { text: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  priority: { text: 'Revenue Priority', variant: 'default' },
  visibility: { text: 'Visibility Expansion', variant: 'secondary' },
  conversion: { text: 'Conversion Optimize', variant: 'outline' },
  underperforming: { text: 'Underperforming', variant: 'destructive' },
};

const actionIcons: Record<string, React.ReactNode> = {
  ranking_push: <Crosshair className="h-3.5 w-3.5 text-red-500" />,
  content_expansion: <TrendingUp className="h-3.5 w-3.5 text-blue-500" />,
  authority_reinforcement: <Shield className="h-3.5 w-3.5 text-amber-500" />,
  revenue_optimization: <DollarSign className="h-3.5 w-3.5 text-emerald-500" />,
};

export function RevenueScalingBlueprint() {
  const [loading, setLoading] = useState(true);
  const [phases, setPhases] = useState<ScalingPhase[]>([]);
  const [targets, setTargets] = useState<ScalingTarget[]>([]);
  const [matrix, setMatrix] = useState<RevenueMatrixItem[]>([]);
  const [weeklyLoop, setWeeklyLoop] = useState<WeeklyLoopAction[]>([]);
  const [metrics, setMetrics] = useState<SuccessMetric[]>([]);
  const [projections, setProjections] = useState<MonthlyProjection[]>([]);

  const loadData = () => {
    setLoading(true);
    setPhases(generatePhases());
    setTargets(generateScalingTargets());
    setMatrix(generateRevenueMatrix());
    setWeeklyLoop(generateWeeklyLoop());
    setMetrics(generateSuccessMetrics());
    setProjections(generate12MonthProjections());
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const activePhase = phases.find(p => p.status === 'active');

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">12-Month Revenue Scaling</h1>
          <p className="text-sm text-muted-foreground">SEO → Revenue Compounding Blueprint</p>
        </div>
        <div className="flex items-center gap-3">
          {activePhase && (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              Phase {activePhase.id}: {activePhase.name}
            </Badge>
          )}
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Success Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map(m => <MetricCard key={m.label} {...m} />)}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="phases" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="phases" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Target className="h-3.5 w-3.5 hidden sm:block" /> Phases
          </TabsTrigger>
          <TabsTrigger value="targets" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <TrendingUp className="h-3.5 w-3.5 hidden sm:block" /> Targets
          </TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <DollarSign className="h-3.5 w-3.5 hidden sm:block" /> Revenue
          </TabsTrigger>
          <TabsTrigger value="loop" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Zap className="h-3.5 w-3.5 hidden sm:block" /> Weekly
          </TabsTrigger>
          <TabsTrigger value="projections" className="text-xs py-2 gap-1 flex-1 min-w-[80px]">
            <Flame className="h-3.5 w-3.5 hidden sm:block" /> Forecast
          </TabsTrigger>
        </TabsList>

        {/* PHASES */}
        <TabsContent value="phases" className="space-y-4 mt-4">
          {phases.map(phase => (
            <Card key={phase.id} className={phase.status === 'active' ? 'border-primary' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ChevronRight className="h-4 w-4" />
                    Phase {phase.id}: {phase.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{phase.months}</span>
                    <Badge variant={phase.status === 'active' ? 'default' : 'outline'} className="text-[10px]">
                      {phase.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium mb-2 text-muted-foreground">Objectives</p>
                    <ul className="space-y-1">
                      {phase.objectives.map((obj, i) => (
                        <li key={i} className="text-xs flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span> {obj}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2 text-muted-foreground">KPIs</p>
                    <div className="space-y-2">
                      {phase.kpis.map(kpi => (
                        <div key={kpi.label}>
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span>{kpi.label}</span>
                            <span className="font-bold">{kpi.current} / {kpi.target}</span>
                          </div>
                          <Progress value={kpi.progress} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* SCALING TARGETS */}
        <TabsContent value="targets" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-3 gap-4">
            {targets.map(t => (
              <Card key={t.month}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Month {t.month} Target</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: 'Impressions', min: t.impressions.min, max: t.impressions.max, current: t.impressions.current },
                    { label: 'Clicks', min: t.clicks.min, max: t.clicks.max, current: t.clicks.current },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span>{row.label}</span>
                        <span className="font-bold">{row.current.toLocaleString()} → {row.min.toLocaleString()}–{row.max.toLocaleString()}</span>
                      </div>
                      <Progress value={Math.min(100, (row.current / row.min) * 100)} className="h-1.5" />
                    </div>
                  ))}
                  {[
                    { label: 'Top 10 Keywords', target: t.top10Keywords.target, current: t.top10Keywords.current },
                    { label: 'Indexed Pages', target: t.indexedPages.target, current: t.indexedPages.current },
                    { label: 'Organic Revenue', target: t.organicRevenue.target, current: t.organicRevenue.current, prefix: '$' },
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span>{row.label}</span>
                        <span className="font-bold">{'prefix' in row ? '$' : ''}{row.current} / {'prefix' in row ? '$' : ''}{row.target}</span>
                      </div>
                      <Progress value={Math.min(100, (row.current / row.target) * 100)} className="h-1.5" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* REVENUE MATRIX */}
        <TabsContent value="revenue" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['priority', 'visibility', 'conversion', 'underperforming'] as const).map(m => {
              const items = matrix.filter(i => i.matrix === m);
              const totalRev = items.reduce((s, i) => s + i.revenue, 0);
              return (
                <Card key={m}>
                  <CardContent className="pt-4 pb-3 px-4">
                    <p className="text-xs text-muted-foreground">{matrixLabels[m].text}</p>
                    <p className="text-2xl font-bold mt-1">{items.length}</p>
                    <p className="text-[10px] text-muted-foreground">${totalRev.toLocaleString()} revenue</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Revenue Priority Matrix</CardTitle>
              <CardDescription className="text-xs">Product pages overlaid with SEO performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2">URL</th>
                    <th className="text-center py-2 px-2">Pos</th>
                    <th className="text-center py-2 px-2">Imp</th>
                    <th className="text-center py-2 px-2">CTR</th>
                    <th className="text-center py-2 px-2">Conv%</th>
                    <th className="text-center py-2 px-2">Rev</th>
                    <th className="text-center py-2 px-2">Rev/Ses</th>
                    <th className="text-center py-2 px-2">Matrix</th>
                  </tr></thead>
                  <tbody>
                    {matrix.sort((a, b) => b.revenue - a.revenue).map(p => (
                      <tr key={p.url} className="border-b">
                        <td className="py-2 px-2 font-mono text-[11px] max-w-[140px] truncate">{p.url}</td>
                        <td className="text-center py-2 px-2 font-bold">{p.avgPosition.toFixed(1)}</td>
                        <td className="text-center py-2 px-2">{p.impressions}</td>
                        <td className={`text-center py-2 px-2 ${p.ctr < 2 ? 'text-red-600' : ''}`}>{p.ctr}%</td>
                        <td className={`text-center py-2 px-2 ${p.conversionRate < 1.5 ? 'text-red-600 font-bold' : ''}`}>{p.conversionRate}%</td>
                        <td className="text-center py-2 px-2 font-bold">${p.revenue}</td>
                        <td className="text-center py-2 px-2">${p.revenuePerSession}</td>
                        <td className="text-center py-2 px-2">
                          <Badge variant={matrixLabels[p.matrix].variant} className="text-[9px]">
                            {matrixLabels[p.matrix].text}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WEEKLY LOOP */}
        <TabsContent value="loop" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Automated Weekly Loop
              </CardTitle>
              <CardDescription className="text-xs">
                8 actions per week — 3 ranking · 2 content · 2 authority · 1 revenue — manual approval required
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {weeklyLoop.map(a => (
                <div key={a.id} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{actionIcons[a.type]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px]">{a.type.replace(/_/g, ' ')}</Badge>
                        <Badge variant={a.impact === 'high' ? 'destructive' : 'secondary'} className="text-[9px]">{a.impact}</Badge>
                      </div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded mt-2 inline-block">{a.target}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">Pending</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROJECTIONS */}
        <TabsContent value="projections" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">12-Month Impression & Click Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => `M${v}`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="impressions" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name="Impressions" />
                  <Line type="monotone" dataKey="clicks" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} name="Clicks" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Revenue & Revenue/Session Projection</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => `M${v}`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, n: string) => n.includes('Revenue') ? `$${v}` : v} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="organicRevenue" fill="hsl(var(--chart-2))" name="Organic Revenue ($)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Indexed Pages & Top 10 Keywords Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={projections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => `M${v}`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="indexedPages" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} name="Indexed Pages" />
                  <Line type="monotone" dataKey="top10Keywords" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Top 10 Keywords" />
                  <Line type="monotone" dataKey="crawlEfficiency" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} name="Crawl Efficiency %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
