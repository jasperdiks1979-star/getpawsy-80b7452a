import { useState, useMemo } from 'react';
import { generateAuthorityReport, type AuthorityReport } from '@/lib/seo/internalLinkAuthorityEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2, AlertTriangle, CheckCircle2, BarChart3, Globe } from 'lucide-react';

export default function InternalLinkAuthorityPage() {
  const [report, setReport] = useState<AuthorityReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runEngine = () => {
    setLoading(true);
    setTimeout(() => {
      setReport(generateAuthorityReport());
      setLoading(false);
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Internal Link Authority Engine</h1>
          <p className="text-muted-foreground">Scan and strengthen internal link structure across guides, collections, and products.</p>
        </div>
        <Button onClick={runEngine} disabled={loading}>
          <Link2 className="mr-2 h-4 w-4" />
          {loading ? 'Scanning...' : 'Run Authority Scan'}
        </Button>
      </div>

      {report && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-primary">{report.totalInternalLinks}</p>
                <p className="text-xs text-muted-foreground">Total Links</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-primary">{report.guidesLinked}</p>
                <p className="text-xs text-muted-foreground">Guides Linked</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-primary">{report.collectionsLinked}</p>
                <p className="text-xs text-muted-foreground">Collections Linked</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-primary">{report.productsLinked}</p>
                <p className="text-xs text-muted-foreground">Products Linked</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-primary">{report.avgCrawlDepth}</p>
                <p className="text-xs text-muted-foreground">Avg Crawl Depth</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-destructive">{report.orphanPages.length}</p>
                <p className="text-xs text-muted-foreground">Orphan Pages</p>
              </CardContent>
            </Card>
          </div>

          {/* Cluster Health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Cluster Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground">Cluster</th>
                      <th className="text-center py-2 px-3 text-muted-foreground">Guides</th>
                      <th className="text-center py-2 px-3 text-muted-foreground">Cornerstones</th>
                      <th className="text-center py-2 px-3 text-muted-foreground">Hubs</th>
                      <th className="text-center py-2 px-3 text-muted-foreground">Orphans</th>
                      <th className="text-center py-2 px-3 text-muted-foreground">Avg Authority</th>
                      <th className="text-center py-2 px-3 text-muted-foreground">Avg Inbound</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.clusterSummaries.map(c => (
                      <tr key={c.cluster} className="border-b border-border/50">
                        <td className="py-2 px-3 font-medium text-foreground">{c.cluster}</td>
                        <td className="py-2 px-3 text-center">{c.totalGuides}</td>
                        <td className="py-2 px-3 text-center">{c.cornerstones}</td>
                        <td className="py-2 px-3 text-center">{c.hubs}</td>
                        <td className="py-2 px-3 text-center">
                          {c.orphans > 0 ? (
                            <Badge variant="destructive">{c.orphans}</Badge>
                          ) : (
                            <Badge variant="secondary">0</Badge>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">{c.avgAuthority}</td>
                        <td className="py-2 px-3 text-center">{c.avgInbound}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Orphan Pages */}
          {report.orphanPages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Orphan Pages ({report.orphanPages.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.orphanPages.slice(0, 20).map(orphan => (
                  <div key={orphan.path} className="flex items-start justify-between border-b border-border/50 pb-3">
                    <div>
                      <p className="font-medium text-foreground text-sm">{orphan.title}</p>
                      <p className="text-xs text-muted-foreground">{orphan.path} · {orphan.inboundCount} inbound links</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {orphan.suggestedLinks.map((link, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          ← {link.from.split('/').pop()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {report.orphanPages.length > 20 && (
                  <p className="text-sm text-muted-foreground">+ {report.orphanPages.length - 20} more orphan pages</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Resolved Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Resolution Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Orphans with fixes</p>
                  <p className="text-lg font-bold text-foreground">{report.orphansResolved}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Guide↔Guide edges</p>
                  <p className="text-lg font-bold text-foreground">
                    {report.linkEdges.filter(e => e.fromType === 'guide' && e.toType === 'guide').length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Guide↔Collection edges</p>
                  <p className="text-lg font-bold text-foreground">
                    {report.linkEdges.filter(e => (e.fromType === 'guide' && e.toType === 'collection') || (e.fromType === 'collection' && e.toType === 'guide')).length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Product↔Guide edges</p>
                  <p className="text-lg font-bold text-foreground">
                    {report.linkEdges.filter(e => e.fromType === 'product' || e.toType === 'product').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
