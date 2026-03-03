import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, RefreshCw, Zap, TrendingUp, Tag, AlertTriangle,
  CheckCircle, ArrowRight, Search, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { Helmet } from 'react-helmet-async';

interface Optimization {
  product_id: string;
  original_title: string;
  optimized_title: string;
  original_description: string;
  optimized_description: string;
  google_product_category: string | null;
  google_product_category_id: number | null;
  product_type: string | null;
  keyword_suggestions: string[];
  optimization_score: number;
  status: string;
}

interface Insights {
  topKeywords: Array<{ keyword: string; productCount: number }>;
  lowCTRProducts: Array<{ id: string; name: string; issue: string; suggestion: string }>;
  titleSuggestions: Array<{ id: string; currentTitle: string; suggestedAddition: string }>;
  categoryIssues: Array<{ id: string; name: string; issue: string }>;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-destructive';
  return <span className={`text-xs font-bold ${color}`}>{score}/100</span>;
}

export default function ShoppingOptimizerPage() {
  const [loading, setLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const callOptimizer = async (action: string, body?: any) => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('Not authenticated');
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/shopping-optimizer?action=${action}`,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }
    );
    return res.json();
  };

  const runOptimize = async () => {
    setLoading(true);
    try {
      const json = await callOptimizer('optimize');
      if (!json.ok) throw new Error(json.error);
      setOptimizations(json.results || []);
      setSelected(new Set());
      toast.success(`Optimized ${json.optimized} products`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const json = await callOptimizer('insights');
      if (!json.ok) throw new Error(json.error);
      setInsights(json);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInsightsLoading(false);
    }
  };

  const applySelected = async () => {
    if (selected.size === 0) return toast.error('No products selected');
    setApplyLoading(true);
    try {
      const json = await callOptimizer('apply', { productIds: Array.from(selected) });
      if (!json.ok) throw new Error(json.error);
      toast.success(`Applied ${json.applied} optimizations`);
      // Update local state
      setOptimizations(prev =>
        prev.map(o => selected.has(o.product_id) ? { ...o, status: 'applied' } : o)
      );
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setApplyLoading(false);
    }
  };

  // Load existing optimizations from DB on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('shopping_optimizations')
        .select('*')
        .order('optimization_score', { ascending: true })
        .limit(50);
      if (data?.length) setOptimizations(data as unknown as Optimization[]);
    })();
  }, []);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const pending = optimizations.filter(o => o.status === 'pending').map(o => o.product_id);
    setSelected(new Set(pending));
  };

  return (
    <div className="space-y-6">
      <Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Shopping Traffic Engine
          </h1>
          <p className="text-muted-foreground text-sm">
            Optimize product data for higher Google Shopping visibility and CTR
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runOptimize} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
            Run Optimizer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="optimizations">
        <TabsList>
          <TabsTrigger value="optimizations">Optimizations</TabsTrigger>
          <TabsTrigger value="insights" onClick={() => !insights && loadInsights()}>
            Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="optimizations" className="space-y-4">
          {optimizations.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All Pending
                </Button>
                <Button size="sm" onClick={applySelected} disabled={selected.size === 0 || applyLoading}>
                  {applyLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                  Apply ({selected.size})
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{optimizations.length} products</span>
            </div>
          )}

          {optimizations.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Click "Run Optimizer" to generate title and description improvements.</p>
            </div>
          )}

          <div className="space-y-3">
            {optimizations.map(opt => (
              <Card key={opt.product_id} className={`${opt.status === 'applied' ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selected.has(opt.product_id)}
                      onCheckedChange={() => toggleSelect(opt.product_id)}
                      disabled={opt.status === 'applied'}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ScoreBadge score={opt.optimization_score} />
                          <Badge variant={opt.status === 'applied' ? 'default' : 'secondary'} className="text-xs">
                            {opt.status}
                          </Badge>
                        </div>
                        {opt.google_product_category && (
                          <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                            <Tag className="w-3 h-3 inline mr-1" />
                            {opt.google_product_category}
                          </span>
                        )}
                      </div>

                      {/* Title comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Original Title</p>
                          <p className="text-sm line-clamp-2">{opt.original_title}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" /> Optimized Title
                          </p>
                          <p className="text-sm line-clamp-2 font-medium">{opt.optimized_title}</p>
                        </div>
                      </div>

                      {/* Keywords */}
                      {opt.keyword_suggestions?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {opt.keyword_suggestions.map(kw => (
                            <Badge key={kw} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Product type */}
                      {opt.product_type && (
                        <p className="text-xs text-muted-foreground">
                          Product Type: {opt.product_type}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          {insightsLoading && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          )}

          {insights && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top Keywords */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Top Shopping Keywords
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {insights.topKeywords.map(kw => (
                      <div key={kw.keyword} className="flex items-center justify-between text-sm">
                        <span>{kw.keyword}</span>
                        <Badge variant="secondary" className="text-xs">{kw.productCount} products</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Category Issues */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Category Issues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.categoryIssues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No issues found</p>
                  ) : (
                    <div className="space-y-1.5">
                      {insights.categoryIssues.map(ci => (
                        <div key={ci.id} className="text-sm truncate">
                          <AlertTriangle className="w-3 h-3 inline text-amber-500 mr-1" />
                          {ci.name}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Low CTR Products */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Low CTR Risk (Short Titles)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.lowCTRProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">All titles look good</p>
                  ) : (
                    <div className="space-y-1.5">
                      {insights.lowCTRProducts.map(p => (
                        <div key={p.id} className="text-sm">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Title Suggestions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Title Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {insights.titleSuggestions.slice(0, 8).map(ts => (
                      <div key={ts.id} className="text-sm">
                        <p className="truncate">{ts.currentTitle}</p>
                        <p className="text-xs text-primary">+ {ts.suggestedAddition}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
