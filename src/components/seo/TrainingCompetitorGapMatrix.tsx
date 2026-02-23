/**
 * Dog Training Competitor Gap Matrix
 * 
 * Visual comparison dashboard showing GetPawsy vs top competitors
 * across SEO structure, content depth, schemas, and conversion factors.
 */

import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Minus, TrendingUp, Shield, Zap, Target, Award } from 'lucide-react';
import {
  NO_PULL_HARNESS_COMPETITORS,
  LONG_LINE_COMPETITORS,
  STOP_PULLING_COMPETITORS,
  RECALL_LEASH_COMPETITORS,
  LARGE_DOG_HARNESS_COMPETITORS,
  GETPAWSY_TRAINING_METRICS,
  CTR_WARFARE_UPGRADES,
  REVENUE_SCENARIOS,
  ATTACK_ROADMAP,
  type CTRUpgrade,
  type TrafficScenario,
  type AttackPhase,
} from '@/data/dog-training-competitor-data';
import type { CompetitorProfile } from '@/lib/competitor-displacement-engine';

const Check = () => <CheckCircle className="w-4 h-4 text-green-600" />;
const Cross = () => <XCircle className="w-4 h-4 text-destructive" />;
const Neutral = () => <Minus className="w-4 h-4 text-muted-foreground" />;

interface ClusterMatrixProps {
  keyword: string;
  competitors: CompetitorProfile[];
  ourMetrics: { wordCount: number; internalLinks: number; schemas: string[] };
}

function ClusterMatrix({ keyword, competitors, ourMetrics }: ClusterMatrixProps) {
  const maxWordCount = Math.max(...competitors.map(c => c.wordCount));
  const weWin = ourMetrics.wordCount > maxWordCount;

  return (
    <div className="mb-8">
      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        "{keyword}"
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2.5 font-medium text-foreground">Factor</th>
              {competitors.slice(0, 3).map((c, i) => (
                <th key={i} className="text-left p-2.5 font-medium text-muted-foreground">{c.domain}</th>
              ))}
              <th className="text-left p-2.5 font-medium text-primary bg-primary/5">GetPawsy</th>
              <th className="text-left p-2.5 font-medium text-foreground">Gap</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">Word Count</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5 text-muted-foreground">{c.wordCount.toLocaleString()}</td>
              ))}
              <td className="p-2.5 font-medium bg-primary/5">{ourMetrics.wordCount.toLocaleString()}</td>
              <td className="p-2.5">{weWin
                ? <Badge variant="default" className="text-[10px] bg-green-600">Leading</Badge>
                : <Badge variant="destructive" className="text-[10px]">+{maxWordCount - ourMetrics.wordCount} needed</Badge>
              }</td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">Product Schema</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5">{c.hasProductSchema ? <Check /> : <Cross />}</td>
              ))}
              <td className="p-2.5 bg-primary/5"><Check /></td>
              <td className="p-2.5"><Badge variant="default" className="text-[10px] bg-green-600">✓</Badge></td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">FAQ Schema</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5">{c.hasFaqSchema ? <Check /> : <Cross />}</td>
              ))}
              <td className="p-2.5 bg-primary/5"><Check /></td>
              <td className="p-2.5"><Badge variant="default" className="text-[10px] bg-green-600">✓</Badge></td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">Breadcrumbs</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5">{c.hasBreadcrumbSchema ? <Check /> : <Cross />}</td>
              ))}
              <td className="p-2.5 bg-primary/5"><Check /></td>
              <td className="p-2.5"><Badge variant="default" className="text-[10px] bg-green-600">✓</Badge></td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">Internal Links</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5 text-muted-foreground">{c.internalLinks}</td>
              ))}
              <td className="p-2.5 font-medium bg-primary/5">{ourMetrics.internalLinks}</td>
              <td className="p-2.5">
                {ourMetrics.internalLinks >= Math.max(...competitors.filter(c => c.domain !== 'amazon.com').map(c => c.internalLinks))
                  ? <Badge variant="default" className="text-[10px] bg-green-600">Leading</Badge>
                  : <Badge variant="secondary" className="text-[10px]">Expand</Badge>
                }
              </td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">Content Depth</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5 text-muted-foreground">{c.contentDepthScore}/10</td>
              ))}
              <td className="p-2.5 font-medium bg-primary/5">8/10</td>
              <td className="p-2.5"><Badge variant="default" className="text-[10px] bg-green-600">Strong</Badge></td>
            </tr>
            <tr className="border-t border-border">
              <td className="p-2.5 font-medium">UX Score</td>
              {competitors.slice(0, 3).map((c, i) => (
                <td key={i} className="p-2.5 text-muted-foreground">{c.uxScore}/10</td>
              ))}
              <td className="p-2.5 font-medium bg-primary/5">9/10</td>
              <td className="p-2.5"><Badge variant="default" className="text-[10px] bg-green-600">Leading</Badge></td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Key weaknesses */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {competitors.slice(0, 3).flatMap(c => c.weaknesses.slice(0, 1)).map((w, i) => (
          <Badge key={i} variant="outline" className="text-[10px] text-destructive border-destructive/30">{w}</Badge>
        ))}
      </div>
    </div>
  );
}

function CTRWarfareSection() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" /> CTR Warfare — Meta Title Upgrades
      </h3>
      {CTR_WARFARE_UPGRADES.map((u, i) => (
        <div key={i} className="p-4 rounded-xl border border-border space-y-2">
          <Badge variant="secondary" className="text-[10px]">{u.keyword}</Badge>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-destructive/5 rounded-lg">
              <span className="font-medium text-destructive block mb-1">Competitor</span>
              <p className="font-medium text-foreground">{u.competitorTitle}</p>
              <p className="text-muted-foreground mt-1">{u.competitorDesc}</p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <span className="font-medium text-green-700 dark:text-green-400 block mb-1">GetPawsy</span>
              <p className="font-medium text-foreground">{u.getpawsyTitle}</p>
              <p className="text-muted-foreground mt-1">{u.getpawsyDesc}</p>
            </div>
          </div>
          <Badge className="bg-green-600 text-[10px]">Expected CTR lift: {u.expectedCTRLift}</Badge>
        </div>
      ))}
    </div>
  );
}

function RevenueProjection() {
  return (
    <div>
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" /> Revenue Projection — Dog Training Niche
      </h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2.5 font-medium">Scenario</th>
              <th className="text-left p-2.5 font-medium">Visitors/mo</th>
              <th className="text-left p-2.5 font-medium">CVR</th>
              <th className="text-left p-2.5 font-medium">AOV</th>
              <th className="text-left p-2.5 font-medium">Monthly</th>
              <th className="text-left p-2.5 font-medium">3-Month</th>
              <th className="text-left p-2.5 font-medium">6-Month</th>
            </tr>
          </thead>
          <tbody>
            {REVENUE_SCENARIOS.map((s, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-2.5 font-medium">{s.label}</td>
                <td className="p-2.5 text-muted-foreground">{s.monthlyVisitors.toLocaleString()}</td>
                <td className="p-2.5 text-muted-foreground">{(s.conversionRate * 100).toFixed(1)}%</td>
                <td className="p-2.5 text-muted-foreground">${s.aov}</td>
                <td className="p-2.5 font-medium text-primary">${s.monthlyRevenue.toLocaleString()}</td>
                <td className="p-2.5 font-medium">${s.threeMonthRevenue.toLocaleString()}</td>
                <td className="p-2.5 font-medium">${s.sixMonthRevenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttackRoadmapSection() {
  return (
    <div>
      <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
        <Award className="w-4 h-4 text-primary" /> 90-Day Attack Roadmap
      </h3>
      <div className="grid md:grid-cols-2 gap-4">
        {ATTACK_ROADMAP.map((phase, i) => (
          <div key={i} className="p-4 rounded-xl border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="default" className="text-[10px]">Phase {i + 1}</Badge>
              <span className="text-xs text-muted-foreground">{phase.days}</span>
            </div>
            <h4 className="font-semibold text-foreground text-sm mb-2">{phase.phase}</h4>
            <ul className="space-y-1 mb-3">
              {phase.actions.map((a, j) => (
                <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <CheckCircle className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                  {a}
                </li>
              ))}
            </ul>
            <div className="text-[10px] p-2 bg-primary/5 rounded-lg text-primary font-medium">
              → {phase.expectedOutcome}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrainingCompetitorGapMatrix() {
  const m = GETPAWSY_TRAINING_METRICS;

  const clusters = [
    { keyword: 'best no pull dog harness', competitors: NO_PULL_HARNESS_COMPETITORS, metrics: m.noPullHarness },
    { keyword: 'dog training leash long line', competitors: LONG_LINE_COMPETITORS, metrics: m.longLine },
    { keyword: 'stop dog pulling harness', competitors: STOP_PULLING_COMPETITORS, metrics: m.stopPulling },
    { keyword: 'dog recall training leash', competitors: RECALL_LEASH_COMPETITORS, metrics: m.recallLeash },
    { keyword: 'best harness for large dogs that pull', competitors: LARGE_DOG_HARNESS_COMPETITORS, metrics: m.largeDogHarness },
  ];

  return (
    <div className="space-y-10">
      {/* Gap Matrices */}
      <div>
        <h2 className="text-xl font-display font-bold text-foreground mb-6 flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Competitor Gap Matrix — Dog Training Niche
        </h2>
        {clusters.map((c, i) => (
          <ClusterMatrix key={i} keyword={c.keyword} competitors={c.competitors} ourMetrics={c.metrics} />
        ))}
      </div>

      {/* CTR Warfare */}
      <CTRWarfareSection />

      {/* Revenue Projection */}
      <RevenueProjection />

      {/* Attack Roadmap */}
      <AttackRoadmapSection />
    </div>
  );
}
