import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';

const CANONICAL = 'https://getpawsy.pet';

interface UrlEntry {
  url: string;
  category: string;
}

export default function GscChecklist() {
  const [urls, setUrls] = useState<UrlEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const entries: UrlEntry[] = [];

        // 1. Homepage
        entries.push({ url: `${CANONICAL}`, category: 'Homepage' });

        // 2. Top SEO collections
        const { data: collections } = await supabase
          .from('seo_collections')
          .select('slug, name, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .limit(10);

        (collections || []).forEach(c => {
          entries.push({ url: `${CANONICAL}/collections/${c.slug}`, category: 'Money Collection' });
        });

        // 3. Top blog posts (as guide proxies)
        const { data: blogs } = await supabase
          .from('blog_posts')
          .select('slug')
          .eq('is_published', true)
          .order('updated_at', { ascending: false })
          .limit(5);

        (blogs || []).forEach(g => {
          entries.push({ url: `${CANONICAL}/blog/${g.slug}`, category: 'Blog/Guide' });
        });

        // 4. Recent products
        const { data: products } = await supabase
          .from('products_public')
          .select('slug')
          .eq('is_active', true)
          .not('slug', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(4);

        (products || []).forEach(p => {
          if (p.slug) entries.push({ url: `${CANONICAL}/product/${p.slug}`, category: 'Product' });
        });

        // Dedupe & limit to 20
        const seen = new Set<string>();
        const deduped = entries.filter(e => {
          if (seen.has(e.url)) return false;
          seen.add(e.url);
          return true;
        }).slice(0, 20);

        setUrls(deduped);
      } catch (e) {
        console.error('[GSC Checklist] Failed to load URLs:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const allUrlsText = [
    '# GetPawsy — GSC URL Inspection Priority List',
    `# Generated: ${new Date().toISOString()}`,
    '',
    '## Sitemap Resubmission',
    `${CANONICAL}/sitemap.xml`,
    '',
    '## URL Inspection Priority (Top 20)',
    ...urls.map((u, i) => `${i + 1}. [${u.category}] ${u.url}`),
  ].join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(allUrlsText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Layout>
      <Helmet>
        <title>GSC Checklist | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Google Search Console — Action Checklist</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Copy-ready list of URLs to submit via URL Inspection in GSC.
        </p>

        {/* Sitemap resubmission */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-sm mb-2">Step 1: Resubmit Sitemap</h2>
          <p className="font-mono text-xs bg-background border rounded px-3 py-2 select-all">
            {CANONICAL}/sitemap.xml
          </p>
        </div>

        {/* URL Inspection list */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Step 2: URL Inspection Priority ({urls.length} URLs)</h2>
          <button
            onClick={handleCopy}
            className="text-xs px-3 py-1.5 rounded border bg-card hover:bg-accent transition-colors"
          >
            {copied ? '✅ Copied!' : '📋 Copy All'}
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading URLs from database…</p>
        ) : (
          <div className="space-y-1">
            {urls.map((u, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                <span className="text-xs text-muted-foreground w-6 text-right">{i + 1}.</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wider font-medium w-24 text-center">
                  {u.category}
                </span>
                <span className="font-mono text-xs text-foreground break-all select-all flex-1">
                  {u.url}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Raw text block */}
        <details className="mt-6">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show raw text</summary>
          <pre className="mt-2 p-3 bg-muted rounded text-[10px] font-mono whitespace-pre-wrap select-all max-h-64 overflow-auto">
            {allUrlsText}
          </pre>
        </details>
      </div>
    </Layout>
  );
}
