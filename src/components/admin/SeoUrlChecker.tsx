import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { SITE_URL } from '@/lib/constants';

// Known noindex paths (must match NoindexController + robots.txt)
const NOINDEX_PATHS = [
  '/cart', '/account', '/search', '/checkout', '/admin', '/auth',
  '/orders', '/wishlist', '/thank-you', '/payment-success', '/diagnostics',
  '/my-claims', '/unsubscribe', '/install', '/track', '/profile', '/dashboard',
];

const SITEMAP_PATHS = [
  '/product/', '/products', '/collections/', '/guides/', '/blog/',
  '/bestseller/', '/dog/', '/cat/', '/shop', '/about', '/contact',
  '/faq', '/shipping', '/',
];

interface CheckResult {
  url: string;
  robotsTag: string;
  canonical: string;
  inSitemap: boolean;
  indexable: boolean;
  issues: string[];
}

function analyzeUrl(inputUrl: string): CheckResult {
  let path = inputUrl;
  
  // Normalize: extract path from full URL
  try {
    if (inputUrl.startsWith('http')) {
      path = new URL(inputUrl).pathname;
    }
  } catch {
    // Keep as-is
  }

  // Remove trailing slash (except root)
  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  const issues: string[] = [];

  // Check noindex
  const isNoindex = NOINDEX_PATHS.some(p => path.startsWith(p));
  const robotsTag = isNoindex ? 'noindex, follow' : 'index, follow';

  // Build canonical
  const cleanPath = path.replace(/\/+$/, '') || '';
  const canonical = `${SITE_URL}${cleanPath}`;

  // Check sitemap inclusion
  const inSitemap = !isNoindex && SITEMAP_PATHS.some(sp => {
    if (sp.endsWith('/')) return path.startsWith(sp);
    return path === sp || path.startsWith(sp + '/');
  });

  // Indexability
  const hasQueryParams = inputUrl.includes('?');
  const indexable = !isNoindex && !hasQueryParams;

  // Issues detection
  if (isNoindex) issues.push('Page has noindex tag — excluded from search');
  if (hasQueryParams) issues.push('URL has query parameters — may be excluded from sitemap');
  if (!inSitemap && !isNoindex) issues.push('Not matched to known sitemap paths');
  if (path.includes('//')) issues.push('Double slashes in path');

  return {
    url: path,
    robotsTag,
    canonical,
    inSitemap,
    indexable,
    issues,
  };
}

export function SeoUrlChecker() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = () => {
    if (!url.trim()) return;
    setLoading(true);
    // Simulate brief processing
    setTimeout(() => {
      setResult(analyzeUrl(url.trim()));
      setLoading(false);
    }, 300);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5" />
          SEO Crawl Status Checker
        </CardTitle>
        <CardDescription>Enter a URL to check robots tag, canonical, sitemap presence, and indexable status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter URL, e.g. /product/dog-toy or https://getpawsy.pet/product/dog-toy"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            className="flex-1"
          />
          <Button onClick={handleCheck} disabled={loading || !url.trim()} size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1">Check</span>
          </Button>
        </div>

        {result && (
          <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
            <div className="text-sm font-mono text-muted-foreground">{result.url}</div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Robots Tag</p>
                <Badge variant={result.indexable ? 'default' : 'destructive'} className="text-xs">
                  {result.robotsTag}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Indexable</p>
                <div className="flex items-center gap-1">
                  {result.indexable 
                    ? <><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-xs text-green-600 font-medium">Yes</span></> 
                    : <><XCircle className="h-4 w-4 text-destructive" /><span className="text-xs text-destructive font-medium">No</span></>}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">In Sitemap</p>
                <div className="flex items-center gap-1">
                  {result.inSitemap 
                    ? <><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-xs text-green-600 font-medium">Yes</span></> 
                    : <><AlertTriangle className="h-4 w-4 text-amber-500" /><span className="text-xs text-amber-600 font-medium">No</span></>}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Canonical URL</p>
                <p className="text-xs font-mono text-foreground break-all">{result.canonical}</p>
              </div>
            </div>

            {result.issues.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border">
                <p className="text-xs font-medium text-amber-600">⚠️ Issues</p>
                {result.issues.map((issue, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {issue}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
