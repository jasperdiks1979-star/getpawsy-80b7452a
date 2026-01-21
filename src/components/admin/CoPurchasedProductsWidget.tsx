import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Package, ArrowRight } from 'lucide-react';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
}

interface ProductPair {
  product1: { id: string; name: string };
  product2: { id: string; name: string };
  count: number;
  percentage: number;
}

function isOrderItemArray(items: unknown): items is OrderItem[] {
  return Array.isArray(items) && items.every(item => 
    typeof item === 'object' && item !== null && 'id' in item && 'name' in item
  );
}

export const CoPurchasedProductsWidget = () => {
  const { data: productPairs, isLoading } = useQuery({
    queryKey: ['co-purchased-pairs'],
    queryFn: async () => {
      // Fetch all paid orders
      const { data: orders, error } = await supabase
        .from('orders')
        .select('items')
        .in('status', ['paid', 'processing', 'shipped', 'delivered']);

      if (error) throw error;

      // Count product pair occurrences
      const pairCounts: Record<string, { 
        product1: { id: string; name: string }; 
        product2: { id: string; name: string }; 
        count: number 
      }> = {};

      let totalOrders = 0;

      orders?.forEach(order => {
        const items = order.items;
        if (!isOrderItemArray(items) || items.length < 2) return;

        totalOrders++;
        
        // Get unique products in this order
        const uniqueProducts = items.reduce((acc, item) => {
          if (!acc.find(p => p.id === item.id)) {
            acc.push({ id: item.id, name: item.name });
          }
          return acc;
        }, [] as { id: string; name: string }[]);

        // Create pairs (order doesn't matter, so we sort by id to avoid duplicates)
        for (let i = 0; i < uniqueProducts.length; i++) {
          for (let j = i + 1; j < uniqueProducts.length; j++) {
            const [first, second] = [uniqueProducts[i], uniqueProducts[j]].sort((a, b) => 
              a.id.localeCompare(b.id)
            );
            const pairKey = `${first.id}|${second.id}`;
            
            if (!pairCounts[pairKey]) {
              pairCounts[pairKey] = {
                product1: first,
                product2: second,
                count: 0
              };
            }
            pairCounts[pairKey].count++;
          }
        }
      });

      // Convert to array and sort by count
      const pairs: ProductPair[] = Object.values(pairCounts)
        .map(pair => ({
          ...pair,
          percentage: totalOrders > 0 ? Math.round((pair.count / totalOrders) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 pairs

      return { pairs, totalOrders };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top Product Combinaties
          </CardTitle>
          <CardDescription>Producten die vaak samen gekocht worden</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { pairs = [], totalOrders = 0 } = productPairs || {};

  if (pairs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top Product Combinaties
          </CardTitle>
          <CardDescription>Producten die vaak samen gekocht worden</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-50" />
            <p>Nog geen product combinaties gevonden</p>
            <p className="text-sm">Meer orders nodig voor analyse</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Top Product Combinaties
        </CardTitle>
        <CardDescription>
          Gebaseerd op {totalOrders} orders met meerdere producten
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pairs.map((pair, index) => (
            <div 
              key={`${pair.product1.id}-${pair.product2.id}`}
              className="group relative flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              {/* Rank indicator */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-semibold text-primary">
                  {index + 1}
                </span>
              </div>

              {/* Product names */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate max-w-[140px]" title={pair.product1.name}>
                    {pair.product1.name}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate max-w-[140px]" title={pair.product2.name}>
                    {pair.product2.name}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {pair.count}x
                </Badge>
                {pair.percentage >= 10 && (
                  <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                    {pair.percentage}%
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary footer */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            💡 Tip: Gebruik deze data voor bundle deals en cross-sell strategieën
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
