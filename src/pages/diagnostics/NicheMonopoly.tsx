import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { NICHE_PROFILES, getMonopolySummary, type NicheProfile } from '@/lib/niche-monopoly-engine';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Clock, TrendingUp, Target, Shield, Zap, Crown } from 'lucide-react';

const summary = getMonopolySummary();
const fmt = (n: number) => '$' + n.toLocaleString();

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle className="w-4 h-4 text-green-600" />;
  if (status === 'in-progress') return <Clock className="w-4 h-4 text-amber-500" />;
  return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
}

function NicheCard({ niche }: { niche: NicheProfile }) {
  const done = niche.executionChecklist.filter(t => t.status === 'done').length;
  const total = niche.executionChecklist.length;
  const pct = Math.round((done / total) * 100);
  const dom = niche.revenueScenarios.find(s => s.label.includes('Domination'));

  return (
    <div className="bg-card border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-lg">{niche.name}</h3>
        <Badge variant={pct >= 80 ? 'default' : pct >= 50 ? 'secondary' : 'outline'}>
          {pct}% complete
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-center">
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Search Vol</p>
          <p className="font-bold text-sm">{niche.monthlySearchVolume.toLocaleString()}/mo</p>
        </div>
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Position</p>
          <p className="font-bold text-sm">~{niche.currentPosition}</p>
        </div>
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-xs text-muted-foreground">AOV</p>
          <p className="font-bold text-sm">{fmt(niche.aov)}</p>
        </div>
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Scale Factor</p>
          <p className="font-bold text-sm">{niche.nicheScaleFactor}/10</p>
        </div>
      </div>

      {/* Revenue Scenarios */}
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Revenue Projection</h4>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/50">
            <th className="text-left p-2">Scenario</th>
            <th className="text-right p-2">Pos</th>
            <th className="text-right p-2">Clicks/mo</th>
            <th className="text-right p-2">Rev/mo</th>
            <th className="text-right p-2">Rev/qtr</th>
          </tr></thead>
          <tbody>{niche.revenueScenarios.map(s => (
            <tr key={s.label} className="border-b border-border/50">
              <td className="p-2 font-medium">{s.label}</td>
              <td className="p-2 text-right">{s.targetPosition}</td>
              <td className="p-2 text-right">{s.monthlyClicks.toLocaleString()}</td>
              <td className="p-2 text-right font-semibold">{fmt(s.monthlyRevenue)}</td>
              <td className="p-2 text-right">{fmt(s.quarterlyRevenue)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Competitor Gaps */}
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Shield className="w-4 h-4" /> Competitor Gaps</h4>
      <div className="space-y-2 mb-6">
        {niche.competitorGaps.slice(0, 3).map(c => (
          <div key={c.domain} className="bg-muted/20 rounded-lg p-3 text-xs">
            <div className="flex justify-between mb-1">
              <span className="font-medium">{c.competitor}</span>
              <span className="text-muted-foreground">{c.wordCount} words | FAQ: {c.hasFaq ? '✓' : '✗'} | Compare: {c.hasComparison ? '✓' : '✗'}</span>
            </div>
            <p className="text-muted-foreground"><span className="text-red-600">Gap:</span> {c.weakness}</p>
            <p className="text-muted-foreground"><span className="text-green-600">Our Edge:</span> {c.ourAdvantage}</p>
          </div>
        ))}
      </div>

      {/* CTR Optimizations */}
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Target className="w-4 h-4" /> CTR Optimizations</h4>
      <div className="space-y-2 mb-6">
        {niche.ctrOptimizations.map(o => (
          <div key={o.page} className="bg-muted/20 rounded-lg p-3 text-xs">
            <p className="font-medium mb-1">{o.page}</p>
            <p className="text-muted-foreground line-through">{o.currentTitle}</p>
            <p className="text-green-700 font-medium">{o.newTitle}</p>
          </div>
        ))}
      </div>

      {/* Silo Guides */}
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Zap className="w-4 h-4" /> Silo Guides</h4>
      <ul className="space-y-1 mb-6">
        {niche.siloGuides.map(g => (
          <li key={g.slug} className="flex items-center gap-2 text-xs">
            <StatusIcon status={g.status === 'published' ? 'done' : 'pending'} />
            <span>{g.title}</span>
            <span className="text-muted-foreground ml-auto">{g.linksToCategory}→cat, {g.linksToProducts}→prod</span>
          </li>
        ))}
      </ul>

      {/* Execution Checklist */}
      <h4 className="font-semibold text-sm mb-2">Execution Checklist</h4>
      <ul className="space-y-1">
        {niche.executionChecklist.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <StatusIcon status={t.status} />
            <span className={t.status === 'done' ? 'text-muted-foreground' : ''}>{t.task}</span>
            <Badge variant="outline" className="ml-auto text-[10px] px-1.5">W{t.week}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NicheMonopoly() {
  return (
    <Layout>
      <Helmet>
        <title>Niche Monopoly Dashboard | GetPawsy Diagnostics</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Crown className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-display font-bold">Niche Monopoly Command Center</h1>
        </div>
        <p className="text-muted-foreground mb-8">Simultaneous 3-category domination tracker — Profit &gt; Traffic</p>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-card border rounded-xl p-5 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Search Volume</p>
            <p className="text-2xl font-bold">{summary.totalSearchVolume.toLocaleString()}</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <p className="text-xs text-muted-foreground mb-1">Current Revenue</p>
            <p className="text-2xl font-bold">{fmt(summary.combinedCurrentRevenue)}/mo</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <p className="text-xs text-muted-foreground mb-1">Domination Revenue</p>
            <p className="text-2xl font-bold text-green-600">{fmt(summary.combinedDominationRevenue)}/mo</p>
          </div>
          <div className="bg-card border rounded-xl p-5 text-center">
            <p className="text-xs text-muted-foreground mb-1">Execution Progress</p>
            <p className="text-2xl font-bold">{summary.overallProgress}%</p>
          </div>
        </div>

        {/* Capital Allocation */}
        <div className="bg-card border rounded-2xl p-6 mb-10">
          <h2 className="font-display font-bold text-lg mb-4">Capital Allocation & Priority</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {summary.capitalAllocation.map((a, i) => (
              <div key={a.niche} className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">#{i + 1} Priority</p>
                <p className="font-semibold text-sm">{a.niche}</p>
                <p className="text-2xl font-bold text-primary">{a.pct}%</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Fastest scaling niche: <strong>{summary.fastestScalingNiche}</strong> · 
            Combined 90-day uplift potential: <strong className="text-green-600">{fmt(summary.combinedQuarterlyUplift)}</strong>
          </p>
        </div>

        {/* Revenue Forecast Table */}
        <div className="bg-card border rounded-2xl p-6 mb-10">
          <h2 className="font-display font-bold text-lg mb-4">Combined 90-Day Revenue Forecast</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50">
                <th className="text-left p-3">Niche</th>
                <th className="text-right p-3">Conservative/mo</th>
                <th className="text-right p-3">Growth/mo</th>
                <th className="text-right p-3">Domination/mo</th>
                <th className="text-right p-3">Dom × 3 (90d)</th>
              </tr></thead>
              <tbody>
                {NICHE_PROFILES.map(n => {
                  const [con, gro, dom] = n.revenueScenarios;
                  return (
                    <tr key={n.id} className="border-b border-border/50">
                      <td className="p-3 font-medium">{n.name}</td>
                      <td className="p-3 text-right">{fmt(con.monthlyRevenue)}</td>
                      <td className="p-3 text-right">{fmt(gro.monthlyRevenue)}</td>
                      <td className="p-3 text-right font-semibold text-green-600">{fmt(dom.monthlyRevenue)}</td>
                      <td className="p-3 text-right font-bold">{fmt(dom.quarterlyRevenue)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 font-bold">
                  <td className="p-3">TOTAL</td>
                  <td className="p-3 text-right">{fmt(NICHE_PROFILES.reduce((s, n) => s + n.revenueScenarios[0].monthlyRevenue, 0))}</td>
                  <td className="p-3 text-right">{fmt(NICHE_PROFILES.reduce((s, n) => s + n.revenueScenarios[1].monthlyRevenue, 0))}</td>
                  <td className="p-3 text-right text-green-600">{fmt(summary.combinedDominationRevenue)}</td>
                  <td className="p-3 text-right">{fmt(summary.combinedDominationRevenue * 3)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-Niche Detail Cards */}
        <h2 className="font-display font-bold text-xl mb-6">Niche Detail Cards</h2>
        <div className="space-y-8">
          {NICHE_PROFILES.map(n => <NicheCard key={n.id} niche={n} />)}
        </div>
      </div>
    </Layout>
  );
}
