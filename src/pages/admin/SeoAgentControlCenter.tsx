import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Bot, Brain, Shield, Target, TrendingUp, AlertTriangle,
  CheckCircle, Clock, RotateCcw, Zap, Search, Link,
  FileText, ShoppingCart, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';
import { runSeoAgentSystem, type SeoAgentResult, type TacticId } from '@/lib/seo-agent-engine';

// ============= HELPERS =============

const TACTIC_LABELS: Record<TacticId, string> = {
  T1: 'Title Rewrite', T2: 'Meta CTR', T3: 'Answer Block', T4: 'FAQ+Schema',
  T5: 'Depth Expand', T6: 'Internal Links', T7: 'Comparison Table',
  T8: 'Freshness', T9: 'CRO: Trust', T10: 'CRO: Sticky Cart', T11: 'AOV: Bundles',
};

function Section({ title, badge, defaultOpen = false, children }: { title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full p-3 text-left text-sm font-semibold hover:bg-muted/50">
        <span className="flex items-center gap-2">
          {title}
          {badge && <Badge variant="outline" className="text-[10px] font-normal">{badge}</Badge>}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-3 pt-0">{children}</div>}
    </div>
  );
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  orchestrator: Bot, data: Search, intent: Brain, content: FileText,
  link: Link, serp: Eye, cro: ShoppingCart, riskqa: Shield,
};

// ============= MAIN PAGE =============

export default function SeoAgentControlCenter() {
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [riskBudgetLimit, setRiskBudgetLimit] = useState([10]);

  const { data: gscData } = useQuery({
    queryKey: ['gsc-keywords-agent-center'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .order('impressions', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const result: SeoAgentResult | null = useMemo(() => {
    if (!gscData || gscData.length === 0) return null;
    return runSeoAgentSystem(gscData);
  }, [gscData]);

  if (!result) {
    return (
      <Layout>
        <div className="container max-w-7xl mx-auto py-8 px-4">
          <p className="text-muted-foreground text-center py-20">Loading SEO Agent Control Center…</p>
        </div>
      </Layout>
    );
  }

  const { agents, learningState, riskBudget, currentBatch, pendingApprovals, recentChanges, kpis, alerts, cannibalization, schedule, systemSummary } = result;

  return (
    <Layout>
      <Helmet>
        <title>SEO Agent Control Center | Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container max-w-7xl mx-auto py-6 px-4 space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-violet-500" />
              SEO Agent Control Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Self-learning agent system • {systemSummary.totalRealQueries} real queries • US market
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Autonomous Mode</span>
              <Switch checked={autonomousMode} onCheckedChange={checked => { setAutonomousMode(checked); toast[checked ? 'success' : 'info'](checked ? '🤖 Autonomous mode activated' : 'Autonomous mode paused'); }} />
            </div>
            <Badge variant={autonomousMode ? 'default' : 'secondary'} className="text-xs">
              {autonomousMode ? '🟢 ACTIVE' : '⏸ PAUSED'}
            </Badge>
          </div>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Clicks', value: kpis.totalClicks.toLocaleString(), icon: Target, color: 'text-blue-500' },
            { label: 'Impressions', value: kpis.totalImpressions.toLocaleString(), icon: Eye, color: 'text-green-500' },
            { label: 'Avg CTR', value: `${kpis.avgCtr}%`, icon: TrendingUp, color: 'text-amber-500' },
            { label: 'Avg Position', value: kpis.avgPosition.toString(), icon: Search, color: 'text-violet-500' },
            { label: 'Est. Revenue', value: `$${kpis.estimatedRevenue.toLocaleString()}`, icon: ShoppingCart, color: 'text-emerald-500' },
          ].map((m, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center gap-3">
                <m.icon className={`h-5 w-5 ${m.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-lg font-bold">{m.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Col 1: Agent Status + Risk Budget */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500" /> Agent Swarm Status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5">
                {agents.map(a => {
                  const Icon = AGENT_ICONS[a.name] || Bot;
                  return (
                    <div key={a.name} className="flex items-center justify-between text-xs p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{a.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={a.status === 'online' ? 'default' : 'secondary'} className="text-[10px]">{a.status}</Badge>
                        <span className="text-muted-foreground">{a.findings}f / {a.actions}a</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" /> Risk Budget
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                    <p className="text-green-600 font-bold text-lg">{riskBudget.lowAutoExecuted}</p>
                    <p className="text-muted-foreground">LOW (auto)</p>
                  </div>
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                    <p className="text-amber-600 font-bold text-lg">{riskBudget.mediumPending}</p>
                    <p className="text-muted-foreground">MED (pending)</p>
                  </div>
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-red-600 font-bold text-lg">{riskBudget.highBlocked}</p>
                    <p className="text-muted-foreground">HIGH (blocked)</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Weekly limit</span>
                    <span className="font-medium">{riskBudgetLimit[0]} URLs</span>
                  </div>
                  <Slider value={riskBudgetLimit} onValueChange={setRiskBudgetLimit} min={1} max={20} step={1} />
                </div>
                <div className="flex justify-between text-xs">
                  <span>Used: {riskBudget.used}/{riskBudget.weeklyLimit}</span>
                  <span className="text-muted-foreground">Remaining: {riskBudget.remaining}</span>
                </div>
              </CardContent>
            </Card>

            {/* Alerts */}
            {alerts.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Alerts ({alerts.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1.5">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border">
                      <Badge variant={a.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px] mt-0.5">{a.severity}</Badge>
                      <span>{a.message}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Col 2: Current Batch + Pending Approvals */}
          <div className="space-y-4">
            <Card className="border-violet-500/30">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" /> Current Batch: {currentBatch.batchId}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline">{currentBatch.targets.length} targets</Badge>
                  <Badge variant="outline">+{currentBatch.totalExpectedClickLift} clicks</Badge>
                  <Badge variant="outline">+${currentBatch.totalExpectedRevenueLift} rev</Badge>
                  <Badge>{currentBatch.status}</Badge>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                  {currentBatch.targets.map((t, i) => (
                    <div key={i} className="p-2 rounded border text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-primary truncate max-w-[60%]">{t.page.replace(/https?:\/\/[^/]+/, '')}</span>
                        <div className="flex gap-1">
                          <Badge variant={t.zone === 'yellow' ? 'default' : 'secondary'} className="text-[10px]">{t.zone}</Badge>
                          <Badge variant={t.riskLevel === 'low' ? 'outline' : 'destructive'} className="text-[10px]">{t.riskLevel}</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {t.recommendedTactics.map(id => (
                          <Badge key={id} variant="secondary" className="text-[9px]">{TACTIC_LABELS[id]}</Badge>
                        ))}
                      </div>
                      <div className="flex gap-2 text-muted-foreground">
                        <span>Score: {t.score}</span>
                        <span>+{t.expectedImpact.clicks} clicks</span>
                        <span>+${t.expectedImpact.revenue} rev</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
              <Card className="border-amber-500/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" /> Pending Approvals ({pendingApprovals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1.5">
                  {pendingApprovals.map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded border">
                      <div>
                        <span className="font-mono text-primary truncate">{t.page.replace(/https?:\/\/[^/]+/, '')}</span>
                        <div className="flex gap-1 mt-1">
                          {t.recommendedTactics.slice(0, 2).map(id => (
                            <Badge key={id} variant="secondary" className="text-[9px]">{TACTIC_LABELS[id]}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2">
                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2">Skip</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Col 3: Learning + Schedule + Changes */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4 text-violet-500" /> Self-Learning Loop
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-violet-500/10 border text-center">
                    <p className="text-violet-600 font-bold text-lg">{learningState.totalExperiments}</p>
                    <p className="text-muted-foreground">Experiments</p>
                  </div>
                  <div className="p-2 rounded bg-green-500/10 border text-center">
                    <p className="text-green-600 font-bold text-lg">{Math.round(learningState.successRate * 100)}%</p>
                    <p className="text-muted-foreground">Success Rate</p>
                  </div>
                </div>

                <Section title="Tactic Priors (Bayesian)" badge={`${Object.keys(learningState.tacticPriors).length} tactics`}>
                  <div className="space-y-1">
                    {Object.entries(learningState.tacticPriors)
                      .sort(([, a], [, b]) => b - a)
                      .map(([id, prior]) => (
                        <div key={id} className="flex items-center justify-between text-xs">
                          <span>{TACTIC_LABELS[id as TacticId]}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${prior * 100}%` }} />
                            </div>
                            <span className="text-muted-foreground w-8 text-right">{(prior * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </Section>

                <Section title="Best Tactic by Page Type">
                  <div className="space-y-1">
                    {Object.entries(learningState.bestTacticByPageType).map(([type, id]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="capitalize">{type}</span>
                        <Badge variant="outline" className="text-[10px]">{TACTIC_LABELS[id]}</Badge>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Reward History">
                  <div className="flex items-end gap-1 h-16">
                    {learningState.rewardHistory.map((r, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full bg-violet-500/80 rounded-t" style={{ height: `${r.reward * 60}px` }} />
                        <span className="text-[9px] text-muted-foreground">W{r.week}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" /> Operations Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5">
                {Object.entries(schedule).map(([cadence, desc]) => (
                  <div key={cadence} className="flex items-start gap-2 text-xs p-2 rounded border">
                    <Badge variant="outline" className="text-[10px] capitalize mt-0.5">{cadence}</Badge>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent Changes */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-green-500" /> Recent Changes ({recentChanges.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5">
                {recentChanges.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded border">
                    <div>
                      <span className="font-mono text-primary truncate block max-w-[180px]">{c.page.replace(/https?:\/\/[^/]+/, '')}</span>
                      <Badge variant="secondary" className="text-[9px] mt-0.5">{TACTIC_LABELS[c.tactic]}</Badge>
                    </div>
                    <Badge variant={c.status === 'completed' ? 'default' : 'outline'} className="text-[10px]">{c.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Cannibalization */}
        {cannibalization.length > 0 && (
          <Card className="border-red-500/20">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Cannibalization Flags ({cannibalization.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                {cannibalization.slice(0, 10).map((c, i) => (
                  <div key={i} className="text-xs p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Badge variant={c.severity === 'critical' ? 'destructive' : 'outline'} className="text-[10px]">{c.severity}</Badge>
                      <span className="font-mono text-primary">"{c.query}"</span>
                      <span className="text-muted-foreground">→ {c.pages.length} pages</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* System JSON */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">System Summary (JSON)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto max-h-[200px]">{JSON.stringify(systemSummary, null, 2)}</pre>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
