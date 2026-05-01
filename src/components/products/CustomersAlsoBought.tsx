import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Users, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/contexts/CartContext';
import { useCustomersAlsoBought } from '@/hooks/useCustomersAlsoBought';
import { toast } from 'sonner';
import { trackCrossSellImpression, trackCrossSellClick, trackCrossSellAddToCart } from '@/lib/analytics';
import { buildOptimizedImageUrl } from '@/lib/image-optimizer';

interface CustomersAlsoBoughtProps {
  productId: string;
  productName: string;
  maxItems?: number;
}

export const CustomersAlsoBought = ({
  productId,
  productName,
  maxItems = 4,
}: CustomersAlsoBoughtProps) => {
  const { addItem } = useCart();
  const { products, isLoading, error } = useCustomersAlsoBought(productId, maxItems);
  const impressionTracked = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track impression when visible
  useEffect(() => {
    if (products.length === 0 || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          trackCrossSellImpression(
            productId,
            productName,
            products.map((p, idx) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              category: p.category || undefined,
              position: idx,
            })),
            'customers_also_bought'
          );
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [products, productId, productName]);

  const handleProductClick = (product: typeof products[0], index: number) => {
    trackCrossSellClick(
      productId,
      productName,
      {
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category || undefined,
        position: index,
      },
      'customers_also_bought'
    );
  };

  const handleQuickAdd = (product: typeof products[0], index: number) => {
    addItem({
      id: product.id,
      slug: (product as any).slug ?? undefined,
      name: product.name,
      price: product.price,
      image: product.image_url || '/placeholder.svg',
    });

    trackCrossSellAddToCart(
      productId,
      productName,
      {
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category || undefined,
        position: index,
      },
      1,
      'customers_also_bought'
    );

    toast.success(`${product.name} added to cart`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-44 md:w-52" />
            <Skeleton className="h-4 w-36 md:w-40" />
          </div>
        </div>
        {/* Products Grid Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div 
              key={i} 
              className="bg-card rounded-xl border shadow-sm overflow-hidden"
            >
              <Skeleton className="aspect-square w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
                {/* Frequency indicator skeleton */}
                <div className="flex items-center gap-1">
                  <Skeleton className="w-1.5 h-1.5 rounded-full" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || products.length === 0) {
    return null;
  }

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-full bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-200 dark:border-blue-800">
          <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Customers Also Bought</h3>
          <p className="text-sm text-muted-foreground">
            Based on real purchase data
          </p>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((product, index) => {
          const productUrl = `/product/${product.id}`;

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="group relative bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Popularity Badge */}
              {product.frequency >= 3 && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                  <TrendingUp className="w-3 h-3" />
                  Popular
                </div>
              )}

              {/* Product Image */}
              <Link
                to={productUrl}
                onClick={() => handleProductClick(product, index)}
                className="block aspect-square overflow-hidden"
              >
                <img
                  src={buildOptimizedImageUrl(product.image_url || '/placeholder.svg', { w: 320, q: 'auto' })}
                  alt={product.name}
                  width={320}
                  height={320}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              {/* Product Info */}
              <div className="p-3 space-y-2">
                <Link
                  to={productUrl}
                  onClick={() => handleProductClick(product, index)}
                >
                  <h4 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                    {product.name}
                  </h4>
                </Link>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-primary">
                    €{product.price.toFixed(2)}
                  </span>
                  
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-2 gap-1 text-xs"
                    onClick={() => handleQuickAdd(product, index)}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    Add
                  </Button>
                </div>

                {/* Purchase Frequency Indicator */}
                {product.frequency >= 2 && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Bought together {product.frequency}x
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};