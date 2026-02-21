import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';

interface HeaderCheck {
  url: string;
  status: number | null;
  cacheControl: string | null;
  contentType: string | null;
  age: string | null;
  vary: string | null;
  error: string | null;
}

const TEST_URLS = [
  '/',
  '/collections/cat-enrichment',
  '/sitemap-index.xml',
  '/robots.txt',
];

export default function HeadersDiagnostics() {
  const [checks, setChecks] = useState<HeaderCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const results: HeaderCheck[] = [];
      for (const path of TEST_URLS) {
        try {
          const url = window.location.origin + path;
          const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
          results.push({
            url: path,
            status: res.status,
            cacheControl: res.headers.get('cache-control'),
            contentType: res.headers.get('content-type'),
            age: res.headers.get('age'),
            vary: res.headers.get('vary'),
            error: null,
          });
        } catch (e: any) {
          results.push({
            url: path,
            status: null,
            cacheControl: null,
            contentType: null,
            age: null,
            vary: null,
            error: e.message,
          });
        }
      }
      setChecks(results);
      setLoading(false);
    };
    run();
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Headers Diagnostics | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">Response Headers Diagnostics</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Verifies Cache-Control, Content-Type, and Age headers for key routes.
        </p>
        {loading ? (
          <p className="text-muted-foreground">Checking headers…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-semibold">URL</th>
                  <th className="text-left py-2 px-3 font-semibold">Status</th>
                  <th className="text-left py-2 px-3 font-semibold">Cache-Control</th>
                  <th className="text-left py-2 px-3 font-semibold">Content-Type</th>
                  <th className="text-left py-2 px-3 font-semibold">Age</th>
                  <th className="text-left py-2 px-3 font-semibold">Vary</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-3 font-mono text-xs">{c.url}</td>
                    <td className="py-2 px-3">
                      {c.error ? (
                        <span className="text-destructive text-xs">{c.error}</span>
                      ) : (
                        <span className={c.status === 200 ? 'text-green-600' : 'text-amber-600'}>
                          {c.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs max-w-48 truncate">{c.cacheControl || '—'}</td>
                    <td className="py-2 px-3 font-mono text-xs">{c.contentType?.split(';')[0] || '—'}</td>
                    <td className="py-2 px-3 font-mono text-xs">{c.age || '—'}</td>
                    <td className="py-2 px-3 font-mono text-xs">{c.vary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
