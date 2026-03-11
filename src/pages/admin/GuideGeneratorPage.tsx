import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, FileText, Link2, ShoppingBag, CheckCircle, XCircle, AlertTriangle, Clock, Globe, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  generateGuide,
  generateMissingGuides,
  getAllKeywords,
  getMissingKeywords,
  type GuideGenerationResult,
  type BatchGenerationResult,
} from '@/lib/ai-guide-generator';

const CLUSTERS = [
  { value: 'cat-toys', label: 'Cat Toys' },
  { value: 'cat-litter', label: 'Cat Litter' },
  { value: 'cat-trees', label: 'Cat Trees' },
  { value: 'dog-training', label: 'Dog Training' },
  { value: 'dog-travel', label: 'Dog Travel' },
  { value: 'dog-grooming', label: 'Dog Grooming' },
];

export default function GuideGeneratorPage() {
  const [keyword, setKeyword] = useState('');
  const [cluster, setCluster] = useState('cat-toys');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [lastResult, setLastResult] = useState<GuideGenerationResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchGenerationResult | null>(null);

  const missingKeywords = getMissingKeywords();
  const totalMissing = Object.values(missingKeywords).flat().length;
  const allKeywords = getAllKeywords();
  const totalKeywords = Object.values(allKeywords).flat().length;

  // Fetch published guides stats from DB
  const { data: publishedStats } = useQuery({
    queryKey: ['admin', 'published-guides-stats'],
    queryFn: async () => {
      const [guidesRes, indexedRes, logRes] = await Promise.all([
        supabase.from('published_guides').select('id,cluster,is_indexed,internal_links_count,products_linked', { count: 'exact' }),
        supabase.from('published_guides').select('id', { count: 'exact' }).eq('is_indexed', true),
        supabase.from('guide_generation_log').select('*').order('run_at', { ascending: false }).limit(10),
      ]);

      const guides = guidesRes.data || [];
      const totalInternalLinks = guides.reduce((sum, g) => sum + (g.internal_links_count || 0), 0);
      const totalProducts = guides.reduce((sum, g) => sum + (g.products_linked || 0), 0);

      const clusterCounts: Record<string, number> = {};
      for (const g of guides) {
        clusterCounts[g.cluster] = (clusterCounts[g.cluster] || 0) + 1;
      }

      return {
        totalPublished: guidesRes.count || 0,
        totalIndexed: indexedRes.count || 0,
        totalInternalLinks,
        totalProducts,
        clusterCounts,
        recentRuns: (logRes.data || []) as any[],
      };
    },
    staleTime: 30_000,
  });

  const handleGenerate = useCallback(async () => {
    if (!keyword.trim()) { toast.error('Enter a keyword'); return; }
    setIsGenerating(true);
    setLastResult(null);
    try {
      const result = await generateGuide({ keyword: keyword.trim(), cluster });
      setLastResult(result);
      if (result.success) {
        // Also save to published_guides
        if (result.guide) {
          await supabase.from('published_guides').upsert([{
            slug: result.guide.slug,
            title: result.guide.title,
            excerpt: result.guide.excerpt,
            category: result.guide.category,
            keywords: result.guide.keywords,
            published_at: new Date().toISOString(),
            featured_image: result.guide.featuredImage,
            reading_time: result.guide.readingTime,
            related_categories: result.guide.relatedCategories,
            guide_data: result.guide as any,
            cluster,
            is_published: true,
            internal_links_count: result.stats?.internalLinksAdded || 0,
            products_linked: result.stats?.productsConnected || 0,
            generation_source: 'manual',
          }], { onConflict: 'slug' });
        }
        toast.success(`Guide generated: ${result.guide?.title}`);
      } else {
        toast.error(result.error || 'Generation failed');
      }
    } catch { toast.error('Unexpected error'); }
    finally { setIsGenerating(false); }
  }, [keyword, cluster]);

  const handleBatchGenerate = useCallback(async (targetCluster?: string) => {
    setIsBatchRunning(true);
    setBatchResult(null);
    try {
      const result = await generateMissingGuides(targetCluster);
      setBatchResult(result);
      toast.success(`Batch complete: ${result.guidesCreated} guides created`);
    } catch { toast.error('Batch generation failed'); }
    finally { setIsBatchRunning(false); }
  }, []);

  const handleAutoPublish = useCallback(async (limit: number = 3) => {
    setIsAutoRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-publish-guides', {
        body: { limit, triggered_by: 'manual' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Auto-publish complete: ${data.guidesGenerated} guides published`);
    } catch (err: any) {
      toast.error(err.message || 'Auto-publish failed');
    } finally {
      setIsAutoRunning(false);
    }
  }, []);

  const handleRequestIndexing = useCallback(async (slug: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('request-indexing', {
        body: { slug },
      });
      if (error) throw error;
      toast.success(`Indexing requested for /guides/${slug}`);
    } catch {
      toast.error('Indexing request failed');
    }
  }, []);

  // Estimated traffic: ~50-200 visits/month per well-optimized guide
  const estimatedMonthlyTraffic = (publishedStats?.totalPublished || 0) * 120;

  return (
    <>
      <Helmet>
        <title>AI Guide Generator | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6 p-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Guide Publishing Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated SEO guide generation, publishing, and indexing pipeline.
          </p>
        </div>

        {/* Performance Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{totalKeywords}</p>
              <p className="text-xs text-muted-foreground">Total Keywords</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{publishedStats?.totalPublished || 0}</p>
              <p className="text-xs text-muted-foreground">Published Guides</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{totalMissing}</p>
              <p className="text-xs text-muted-foreground">Remaining</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Globe className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold text-foreground">{publishedStats?.totalIndexed || 0}</p>
              <p className="text-xs text-muted-foreground">Indexed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Link2 className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold text-foreground">{publishedStats?.totalInternalLinks || 0}</p>
              <p className="text-xs text-muted-foreground">Internal Links</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold text-foreground">{estimatedMonthlyTraffic.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Est. Monthly Traffic</p>
            </CardContent>
          </Card>
        </div>

        {/* Auto-Publish Pipeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              Auto-Publish Pipeline
            </CardTitle>
            <CardDescription>
              Generate and publish 3-5 guides automatically. Scheduled daily at 03:00 UTC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleAutoPublish(3)} disabled={isAutoRunning} variant="default">
                {isAutoRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Publish 3 Guides
              </Button>
              <Button onClick={() => handleAutoPublish(5)} disabled={isAutoRunning} variant="outline">
                Publish 5 Guides
              </Button>
              <Button onClick={() => handleAutoPublish(1)} disabled={isAutoRunning} variant="outline" size="sm">
                Test (1 Guide)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Single Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Single Guide
            </CardTitle>
            <CardDescription>Enter a keyword and cluster to generate an optimized guide.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input placeholder="e.g. best automatic cat toys" value={keyword} onChange={e => setKeyword(e.target.value)} className="flex-1" />
              <Select value={cluster} onValueChange={setCluster}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLUSTERS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate
              </Button>
            </div>

            {lastResult && (
              <div className={`p-4 rounded-lg border ${lastResult.success ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
                {lastResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-foreground">{lastResult.guide?.title}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary"><Link2 className="h-3 w-3 mr-1" />{lastResult.stats?.internalLinksAdded} links</Badge>
                      <Badge variant="secondary"><ShoppingBag className="h-3 w-3 mr-1" />{lastResult.stats?.productsConnected} products</Badge>
                      <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />SEO meta ✓</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">/guides/{lastResult.guide?.slug}</p>
                      <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => handleRequestIndexing(lastResult.guide?.slug || '')}>
                        <Globe className="h-3 w-3 mr-1" /> Request Indexing
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">{lastResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Batch Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Batch Generate Missing Guides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CLUSTERS.map(c => {
                const missing = missingKeywords[c.value]?.length || 0;
                return (
                  <Button key={c.value} variant="outline" size="sm" disabled={isBatchRunning || missing === 0} onClick={() => handleBatchGenerate(c.value)}>
                    {c.label}
                    {missing > 0 && <Badge variant="destructive" className="ml-2 text-xs">{missing}</Badge>}
                  </Button>
                );
              })}
              <Button variant="default" size="sm" disabled={isBatchRunning || totalMissing === 0} onClick={() => handleBatchGenerate()}>
                {isBatchRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate All ({totalMissing})
              </Button>
            </div>

            {batchResult && (
              <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <h3 className="font-semibold text-foreground">Batch Results</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div><p className="text-xl font-bold text-primary">{batchResult.guidesCreated}</p><p className="text-xs text-muted-foreground">Created</p></div>
                  <div><p className="text-xl font-bold text-foreground">{batchResult.internalLinksAdded}</p><p className="text-xs text-muted-foreground">Links</p></div>
                  <div><p className="text-xl font-bold text-foreground">{batchResult.productsConnected}</p><p className="text-xs text-muted-foreground">Products</p></div>
                  <div><p className="text-xl font-bold text-foreground">{batchResult.seoMetaGenerated}</p><p className="text-xs text-muted-foreground">SEO Meta</p></div>
                </div>
                {batchResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {batchResult.errors.length} errors:
                    </p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {batchResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Pipeline Runs */}
        {publishedStats?.recentRuns && publishedStats.recentRuns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                Recent Pipeline Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {publishedStats.recentRuns.map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-3">
                      <Badge variant={run.guides_generated > 0 ? 'default' : 'secondary'} className="text-xs">
                        {run.triggered_by}
                      </Badge>
                      <span className="text-sm text-foreground">
                        {run.guides_generated} generated, {run.guides_failed} failed
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : '-'}</span>
                      <span>{new Date(run.run_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Keyword Coverage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Keyword Coverage by Cluster</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {CLUSTERS.map(c => {
                const all = allKeywords[c.value] || [];
                const missing = missingKeywords[c.value] || [];
                const existing = all.length - missing.length;
                const dbCount = publishedStats?.clusterCounts?.[c.value] || 0;
                return (
                  <div key={c.value} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{c.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {existing}/{all.length} static · {dbCount} published
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: all.length > 0 ? `${(existing / all.length) * 100}%` : '0%' }} />
                    </div>
                    {missing.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {missing.slice(0, 8).map(kw => (
                          <Badge key={kw} variant="outline" className="text-xs cursor-pointer" onClick={() => { setKeyword(kw); setCluster(c.value); }}>
                            {kw}
                          </Badge>
                        ))}
                        {missing.length > 8 && <Badge variant="outline" className="text-xs">+{missing.length - 8} more</Badge>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
