import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus, 
  RefreshCw, 
  Link2, 
  DollarSign,
  TrendingUp,
  TrendingDown 
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { 
  findProductMatches, 
  type OwnProduct, 
  type CompetitorProduct,
  type ProductMatchResult 
} from '@/lib/product-matching';

const COMPETITOR_LABELS: Record<string, { name: string; color: string }> = {
  amazon: { name: 'Amazon', color: 'bg-orange-500' },
  chewy: { name: 'Chewy', color: 'bg-blue-500' },
  petco: { name: 'Petco', color: 'bg-teal-500' },
};

export const ProductPriceComparison = () => {
  const queryClient = useQueryClient();

  // Fetch own products
  const { data: ownProducts, isLoading: loadingOwn } = useQuery({
    queryKey: ['products-for-matching'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, cost_price')
        .eq('is_active', true)
        .limit(100);
      
      if (error) throw error;
      return data as OwnProduct[];
    },
  });

  // Fetch competitor products
  const { data: competitorProducts, isLoading: loadingCompetitor } = useQuery({
    queryKey: ['competitor-products-for-matching'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_products')
        .select('id, competitor, product_name, price, current_rank')
        .order('current_rank', { ascending: true })
        .limit(100);
      
      if (error) throw error;
      return data as CompetitorProduct[];
    },
  });

  // Fetch existing matches
  const { data: existingMatches } = useQuery({
    queryKey: ['product-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_matches')
        .select('*');
      
      if (error) throw error;
      return data;
    },
  });

  // Save match mutation
  const saveMutation = useMutation({
    mutationFn: async (match: ProductMatchResult) => {
      const { error } = await supabase
        .from('product_matches')
        .upsert({
          product_id: match.ownProduct.id,
          competitor_product_id: match.competitorProduct.id,
          match_score: match.matchScore,
          match_type: 'auto',
        }, {
          onConflict: 'product_id,competitor_product_id',
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-matches'] });
      toast({
        title: 'Match opgeslagen',
        description: 'Product koppeling succesvol opgeslagen',
      });
    },
  });

  // Auto-match mutation
  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      if (!ownProducts || !competitorProducts) return [];
      
      const matches = findProductMatches(ownProducts, competitorProducts, 50);
      
      // Save all matches
      for (const match of matches.slice(0, 20)) {
        await supabase
          .from('product_matches')
          .upsert({
            product_id: match.ownProduct.id,
            competitor_product_id: match.competitorProduct.id,
            match_score: match.matchScore,
            match_type: 'auto',
          }, {
            onConflict: 'product_id,competitor_product_id',
          });
      }
      
      return matches;
    },
    onSuccess: (matches) => {
      queryClient.invalidateQueries({ queryKey: ['product-matches'] });
      toast({
        title: 'Auto-matching voltooid',
        description: `${matches?.length || 0} matches gevonden en opgeslagen`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Auto-matching mislukt',
        description: error instanceof Error ? error.message : 'Onbekende fout',
        variant: 'destructive',
      });
    },
  });

  const isLoading = loadingOwn || loadingCompetitor;

  // Calculate matches on the fly
  const matches = ownProducts && competitorProducts
    ? findProductMatches(ownProducts, competitorProducts, 40)
    : [];

  const getPriceIndicator = (pricePercentage: number | null) => {
    if (pricePercentage === null) return null;
    
    if (pricePercentage > 10) {
      return {
        icon: <ArrowUpRight className="h-4 w-4" />,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        label: `+${pricePercentage}%`,
        description: 'Duurder dan concurrent',
      };
    } else if (pricePercentage < -10) {
      return {
        icon: <ArrowDownRight className="h-4 w-4" />,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
        label: `${pricePercentage}%`,
        description: 'Goedkoper dan concurrent',
      };
    } else {
      return {
        icon: <Minus className="h-4 w-4" />,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        label: `${pricePercentage > 0 ? '+' : ''}${pricePercentage}%`,
        description: 'Vergelijkbare prijs',
      };
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-medium">
              Price Comparison
            </CardTitle>
            {matches.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {matches.length} matches
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending || isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${autoMatchMutation.isPending ? 'animate-spin' : ''}`} />
            {autoMatchMutation.isPending ? 'Matching...' : 'Auto Match'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Geen matches gevonden</p>
            <p className="text-xs">Klik op "Auto Match" om producten te koppelen</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {matches.slice(0, 15).map((match, index) => {
                const priceIndicator = getPriceIndicator(match.pricePercentage);
                const competitorLabel = COMPETITOR_LABELS[match.competitorProduct.competitor];
                
                return (
                  <div
                    key={`${match.ownProduct.id}-${match.competitorProduct.id}`}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Own Product */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={match.ownProduct.name}>
                          {match.ownProduct.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            Eigen product
                          </Badge>
                          <span className="text-sm font-semibold text-primary">
                            ${match.ownProduct.price.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Match Score */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                          match.matchScore >= 70 ? 'bg-green-500/20 text-green-600' :
                          match.matchScore >= 50 ? 'bg-yellow-500/20 text-yellow-600' :
                          'bg-orange-500/20 text-orange-600'
                        }`}>
                          {match.matchScore}%
                        </div>
                        <span className="text-[10px] text-muted-foreground">match</span>
                      </div>

                      {/* Competitor Product */}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm font-medium truncate" title={match.competitorProduct.product_name}>
                          {match.competitorProduct.product_name}
                        </p>
                        <div className="flex items-center justify-end gap-2 mt-1">
                          <Badge 
                            className={`text-xs ${competitorLabel?.color || 'bg-gray-500'} text-white border-0`}
                          >
                            {competitorLabel?.name || match.competitorProduct.competitor}
                          </Badge>
                          {match.competitorProduct.price != null && (
                            <span className="text-sm font-semibold">
                              ${match.competitorProduct.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price Comparison */}
                    {priceIndicator && (
                      <div className={`mt-2 px-2 py-1 rounded flex items-center justify-between ${priceIndicator.bgColor}`}>
                        <div className="flex items-center gap-1">
                          <span className={priceIndicator.color}>{priceIndicator.icon}</span>
                          <span className={`text-xs font-medium ${priceIndicator.color}`}>
                            {priceIndicator.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {priceIndicator.description}
                        </span>
                        {match.priceDifference !== null && (
                          <span className={`text-xs font-medium ${priceIndicator.color}`}>
                            {match.priceDifference >= 0 ? '+' : ''}${match.priceDifference.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Summary Stats */}
        {matches.length > 0 && (
          <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-green-500">
                <TrendingDown className="h-4 w-4" />
                <span className="text-lg font-bold">
                  {matches.filter(m => m.pricePercentage !== null && m.pricePercentage < -10).length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Goedkoper</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-yellow-500">
                <Minus className="h-4 w-4" />
                <span className="text-lg font-bold">
                  {matches.filter(m => m.pricePercentage !== null && m.pricePercentage >= -10 && m.pricePercentage <= 10).length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Vergelijkbaar</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-red-500">
                <TrendingUp className="h-4 w-4" />
                <span className="text-lg font-bold">
                  {matches.filter(m => m.pricePercentage !== null && m.pricePercentage > 10).length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Duurder</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
