import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dedupeProducts } from '@/lib/dedupe-products';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface CoPurchaseProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  slug: string | null;
  category: string | null;
  frequency: number;
}

// Type guard to check if Json is an array of OrderItems
const isOrderItemArray = (items: unknown): items is OrderItem[] => {
  return Array.isArray(items) && items.every(item => 
    typeof item === 'object' && 
    item !== null && 
    'id' in item && 
    'name' in item
  );
};

export const useCustomersAlsoBought = (productId: string, limit = 4) => {
  const { data: products = [], isLoading, error } = useQuery({
    queryKey: ['customers-also-bought', productId, limit],
    queryFn: async (): Promise<CoPurchaseProduct[]> => {
      if (!productId) return [];

      // Fetch orders containing the current product (limited for performance)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('items')
        .in('status', ['paid', 'processing', 'shipped', 'delivered'])
        .limit(200); // Reduced from 500 for better performance

      if (ordersError) {
        console.log('Could not fetch order data for co-purchases:', ordersError.message);
        return [];
      }

      if (!orders || orders.length === 0) return [];

      // Find orders containing the current product
      const coPurchaseCounts: Record<string, { count: number; name: string; price: number; image?: string }> = {};
      
      for (const order of orders) {
        const items = order.items;
        if (!isOrderItemArray(items)) continue;

        // Check if this order contains our product
        const containsProduct = items.some(item => item.id === productId);
        
        if (containsProduct) {
          // Count other products in this order
          for (const item of items) {
            if (item.id !== productId) {
              if (!coPurchaseCounts[item.id]) {
                coPurchaseCounts[item.id] = {
                  count: 0,
                  name: item.name,
                  price: item.price,
                  image: item.image,
                };
              }
              coPurchaseCounts[item.id].count += item.quantity;
            }
          }
        }
      }

      // Get product IDs sorted by frequency
      const sortedProductIds = Object.entries(coPurchaseCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([id]) => id);

      if (sortedProductIds.length === 0) return [];

      // Fetch full product details for co-purchased products
      const { data: productDetails, error: productsError } = await supabase
        .from('products_public')
        .select('id, name, price, image_url, slug, category')
        .in('id', sortedProductIds);

      if (productsError) {
        console.error('Error fetching product details:', productsError);
        return [];
      }

      // Merge with frequency data and sort
      const enrichedProducts: CoPurchaseProduct[] = [];
      
      if (productDetails && Array.isArray(productDetails)) {
        for (const product of productDetails) {
          const p = product as { id: string | null; name: string | null; price: number | null; image_url: string | null; slug: string | null; category: string | null };
          if (p.id) {
            enrichedProducts.push({
              id: p.id,
              name: p.name || '',
              price: p.price || 0,
              image_url: p.image_url || null,
              slug: p.slug || null,
              category: p.category || null,
              frequency: coPurchaseCounts[p.id]?.count || 0,
            });
          }
        }
      }
      
      enrichedProducts.sort((a, b) => b.frequency - a.frequency);
      return enrichedProducts.filter(p => p.frequency > 0);
    },
    enabled: !!productId,
    staleTime: 10 * 60 * 1000, // 10 minutes - co-purchase data doesn't change often
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  return { products, isLoading, error: error?.message || null };
};