import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface UrlResult {
  url: string;
  status: 'pass' | 'fail' | 'warn';
  rendered: boolean;
  productCount?: number;
  note?: string;
}

interface VerificationResult {
  environment: string;
  buildVersion: string;
  timestamp: string;
  passFail: 'PASS' | 'FAIL';
  failedChecks: string[];
  urlResults: UrlResult[];
}

const TEST_URLS = [
  '/',
  '/guides',
  '/guides/best-cat-litter-box-2026',
  '/guides/best-dog-bed-2026',
  '/guides/best-cat-litter-box-furniture-enclosures-2026',
  '/collections/indestructible-dog-chew-toys',
  '/collections/dog-beds',
  '/collections/automatic-cat-feeders',
  '/collections/dog-car-travel-safety-seats',
  '/collections/pet-grooming-vacuum-kits',
  '/products',
  '/blog',
];

const GrowthVerification = () => {
  const [results, setResults] = useState<VerificationResult | null>(null);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    const urlResults: UrlResult[] = [];
    const failedChecks: string[] = [];

    for (const url of TEST_URLS) {
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const html = await res.text();
        const is404 = html.includes('Page Not Found') || html.includes('NotFound') || html.includes('404');
        const hasContent = html.includes('<main') || html.includes('data-testid') || res.ok;

        if (!res.ok || is404) {
          urlResults.push({ url, status: 'fail', rendered: false, note: `HTTP ${res.status}${is404 ? ' (404 page)' : ''}` });
          failedChecks.push(url);
        } else {
          urlResults.push({ url, status: 'pass', rendered: !is404 && hasContent });
        }
      } catch (e) {
        urlResults.push({ url, status: 'fail', rendered: false, note: String(e) });
        failedChecks.push(url);
      }
    }

    // Check robots.txt
    try {
      const robotsRes = await fetch('/robots.txt');
      const robotsText = await robotsRes.text();
      if (!robotsText.includes('sitemap') && !robotsText.includes('Sitemap')) {
        failedChecks.push('robots.txt missing sitemap reference');
      }
    } catch {
      failedChecks.push('robots.txt unreachable');
    }

    setResults({
      environment: window.location.hostname.includes('preview') ? 'preview' : 'production',
      buildVersion: document.querySelector('meta[name="build-id"]')?.getAttribute('content') || 'unknown',
      timestamp: new Date().toISOString(),
      passFail: failedChecks.length === 0 ? 'PASS' : 'FAIL',
      failedChecks,
      urlResults,
    });
    setRunning(false);
  };

  return (
    <Layout>
      <div className="container py-12 max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">Growth Verification Dashboard</h1>
        <p className="text-muted-foreground mb-6">Internal QA page — checks route rendering, sitemap, and robots.txt.</p>

        <Button onClick={runChecks} disabled={running} className="mb-8">
          {running ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Running checks...</> : 'Run All Checks'}
        </Button>

        {results && (
          <div className="space-y-6">
            <div className={`p-4 rounded-lg border ${results.passFail === 'PASS' ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {results.passFail === 'PASS' ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                Overall: {results.passFail}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {results.environment} · {results.timestamp}
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2">URL</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {results.urlResults.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{r.url}</td>
                      <td className="px-4 py-2">
                        {r.status === 'pass' && <CheckCircle className="w-4 h-4 text-green-600" />}
                        {r.status === 'fail' && <XCircle className="w-4 h-4 text-red-600" />}
                        {r.status === 'warn' && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.note || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="border rounded-lg p-4">
              <summary className="cursor-pointer font-medium">Raw JSON</summary>
              <pre className="mt-4 text-xs bg-muted/30 p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default GrowthVerification;
