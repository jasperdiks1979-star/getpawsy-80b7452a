import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { runCrawl, type CrawlResult, type CrawlProgress } from "@/lib/admin/url-crawler";
import { Download, Play, Search } from "lucide-react";

export function UrlCrawler() {
  const [results, setResults] = useState<CrawlResult[]>([]);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("");

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults([]);
    try {
      const r = await runCrawl(setProgress);
      setResults(r);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, []);

  const filtered = filter
    ? results.filter(r =>
        r.url.toLowerCase().includes(filter.toLowerCase()) ||
        (r.issue || '').toLowerCase().includes(filter.toLowerCase())
      )
    : results;

  const issues = results.filter(r => r.severity !== 'ok');

  const exportData = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
      downloadBlob(blob, 'indexing-diagnostics.json');
    } else {
      const header = 'URL,Status,Final URL,Issue,Severity,Canonical,Content-Type\n';
      const rows = filtered.map(r =>
        [r.url, r.status, r.finalUrl, r.issue || '', r.severity, r.canonical || '', r.contentType || '']
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      downloadBlob(blob, 'indexing-diagnostics.csv');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Sitemap URL Crawler</span>
          <div className="flex gap-2">
            <Button onClick={handleRun} disabled={running} size="sm">
              <Play className="w-4 h-4 mr-1" />
              {running ? 'Crawling...' : 'Run Crawl'}
            </Button>
            {results.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => exportData('csv')}>
                  <Download className="w-4 h-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportData('json')}>
                  <Download className="w-4 h-4 mr-1" /> JSON
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress && (
          <div className="space-y-2">
            <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} />
            <p className="text-xs text-muted-foreground">
              {progress.done}/{progress.total} — {progress.current}
            </p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by URL or issue..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <div className="flex gap-2 text-sm">
                <Badge variant="destructive">{issues.filter(i => i.severity === 'critical').length} critical</Badge>
                <Badge variant="secondary">{issues.filter(i => i.severity === 'warning').length} warnings</Badge>
                <Badge>{results.filter(r => r.severity === 'ok').length} OK</Badge>
              </div>
            </div>

            <div className="overflow-auto max-h-[600px] border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">URL</th>
                    <th className="text-left p-2 w-16">Status</th>
                    <th className="text-left p-2">Issue</th>
                    <th className="text-left p-2 w-20">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i} className={r.severity === 'critical' ? 'bg-destructive/10' : r.severity === 'warning' ? 'bg-yellow-500/10' : ''}>
                      <td className="p-2 font-mono text-xs max-w-[400px] truncate" title={r.url}>{r.url}</td>
                      <td className="p-2">{r.status ?? '—'}</td>
                      <td className="p-2 text-xs">{r.issue || '✓'}</td>
                      <td className="p-2">
                        <SeverityBadge severity={r.severity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case 'critical': return <Badge variant="destructive">Critical</Badge>;
    case 'warning': return <Badge variant="secondary">Warning</Badge>;
    case 'info': return <Badge variant="outline">Info</Badge>;
    default: return <Badge>OK</Badge>;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
