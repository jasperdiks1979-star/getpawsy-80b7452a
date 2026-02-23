import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, Circle, Target, TrendingUp, Zap, ShieldCheck, Brain, DollarSign } from 'lucide-react';
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

const revenueReports = runFullRevenueSimulation();
const displacementPlans = runCompetitorDisplacementAnalysis();
const sprint = getSprintSummary();

function fmt(n: number) { return '$' + n.toLocaleString(); }

const statusIcon = (s: string) => {
  if (s === 'done') return <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />;
  if (s === 'in-progress') return <Clock className="w-3.5 h-3.5 text-yellow-600 shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />;
};

export default function RevenueWarMachine() {
  const totalDomRevenue = revenueReports.reduce((s, r) => s + r.scenarios.domination.expectedMonthlyRevenue, 0);
  const avgDisplacement = Math.round(displacementPlans.reduce((s, p) => s + p.displacementScore, 0) / displacementPlans.length);

  return (
    <Layout>
      <Helmet>
        <title>Revenue War Machine | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container py-10 max-w-6xl">
        <h1 className="text-3xl font-display font-bold mb-1">🔥 Revenue War Machine</h1>
        <p className="text-muted-foreground mb-8">30-day sprint · AI expansion · Conversion targeting · Competitor displacement</p>

        {/* ── Summary Cards ── */}
        <div className="grid sm:grid-cols-5 gap-3 mb-10">
          <div className="bg-card border rounded-xl p-4 text-center">
            <Target className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{sprint.completionPct}%</div>
            <div className="text-xs text-muted-foreground">Sprint Complete</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{fmt(totalDomRevenue)}</div>
            <div className="text-xs text-muted-foreground">Domination Rev/mo</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">~{sprint.estimatedDaysTo10Sales}d</div>
            <div className="text-xs text-muted-foreground">Est. First 10 Sales</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <ShieldCheck className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{avgDisplacement}/100</div>
            <div className="text-xs text-muted-foreground">Displacement Score</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <Brain className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{EXPANSION_RULES.length}</div>
            <div className="text-xs text-muted-foreground">AI Expansion Rules</div>
          </div>
        </div>

        {/* ── Sprint Progress ── */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">Phase 1 — 30-Day Sprint Tracker</h2>
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

        {/* ── AI Expansion Engine ── */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">Phase 2 — AI Self-Learning Expansion Engine</h2>
          <div className="bg-card border rounded-2xl p-5">
            <div className="grid sm:grid-cols-2 gap-3">
              {EXPANSION_RULES.map(rule => (
                <div key={rule.id} className="flex items-start gap-2 text-xs border border-border/30 rounded-lg p-3">
                  <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold mb-0.5">{rule.name}</div>
                    <div className="text-muted-foreground">Trigger: {rule.trigger}</div>
                    <div className="text-muted-foreground">Action: {rule.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Top 10 Conversion Targets ── */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">Phase 3 — Top 10 Fastest Conversion Targets</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">Cluster</th>
                  <th className="text-right p-2">Pos</th>
                  <th className="text-right p-2">Impr</th>
                  <th className="text-center p-2">Conv. Prob.</th>
                  <th className="text-left p-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {TOP_CONVERSION_TARGETS.map(t => (
                  <tr key={t.rank} className="border-t border-border/30">
                    <td className="p-2 font-bold">{t.rank}</td>
                    <td className="p-2 font-medium">{t.product}</td>
                    <td className="p-2 text-muted-foreground">{t.cluster}</td>
                    <td className="p-2 text-right">~{t.estimatedPosition}</td>
                    <td className="p-2 text-right">{t.impressions}</td>
                    <td className="p-2 text-center">
                      <Badge variant={t.conversionProbability === 'high' ? 'default' : 'outline'} className="text-[10px]">
                        {t.conversionProbability}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Sales Probability Curve ── */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">Sales Probability Curve (30 Days)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2">Day</th>
                  <th className="text-right p-2">Conservative</th>
                  <th className="text-right p-2">Growth</th>
                  <th className="text-right p-2">Domination</th>
                </tr>
              </thead>
              <tbody>
                {SALES_PROBABILITY_CURVE.map(d => (
                  <tr key={d.day} className="border-t border-border/30">
                    <td className="p-2 font-medium">Day {d.day}</td>
                    <td className="p-2 text-right">{d.cumulativeSales.conservative} sales</td>
                    <td className="p-2 text-right">{d.cumulativeSales.growth} sales</td>
                    <td className="p-2 text-right font-semibold">{d.cumulativeSales.domination} sales</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 90-Day Scale Forecast ── */}
        <section className="mb-10">
          <h2 className="text-xl font-display font-bold mb-3">90-Day Scale Forecast</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2">Month</th>
                  <th className="text-right p-2">Sessions (Growth)</th>
                  <th className="text-right p-2">Revenue (Growth)</th>
                  <th className="text-right p-2">Sessions (Dom.)</th>
                  <th className="text-right p-2">Revenue (Dom.)</th>
                  <th className="text-right p-2">Cluster Authority</th>
                </tr>
              </thead>
              <tbody>
                {SCALE_FORECAST.map(m => (
                  <tr key={m.month} className="border-t border-border/30">
                    <td className="p-2 font-medium">Month {m.month}</td>
                    <td className="p-2 text-right">{m.organicSessions.growth.toLocaleString()}</td>
                    <td className="p-2 text-right">{fmt(m.revenue.growth)}</td>
                    <td className="p-2 text-right font-semibold">{m.organicSessions.domination.toLocaleString()}</td>
                    <td className="p-2 text-right font-semibold">{fmt(m.revenue.domination)}</td>
                    <td className="p-2 text-right">{m.clusterAuthority}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Revenue Simulation Summary ── */}
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

        {/* ── Execution Report ── */}
        <div className="bg-muted/30 rounded-2xl p-6">
          <h2 className="text-xl font-display font-bold mb-4">Full Execution Summary</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-border/30"><span>Sprint completion</span><span className="font-medium">{sprint.completionPct}% ({sprint.done}/{sprint.total})</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Pillar pages upgraded</span><span className="font-medium">3 (2,200–2,800 words)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>FAQ schemas deployed</span><span className="font-medium">19 FAQs across 3 pages</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Structured data types</span><span className="font-medium">18 (6 per page)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Internal links deployed</span><span className="font-medium">140+ contextual links</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Supporting guides</span><span className="font-medium">9 live, 6 queued</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>AI expansion rules</span><span className="font-medium">{EXPANSION_RULES.length} active triggers</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Conversion targets</span><span className="font-medium">{TOP_CONVERSION_TARGETS.length} products tracked</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Competitor gaps exploited</span><span className="font-medium">15 identified, 12 addressed</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Crawl optimization</span><span className="font-medium">Canonicals, parameter blocks, sitemap tiers</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Est. CTR uplift</span><span className="font-medium">+25–40%</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Est. first 10 sales</span><span className="font-medium">~25 days (growth scenario)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>90-day revenue (growth)</span><span className="font-medium">{fmt(SCALE_FORECAST[2].revenue.growth)}/mo</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>90-day revenue (dom.)</span><span className="font-medium">{fmt(SCALE_FORECAST[2].revenue.domination)}/mo</span></div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
