import { Link } from 'react-router-dom';
import { ShoppingCart, Dumbbell } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackCrossSellImpression, trackCrossSellClick, trackCrossSellAddToCart } from '@/lib/analytics';
import { getCanonicalPrice } from '@/lib/canonical-pricing';
import { useRef, useEffect } from 'react';
import { buildOptimizedImageUrl } from '@/lib/image-optimizer';

const TRAINING_CATEGORIES = [
  'dog-harness', 'dog-leash', 'dog-training', 'training-treats',
  'harness', 'leash', 'training', 'collar',
];

interface Props {
  productId: string;
  productName: string;
  productCategory: string;
  maxItems?: number;
}

export function CustomersAlsoTrainWith({ productId, productName, productCategory, maxItems = 4 }: Props) {
  const { addItem } = useCart();
  const impressionTracked = useRef(false);

  const isTrainingProduct = TRAINING_CATEGORIES.some(cat =>
    productCategory.toLowerCase().includes(cat) ||
    productName.toLowerCase().includes('harness') ||
    productName.toLowerCase().includes('leash') ||
    productName.toLowerCase().includes('training')
  );

  const { data: products = [] } = useQuery({
    queryKey: ['also-train-with', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, price, compare_at_price, image_url, slug, category')
        .neq('id', productId)
        .eq('is_active', true)
        .gt('stock', 0)
        .or(TRAINING_CATEGORIES.map(c => `category.ilike.%${c}%`).join(','))
        .limit(maxItems * 3);

      if (error) throw error;

      const catCounts = new Map<string, number>();
      const diversified = (data || []).filter(p => {
        const cat = (p.category || '').toLowerCase();
        if (cat === productCategory.toLowerCase()) return false;
        const count = catCounts.get(cat) || 0;
        if (count >= 2) return false;
        catCounts.set(cat, count + 1);
        return true;
      });

      return diversified.slice(0, maxItems);
    },
    enabled: isTrainingProduct,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (products.length === 0 || impressionTracked.current) return;
    impressionTracked.current = true;
    trackCrossSellImpression(
      productId,
      productName,
      products.map((p, idx) => ({ id: p.id, name: p.name, price: Number(p.price), position: idx + 1 })),
      'customers_also_bought'
    );
  }, [products, productId, productName]);

  if (!isTrainingProduct || products.length === 0) return null;

  return (
    <div className="mt-16">
      <div className="flex items-center gap-2 mb-6">
        <Dumbbell className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-display font-bold">Customers Also Train With</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Pet parents who bought {productName.split(' ').slice(0, 4).join(' ')} also use these training essentials
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((product, idx) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-card border rounded-xl overflow-hidden group"
          >
            <Link
              to={`/product/${product.slug || product.id}`}
              onClick={() => trackCrossSellClick(
                productId,
                productName,
                { id: product.id, name: product.name, price: Number(product.price), position: idx + 1 },
                'customers_also_bought'
              )}
            >
              <div className="aspect-square overflow-hidden bg-muted/30">
                <img
                  src={buildOptimizedImageUrl(product.image_url || '/placeholder.svg', { w: 320, q: 'auto' })}
                  alt={product.name}
                  width={320}
                  height={320}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </Link>
            <div className="p-3">
              <Link
                to={`/product/${product.slug || product.id}`}
                className="text-sm font-medium line-clamp-2 hover:text-primary transition-colors"
              >
                {product.name}
              </Link>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-sm font-bold">${getCanonicalPrice(product).toFixed(2)}</span>
                {product.compare_at_price && Number(product.compare_at_price) > getCanonicalPrice(product) && (
                  <span className="text-xs text-muted-foreground line-through">
                    ${Number(product.compare_at_price).toFixed(2)}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2 text-xs gap-1.5"
                onClick={() => {
                  addItem({
                    id: product.id,
                    name: product.name,
                    price: Number(product.price),
                    image: product.image_url || '/placeholder.svg',
                  });
                  trackCrossSellAddToCart(
                    productId,
                    productName,
                    { id: product.id, name: product.name, price: Number(product.price), position: idx + 1 },
                    1,
                    'customers_also_bought'
                  );
                  toast.success('Added to cart!');
                }}
              >
                <ShoppingCart className="w-3 h-3" />
                Add to Cart
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
