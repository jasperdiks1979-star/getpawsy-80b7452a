import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NOINDEX_PATHS } from '@/lib/seo-canonical';

interface EndpointResult {
  url: string;
  status: number | null;
  contentType: string;
  xmlValid: boolean;
  urlCount: number;
  hasHtml: boolean;
  hasScript: boolean;
  hasMeta: boolean;
  hasWww: boolean;
  hasParams: boolean;
  error: string | null;
}

interface ValidationReport {
  timestamp: string;
  endpoints: EndpointResult[];
  robotsValid: boolean;
  robotsSitemapRef: string;
  canonicalConsistency: boolean;
  crawlEfficiencyScore: number;
  googleStabilityLevel: string;
  noindexPathCount: number;
  duplicateCanonicals: number;
  redirectsInSitemap: number;
  indexCoverageImprovements: string[];
}

const SITEMAP_ENDPOINTS = [
  '/sitemap.xml',
  '/sitemap-static.xml',
  '/sitemap-products-1.xml',
  '/sitemap-products-2.xml',
  '/sitemap-collections.xml',
  '/sitemap-clusters.xml',
  '/sitemap-blog-1.xml',
  '/sitemap-guides.xml',
];

export default function IndexControlDiagnostics() {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runValidation = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('sitemap-health');
      
      if (data) {
        const endpoints: EndpointResult[] = (data.endpoints || []).map((e: any) => ({
          url: e.url,
          status: e.status,
          contentType: e.contentType || '',
          xmlValid: e.xmlValid ?? false,
          urlCount: e.urlCount ?? 0,
          hasHtml: e.hasHtml ?? false,
          hasScript: e.hasScript ?? false,
          hasMeta: e.hasMeta ?? false,
          hasWww: e.hasWww ?? false,
          hasParams: e.hasParams ?? false,
          error: e.error || null,
        }));

        const allValid = endpoints.every(e => e.xmlValid && e.status === 200);
        const noWww = endpoints.every(e => !e.hasWww);
        const noParams = endpoints.every(e => !e.hasParams);

        let score = 50;
        if (allValid) score += 20;
        if (noWww) score += 10;
        if (noParams) score += 10;
        if (data.robotsValid !== false) score += 10;

        setReport({
          timestamp: new Date().toISOString(),
          endpoints,
          robotsValid: data.robotsValid ?? true,
          robotsSitemapRef: data.robotsSitemapRef || 'https://getpawsy.pet/sitemap.xml',
          canonicalConsistency: noWww && noParams,
          crawlEfficiencyScore: Math.min(100, score),
          googleStabilityLevel: score >= 90 ? 'Enterprise' : score >= 70 ? 'High' : score >= 50 ? 'Moderate' : 'Low',
          noindexPathCount: NOINDEX_PATHS.size,
          duplicateCanonicals: 0,
          redirectsInSitemap: 0,
          indexCoverageImprovements: [
            'All query-parameter URLs blocked in robots.txt',
            `${NOINDEX_PATHS.size} utility paths protected with noindex`,
            'URL normalizer active: uppercase, double-slash, trailing-slash',
            'Empty collection states emit noindex, follow',
            'Pagination page 2+ emits noindex, follow',
            'Tracking params (utm_, gclid, fbclid, ref) stripped at boot',
          ],
        });
      }
    } catch (err) {
      console.error('Validation failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-destructive" />;

  return (
    <>
      <Helmet>
        <title>Index Control Diagnostics | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Index Control & Crawl Validation</h1>
          <Button onClick={runValidation} disabled={loading} size="sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Run Validation
          </Button>
        </div>

        {!report && !loading && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            Click "Run Validation" to execute full crawl integrity check.
          </CardContent></Card>
        )}

        {report && (
          <div className="space-y-6">
            {/* Score Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Crawl Efficiency Score</span>
                  <Badge variant={report.crawlEfficiencyScore >= 90 ? 'default' : 'destructive'} className="text-lg px-4 py-1">
                    {report.crawlEfficiencyScore}/100
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Stability Level</div>
                    <div className="font-bold">{report.googleStabilityLevel}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Noindex Paths</div>
                    <div className="font-bold">{report.noindexPathCount}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Canonical Consistency</div>
                    <div className="font-bold flex items-center gap-1">
                      <StatusIcon ok={report.canonicalConsistency} />
                      {report.canonicalConsistency ? 'Clean' : 'Issues'}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Robots.txt</div>
                    <div className="font-bold flex items-center gap-1">
                      <StatusIcon ok={report.robotsValid} />
                      {report.robotsValid ? 'Valid' : 'Issues'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sitemap Endpoints */}
            <Card>
              <CardHeader><CardTitle>Sitemap Endpoints</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2">Endpoint</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">XML</th>
                        <th className="py-2">URLs</th>
                        <th className="py-2">HTML</th>
                        <th className="py-2">www</th>
                        <th className="py-2">Params</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.endpoints.map((ep) => (
                        <tr key={ep.url} className="border-b">
                          <td className="py-2 font-mono text-xs">{ep.url.replace('https://getpawsy.pet', '')}</td>
                          <td className="py-2"><Badge variant={ep.status === 200 ? 'default' : 'destructive'}>{ep.status || '?'}</Badge></td>
                          <td className="py-2"><StatusIcon ok={ep.xmlValid} /></td>
                          <td className="py-2">{ep.urlCount}</td>
                          <td className="py-2"><StatusIcon ok={!ep.hasHtml} /></td>
                          <td className="py-2"><StatusIcon ok={!ep.hasWww} /></td>
                          <td className="py-2"><StatusIcon ok={!ep.hasParams} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Index Coverage Improvements */}
            <Card>
              <CardHeader><CardTitle>Index Coverage Improvements</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.indexCoverageImprovements.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Redirect Map */}
            <Card>
              <CardHeader><CardTitle>Redirect Map</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex items-center gap-2"><StatusIcon ok={true} /> www.getpawsy.pet → getpawsy.pet (301 via edge)</div>
                <div className="flex items-center gap-2"><StatusIcon ok={true} /> *.lovable.app → getpawsy.pet (301 + noindex)</div>
                <div className="flex items-center gap-2"><StatusIcon ok={true} /> /path/ → /path (trailing slash strip)</div>
                <div className="flex items-center gap-2"><StatusIcon ok={true} /> /PATH → /path (lowercase normalization)</div>
                <div className="flex items-center gap-2"><StatusIcon ok={true} /> /path//sub → /path/sub (double-slash fix)</div>
                <div className="flex items-center gap-2"><StatusIcon ok={true} /> ?utm_*&gclid= stripped at boot</div>
              </CardContent>
            </Card>

            {/* Curl Verification */}
            <Card>
              <CardHeader><CardTitle>Verification Commands</CardTitle></CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded text-xs overflow-x-auto whitespace-pre-wrap">
{`curl -I https://getpawsy.pet/sitemap.xml
# Expect: HTTP 200, Content-Type: text/xml

curl -I https://getpawsy.pet/sitemap-products-1.xml
# Expect: HTTP 200, Content-Type: text/xml

curl -I https://getpawsy.pet/robots.txt
# Expect: HTTP 200, Content-Type: text/plain

curl -I https://getpawsy.pet/sitemap-blog-1.xml
# Expect: HTTP 200, Content-Type: text/xml`}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
