import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Minus, Sparkles, RefreshCw, Store, ExternalLink, Link2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import { ProductPriceComparison } from './ProductPriceComparison';

interface CompetitorProduct {
  id: string;
  competitor: string;
  product_name: string;
  product_url: string | null;
  current_rank: number;
  previous_rank: number | null;
  price: number | null;
  trend: string;
  rank_change: number;
  last_seen_at: string;
}

const COMPETITOR_LABELS: Record<string, { name: string; color: string }> = {
  amazon: { name: 'Amazon', color: 'bg-orange-500' },
  chewy: { name: 'Chewy', color: 'bg-blue-500' },
  petco: { name: 'Petco', color: 'bg-teal-500' },
};

export const CompetitorProductsWidget = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: products, isLoading } = useQuery({
    queryKey: ['competitor-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_products')
        .select('*')
        .order('current_rank', { ascending: true })
        .limit(30);
      
      if (error) throw error;
      return data as CompetitorProduct[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: trendingProducts } = useQuery({
    queryKey: ['competitor-products-trending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_products')
        .select('*')
        .or('trend.eq.up,trend.eq.new')
        .order('rank_change', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as CompetitorProduct[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-competitor-products');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['competitor-products'] });
      queryClient.invalidateQueries({ queryKey: ['competitor-products-trending'] });
      toast({
        title: 'Scraping voltooid',
        description: `${data.results?.length || 0} concurrenten gescraped`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Scraping mislukt',
        description: error instanceof Error ? error.message : 'Onbekende fout',
        variant: 'destructive',
      });
    },
  });

  const getTrendIcon = (trend: string, rankChange: number) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'new':
        return <Sparkles className="h-4 w-4 text-yellow-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendBadge = (trend: string, rankChange: number) => {
    switch (trend) {
      case 'up':
        return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">+{rankChange}</Badge>;
      case 'down':
        return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">{rankChange}</Badge>;
      case 'new':
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Nieuw</Badge>;
      default:
        return null;
    }
  };

  const filterProducts = (items: CompetitorProduct[] | undefined) => {
    if (!items) return [];
    if (activeTab === 'all') return items;
    return items.filter(p => p.competitor === activeTab);
  };

  const filteredProducts = filterProducts(products);
  const competitorCounts = products?.reduce((acc, p) => {
    acc[p.competitor] = (acc[p.competitor] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-medium">
              Top Products (USA Market)
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scrapeMutation.mutate()}
            disabled={scrapeMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${scrapeMutation.isPending ? 'animate-spin' : ''}`} />
            {scrapeMutation.isPending ? 'Scraping...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trending Alerts */}
        {trendingProducts && trendingProducts.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Trending Products</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {trendingProducts.slice(0, 5).map((product) => (
                <Badge key={product.id} variant="outline" className="text-xs">
                  {product.product_name.slice(0, 30)}...
                  {getTrendBadge(product.trend, product.rank_change)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Competitor Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              Alle ({products?.length || 0})
            </TabsTrigger>
            {Object.entries(COMPETITOR_LABELS).map(([key, { name }]) => (
              <TabsTrigger key={key} value={key}>
                {name} ({competitorCounts[key] || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Store className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nog geen data beschikbaar</p>
                <p className="text-xs">Klik op "Refresh" om te starten</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredProducts.slice(0, 10).map((product, index) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                        {product.current_rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={product.product_name}>
                          {product.product_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${COMPETITOR_LABELS[product.competitor]?.color} text-white border-0`}
                          >
                            {COMPETITOR_LABELS[product.competitor]?.name || product.competitor}
                          </Badge>
                          {product.price && (
                            <span className="text-xs text-muted-foreground">
                              ${product.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(product.trend, product.rank_change)}
                      {getTrendBadge(product.trend, product.rank_change)}
                      {product.product_url && (
                        <a
                          href={product.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Last Updated */}
        {products && products.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Laatst bijgewerkt: {new Date(products[0].last_seen_at).toLocaleString('nl-NL')}
          </p>
        )}
      </CardContent>
    </Card>

    {/* Price Comparison Widget */}
    <ProductPriceComparison />
  </>
  );
};
