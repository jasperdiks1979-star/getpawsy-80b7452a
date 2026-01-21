import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

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
  const [products, setProducts] = useState<CoPurchaseProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoPurchases = async () => {
      if (!productId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Fetch all paid orders
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('items')
          .eq('status', 'paid')
          .limit(500);

        if (ordersError) {
          console.log('Could not fetch order data for co-purchases:', ordersError.message);
          setProducts([]);
          setIsLoading(false);
          return;
        }

        if (!orders || orders.length === 0) {
          setProducts([]);
          setIsLoading(false);
          return;
        }

        // Find orders containing the current product
        const coPurchaseCounts: Record<string, { count: number; name: string; price: number; image?: string }> = {};
        
        orders.forEach(order => {
          const items = order.items;
          if (!isOrderItemArray(items)) return;

          // Check if this order contains our product
          const containsProduct = items.some(item => item.id === productId);
          
          if (containsProduct) {
            // Count other products in this order
            items.forEach(item => {
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
            });
          }
        });

        // Get product IDs sorted by frequency
        const sortedProductIds = Object.entries(coPurchaseCounts)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, limit)
          .map(([id]) => id);

        if (sortedProductIds.length === 0) {
          setProducts([]);
          setIsLoading(false);
          return;
        }

        // Fetch full product details for co-purchased products
        const { data: productDetails, error: productsError } = await supabase
          .from('products_public')
          .select('id, name, price, image_url, category')
          .in('id', sortedProductIds);

        if (productsError) {
          console.error('Error fetching product details:', productsError);
          setProducts([]);
          setIsLoading(false);
          return;
        }

        // Merge with frequency data and sort
        const enrichedProducts: CoPurchaseProduct[] = (productDetails || [])
          .filter(product => product.id !== null)
          .map(product => ({
            id: product.id!,
            name: product.name || '',
            price: product.price || 0,
            image_url: product.image_url,
            category: product.category,
            frequency: coPurchaseCounts[product.id!]?.count || 0,
          }))
          .filter(p => p.frequency > 0)
          .sort((a, b) => b.frequency - a.frequency);

        setProducts(enrichedProducts);
      } catch (err) {
        console.error('Error in useCustomersAlsoBought:', err);
        setError('Failed to load recommendations');
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCoPurchases();
  }, [productId, limit]);

  return { products, isLoading, error };
};
