import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ExternalLink } from "lucide-react";

interface UrlCheckResult {
  url: string;
  status: number | null;
  redirectTo: string | null;
  source: string;
  action: string;
  actionTarget: string | null;
}

const ROUTES_TO_CHECK = [
  // Common GSC 4xx patterns
  { url: "/products", source: "sitemap" },
  { url: "/product/test-product", source: "crawl" },
  { url: "/collections", source: "internal-link" },
  { url: "/collections/dogs", source: "internal-link" },
  { url: "/collections/cats", source: "internal-link" },
  { url: "/blog", source: "sitemap" },
  { url: "/guides", source: "sitemap" },
  { url: "/bestseller/test", source: "crawl" },
  { url: "/c/dog-toys", source: "internal-link" },
  { url: "/c/cat-trees", source: "internal-link" },
  { url: "/sitemap.xml", source: "sitemap" },
  { url: "/sitemap-static.xml", source: "sitemap" },
  { url: "/robots.txt", source: "crawl" },
  { url: "/merchant-feed.xml", source: "feed" },
  // Legacy Shopify patterns (common GSC 4xx source)
  { url: "/shop", source: "external-link" },
  { url: "/shop/all", source: "external-link" },
  { url: "/pages/contact", source: "external-link" },
  { url: "/pages/about", source: "external-link" },
  // Trailing slash variants
  { url: "/products/", source: "crawl" },
  { url: "/blog/", source: "crawl" },
  // Double path conflicts
  { url: "/products/some-product", source: "crawl" },
  { url: "/category/dogs", source: "external-link" },
  { url: "/category/cats", source: "external-link" },
];

export default function Gsc4xxTriagePage() {
  const [results, setResults] = useState<UrlCheckResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const runCrawl = useCallback(async () => {
    setLoading(true);
    const checks: UrlCheckResult[] = [];

    for (const route of ROUTES_TO_CHECK) {
      try {
        const res = await fetch(route.url, {
          method: "HEAD",
          redirect: "manual",
          cache: "no-store",
        });

        const location = res.headers.get("location");
        const status = res.status;

        let action = "OK";
        let actionTarget: string | null = null;

        if (status === 404) {
          action = "needs-redirect-or-fix";
        } else if (status >= 300 && status < 400) {
          action = status === 301 ? "301-ok" : `${status}-review`;
          actionTarget = location;
        } else if (status === 200) {
          action = "OK";
        } else {
          action = `unexpected-${status}`;
        }

        checks.push({
          url: route.url,
          status,
          redirectTo: location,
          source: route.source,
          action,
          actionTarget,
        });
      } catch {
        checks.push({
          url: route.url,
          status: null,
          redirectTo: null,
          source: route.source,
          action: "fetch-error",
          actionTarget: null,
        });
      }
    }

    setResults(checks);
    setCheckedAt(new Date().toISOString());
    setLoading(false);
  }, []);

  const count200 = results.filter((r) => r.status === 200).length;
  const count3xx = results.filter((r) => r.status && r.status >= 300 && r.status < 400).length;
  const count4xx = results.filter((r) => r.status && r.status >= 400 && r.status < 500).length;
  const countErr = results.filter((r) => r.status === null || (r.status && r.status >= 500)).length;

  return (
    <Layout>
      <Helmet>
        <title>GSC 4xx Triage | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">GSC 4xx URL Triage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Simulates crawl of common routes to detect 404s, soft 404s, redirect issues,
            and legacy Shopify URL conflicts. Client-side HEAD requests to SPA routes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Route Crawl Simulation ({ROUTES_TO_CHECK.length} URLs)</span>
              <Button size="sm" onClick={runCrawl} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Run Crawl
              </Button>
            </CardTitle>
            {checkedAt && (
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(checkedAt).toLocaleString()}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {results.length > 0 && (
              <>
                {/* Summary badges */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  <Badge variant="default" className="font-mono">200: {count200}</Badge>
                  <Badge variant="outline" className="font-mono">3xx: {count3xx}</Badge>
                  <Badge variant={count4xx > 0 ? "destructive" : "outline"} className="font-mono">4xx: {count4xx}</Badge>
                  <Badge variant={countErr > 0 ? "destructive" : "outline"} className="font-mono">Err: {countErr}</Badge>
                </div>

                {/* Results table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Status</th>
                        <th className="p-2">URL</th>
                        <th className="p-2">Source</th>
                        <th className="p-2">Redirect</th>
                        <th className="p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2">
                            <Badge
                              variant={
                                r.status === 200
                                  ? "default"
                                  : r.status === 301
                                  ? "outline"
                                  : "destructive"
                              }
                              className="font-mono text-[10px]"
                            >
                              {r.status ?? "ERR"}
                            </Badge>
                          </td>
                          <td className="p-2 font-mono">{r.url}</td>
                          <td className="p-2 text-muted-foreground">{r.source}</td>
                          <td className="p-2 font-mono text-muted-foreground max-w-[200px] truncate">
                            {r.redirectTo || "—"}
                          </td>
                          <td className="p-2">
                            {r.action === "OK" ? (
                              <span className="flex items-center gap-1 text-primary">
                                <CheckCircle2 className="w-3 h-3" /> OK
                              </span>
                            ) : r.action === "301-ok" ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3" /> 301 OK
                              </span>
                            ) : r.action.includes("needs") ? (
                              <span className="flex items-center gap-1 text-destructive">
                                <XCircle className="w-3 h-3" /> Fix needed
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-destructive/70">
                                <AlertTriangle className="w-3 h-3" /> {r.action}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {results.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Klik "Run Crawl" om een gesimuleerde crawl uit te voeren over {ROUTES_TO_CHECK.length} URL-patronen.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Explanation card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hoe GSC 4xx URLs ontstaan</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>
              <strong>1. Legacy Shopify URLs:</strong> /shop/*, /pages/*, /collections/* zijn nog
              geïndexeerd of gelinkt door externe sites. Fix: 301 redirect naar relevante
              SPA-route.
            </p>
            <p>
              <strong>2. /products/* vs /product/*:</strong> Sommige interne links gebruiken
              /products/slug i.p.v. /product/slug. Fix: normaliseer naar /product/slug.
            </p>
            <p>
              <strong>3. Trailing slash:</strong> SPA behandelt /blog en /blog/ anders.
              Fix: nginx trailing-slash strip of React Router redirect.
            </p>
            <p>
              <strong>4. Soft 404:</strong> Routes die een 200 retourneren maar de "not found" 
              component tonen. Fix: return echte 404 status of redirect naar parent.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
