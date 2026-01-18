import { Link } from 'react-router-dom';
import { Plus, Sparkles, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface CartUpsellProps {
  currentItemIds: string[];
  variant?: 'default' | 'compact';
  maxItems?: number;
}

export const CartUpsell = ({ currentItemIds, variant = 'default', maxItems = 4 }: CartUpsellProps) => {
  const { addItem } = useCart();

  // Extract base product IDs (remove variant suffixes)
  const baseProductIds = currentItemIds.map(id => id.split('-')[0]);

  // Fetch cart items to get categories
  const { data: cartProducts } = useQuery({
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
  const { data: upsellProducts } = useQuery({
    queryKey: ['upsell-products', cartCategories, baseProductIds],
    queryFn: async () => {
      if (cartCategories.length === 0) {
        // If no categories, fetch bestsellers or random products
        const { data, error } = await supabase
          .from('products_public')
          .select('*')
          .eq('is_active', true)
          .gt('stock', 0)
          .limit(maxItems * 2);
        
        if (error) throw error;
        
        // Filter out cart items and shuffle
        return (data || [])
          .filter(p => !baseProductIds.includes(p.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, maxItems);
      }

      // Fetch products from same categories
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .eq('is_active', true)
        .gt('stock', 0)
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

  const handleQuickAdd = (product: typeof upsellProducts[0]) => {
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    toast.success(`${product.name} added to cart!`);
  };

  if (!upsellProducts || upsellProducts.length === 0) {
    return null;
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-3">
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
              <Link to={`/product/${product.id}`} className="shrink-0">
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  className="w-12 h-12 object-cover rounded-md"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/product/${product.id}`}>
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {product.name}
                  </p>
                </Link>
                <p className="text-sm text-primary font-semibold">
                  ${Number(product.price).toFixed(2)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-8 w-8 p-0 hover:bg-primary hover:text-primary-foreground"
                onClick={() => handleQuickAdd(product)}
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
    <div className="space-y-4">
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
            <Link to={`/product/${product.id}`} className="block">
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </Link>
            <div className="p-3">
              <Link to={`/product/${product.id}`}>
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
                  onClick={() => handleQuickAdd(product)}
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
