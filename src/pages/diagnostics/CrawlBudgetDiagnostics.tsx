import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import {
  SITEMAP_PRIORITY_TIERS,
  DEPTH_MAP,
  AUTHORITY_FLOW,
  BLOCKED_PARAMS,
  analyzeCrawlWaste,
  calculateCrawlBudgetScore,
  INDEX_ACCELERATION_TRIGGERS,
} from '@/lib/crawl-budget';
import { NOINDEX_PATHS } from '@/lib/seo-canonical';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Shield,
  Zap,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Layers,
  Target,
  TrendingUp,
} from 'lucide-react';

const ratingColor: Record<string, string> = {
  Enterprise: 'bg-primary text-primary-foreground',
  Optimized: 'bg-secondary text-secondary-foreground',
  Moderate: 'bg-accent text-accent-foreground',
  Low: 'bg-destructive text-destructive-foreground',
};

const directionIcon = {
  downward: <ArrowDown className="h-3.5 w-3.5 text-primary" />,
  upward:   <ArrowUp   className="h-3.5 w-3.5 text-accent-foreground" />,
  lateral:  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />,
};

export default function CrawlBudgetDiagnostics() {
  const budget = calculateCrawlBudgetScore();
  const waste  = analyzeCrawlWaste();

  return (
    <Layout>
      <Helmet>
        <title>Crawl Budget Diagnostics | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container mx-auto max-w-6xl px-4 py-10 space-y-8">
        {/* ── Header & Score ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Crawl Budget Maximization</h1>
            <p className="text-muted-foreground text-sm mt-1">Enterprise crawl efficiency monitoring for getpawsy.pet</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-extrabold">{budget.score}</span>
            <div>
              <Badge className={ratingColor[budget.rating]}>{budget.rating}</Badge>
              <p className="text-xs text-muted-foreground mt-0.5">/ 100</p>
            </div>
          </div>
        </div>

        {/* ── Factor Breakdown ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Budget Score Factors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {budget.factors.map((f) => (
                <div key={f.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2">
                    {f.status === 'pass' ? <CheckCircle className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                    <span className="text-sm">{f.name}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold">{f.score}/{f.max}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Crawl Waste Summary ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Crawl Waste Elimination</CardTitle>
            <CardDescription>Waste score: {waste.wasteScore}% (lower = better)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <Stat label="Params blocked" value={waste.queryParamsBlocked} />
              <Stat label="noindex pages" value={waste.noindexPagesCount} />
              <Stat label="robots.txt rules" value={waste.robotsRulesCount} />
              <Stat label="Soft-404 risk" value={waste.softFourOhFourRisk} />
            </div>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">Sitemap exclusions enforced:</p>
              <ul className="space-y-1">
                {waste.sitemapExclusions.map((e) => (
                  <li key={e} className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />{e}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Blocked query parameters ({BLOCKED_PARAMS.length}):</p>
              <div className="flex flex-wrap gap-1.5">
                {BLOCKED_PARAMS.map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs font-mono">?{p}=</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Depth Map ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />Crawl Depth Map</CardTitle>
            <CardDescription>No important page deeper than 4 clicks from homepage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2">Depth</th><th className="pb-2">Tier</th><th className="pb-2">Path</th><th className="pb-2">Label</th><th className="pb-2 text-right">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPTH_MAP.map((d) => (
                    <tr key={d.path} className="border-b last:border-0">
                      <td className="py-1.5">
                        <Badge variant={d.depth <= 2 ? 'default' : 'secondary'} className="font-mono text-xs">{d.depth}</Badge>
                      </td>
                      <td className="py-1.5 font-mono text-xs">T{d.tier}</td>
                      <td className="py-1.5 font-mono text-xs text-muted-foreground">{d.path}</td>
                      <td className="py-1.5">{d.label}</td>
                      <td className="py-1.5 text-right font-mono">{d.priority.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Authority Flow ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Target className="h-5 w-5 text-primary" />Authority Flow Architecture</CardTitle>
            <CardDescription>Top-down link equity distribution model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {AUTHORITY_FLOW.map((edge, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span className="text-sm font-medium w-36 shrink-0">{edge.from}</span>
                  {directionIcon[edge.direction]}
                  <span className="text-sm font-medium w-36 shrink-0">{edge.to}</span>
                  <Badge variant="outline" className="ml-auto font-mono text-xs">
                    w={edge.weight.toFixed(1)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Sitemap Priority Tiers ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Sitemap Priority Signaling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(SITEMAP_PRIORITY_TIERS).map(([key, v]) => (
                <div key={key} className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-2xl font-bold mt-1">{v.priority.toFixed(2)}</p>
                  <Badge variant="secondary" className="text-xs mt-1">{v.changefreq}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Index Acceleration Triggers ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Index Acceleration Triggers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {INDEX_ACCELERATION_TRIGGERS.map((t, i) => (
              <div key={i} className="rounded-lg border p-3">
                <p className="font-medium text-sm mb-2">🔔 {t.trigger}</p>
                <ul className="space-y-1">
                  {t.actions.map((a, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 shrink-0" />{a}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── noindex Coverage ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">noindex Coverage ({NOINDEX_PATHS.size} paths)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {[...NOINDEX_PATHS].sort().map((p) => (
                <Badge key={p} variant="outline" className="text-xs font-mono">{p}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── curl verification ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">curl Verification Commands</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto whitespace-pre">{`curl -I https://getpawsy.pet/sitemap-index.xml
# Expect: HTTP/2 200, content-type: text/xml

curl -I https://getpawsy.pet/robots.txt
# Expect: HTTP/2 200, content-type: text/plain

curl -I https://getpawsy.pet/sitemap-static.xml
curl -I https://getpawsy.pet/sitemap-blog-1.xml
curl -I https://getpawsy.pet/sitemap-products-1.xml
curl -I https://getpawsy.pet/sitemap-collections.xml
curl -I https://getpawsy.pet/sitemap-clusters.xml
curl -I https://getpawsy.pet/sitemap-guides.xml`}</pre>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
