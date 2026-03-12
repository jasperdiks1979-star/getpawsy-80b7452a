import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, XCircle, BookOpen, Layers, Link2, ShoppingBag, Rocket } from 'lucide-react';
import { toast } from 'sonner';

interface CornerstoneItem {
  slug: string;
  title: string;
  primaryKW: string;
  cluster: string;
  category: string;
  status: 'published' | 'pending';
  publishedAt?: string;
}

interface ClusterItem {
  slug: string;
  title: string;
  cluster: string;
  status: 'published' | 'pending';
  publishedAt?: string;
}

export default function CornerstoneEnginePage() {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState<string | null>(null);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['cornerstone-engine', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-cornerstone', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return data as { cornerstones: CornerstoneItem[]; clusterGuides: ClusterItem[] };
    },
  });

  const { data: statusData } = useQuery({
    queryKey: ['cornerstone-engine', 'status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-cornerstone', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ slug, type }: { slug?: string; type: 'generate' | 'generate-cluster' }) => {
      setGenerating(slug || 'batch');
      const { data, error } = await supabase.functions.invoke('generate-cornerstone', {
        body: { action: type, slug, batchSize: slug ? 1 : 3 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGenerating(null);
      queryClient.invalidateQueries({ queryKey: ['cornerstone-engine'] });
      if (data?.generated > 0) {
        toast.success(`Generated ${data.generated} guide(s) successfully`);
      } else if (data?.results?.[0]?.error === 'Already exists') {
        toast.info('Guide already exists');
      } else {
        toast.error(data?.results?.[0]?.error || 'Generation failed');
      }
    },
    onError: (err) => {
      setGenerating(null);
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    },
  });

  const cornerstones = listData?.cornerstones || [];
  const clusterGuides = listData?.clusterGuides || [];
  const publishedCount = cornerstones.filter(c => c.status === 'published').length + clusterGuides.filter(c => c.status === 'published').length;
  const totalCount = cornerstones.length + clusterGuides.length;
  const progress = totalCount > 0 ? (publishedCount / totalCount) * 100 : 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Cornerstone SEO Content Engine</h1>
          <p className="text-muted-foreground">Generate and manage cornerstone pages and guide clusters for topical authority.</p>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6 text-center">
              <BookOpen className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{statusData?.cornerstonesPublished || 0}/{statusData?.totalCornerstones || 0}</div>
              <div className="text-xs text-muted-foreground">Cornerstones</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Layers className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{statusData?.clusterGuidesPublished || 0}/{statusData?.totalClusterGuides || 0}</div>
              <div className="text-xs text-muted-foreground">Cluster Guides</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Link2 className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{statusData?.totalInternalLinks || 0}</div>
              <div className="text-xs text-muted-foreground">Internal Links</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <ShoppingBag className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{statusData?.totalProductsLinked || 0}</div>
              <div className="text-xs text-muted-foreground">Products Linked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Rocket className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{Math.round(progress)}%</div>
              <div className="text-xs text-muted-foreground">Complete</div>
            </CardContent>
          </Card>
        </div>

        <Progress value={progress} className="mb-8 h-3" />

        {/* Cornerstone Pages */}
        <Card className="mb-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Cornerstone Pages (2,500-3,000 words)</CardTitle>
            <Button
              size="sm"
              onClick={() => generateMutation.mutate({ type: 'generate' })}
              disabled={generating !== null}
            >
              {generating === 'batch' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate All Pending
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {cornerstones.map((cs) => (
                  <div key={cs.slug} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {cs.status === 'published' ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{cs.title}</span>
                      </div>
                      <div className="flex gap-2 ml-6">
                        <Badge variant="outline" className="text-xs">{cs.cluster}</Badge>
                        <Badge variant={cs.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                          {cs.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      {cs.status === 'published' ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/guides/${cs.slug}`} target="_blank" rel="noopener">View</a>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => generateMutation.mutate({ slug: cs.slug, type: 'generate' })}
                          disabled={generating !== null}
                        >
                          {generating === cs.slug ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Generate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cluster Support Guides */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Cluster Support Guides (1,000-1,500 words)</CardTitle>
            <Button
              size="sm"
              onClick={() => generateMutation.mutate({ type: 'generate-cluster' })}
              disabled={generating !== null}
            >
              {generating === 'batch' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Generate All Pending
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {clusterGuides.map((guide) => (
                  <div key={guide.slug} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {guide.status === 'published' ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{guide.title}</span>
                      </div>
                      <div className="flex gap-2 ml-6">
                        <Badge variant="outline" className="text-xs">{guide.cluster}</Badge>
                        <Badge variant={guide.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                          {guide.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      {guide.status === 'published' ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/guides/${guide.slug}`} target="_blank" rel="noopener">View</a>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => generateMutation.mutate({ slug: guide.slug, type: 'generate-cluster' })}
                          disabled={generating !== null}
                        >
                          {generating === guide.slug ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Generate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SEO Report */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-xl">SEO Impact Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium">Cornerstone Pages</div>
                <div className="text-muted-foreground">{statusData?.cornerstonesPublished || 0} created</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium">Cluster Guides</div>
                <div className="text-muted-foreground">{statusData?.clusterGuidesPublished || 0} created</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium">Internal Links</div>
                <div className="text-muted-foreground">{statusData?.totalInternalLinks || 0} generated</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium">Products Linked</div>
                <div className="text-muted-foreground">{statusData?.totalProductsLinked || 0} connected</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium">Schema Added</div>
                <div className="text-muted-foreground">Article + FAQ + Breadcrumb (auto)</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium">Est. Traffic Potential</div>
                <div className="text-muted-foreground">+2,000-5,000 monthly visits</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
