import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Target, TrendingUp, AlertTriangle, Link2, BarChart3,
  Crosshair, Lock, Shield, Gauge, ArrowRight, CheckCircle,
  FileText, Zap, DollarSign,
} from 'lucide-react';
import { buildMarketTakeoverState } from '@/lib/market-takeover-engine';
import { useMemo } from 'react';

const fmt = (n: number) => '$' + n.toLocaleString();

const TYPE_COLORS: Record<string, string> = {
  'Buying Guide': 'bg-blue-500/10 text-blue-600',
  'Best of 2026': 'bg-green-500/10 text-green-600',
  'Problem-Solution': 'bg-orange-500/10 text-orange-600',
  'Comparison': 'bg-purple-500/10 text-purple-600',
  'Use-Case': 'bg-cyan-500/10 text-cyan-600',
  'Expert FAQ': 'bg-primary/10 text-primary',
};

export default function MarketTakeover() {
  const state = useMemo(() => buildMarketTakeoverState(), []);
  const { niches, clusterRoadmap, internalLinks, ctrRewrites, cannibalizationFixes, velocityRules, marketShare, executionOrder, summary } = state;

  return (
    <Layout>
      <Helmet>
        <title>Market Takeover Mode | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container py-10 max-w-7xl">
        <h1 className="text-3xl font-display font-bold mb-1">🏴 Market Takeover Mode</h1>
        <p className="text-muted-foreground mb-8">3-Niche Domination — Hubs · Clusters · Links · CTR · Velocity · Market Share</p>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-10">
          <SumCard icon={Target} label="Niche Hubs" value={summary.totalHubs} />
          <SumCard icon={FileText} label="Cluster Pages" value={summary.totalClusterPages} />
          <SumCard icon={Link2} label="Internal Links" value={summary.totalInternalLinks} />
          <SumCard icon={AlertTriangle} label="Cannibalizations" value={summary.cannibalizationsFixed} color="text-red-500" />
          <SumCard icon={DollarSign} label="90d Rev @Rank 3" value={fmt(summary.combined90dRevenue.rank3)} color="text-green-600" />
          <SumCard icon={Gauge} label="Market Share" value={summary.marketShareTarget} />
        </div>

        {/* ── NICHE HUBS ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Phase 1 — Category Power Hubs</CardTitle>
            <CardDescription>3 high-authority hub pages targeting primary commercial keywords</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {niches.map(h => (
                <div key={h.hubUrl} className="border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{h.niche}</span>
                    <Badge variant="outline" className="text-[9px]">{h.wordCount}w</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{h.hubUrl}</div>
                  <div className="text-xs font-medium">{h.h1}</div>
                  <div className="space-y-1">
                    {h.h2Sections.map((s, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <CheckCircle className="h-2.5 w-2.5 text-green-500" /> {s}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1 border-t">
                    {h.schemas.map(s => <Badge key={s} variant="secondary" className="text-[8px]">{s}</Badge>)}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] text-center pt-1 border-t">
                    <div><div className="font-bold">{h.currentPosition.toFixed(1)}</div><div className="text-muted-foreground">Position</div></div>
                    <div><div className="font-bold">{h.impressions.toLocaleString()}</div><div className="text-muted-foreground">Impressions</div></div>
                    <div><div className="font-bold">${h.aov}</div><div className="text-muted-foreground">AOV</div></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── CLUSTER ROADMAP ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Phase 2 — Cluster Expansion (18 Articles)</CardTitle>
          </CardHeader>
          <CardContent>
            {['Orthopedic Dog Beds', 'Cat Trees for Large Cats', 'Dog Car Travel Safety'].map(niche => {
              const articles = clusterRoadmap.filter(a => a.niche === niche);
              return (
                <div key={niche} className="mb-5 last:mb-0">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-2">
                    <Lock className="h-3 w-3" /> {niche}
                    <Badge variant="outline" className="text-[8px]">{articles.length} articles</Badge>
                  </h4>
                  <div className="space-y-1.5">
                    {articles.map(a => (
                      <div key={a.slug} className="flex items-center justify-between text-xs border rounded px-3 py-2 hover:bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          <span className="truncate">{a.title}</span>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Badge variant="outline" className={`text-[8px] ${TYPE_COLORS[a.type] || ''}`}>{a.type}</Badge>
                          <Badge variant="secondary" className="text-[8px]">{a.wordCount}w</Badge>
                          <Badge variant="outline" className="text-[8px]">{a.linksToHub}→Hub</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* ── CTR REWRITES ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Crosshair className="h-4 w-4" /> Phase 4 — CTR War Mode</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[350px]">
                <div className="space-y-3">
                  {ctrRewrites.map((r, i) => (
                    <div key={i} className="border rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-muted-foreground text-[10px]">{r.url}</span>
                        <Badge variant="default" className="text-[8px]">{r.expectedCtrLift}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          <span className="text-red-500 text-[10px] shrink-0">OLD:</span>
                          <span className="text-muted-foreground line-through text-[10px]">{r.currentTitle}</span>
                        </div>
                        <div className="flex gap-1">
                          <span className="text-green-600 text-[10px] shrink-0">NEW:</span>
                          <span className="font-medium text-[10px]">{r.newTitle}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground pt-1 border-t">{r.newMeta}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* ── CANNIBALIZATION ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Phase 5 — Cannibalization Control</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {cannibalizationFixes.map((c, i) => (
                  <div key={i} className="border border-red-500/20 bg-red-500/5 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">"{c.query}"</span>
                      <Badge variant="destructive" className="text-[9px]">{c.severity}</Badge>
                    </div>
                    {c.pages.map((p, j) => (
                      <div key={j} className="flex justify-between text-[10px] text-muted-foreground pl-2 border-l-2 border-red-500/30">
                        <span className="truncate">{p.url}</span>
                        <span>pos {p.position} · {p.impressions} impr</span>
                      </div>
                    ))}
                    <div className="text-[10px] font-medium text-red-600 pt-1 border-t border-red-500/10">
                      Fix: {c.action}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* ── VELOCITY ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Phase 6 — Velocity Acceleration</CardTitle>
              <CardDescription>Bi-weekly scaling decisions per niche</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {velocityRules.map((v, i) => (
                  <div key={i} className="border rounded-lg p-3 text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{v.niche}</span>
                      <Badge variant={v.action === 'SCALE' ? 'default' : 'secondary'} className="text-[8px]">{v.action}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground mb-2">
                      <div>Clicks <span className={v.clickGrowthPct >= 25 ? 'text-green-600 font-bold' : ''}>{v.clickGrowthPct > 0 ? '+' : ''}{v.clickGrowthPct}%</span></div>
                      <div>Impr +{v.impressionGrowthPct}%</div>
                      <div>Pos <span className="text-green-600">{v.positionDelta}</span></div>
                    </div>
                    <div className="text-[10px] text-primary">{v.details}</div>
                  </div>
                ))}
              </div>
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

        {/* ── MARKET SHARE & REVENUE ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Phase 7 — Market Share Simulation & Revenue Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left p-2">Niche</th>
                  <th className="text-right p-2">Rev @3 /30d</th>
                  <th className="text-right p-2">Rev @5 /30d</th>
                  <th className="text-right p-2 font-bold">Rev @3 /90d</th>
                  <th className="text-right p-2">Rev @5 /90d</th>
                  <th className="text-right p-2">Market Share</th>
                  <th className="text-right p-2">SERP Coverage</th>
                </tr>
              </thead>
              <tbody>
                {marketShare.map(m => (
                  <tr key={m.niche} className="border-b border-border/30">
                    <td className="p-2 font-medium">{m.niche}</td>
                    <td className="p-2 text-right font-mono">{fmt(m.revenue30d.rank3)}</td>
                    <td className="p-2 text-right font-mono text-muted-foreground">{fmt(m.revenue30d.rank5)}</td>
                    <td className="p-2 text-right font-mono font-bold text-green-600">{fmt(m.revenue90d.rank3)}</td>
                    <td className="p-2 text-right font-mono text-muted-foreground">{fmt(m.revenue90d.rank5)}</td>
                    <td className="p-2 text-right font-bold text-primary">{m.marketSharePct}%</td>
                    <td className="p-2 text-right">{m.serpCoverage}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-bold">
                  <td className="p-2">TOTAL</td>
                  <td className="p-2 text-right">{fmt(marketShare.reduce((s, m) => s + m.revenue30d.rank3, 0))}</td>
                  <td className="p-2 text-right text-muted-foreground">{fmt(marketShare.reduce((s, m) => s + m.revenue30d.rank5, 0))}</td>
                  <td className="p-2 text-right text-green-600">{fmt(summary.combined90dRevenue.rank3)}</td>
                  <td className="p-2 text-right text-muted-foreground">{fmt(summary.combined90dRevenue.rank5)}</td>
                  <td className="p-2 text-right text-primary">~{(marketShare.reduce((s, m) => s + m.marketSharePct, 0) / 3).toFixed(1)}% avg</td>
                  <td className="p-2 text-right">—</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── INTERNAL LINK BLUEPRINT ── */}
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Phase 3 — Internal Link Authority Blueprint</CardTitle>
            <CardDescription>{summary.totalInternalLinks} strategic links mapped across 3 niches</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {internalLinks.map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/30 border-b border-border/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground truncate max-w-[180px]">{l.source}</span>
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      <span className="font-medium truncate max-w-[180px]">{l.target}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Badge variant="outline" className="text-[8px]">{l.anchorType}</Badge>
                      <Badge variant="secondary" className="text-[8px]">w{l.weight}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
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
