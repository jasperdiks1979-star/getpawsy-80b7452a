import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle, Clock, Circle, Target, TrendingUp, Zap, ShieldCheck,
  Brain, DollarSign, AlertTriangle, Crosshair, Lock, Gauge, Link2,
  ArrowUp, ArrowDown, BarChart3,
} from 'lucide-react';
import {
  SPRINT_CHECKLIST,
  EXPANSION_RULES,
  TOP_CONVERSION_TARGETS,
  SALES_PROBABILITY_CURVE,
  SCALE_FORECAST,
  getSprintSummary,
} from '@/lib/revenue-war-machine';
import { runFullRevenueSimulation } from '@/lib/serp-war-revenue-model';
import { runCompetitorDisplacementAnalysis } from '@/lib/competitor-displacement-engine';
import { buildUnifiedEngineState } from '@/lib/unified-growth-engine';
import { useMemo } from 'react';

const revenueReports = runFullRevenueSimulation();
const displacementPlans = runCompetitorDisplacementAnalysis();
const sprint = getSprintSummary();
const fmt = (n: number) => '$' + n.toLocaleString();

const statusIcon = (s: string) => {
  if (s === 'done') return <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />;
  if (s === 'in-progress') return <Clock className="w-3.5 h-3.5 text-yellow-600 shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />;
};

const VELOCITY_ACTIONS: Record<string, { label: string; color: string }> = {
  double_links: { label: '2× Links', color: 'bg-green-500/10 text-green-600' },
  add_articles: { label: '+2 Articles', color: 'bg-blue-500/10 text-blue-600' },
  boost_homepage: { label: 'HP Boost', color: 'bg-primary/10 text-primary' },
  reduce_priority: { label: 'Reduce', color: 'bg-yellow-500/10 text-yellow-600' },
  reallocate: { label: 'Reallocate', color: 'bg-red-500/10 text-red-600' },
};

export default function RevenueWarMachine() {
  const unified = useMemo(() => buildUnifiedEngineState(), []);
  const { sniperTargets, lockdownNiche, velocityLeaders, cannibalizationAlerts, forecast, executionOrder, summary } = unified;

  const totalDomRevenue = revenueReports.reduce((s, r) => s + r.scenarios.domination.expectedMonthlyRevenue, 0);
  const avgDisplacement = Math.round(displacementPlans.reduce((s, p) => s + p.displacementScore, 0) / displacementPlans.length);

  return (
    <Layout>
      <Helmet>
        <title>Revenue War Machine | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container py-10 max-w-7xl">
        <h1 className="text-3xl font-display font-bold mb-1">🔥 Revenue War Machine</h1>
        <p className="text-muted-foreground mb-8">Unified Growth Engine — Sniper · Lockdown · Velocity · Cannibalization Guard</p>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
          <SumCard icon={Target} label="Sprint" value={`${sprint.completionPct}%`} />
          <SumCard icon={Crosshair} label="Sniper Rev 90d" value={fmt(summary.totalSniperRevenue90d)} color="text-green-600" />
          <SumCard icon={Lock} label="Lockdown Rev 90d" value={fmt(summary.lockdownRevenue90d)} color="text-primary" />
          <SumCard icon={Gauge} label="Velocity Boost" value={summary.velocityBoost.split(' ')[0]} />
          <SumCard icon={AlertTriangle} label="Cannibalizations" value={summary.cannibalizationFixed} color={summary.cannibalizationFixed > 0 ? 'text-red-500' : 'text-green-500'} />
          <SumCard icon={ShieldCheck} label="Displacement" value={`${avgDisplacement}/100`} />
        </div>

        {/* ── SNIPER TARGETS ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Crosshair className="h-4 w-4" /> Revenue Sniper — Top 15 Targets</CardTitle>
            <CardDescription>SniperScore = (Impressions × CommercialIntent × AOV × CTR_Uplift) ÷ CompetitiveDensity</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-1">#</th>
                    <th className="text-left py-2 px-1">Target</th>
                    <th className="text-right py-2 px-1">Impr</th>
                    <th className="text-right py-2 px-1">Pos</th>
                    <th className="text-right py-2 px-1">AOV</th>
                    <th className="text-right py-2 px-1">Score</th>
                    <th className="text-right py-2 px-1">Rev @3/mo</th>
                    <th className="text-right py-2 px-1">Rev 90d</th>
                  </tr>
                </thead>
                <tbody>
                  {sniperTargets.map(t => (
                    <tr key={t.rank} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-1 font-bold text-muted-foreground">{t.rank}</td>
                      <td className="py-2 px-1">
                        <div className="font-medium truncate max-w-[200px]">{t.optimizedTitle}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{t.url}</div>
                      </td>
                      <td className="py-2 px-1 text-right font-mono">{t.impressions.toLocaleString()}</td>
                      <td className="py-2 px-1 text-right font-mono">{t.position.toFixed(1)}</td>
                      <td className="py-2 px-1 text-right font-mono">${t.aov}</td>
                      <td className="py-2 px-1 text-right font-bold text-primary">{t.sniperScore}</td>
                      <td className="py-2 px-1 text-right font-mono text-green-600">{fmt(t.revenue30d)}</td>
                      <td className="py-2 px-1 text-right font-mono font-bold text-green-700">{fmt(t.revenue90d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* ── LOCKDOWN NICHE ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Niche Lockdown — {lockdownNiche.niche}</CardTitle>
              <CardDescription>Target: {summary.marketShareTarget}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span>Dominance Score</span>
                <span className="font-bold text-primary">{lockdownNiche.dominanceScore}/100</span>
              </div>
              <Progress value={lockdownNiche.dominanceScore} className="h-2" />

              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Cluster Articles ({lockdownNiche.clusterArticles.length})</h4>
                <div className="space-y-1.5">
                  {lockdownNiche.clusterArticles.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                        <span className="truncate">{a.title}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Badge variant="outline" className="text-[8px]">{a.type}</Badge>
                        <Badge variant="secondary" className="text-[8px]">{a.wordCount}w</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Schema Coverage</h4>
                <div className="flex flex-wrap gap-1">
                  {lockdownNiche.schemas.map(s => (
                    <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[10px] pt-2 border-t">
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-muted-foreground">Conservative</div>
                  <div className="font-bold">{fmt(lockdownNiche.revenue90d.conservative)}</div>
                </div>
                <div className="text-center p-2 rounded bg-primary/5 border border-primary/10">
                  <div className="text-muted-foreground">Growth</div>
                  <div className="font-bold text-primary">{fmt(lockdownNiche.revenue90d.growth)}</div>
                </div>
                <div className="text-center p-2 rounded bg-green-500/5 border border-green-500/10">
                  <div className="text-muted-foreground">Domination</div>
                  <div className="font-bold text-green-600">{fmt(lockdownNiche.revenue90d.domination)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── VELOCITY LEADERS ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Velocity Scaling — Leaders</CardTitle>
              <CardDescription>VelocityScore = ClickGrowth × PositionMomentum × RevenuePotential</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {velocityLeaders.map((v, i) => {
                  const act = VELOCITY_ACTIONS[v.action] || { label: v.action, color: '' };
                  return (
                    <div key={i} className="border rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="font-medium truncate max-w-[180px]">{v.query}</div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-primary">{v.velocityScore}</span>
                          <Badge variant="outline" className={`text-[8px] ${act.color}`}>{act.label}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                        <div>Clicks <span className={v.clickGrowthPct >= 25 ? 'text-green-600 font-bold' : ''}>{v.clickGrowthPct > 0 ? '+' : ''}{v.clickGrowthPct}%</span></div>
                        <div>Impr {v.impressionGrowthPct > 0 ? '+' : ''}{v.impressionGrowthPct}%</div>
                        <div>Pos <span className={v.positionDelta < 0 ? 'text-green-600' : 'text-red-500'}>{v.positionDelta > 0 ? '+' : ''}{v.positionDelta}</span></div>
                        <div>{fmt(v.revenuePerMonth)}/mo</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* ── CANNIBALIZATION ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Cannibalization Guard</CardTitle>
            </CardHeader>
            <CardContent>
              {cannibalizationAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No cannibalization detected ✓</p>
              ) : (
                <div className="space-y-3">
                  {cannibalizationAlerts.map((a, i) => (
                    <div key={i} className="border border-red-500/20 bg-red-500/5 rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">"{a.query}"</span>
                        <Badge variant="destructive" className="text-[9px]">{a.severity}</Badge>
                      </div>
                      {a.pages.map((p, j) => (
                        <div key={j} className="flex justify-between text-[10px] text-muted-foreground pl-2 border-l-2 border-red-500/30">
                          <span className="truncate">{p.url}</span>
                          <span>pos {p.position} · {p.impressions} impr</span>
                        </div>
                      ))}
                      <div className="text-[10px] font-medium text-red-600 pt-1 border-t border-red-500/10">
                        Fix: {a.resolution}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── EXECUTION ORDER ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Execution Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {executionOrder.map((e, i) => (
                  <div key={i} className="border rounded-lg p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{e.phase}</span>
                      <Badge variant="outline" className="text-[8px]">P{e.priority}</Badge>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span className="text-green-600 font-medium">{e.expectedLift}</span>
                      <span>{e.timeframe}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── 90-DAY REVENUE FORECAST ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> 90-Day Revenue Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left p-2">Month</th>
                  <th className="text-right p-2">Conservative</th>
                  <th className="text-right p-2">Growth</th>
                  <th className="text-right p-2">Domination</th>
                  <th className="text-right p-2">Cumul. (Dom.)</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map(f => (
                  <tr key={f.month} className="border-b border-border/30">
                    <td className="p-2 font-medium">Month {f.month}</td>
                    <td className="p-2 text-right">{fmt(f.revenue.conservative)}</td>
                    <td className="p-2 text-right">{fmt(f.revenue.growth)}</td>
                    <td className="p-2 text-right font-bold text-green-600">{fmt(f.revenue.domination)}</td>
                    <td className="p-2 text-right font-bold">{fmt(f.cumulativeRevenue.domination)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── INTERNAL LINK MAP ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Internal Link Blueprint — {lockdownNiche.niche}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {lockdownNiche.internalLinkMap.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/30 border-b border-border/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground truncate max-w-[200px]">{l.source}</span>
                    <ArrowUp className="h-3 w-3 text-primary rotate-90 shrink-0" />
                    <span className="font-medium truncate max-w-[200px]">{l.target}</span>
                  </div>
                  <Badge variant="outline" className="text-[8px] shrink-0">{l.anchorType}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── LEGACY SECTIONS (kept for continuity) ── */}
        {/* Sprint Progress */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">Sprint Tracker</h2>
          <div className="flex items-center gap-3 mb-4">
            <Progress value={sprint.completionPct} className="flex-1 h-2" />
            <span className="text-sm font-medium">{sprint.done}/{sprint.total}</span>
          </div>
          {[1, 2, 3, 4].map(week => {
            const tasks = SPRINT_CHECKLIST.filter(t => t.week === week);
            const weekDone = tasks.filter(t => t.status === 'done').length;
            return (
              <div key={week} className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  Week {week}
                  <Badge variant="outline" className="text-xs">{weekDone}/{tasks.length}</Badge>
                </h3>
                <div className="space-y-1.5">
                  {tasks.map(t => (
                    <div key={t.id} className="flex items-start gap-2 text-xs">
                      {statusIcon(t.status)}
                      <div className="flex-1">
                        <span className="font-medium">{t.task}</span>
                        {t.notes && <span className="text-muted-foreground ml-1">— {t.notes}</span>}
                      </div>
                      <Badge variant={t.impact === 'critical' ? 'destructive' : t.impact === 'high' ? 'default' : 'outline'} className="text-[10px] shrink-0">
                        {t.impact}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* Revenue Simulation by Cluster */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">Revenue Simulation by Cluster</h2>
          <div className="space-y-4">
            {revenueReports.map(r => (
              <div key={r.slug} className="bg-card border rounded-xl p-4">
                <h3 className="font-semibold mb-2">{r.cluster}</h3>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="text-center p-2 bg-muted/30 rounded">
                    <div className="font-medium">Conservative</div>
                    <div className="text-lg font-bold">{fmt(r.scenarios.conservative.expectedMonthlyRevenue)}</div>
                    <div className="text-muted-foreground">{r.scenarios.conservative.monthlyClicks} clicks/mo</div>
                  </div>
                  <div className="text-center p-2 bg-muted/30 rounded">
                    <div className="font-medium">Growth</div>
                    <div className="text-lg font-bold">{fmt(r.scenarios.growth.expectedMonthlyRevenue)}</div>
                    <div className="text-muted-foreground">{r.scenarios.growth.monthlyClicks} clicks/mo</div>
                  </div>
                  <div className="text-center p-2 bg-primary/10 rounded border border-primary/20">
                    <div className="font-medium">Domination</div>
                    <div className="text-lg font-bold">{fmt(r.scenarios.domination.expectedMonthlyRevenue)}</div>
                    <div className="text-muted-foreground">{r.scenarios.domination.monthlyClicks} clicks/mo</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}

function SumCard({ icon: Icon, label, value, color }: {
  icon: typeof Target; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-3 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${color || 'text-muted-foreground'}`} />
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
