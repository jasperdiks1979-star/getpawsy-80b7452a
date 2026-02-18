import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";

interface HeaderResult {
  url: string;
  status: number | null;
  cacheControl: string | null;
  contentType: string | null;
  xRobotsTag: string | null;
  ok: boolean;
}

const PROBE_PATHS = [
  '/',
  '/products',
  '/sitemap.xml',
  '/robots.txt',
];

export function HeadersReport() {
  const [results, setResults] = useState<HeaderResult[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const base = window.location.origin;

    // Also find an asset file
    const assetPaths = [...PROBE_PATHS];

    // Try to discover a JS asset from the page
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text();
      const jsMatch = html.match(/\/assets\/[^"']+\.js/);
      if (jsMatch) assetPaths.push(jsMatch[0]);
      const cssMatch = html.match(/\/assets\/[^"']+\.css/);
      if (cssMatch) assetPaths.push(cssMatch[0]);
    } catch { /* ignore */ }

    const probes = await Promise.all(
      assetPaths.map(async (path) => {
        try {
          const res = await fetch(`${base}${path}`, { method: 'HEAD', cache: 'no-store' });
          return {
            url: path,
            status: res.status,
            cacheControl: res.headers.get('cache-control'),
            contentType: res.headers.get('content-type'),
            xRobotsTag: res.headers.get('x-robots-tag'),
            ok: res.ok,
          };
        } catch {
          return { url: path, status: null, cacheControl: null, contentType: null, xRobotsTag: null, ok: false };
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
          <span>Cache Headers Report</span>
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
                  <th className="text-left p-2 w-16">Status</th>
                  <th className="text-left p-2">Cache-Control</th>
                  <th className="text-left p-2">Content-Type</th>
                  <th className="text-left p-2">X-Robots-Tag</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td className="p-2 font-mono text-xs">{r.url}</td>
                    <td className="p-2">
                      <Badge variant={r.ok ? 'default' : 'destructive'}>{r.status ?? '—'}</Badge>
                    </td>
                    <td className="p-2 text-xs font-mono">{r.cacheControl || <span className="text-destructive">NULL</span>}</td>
                    <td className="p-2 text-xs">{r.contentType || '—'}</td>
                    <td className="p-2 text-xs">{r.xRobotsTag || '—'}</td>
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
