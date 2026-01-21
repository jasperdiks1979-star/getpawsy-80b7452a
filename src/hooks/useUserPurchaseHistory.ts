import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PurchasedProduct {
  productId: string;
  category: string | null;
  purchasedAt: string;
  quantity: number;
}

interface OrderItem {
  id: string;
  name: string;
  category?: string;
  quantity: number;
}

export const useUserPurchaseHistory = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-purchase-history', user?.id],
    queryFn: async (): Promise<PurchasedProduct[]> => {
      if (!user?.id) return [];

      const { data: orders, error } = await supabase
        .from('orders')
        .select('items, created_at')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!orders) return [];

      const purchasedProducts: PurchasedProduct[] = [];

      orders.forEach((order) => {
        const items = order.items as unknown as OrderItem[] | null;
        if (!items || !Array.isArray(items)) return;

        items.forEach((item) => {
          purchasedProducts.push({
            productId: item.id,
            category: item.category || null,
            purchasedAt: order.created_at,
            quantity: item.quantity || 1,
          });
        });
      });

      return purchasedProducts;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Get unique categories from purchase history, weighted by recency and quantity
 */
export const getCategoryPreferences = (
  purchases: PurchasedProduct[]
): Map<string, number> => {
  const categoryScores = new Map<string, number>();
  const now = Date.now();
  const oneMonth = 30 * 24 * 60 * 60 * 1000;

  purchases.forEach((purchase) => {
    if (!purchase.category) return;

    const category = purchase.category.toLowerCase();
    const purchaseAge = now - new Date(purchase.purchasedAt).getTime();
    
    // Recency weight: more recent = higher weight
    const recencyWeight = Math.max(0.2, 1 - purchaseAge / (3 * oneMonth));
    
    // Quantity weight
    const quantityWeight = Math.min(purchase.quantity, 5) / 5;
    
    const score = (recencyWeight + quantityWeight) / 2;
    const currentScore = categoryScores.get(category) || 0;
    categoryScores.set(category, currentScore + score);
  });

  return categoryScores;
};

/**
 * Get product IDs that the user has already purchased
 */
export const getPurchasedProductIds = (purchases: PurchasedProduct[]): Set<string> => {
  return new Set(purchases.map((p) => p.productId));
};
