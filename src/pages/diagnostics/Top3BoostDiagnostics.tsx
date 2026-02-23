import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { runTop3BoostEngine } from '@/lib/top3-boost-engine';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Target, TrendingUp, Zap, DollarSign, Link2, Brain, MousePointerClick } from 'lucide-react';
import { useMemo } from 'react';

export default function Top3BoostDiagnostics() {
  const result = useMemo(() => runTop3BoostEngine(), []);

  return (
    <Layout>
      <Helmet>
        <title>Top-3 Boost Engine | GetPawsy Diagnostics</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container py-10 max-w-6xl">
        <h1 className="text-3xl font-display font-bold mb-2">Position 6–15 → Top 3 Boost Engine</h1>
        <p className="text-muted-foreground mb-8">
          {result.totalCandidates} boost candidates · CTR warfare · Internal link pressure · Semantic domination
        </p>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-4 gap-4 mb-10">
          <div className="bg-card border rounded-xl p-4 text-center">
            <Target className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{result.totalCandidates}</div>
            <div className="text-xs text-muted-foreground">Boost Candidates</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <ArrowUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{result.avgCurrentPosition} → {result.avgProjectedPosition}</div>
            <div className="text-xs text-muted-foreground">Avg Position Shift</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">+{result.avgCtrUplift}%</div>
            <div className="text-xs text-muted-foreground">Avg CTR Uplift</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">+${result.totalRevenueUplift.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Revenue Uplift/mo</div>
          </div>
        </div>

        {/* Candidate Table */}
        <h2 className="text-2xl font-display font-bold mb-4">Boost Candidates — Ranked by Revenue Potential</h2>
        <div className="overflow-x-auto mb-10">
          <table className="w-full text-xs border">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-2 font-semibold">#</th>
                <th className="text-left p-2 font-semibold">URL</th>
                <th className="text-left p-2 font-semibold">Keyword</th>
                <th className="text-right p-2 font-semibold">Pos</th>
                <th className="text-right p-2 font-semibold">Impr</th>
                <th className="text-right p-2 font-semibold">CTR</th>
                <th className="text-center p-2 font-semibold">Intent</th>
                <th className="text-center p-2 font-semibold">Rev $</th>
                <th className="text-right p-2 font-semibold">→ Pos</th>
                <th className="text-right p-2 font-semibold">→ CTR</th>
                <th className="text-right p-2 font-semibold">Uplift</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.map(c => (
                <tr key={c.url} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="p-2 font-medium">{c.rank}</td>
                  <td className="p-2 font-mono text-[10px] max-w-[200px] truncate">{c.url}</td>
                  <td className="p-2 font-medium">{c.keyword}</td>
                  <td className="p-2 text-right">{c.position}</td>
                  <td className="p-2 text-right">{c.impressions.toLocaleString()}</td>
                  <td className="p-2 text-right">{c.ctr}%</td>
                  <td className="p-2 text-center">
                    <Badge variant={c.intent === 'buy' ? 'default' : 'outline'} className="text-[10px]">
                      {c.intent}
                    </Badge>
                  </td>
                  <td className="p-2 text-center">
                    <Badge variant={c.revenuePotential === 'high' ? 'default' : 'outline'} className="text-[10px]">
                      {c.revenuePotential}
                    </Badge>
                  </td>
                  <td className="p-2 text-right font-bold text-primary">{c.projectedPosition}</td>
                  <td className="p-2 text-right">{c.projectedCtr}%</td>
                  <td className="p-2 text-right font-semibold text-green-600">+${c.revenueUpliftMonthly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CTR Rewrites */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <MousePointerClick className="w-5 h-5" /> CTR Warfare — Title Rewrites
        </h2>
        <div className="space-y-4 mb-10">
          {result.candidates.slice(0, 10).map(c => (
            <div key={c.url} className="bg-card border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{c.url}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Before</p>
                  <p className="text-sm line-through opacity-60">{c.currentTitle}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-primary uppercase mb-0.5">After</p>
                  <p className="text-sm font-medium">{c.boostedTitle}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 italic">{c.boostedMeta}</p>
            </div>
          ))}
        </div>

        {/* Internal Link Maps */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Link2 className="w-5 h-5" /> Internal Link Pressure Maps
        </h2>
        <div className="space-y-4 mb-10">
          {result.candidates.slice(0, 5).map(c => (
            <div key={c.url} className="bg-card border rounded-xl p-4">
              <p className="text-sm font-bold mb-2">{c.keyword} <span className="text-muted-foreground font-normal">({c.internalLinkPlan.length} links planned)</span></p>
              <div className="grid sm:grid-cols-2 gap-1">
                {c.internalLinkPlan.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={link.priority === 'critical' ? 'default' : 'outline'} className="text-[9px] w-14 justify-center shrink-0">
                      {link.priority}
                    </Badge>
                    <span className="text-muted-foreground">{link.type}:</span>
                    <span className="font-mono text-[10px] truncate">{link.anchorText}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Semantic Gaps */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5" /> Semantic Gap Analysis vs Competitors
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {result.candidates.map(c => (
            <div key={c.url} className="bg-card border rounded-xl p-4">
              <p className="text-sm font-bold mb-2">{c.keyword}</p>
              <ul className="space-y-1">
                {c.semanticGaps.map((gap, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">▸</span> {gap}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 30-Day Roadmap */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5" /> 30-Day Climb Roadmap
        </h2>
        <div className="space-y-4 mb-10">
          {result.roadmap.map(week => (
            <div key={week.week} className="bg-card border rounded-xl p-5">
              <h3 className="font-display font-bold text-lg mb-3">Week {week.week}</h3>
              <ul className="space-y-1.5 mb-3">
                {week.actions.map((a, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-primary font-bold">✓</span> {a}
                  </li>
                ))}
              </ul>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-primary">Expected Outcome</p>
                <p className="text-sm">{week.expectedOutcome}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Revenue Projection */}
        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-display font-bold mb-4">Revenue Lift Projection</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current (Pos 6–15)</p>
              <p className="text-2xl font-bold">${Math.round(result.candidates.reduce((s, c) => s + c.clicks * 0.03 * 55, 0)).toLocaleString()}/mo</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">After Boost (Top 3–5)</p>
              <p className="text-2xl font-bold text-primary">+${result.totalRevenueUplift.toLocaleString()}/mo</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Annual Uplift</p>
              <p className="text-2xl font-bold text-green-600">${(result.totalRevenueUplift * 12).toLocaleString()}/yr</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
