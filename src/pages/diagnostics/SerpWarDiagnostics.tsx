import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { runFullRevenueSimulation, type ClusterRevenueReport } from '@/lib/serp-war-revenue-model';
import { runCompetitorDisplacementAnalysis, type ClusterDisplacementPlan } from '@/lib/competitor-displacement-engine';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, TrendingUp, Target, Shield, Zap } from 'lucide-react';

const revenueReports = runFullRevenueSimulation();
const displacementPlans = runCompetitorDisplacementAnalysis();

function fmt(n: number) { return '$' + n.toLocaleString(); }

function RevenueCard({ report }: { report: ClusterRevenueReport }) {
  const { scenarios } = report;
  return (
    <div className="bg-card border rounded-2xl p-6">
      <h3 className="font-display font-bold text-lg mb-1">{report.cluster}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Search Vol: {report.searchVolume.toLocaleString()}/mo · AOV: {fmt(report.aov)} · Current Pos: ~{report.currentPosition}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-semibold">Scenario</th>
              <th className="text-right p-2 font-semibold">CTR</th>
              <th className="text-right p-2 font-semibold">Clicks/mo</th>
              <th className="text-right p-2 font-semibold">Orders (1.5%)</th>
              <th className="text-right p-2 font-semibold">Revenue/mo</th>
              <th className="text-right p-2 font-semibold">Annual</th>
              <th className="text-right p-2 font-semibold">First 10 Sales</th>
            </tr>
          </thead>
          <tbody>
            {([scenarios.conservative, scenarios.growth, scenarios.domination]).map(s => (
              <tr key={s.label} className="border-t border-border/30">
                <td className="p-2 font-medium">{s.label} ({s.positionRange})</td>
                <td className="p-2 text-right">{(s.estimatedCtr * 100).toFixed(1)}%</td>
                <td className="p-2 text-right">{s.monthlyClicks.toLocaleString()}</td>
                <td className="p-2 text-right">{s.conversions.moderate.orders}</td>
                <td className="p-2 text-right font-semibold">{fmt(s.expectedMonthlyRevenue)}</td>
                <td className="p-2 text-right">{fmt(s.annualRevenue)}</td>
                <td className="p-2 text-right">{s.first10SalesDays}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          <TrendingUp className="w-3 h-3 mr-1" />
          Domination uplift: +{fmt(report.revenueUpliftAtDomination)}/mo ({report.revenueUpliftPct}%)
        </Badge>
      </div>
    </div>
  );
}

function DisplacementCard({ plan }: { plan: ClusterDisplacementPlan }) {
  return (
    <div className="bg-card border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-lg">{plan.cluster}</h3>
        <Badge variant={plan.displacementScore >= 70 ? 'default' : 'outline'}>
          Score: {plan.displacementScore}/100
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Our content: {plan.ourContentWordCount} words · {plan.ourInternalLinks} links · {plan.ourSchemaTypes.length} schemas · ETA Top 3: ~{plan.estimatedWeeksToTop3} weeks
      </p>

      {/* Competitors */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2">Competitor</th>
              <th className="text-right p-2">Pos</th>
              <th className="text-right p-2">Words</th>
              <th className="text-center p-2">FAQ</th>
              <th className="text-center p-2">Reviews</th>
              <th className="text-right p-2">Links</th>
              <th className="text-right p-2">Depth</th>
            </tr>
          </thead>
          <tbody>
            {plan.competitors.map(c => (
              <tr key={c.domain} className="border-t border-border/30">
                <td className="p-2 font-medium">{c.domain}</td>
                <td className="p-2 text-right">#{c.estimatedPosition}</td>
                <td className="p-2 text-right">{c.wordCount.toLocaleString()}</td>
                <td className="p-2 text-center">{c.hasFaqSchema ? '✅' : '❌'}</td>
                <td className="p-2 text-center">{c.hasReviewSchema ? '✅' : '❌'}</td>
                <td className="p-2 text-right">{c.internalLinks}</td>
                <td className="p-2 text-right">{c.contentDepthScore}/10</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gaps */}
      <h4 className="text-sm font-semibold mb-2">Displacement Gaps</h4>
      <div className="space-y-2">
        {plan.gaps.map((gap, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {gap.ourStatus.includes('exceeds') || gap.ourStatus.includes('Complete') || gap.ourStatus.includes('Addressed')
              ? <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 mt-0.5 shrink-0" />
            }
            <div>
              <span className="font-medium">{gap.description}</span>
              <span className="text-muted-foreground ml-1">→ {gap.actionRequired}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SerpWarDiagnostics() {
  const totalDominationRevenue = revenueReports.reduce((s, r) => s + r.scenarios.domination.expectedMonthlyRevenue, 0);
  const totalCurrentRevenue = revenueReports.reduce((s, r) => s + r.currentMonthlyRevenue, 0);
  const avgDisplacement = Math.round(displacementPlans.reduce((s, p) => s + p.displacementScore, 0) / displacementPlans.length);

  return (
    <Layout>
      <Helmet>
        <title>SERP War Diagnostics | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container py-10 max-w-6xl">
        <h1 className="text-3xl font-display font-bold mb-2">SERP War Diagnostics</h1>
        <p className="text-muted-foreground mb-8">Revenue simulation · Competitor displacement · Authority analysis</p>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-4 gap-4 mb-10">
          <div className="bg-card border rounded-xl p-4 text-center">
            <Target className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{fmt(totalDominationRevenue)}</div>
            <div className="text-xs text-muted-foreground">Domination Revenue/mo</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">+{fmt(totalDominationRevenue - totalCurrentRevenue)}</div>
            <div className="text-xs text-muted-foreground">Revenue Uplift/mo</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <Shield className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{avgDisplacement}/100</div>
            <div className="text-xs text-muted-foreground">Avg Displacement Score</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <Zap className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">18</div>
            <div className="text-xs text-muted-foreground">Schema Types Deployed</div>
          </div>
        </div>

        {/* Revenue Simulations */}
        <h2 className="text-2xl font-display font-bold mb-4">Phase 1 — Revenue Impact Simulation</h2>
        <div className="space-y-6 mb-12">
          {revenueReports.map(r => <RevenueCard key={r.slug} report={r} />)}
        </div>

        {/* Competitor Displacement */}
        <h2 className="text-2xl font-display font-bold mb-4">Phase 3 — Competitor Displacement Analysis</h2>
        <div className="space-y-6 mb-12">
          {displacementPlans.map(p => <DisplacementCard key={p.slug} plan={p} />)}
        </div>

        {/* Execution Summary */}
        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-display font-bold mb-4">Execution Report Summary</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-border/30"><span>SEO titles updated</span><span className="font-medium">3 (CTR-optimized)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Meta descriptions updated</span><span className="font-medium">3 (pain+promise)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>FAQ schemas deployed</span><span className="font-medium">3 pages (19 FAQs)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Structured data types</span><span className="font-medium">6 per page (18 total)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Internal links added</span><span className="font-medium">140+ contextual links</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Content upgrades</span><span className="font-medium">3 pillar pages (2,200–2,800 words)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Competitor gaps exploited</span><span className="font-medium">15 gaps identified, 12 addressed</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Crawl improvements</span><span className="font-medium">Self-referencing canonicals, parameter blocks</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Estimated CTR uplift</span><span className="font-medium">+25–40% (snippet advantage)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Timeline to impact</span><span className="font-medium">4–12 weeks (position dependent)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Cluster guides planned</span><span className="font-medium">9 supporting guides (3 per cluster)</span></div>
            <div className="flex justify-between py-1 border-b border-border/30"><span>Authority loops active</span><span className="font-medium">3 pillar ↔ product ↔ guide loops</span></div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
