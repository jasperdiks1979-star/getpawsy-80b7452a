import { memo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  trackCrossSellImpression, 
  trackCrossSellClick, 
  trackCrossSellAddToCart 
} from '@/lib/analytics';
import { getCanonicalPrice } from '@/lib/canonical-pricing';

interface CartUpsellProps {
  currentItemIds: string[];
  variant?: 'default' | 'compact';
  maxItems?: number;
}

// Skeleton for compact variant
const CompactUpsellSkeleton = memo(() => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-32" />
    </div>
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
          <Skeleton className="w-12 h-12 rounded-md shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  </div>
));
CompactUpsellSkeleton.displayName = 'CompactUpsellSkeleton';

// Skeleton for default variant
const DefaultUpsellSkeleton = memo(({ count = 4 }: { count?: number }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <Skeleton className="h-5 w-5 rounded" />
      <Skeleton className="h-6 w-44" />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-card rounded-xl overflow-hidden shadow-card">
          <Skeleton className="aspect-square w-full" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center justify-between pt-1">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
));
DefaultUpsellSkeleton.displayName = 'DefaultUpsellSkeleton';

export const CartUpsell = ({ currentItemIds, variant = 'default', maxItems = 4 }: CartUpsellProps) => {
  const { addItem } = useCart();

  // Extract base product IDs (remove variant suffixes)
  const baseProductIds = currentItemIds.map(id => id.split('-')[0]);

  // Fetch cart items to get categories
  const { data: cartProducts, isLoading: isLoadingCart } = useQuery({
    queryKey: ['cart-products', baseProductIds],
    queryFn: async () => {
      if (baseProductIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('products_public')
        .select('id, category')
        .in('id', baseProductIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: baseProductIds.length > 0,
  });

  // Get unique categories from cart items
  const cartCategories = [...new Set(cartProducts?.map(p => p.category).filter(Boolean) || [])];

  // Fetch upsell products (related by category, not in cart)
  const { data: upsellProducts, isLoading: isLoadingUpsell } = useQuery({
    queryKey: ['upsell-products', cartCategories, baseProductIds],
    queryFn: async () => {
      if (cartCategories.length === 0) {
        // If no categories, fetch bestsellers or random active products
        // Fetch active products (products_public already filters duplicates)
        const { data, error } = await supabase
          .from('products_public')
          .select('*')
          .eq('is_active', true)
          .limit(maxItems * 2);
        
        if (error) throw error;
        
        // Filter out cart items and shuffle
        return (data || [])
          .filter(p => !baseProductIds.includes(p.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, maxItems);
      }

      // Fetch products from same categories
      // Fetch products from same categories (products_public filters duplicates)
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .in('category', cartCategories)
        .limit(maxItems * 3);
      
      if (error) throw error;
      
      // Filter out cart items and prioritize by stock/random
      return (data || [])
        .filter(p => !baseProductIds.includes(p.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, maxItems);
    },
    enabled: cartProducts !== undefined,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const isLoading = isLoadingCart || isLoadingUpsell;
  const hasTrackedImpression = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track impression when upsell products are visible
  useEffect(() => {
    if (upsellProducts && upsellProducts.length > 0 && !hasTrackedImpression.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !hasTrackedImpression.current) {
            hasTrackedImpression.current = true;
            trackCrossSellImpression(
              'cart',
              'Shopping Cart',
              upsellProducts.map((p, idx) => ({
                id: p.id,
                name: p.name,
                price: Number(p.price) || 0,
                category: p.category || undefined,
                position: idx,
              })),
              'cart_upsell'
            );
          }
        },
        { threshold: 0.3 }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      return () => observer.disconnect();
    }
  }, [upsellProducts]);

  // Reset impression tracking when cart items change
  useEffect(() => {
    hasTrackedImpression.current = false;
  }, [baseProductIds.join(',')]);

  const handleProductClick = useCallback((product: typeof upsellProducts[0], position: number) => {
    trackCrossSellClick(
      'cart',
      'Shopping Cart',
      {
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        category: product.category || undefined,
        position,
      },
      'cart_upsell'
    );
  }, []);

  const handleQuickAdd = useCallback((product: typeof upsellProducts[0], position: number) => {
    // Track add to cart from cross-sell
    trackCrossSellAddToCart(
      'cart',
      'Shopping Cart',
      {
        id: product.id,
        name: product.name,
        price: Number(product.price) || 0,
        category: product.category || undefined,
        position,
      },
      1,
      'cart_upsell'
    );

    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    toast.success(`${product.name} added to cart!`);
  }, [addItem]);

  // Show skeleton while loading
  if (isLoading) {
    return variant === 'compact' 
      ? <CompactUpsellSkeleton /> 
      : <DefaultUpsellSkeleton count={maxItems} />;
  }

  if (!upsellProducts || upsellProducts.length === 0) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div ref={containerRef} className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          You might also like
        </h3>
        <div className="space-y-2">
          {upsellProducts.slice(0, 3).map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
            >
              <Link 
                to={`/product/${product.id}`} 
                className="shrink-0"
                onClick={() => handleProductClick(product, index)}
              >
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  className="w-12 h-12 object-cover rounded-md"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link 
                  to={`/product/${product.id}`}
                  onClick={() => handleProductClick(product, index)}
                >
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {product.name}
                  </p>
                </Link>
                <p className="text-sm text-primary font-semibold">
                  ${getCanonicalPrice(product).toFixed(2)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-8 w-8 p-0 hover:bg-primary hover:text-primary-foreground"
                onClick={() => handleQuickAdd(product, index)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Customers Also Bought</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {upsellProducts.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group bg-card rounded-xl overflow-hidden shadow-card hover:shadow-lg transition-all"
          >
            <Link 
              to={`/product/${product.id}`} 
              className="block"
              onClick={() => handleProductClick(product, index)}
            >
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </Link>
            <div className="p-3">
              <Link 
                to={`/product/${product.id}`}
                onClick={() => handleProductClick(product, index)}
              >
                <h4 className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors mb-1">
                  {product.name}
                </h4>
              </Link>
              <div className="flex items-center justify-between">
                <span className="text-primary font-bold">
                  ${Number(product.price).toFixed(2)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1 text-xs"
                  onClick={() => handleQuickAdd(product, index)}
                >
                  <Plus className="w-3 h-3" />
                  Add
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
