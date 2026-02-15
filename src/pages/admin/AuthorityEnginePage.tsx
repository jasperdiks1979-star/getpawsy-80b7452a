import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Zap, FileText, PenTool, Rocket, CheckCircle, Clock, AlertCircle,
  Loader2, Crown, Link2, Eye, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';

type ArticleStatus = 'planned' | 'brief' | 'draft' | 'review' | 'published' | 'archived';
type ArticleRole = 'cornerstone' | 'support' | 'micro';

interface ClusterArticle {
  id: string;
  slug: string;
  title: string | null;
  seo_title: string | null;
  meta_description: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string;
  article_role: ArticleRole;
  status: ArticleStatus;
  outline: any;
  content: string | null;
  faq: any;
  key_takeaways: string[];
  internal_links: any;
  word_count: number;
  canonical_url: string | null;
  publish_date: string | null;
  approved: boolean;
  created_at: string;
}

interface Cluster {
  id: string;
  niche: string;
  cornerstone_slug: string;
  cornerstone_title: string | null;
  status: string;
  topical_map: any;
  created_at: string;
}

const STATUS_CONFIG: Record<ArticleStatus, { icon: typeof Clock; color: string; label: string }> = {
  planned: { icon: Clock, color: 'bg-muted text-muted-foreground', label: 'Planned' },
  brief: { icon: FileText, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Brief' },
  draft: { icon: PenTool, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', label: 'Draft' },
  review: { icon: Eye, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', label: 'Review' },
  published: { icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Published' },
  archived: { icon: AlertCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Archived' },
};

const ROLE_BADGE: Record<ArticleRole, string> = {
  cornerstone: 'bg-amber-500 text-white',
  support: 'bg-blue-500 text-white',
  micro: 'bg-muted text-muted-foreground',
};

export default function AuthorityEnginePage() {
  const [niche, setNiche] = useState('Cat Litter Box + Odor Control');
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [articles, setArticles] = useState<ClusterArticle[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const fetchClusters = useCallback(async () => {
    const { data } = await supabase
      .from('authority_clusters')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setClusters(data as unknown as Cluster[]);
  }, []);

  const fetchArticles = useCallback(async (clusterId: string) => {
    const { data } = await supabase
      .from('cluster_articles')
      .select('*')
      .eq('cluster_id', clusterId)
      .order('article_role', { ascending: true })
      .order('status', { ascending: true });
    if (data) setArticles(data as unknown as ClusterArticle[]);
  }, []);

  useEffect(() => { fetchClusters(); }, [fetchClusters]);
  useEffect(() => {
    if (selectedCluster) fetchArticles(selectedCluster);
  }, [selectedCluster, fetchArticles]);

  const callEngine = async (action: string, extra: Record<string, any> = {}) => {
    setLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('authority-engine', {
        body: { action, ...extra },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${action} completed`, { description: JSON.stringify(data).slice(0, 120) });
      await fetchClusters();
      if (selectedCluster) await fetchArticles(selectedCluster);
      if (data?.clusterId && !selectedCluster) setSelectedCluster(data.clusterId);
      return data;
    } catch (e: any) {
      toast.error(`${action} failed`, { description: e.message });
    } finally {
      setLoading(null);
    }
  };

  const statusCounts = articles.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeCluster = clusters.find(c => c.id === selectedCluster);

  return (
    <Layout>
      <Helmet>
        <title>Authority Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            Cat Litter Authority Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate, manage, and publish topical authority clusters for US SEO dominance.
          </p>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Controls</CardTitle>
            <CardDescription>Step-by-step content pipeline: Map → Briefs → Drafts → Review → Publish</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Niche (e.g., Cat Litter Box + Odor Control)"
                className="flex-1"
              />
              <Button
                onClick={() => callEngine('generate-topical-map', { niche })}
                disabled={!!loading}
              >
                {loading === 'generate-topical-map' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                Generate Topical Map
              </Button>
            </div>

            {selectedCluster && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => callEngine('generate-briefs', { clusterId: selectedCluster })}
                  disabled={!!loading}
                >
                  {loading === 'generate-briefs' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  Generate Briefs (batch 5)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => callEngine('draft-articles', { clusterId: selectedCluster })}
                  disabled={!!loading}
                >
                  {loading === 'draft-articles' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PenTool className="h-4 w-4 mr-2" />}
                  Draft Articles (batch 2)
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { fetchClusters(); if (selectedCluster) fetchArticles(selectedCluster); }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cluster Selector */}
        {clusters.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Clusters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {clusters.map(c => (
                  <Button
                    key={c.id}
                    variant={selectedCluster === c.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCluster(c.id)}
                  >
                    <Crown className="h-3 w-3 mr-1" />
                    {c.niche}
                    <Badge variant="secondary" className="ml-2">{c.status}</Badge>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Overview */}
        {selectedCluster && articles.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
            {(Object.keys(STATUS_CONFIG) as ArticleStatus[]).map(status => {
              const config = STATUS_CONFIG[status];
              const Icon = config.icon;
              return (
                <Card key={status} className="text-center">
                  <CardContent className="pt-4 pb-3">
                    <Icon className="h-5 w-5 mx-auto mb-1 opacity-60" />
                    <div className="text-2xl font-bold">{statusCounts[status] || 0}</div>
                    <div className="text-xs text-muted-foreground">{config.label}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Articles Table */}
        {selectedCluster && articles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Articles ({articles.length})
                {activeCluster && <span className="text-sm font-normal text-muted-foreground">— {activeCluster.niche}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {articles.map(article => {
                  const statusConf = STATUS_CONFIG[article.status];
                  const StatusIcon = statusConf.icon;
                  const isExpanded = expandedArticle === article.id;

                  return (
                    <div key={article.id} className="border rounded-lg">
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                      >
                        <Badge className={ROLE_BADGE[article.article_role]} variant="secondary">
                          {article.article_role === 'cornerstone' ? '👑' : article.article_role === 'support' ? '🔗' : '🎯'}
                          <span className="ml-1">{article.article_role}</span>
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">{article.title || article.slug}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            /{article.slug} • {article.primary_keyword} • {article.word_count} words
                          </div>
                        </div>
                        <Badge className={statusConf.color} variant="secondary">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConf.label}
                        </Badge>
                        {article.approved && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 border-t pt-3 space-y-3">
                          {article.seo_title && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground">SEO Title:</span>
                              <p className="text-sm">{article.seo_title}</p>
                            </div>
                          )}
                          {article.meta_description && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground">Meta Description:</span>
                              <p className="text-sm">{article.meta_description}</p>
                            </div>
                          )}
                          {article.key_takeaways?.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground">Key Takeaways:</span>
                              <ul className="text-sm list-disc list-inside">
                                {article.key_takeaways.map((t, i) => <li key={i}>{t}</li>)}
                              </ul>
                            </div>
                          )}
                          {article.content && (
                            <div>
                              <span className="text-xs font-medium text-muted-foreground">Content Preview:</span>
                              <p className="text-sm whitespace-pre-wrap max-h-40 overflow-y-auto bg-muted/30 rounded p-2 mt-1">
                                {article.content.slice(0, 800)}...
                              </p>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            {article.status === 'draft' && !article.approved && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  callEngine('approve', { articleId: article.id });
                                }}
                                disabled={!!loading}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                            )}
                            {article.status === 'review' && article.approved && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  callEngine('publish', { articleId: article.id });
                                }}
                                disabled={!!loading}
                              >
                                <Rocket className="h-3 w-3 mr-1" />
                                Publish
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {clusters.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No clusters yet</h3>
              <p className="text-muted-foreground mb-4">
                Enter a niche and click "Generate Topical Map" to start building your authority cluster.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
