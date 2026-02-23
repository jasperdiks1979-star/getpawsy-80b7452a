import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { runLockdownEngine } from '@/lib/top3-lockdown-engine';
import { Badge } from '@/components/ui/badge';
import { Shield, Lock, Link2, FileText, MousePointerClick, RefreshCw, Swords, TrendingUp, DollarSign, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useMemo } from 'react';

const statusIcon = (s: string) => {
  if (s === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />;
  if (s === 'partial') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
  return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
};

export default function Top3LockdownDiagnostics() {
  const result = useMemo(() => runLockdownEngine(), []);

  return (
    <Layout>
      <Helmet>
        <title>Top-3 Lockdown Mode | GetPawsy Diagnostics</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container py-10 max-w-6xl">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Top 3 Lockdown Mode</h1>
        </div>
        <p className="text-muted-foreground mb-8">
          {result.totalPages} pages in position 1–3 · Entrenchment protocol active · No passive maintenance allowed
        </p>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-5 gap-4 mb-10">
          <div className="bg-card border rounded-xl p-4 text-center">
            <Lock className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{result.totalPages}</div>
            <div className="text-xs text-muted-foreground">Locked Pages</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <Shield className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{result.avgReinforcementScore}%</div>
            <div className="text-xs text-muted-foreground">Avg Reinforcement</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">${result.totalMonthlyRevenue.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Monthly Revenue</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <FileText className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{result.totalSupportArticles}</div>
            <div className="text-xs text-muted-foreground">Support Articles</div>
          </div>
          <div className="bg-card border rounded-xl p-4 text-center">
            <Link2 className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-2xl font-bold">{result.totalInternalLinks}</div>
            <div className="text-xs text-muted-foreground">Internal Links</div>
          </div>
        </div>

        {/* Page Overview */}
        <h2 className="text-2xl font-display font-bold mb-4">Locked Pages — Reinforcement Scores</h2>
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
                <th className="text-right p-2 font-semibold">Rev/mo</th>
                <th className="text-right p-2 font-semibold">Words</th>
                <th className="text-center p-2 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {result.pages.map(p => (
                <tr key={p.url} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="p-2">{p.rank}</td>
                  <td className="p-2 font-mono text-[10px] max-w-[180px] truncate">{p.url}</td>
                  <td className="p-2 font-medium">{p.keyword}</td>
                  <td className="p-2 text-right font-bold text-primary">#{p.position}</td>
                  <td className="p-2 text-right">{p.impressions.toLocaleString()}</td>
                  <td className="p-2 text-right">{p.ctr}%</td>
                  <td className="p-2 text-right font-semibold">${p.monthlyRevenue.toLocaleString()}</td>
                  <td className="p-2 text-right">{p.currentWordCount.toLocaleString()} → {p.targetWordCount.toLocaleString()}</td>
                  <td className="p-2 text-center">
                    <Badge variant={p.reinforcementScore >= 60 ? 'default' : 'destructive'} className="text-[10px]">
                      {p.reinforcementScore}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reinforcement Checklists */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" /> Reinforcement Checklists
        </h2>
        <div className="grid lg:grid-cols-2 gap-4 mb-10">
          {result.pages.slice(0, 6).map(p => (
            <div key={p.url} className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold">{p.keyword}</p>
                <Badge variant={p.reinforcementScore >= 60 ? 'default' : 'destructive'} className="text-[10px]">{p.reinforcementScore}%</Badge>
              </div>
              <div className="space-y-1.5">
                {p.missingChecklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {statusIcon(item.status)}
                    <span className={item.status === 'done' ? 'text-muted-foreground' : ''}>{item.label}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{item.priority}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* CTR Rewrites */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <MousePointerClick className="w-5 h-5" /> CTR Domination — Title Rewrites
        </h2>
        <div className="space-y-4 mb-10">
          {result.pages.map(p => (
            <div key={p.url} className="bg-card border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{p.url} · Position #{p.position}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-0.5">Before</p>
                  <p className="text-sm line-through opacity-60">{p.ctrRewrite.before}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-primary uppercase mb-0.5">After (Lockdown)</p>
                  <p className="text-sm font-medium">{p.ctrRewrite.after}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 italic">{p.ctrRewrite.meta}</p>
            </div>
          ))}
        </div>

        {/* Internal Link Maps */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Link2 className="w-5 h-5" /> Internal Link Domination (15+ per page)
        </h2>
        <div className="space-y-4 mb-10">
          {result.pages.slice(0, 5).map(p => (
            <div key={p.url} className="bg-card border rounded-xl p-4">
              <p className="text-sm font-bold mb-2">{p.keyword} <span className="text-muted-foreground font-normal">({p.internalLinkMap.length} links)</span></p>
              <div className="grid sm:grid-cols-2 gap-1">
                {p.internalLinkMap.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={link.priority === 'critical' ? 'default' : 'outline'} className="text-[9px] w-14 justify-center shrink-0">{link.priority}</Badge>
                    <span className="text-muted-foreground">{link.type}:</span>
                    <span className="font-mono text-[10px] truncate">{link.anchorText}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Support Cluster Expansion */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" /> Support Cluster Expansion
        </h2>
        <div className="space-y-4 mb-10">
          {result.pages.slice(0, 4).map(p => (
            <div key={p.url} className="bg-card border rounded-xl p-4">
              <p className="text-sm font-bold mb-3">{p.keyword} <span className="text-muted-foreground font-normal">({p.clusterExpansion.length} articles)</span></p>
              <div className="space-y-2">
                {p.clusterExpansion.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[9px] w-24 justify-center shrink-0">{a.type}</Badge>
                    <span className="font-medium">{a.title}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">{a.wordTarget} words</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Competitor Suppression */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <Swords className="w-5 h-5" /> Competitor Suppression Plan
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {result.pages.slice(0, 6).map(p => (
            <div key={p.url} className="bg-card border rounded-xl p-4">
              <p className="text-sm font-bold mb-2">{p.keyword}</p>
              <div className="space-y-1.5">
                {p.competitorSuppression.slice(0, 4).map((s, i) => (
                  <div key={i} className="text-xs flex items-start gap-1.5">
                    <Badge variant="outline" className="text-[9px] shrink-0">{s.type}</Badge>
                    <span>{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Freshness Schedule */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5" /> Content Freshness Schedule
        </h2>
        <div className="overflow-x-auto mb-10">
          <table className="w-full text-xs border">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left p-2 font-semibold">Action</th>
                <th className="text-center p-2 font-semibold">Frequency</th>
                <th className="text-center p-2 font-semibold">Next Due</th>
              </tr>
            </thead>
            <tbody>
              {result.pages[0]?.freshnessSchedule.map((f, i) => (
                <tr key={i} className="border-t border-border/30">
                  <td className="p-2">{f.action}</td>
                  <td className="p-2 text-center"><Badge variant="outline" className="text-[9px]">{f.frequency}</Badge></td>
                  <td className="p-2 text-center font-mono">{f.nextDue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 90-Day Roadmap */}
        <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> 90-Day Defensive Roadmap
        </h2>
        <div className="space-y-4 mb-10">
          {result.roadmap.map(phase => (
            <div key={phase.phase} className="bg-card border rounded-xl p-5">
              <h3 className="font-display font-bold text-lg mb-1">Phase {phase.phase}: {phase.name}</h3>
              <p className="text-xs text-muted-foreground mb-3">{phase.days}</p>
              <ul className="space-y-1.5 mb-3">
                {phase.actions.map((a, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-primary font-bold">✓</span> {a}
                  </li>
                ))}
              </ul>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-primary">Expected Outcome</p>
                <p className="text-sm">{phase.expectedOutcome}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Revenue Protection */}
        <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" /> Revenue Protection Summary
          </h2>
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Monthly Revenue (Top 3)</p>
              <p className="text-2xl font-bold">${result.totalMonthlyRevenue.toLocaleString()}/mo</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Annual Protected Revenue</p>
              <p className="text-2xl font-bold text-primary">${result.protectedRevenue.toLocaleString()}/yr</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Lockdown Status</p>
              <p className="text-2xl font-bold text-green-600">ACTIVE</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
