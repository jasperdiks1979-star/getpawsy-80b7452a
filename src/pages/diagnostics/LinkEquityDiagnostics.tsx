import { Helmet } from 'react-helmet-async';
import { useMemo } from 'react';
import { runLinkEquityRedistribution, type LinkEquityReport } from '@/lib/link-equity-engine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2, TrendingUp, Trash2, RotateCw, ArrowRight, Target } from 'lucide-react';

function AnchorBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    exact: 'bg-red-500/10 text-red-700 border-red-200',
    partial: 'bg-amber-500/10 text-amber-700 border-amber-200',
    natural: 'bg-green-500/10 text-green-700 border-green-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[type] || ''}`}>{type}</span>;
}

export default function LinkEquityDiagnostics() {
  const report: LinkEquityReport = useMemo(() => runLinkEquityRedistribution(), []);

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Link Equity Diagnostics | GetPawsy Internal</title>
      </Helmet>
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Link Equity Redistribution Report</h1>
          <p className="text-sm text-muted-foreground mt-1">TP20 internal link authority optimization — position 8–20 targets</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">{report.tp20.length}</div>
              <div className="text-xs text-muted-foreground mt-1">TP20 Targets</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-600">+{report.linksAdded}</div>
              <div className="text-xs text-muted-foreground mt-1">Links Added</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-red-600">-{report.linksRemoved}</div>
              <div className="text-xs text-muted-foreground mt-1">Links Removed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">{report.crawlDepthImprovements.avgAfter}</div>
              <div className="text-xs text-muted-foreground mt-1">Avg Depth (was {report.crawlDepthImprovements.avgBefore})</div>
            </CardContent>
          </Card>
        </div>

        {/* Anchor Distribution */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4" /> Anchor Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <AnchorBadge type="exact" />
                <span className="text-sm font-medium">{report.anchorDistribution.exact}%</span>
                <span className="text-xs text-muted-foreground">(target ≤30%)</span>
              </div>
              <div className="flex items-center gap-2">
                <AnchorBadge type="partial" />
                <span className="text-sm font-medium">{report.anchorDistribution.partial}%</span>
                <span className="text-xs text-muted-foreground">(target ~40%)</span>
              </div>
              <div className="flex items-center gap-2">
                <AnchorBadge type="natural" />
                <span className="text-sm font-medium">{report.anchorDistribution.natural}%</span>
                <span className="text-xs text-muted-foreground">(target ~30%)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TP20 Products */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> TP20 Product Injections</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {report.tp20.map(p => (
              <details key={p.slug} className="border rounded-lg p-3">
                <summary className="cursor-pointer flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">Pos {p.estimatedPosition}</Badge>
                    <span className="font-medium text-sm">{p.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{p.injections.length} links</span>
                </summary>
                <div className="mt-3 space-y-2 pl-4 border-l-2 border-primary/20">
                  {p.injections.map((inj, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
                      <div>
                        <span className="text-muted-foreground">{inj.sourceLabel}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium">"{inj.anchorText}"</span>
                        <AnchorBadge type={inj.anchorType} />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </CardContent>
        </Card>

        {/* Authority Loops */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><RotateCw className="w-4 h-4" /> Authority Loops</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {report.authorityLoops.map(loop => (
              <div key={loop.category} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">{loop.category}</h3>
                  <Badge variant="secondary" className="text-xs">{loop.pillarWordTarget} words</Badge>
                </div>
                <div className="text-xs text-muted-foreground mb-2">Pillar: {loop.pillarSlug}</div>
                <div className="space-y-1">
                  {loop.loopLinks.map((ll, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground truncate max-w-[200px]">{ll.from}</span>
                      <ArrowRight className="w-3 h-3 text-primary flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{ll.to}</span>
                      <span className="text-primary/60 ml-1">"{ll.anchor}"</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Products in loop: {loop.productSlugs.length}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Link Removals */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Crawl Sculpting — Links Removed</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {report.removals.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  <Badge variant="destructive" className="text-[10px] px-1.5">removed</Badge>
                  <code className="text-muted-foreground">{r.targetUrl}</code>
                  <span className="text-muted-foreground/60 ml-auto">{r.reason}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Orphan Resolution */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Orphan Pages</div>
                <div className="text-xs text-muted-foreground">Before → After redistribution</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-red-500">{report.orphansBefore}</span>
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-lg font-bold text-green-600">{report.orphansAfter}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
