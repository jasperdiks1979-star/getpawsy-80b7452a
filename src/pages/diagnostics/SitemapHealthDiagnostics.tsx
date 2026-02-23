import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import Shield from "lucide-react/dist/esm/icons/shield";

interface SitemapResult {
  name: string;
  url: string;
  status: number | null;
  contentType: string | null;
  isXml: boolean;
  hasHtml: boolean;
  hasScriptTags: boolean;
  xmlDeclaration: boolean;
  correctRoot: boolean;
  urlCount: number;
  hasLastmod: boolean;
  hasWwwUrls: boolean;
  hasParameterUrls: boolean;
  hasDuplicateUrls: boolean;
  sampleUrls: string[];
  responseSize: number;
  error: string | null;
  valid: boolean;
}

interface RobotsResult {
  status: number | null;
  contentType: string | null;
  hasSitemapRef: boolean;
  sitemapUrl: string | null;
  hasWwwRef: boolean;
  hasLovableRef: boolean;
  valid: boolean;
}

interface HealthReport {
  timestamp: string;
  crawl_integrity_score: number;
  stability_level: string;
  summary: {
    total_endpoints: number;
    valid_endpoints: number;
    total_urls_across_sitemaps: number;
    issues: string[];
  };
  robots_txt: RobotsResult;
  sitemaps: SitemapResult[];
  curl_verification: string[];
}

export default function SitemapHealthDiagnostics() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("sitemap-health");
      if (fnErr) throw fnErr;
      setReport(data as HealthReport);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) =>
    score >= 90 ? "text-green-600" : score >= 70 ? "text-yellow-600" : "text-red-600";

  const levelBadge = (level: string) => {
    const v = level === "Enterprise" ? "default" : level === "High" ? "secondary" : "destructive";
    return <Badge variant={v}>{level}</Badge>;
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Sitemap Health | Diagnostics</title>
      </Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sitemap Integrity & Crawl Validation</h1>
          <p className="text-sm text-muted-foreground">Enterprise-grade sitemap health monitoring</p>
        </div>
        <Button onClick={runScan} disabled={loading}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</> : "Run Full Scan"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {report && (
        <>
          {/* Score card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className={`text-4xl font-bold ${scoreColor(report.crawl_integrity_score)}`}>
                  {report.crawl_integrity_score}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Crawl Integrity Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                {levelBadge(report.stability_level)}
                <p className="text-xs text-muted-foreground mt-2">Google Stability Level</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold">
                  {report.summary.valid_endpoints}/{report.summary.total_endpoints}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Valid Endpoints</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold">{report.summary.total_urls_across_sitemaps}</div>
                <p className="text-xs text-muted-foreground mt-1">Total URLs</p>
              </CardContent>
            </Card>
          </div>

          {/* Issues */}
          {report.summary.issues.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Issues Found
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                {report.summary.issues.map((issue, i) => (
                  <div key={i} className="text-destructive">{issue}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Sitemap table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sitemap Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-2">File</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Content-Type</th>
                      <th className="py-2 pr-2">XML Valid</th>
                      <th className="py-2 pr-2">URLs</th>
                      <th className="py-2 pr-2">Lastmod</th>
                      <th className="py-2 pr-2">Size</th>
                      <th className="py-2">Checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sitemaps.map((s) => (
                      <tr key={s.name} className="border-b">
                        <td className="py-2 pr-2 font-mono">{s.name}</td>
                        <td className="py-2 pr-2">
                          <Badge variant={s.status === 200 ? "default" : "destructive"}>
                            {s.status ?? "ERR"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 font-mono truncate max-w-[140px]">{s.contentType}</td>
                        <td className="py-2 pr-2">
                          {s.valid ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </td>
                        <td className="py-2 pr-2">{s.urlCount}</td>
                        <td className="py-2 pr-2">{s.hasLastmod ? "✓" : "—"}</td>
                        <td className="py-2 pr-2">{(s.responseSize / 1024).toFixed(1)}KB</td>
                        <td className="py-2 space-x-1">
                          {s.hasHtml && <Badge variant="destructive" className="text-[9px]">HTML</Badge>}
                          {s.hasScriptTags && <Badge variant="destructive" className="text-[9px]">SCRIPT</Badge>}
                          {s.hasWwwUrls && <Badge variant="destructive" className="text-[9px]">WWW</Badge>}
                          {s.hasParameterUrls && <Badge variant="destructive" className="text-[9px]">PARAMS</Badge>}
                          {s.hasDuplicateUrls && <Badge variant="destructive" className="text-[9px]">DUPES</Badge>}
                          {s.valid && !s.hasHtml && !s.hasScriptTags && (
                            <Badge variant="outline" className="text-[9px] text-green-600">CLEAN</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Robots.txt */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4" /> robots.txt Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex items-center gap-2">
                Status: <Badge variant={report.robots_txt.status === 200 ? "default" : "destructive"}>
                  {report.robots_txt.status ?? "ERR"}
                </Badge>
              </div>
              <div>Content-Type: <span className="font-mono">{report.robots_txt.contentType}</span></div>
              <div>Sitemap ref: <span className="font-mono">{report.robots_txt.sitemapUrl ?? "MISSING"}</span>
                {report.robots_txt.hasSitemapRef ? (
                  <CheckCircle className="inline h-3 w-3 ml-1 text-green-600" />
                ) : (
                  <XCircle className="inline h-3 w-3 ml-1 text-destructive" />
                )}
              </div>
              {report.robots_txt.hasWwwRef && <div className="text-destructive">⚠ Contains www reference</div>}
              {report.robots_txt.hasLovableRef && <div className="text-destructive">⚠ Contains lovable.app reference</div>}
            </CardContent>
          </Card>

          {/* Curl commands */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Verification Commands</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded font-mono space-y-1 overflow-x-auto">
                {report.curl_verification.join("\n")}
              </pre>
            </CardContent>
          </Card>

          <p className="text-[10px] text-muted-foreground text-right">
            Scanned at {report.timestamp}
          </p>
        </>
      )}
    </div>
  );
}
