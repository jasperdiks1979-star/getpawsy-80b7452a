import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Copy, ExternalLink, Search, Zap, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SITE = 'https://getpawsy.pet';

interface UrlEntry {
  url: string;
  type: string;
  date: string;
  priority: 'high' | 'medium' | 'low';
}

export default function GscUrlInspectionHelper() {
  const [copiedAll, setCopiedAll] = useState(false);

  // Fetch recently published guides
  const { data: recentGuides = [], isLoading: loadingGuides } = useQuery({
    queryKey: ['gsc-helper-guides'],
    queryFn: async () => {
      const { data } = await supabase
        .from('published_guides')
        .select('slug, title, published_at, is_indexed')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    staleTime: 60_000,
  });

  // Fetch recently published blog posts
  const { data: recentBlog = [], isLoading: loadingBlog } = useQuery({
    queryKey: ['gsc-helper-blog'],
    queryFn: async () => {
      const { data } = await supabase
        .from('blog_posts')
        .select('slug, title, published_at')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    staleTime: 60_000,
  });

  // Fetch recently added products
  const { data: recentProducts = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['gsc-helper-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('slug, name, created_at')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .order('created_at', { ascending: false })
        .limit(15);
      return data || [];
    },
    staleTime: 60_000,
  });

  const isLoading = loadingGuides || loadingBlog || loadingProducts;

  // Build prioritized URL list
  const urlEntries: UrlEntry[] = [];

  for (const g of recentGuides) {
    const isNew = g.published_at && (Date.now() - new Date(g.published_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
    urlEntries.push({
      url: `${SITE}/guides/${g.slug}`,
      type: 'Guide',
      date: g.published_at || '',
      priority: !g.is_indexed ? 'high' : isNew ? 'medium' : 'low',
    });
  }

  for (const b of recentBlog) {
    const isNew = b.published_at && (Date.now() - new Date(b.published_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
    urlEntries.push({
      url: `${SITE}/blog/${b.slug}`,
      type: 'Blog',
      date: b.published_at || '',
      priority: isNew ? 'high' : 'medium',
    });
  }

  for (const p of recentProducts) {
    const isNew = p.created_at && (Date.now() - new Date(p.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
    urlEntries.push({
      url: `${SITE}/product/${p.slug}`,
      type: 'Product',
      date: p.created_at || '',
      priority: isNew ? 'high' : 'low',
    });
  }

  // Sort: high first, then by date
  urlEntries.sort((a, b) => {
    const pMap = { high: 0, medium: 1, low: 2 };
    if (pMap[a.priority] !== pMap[b.priority]) return pMap[a.priority] - pMap[b.priority];
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const highPriority = urlEntries.filter(u => u.priority === 'high');

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
  };

  const copyAllHighPriority = () => {
    const urls = highPriority.map(u => u.url).join('\n');
    navigator.clipboard.writeText(urls);
    setCopiedAll(true);
    toast.success(`${highPriority.length} high-priority URLs copied`);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const openGsc = () => {
    window.open('https://search.google.com/search-console', '_blank');
  };

  return (
    <>
      <Helmet><title>GSC URL Inspection Helper | GetPawsy Admin</title></Helmet>
      <div className="container py-8 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            Search Console URL Inspection Helper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prioritized list of new/updated URLs ready for manual "Request Indexing" in Google Search Console.
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={openGsc} variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> Open Search Console
          </Button>
          {highPriority.length > 0 && (
            <Button onClick={copyAllHighPriority} size="sm" className="gap-1.5">
              {copiedAll ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy {highPriority.length} High-Priority URLs
            </Button>
          )}
        </div>

        {/* Summary */}
        <div className="flex gap-3 text-xs">
          <Badge variant="destructive" className="gap-1">
            <Zap className="h-3 w-3" /> {highPriority.length} High Priority
          </Badge>
          <Badge variant="outline">{urlEntries.filter(u => u.priority === 'medium').length} Medium</Badge>
          <Badge variant="secondary">{urlEntries.filter(u => u.priority === 'low').length} Low</Badge>
          <Badge variant="outline">{urlEntries.length} Total</Badge>
        </div>

        {/* URL List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">URLs for Inspection</CardTitle>
            <CardDescription>Copy URLs and paste into Search Console URL Inspection → Request Indexing</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : urlEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent URLs found.</p>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-0.5 text-xs font-mono">
                  {urlEntries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 group">
                      <Badge
                        variant={entry.priority === 'high' ? 'destructive' : entry.priority === 'medium' ? 'outline' : 'secondary'}
                        className="text-[8px] h-4 px-1.5 shrink-0 w-12 justify-center"
                      >
                        {entry.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[8px] h-4 px-1.5 shrink-0 w-14 justify-center">
                        {entry.type}
                      </Badge>
                      <span className="truncate flex-1 text-foreground">{entry.url.replace(SITE, '')}</span>
                      <span className="text-muted-foreground/60 shrink-0 w-16">
                        {entry.date ? new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={() => copyUrl(entry.url)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How to Use</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Click "Open Search Console" above</p>
            <p>2. Paste a high-priority URL into the URL Inspection bar</p>
            <p>3. Click "Request Indexing" in the results panel</p>
            <p>4. Repeat for each high-priority URL (Google limits ~10-20/day)</p>
            <p className="text-xs mt-3 text-muted-foreground/60">
              Tip: Focus on unindexed guides and new money pages first. Products with existing impressions (positions 6-25) benefit most from re-indexing.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
