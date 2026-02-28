import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface HeaderResult {
  url: string;
  category: string;
  status: number | null;
  cacheControl: string | null;
  contentType: string | null;
  xRobotsTag: string | null;
  etag: string | null;
  lastModified: string | null;
  ok: boolean;
  cachePass: boolean;
  cacheExpected: string;
}

const EXPECTED: Record<string, string> = {
  html: "public, max-age=0, must-revalidate",
  xml: "public, max-age=300+, s-maxage=3600+",
  txt: "public, max-age=300+",
  asset: "public, max-age=31536000, immutable",
};

function classifyCachePass(category: string, cc: string | null): boolean {
  if (!cc) return false;
  const lower = cc.toLowerCase();
  switch (category) {
    case "html":
      return lower.includes("must-revalidate") || lower.includes("no-cache");
    case "xml":
    case "txt":
      return lower.includes("public") && !lower.includes("immutable");
    case "asset":
      return lower.includes("immutable") || lower.includes("max-age=31536000");
    default:
      return true;
  }
}

export function EdgeHeadersReport() {
  const [results, setResults] = useState<HeaderResult[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const base = window.location.origin;

    const paths: { path: string; category: string }[] = [
      { path: "/", category: "html" },
      { path: "/products", category: "html" },
      { path: "/sitemap.xml", category: "xml" },
      { path: "/sitemap-static.xml", category: "xml" },
      { path: "/merchant-feed.xml", category: "xml" },
      { path: "/robots.txt", category: "txt" },
    ];

    // Auto-discover asset files
    try {
      const html = await (await fetch("/", { cache: "no-store" })).text();
      const jsMatch = html.match(/\/assets\/[^"']+\.js/);
      if (jsMatch) paths.push({ path: jsMatch[0], category: "asset" });
      const cssMatch = html.match(/\/assets\/[^"']+\.css/);
      if (cssMatch) paths.push({ path: cssMatch[0], category: "asset" });
    } catch {
      /* ignore */
    }

    const probes = await Promise.all(
      paths.map(async ({ path, category }) => {
        try {
          const res = await fetch(`${base}${path}`, { method: "HEAD", cache: "no-store" });
          const cc = res.headers.get("cache-control");
          return {
            url: path,
            category,
            status: res.status,
            cacheControl: cc,
            contentType: res.headers.get("content-type"),
            xRobotsTag: res.headers.get("x-robots-tag"),
            etag: res.headers.get("etag"),
            lastModified: res.headers.get("last-modified"),
            ok: res.ok,
            cachePass: classifyCachePass(category, cc),
            cacheExpected: EXPECTED[category] || "—",
          };
        } catch {
          return {
            url: path,
            category,
            status: null,
            cacheControl: null,
            contentType: null,
            xRobotsTag: null,
            etag: null,
            lastModified: null,
            ok: false,
            cachePass: false,
            cacheExpected: EXPECTED[category] || "—",
          };
        }
      })
    );

    setResults(probes);
    setLoading(false);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Deterministic Cache Headers Report</span>
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Check
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {results.length > 0 && (
          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Path</th>
                  <th className="text-left p-2 w-12">Type</th>
                  <th className="text-left p-2 w-16">Status</th>
                  <th className="text-left p-2">Cache-Control</th>
                  <th className="text-left p-2">Expected</th>
                  <th className="text-left p-2 w-12">Pass</th>
                  <th className="text-left p-2">ETag</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={r.cachePass ? "" : "bg-destructive/5"}>
                    <td className="p-2 font-mono text-xs">{r.url}</td>
                    <td className="p-2 text-xs">{r.category}</td>
                    <td className="p-2">
                      <Badge variant={r.ok ? "default" : "destructive"}>{r.status ?? "—"}</Badge>
                    </td>
                    <td className="p-2 text-xs font-mono">
                      {r.cacheControl || <span className="text-destructive font-bold">MISSING</span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{r.cacheExpected}</td>
                    <td className="p-2">
                      {r.cachePass ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </td>
                    <td className="p-2 text-xs font-mono truncate max-w-[120px]">{r.etag || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
