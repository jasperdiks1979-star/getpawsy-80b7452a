import { useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wand2, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { trackCrossSellImpression, trackCrossSellClick, trackCrossSellAddToCart } from '@/lib/analytics';
import { getCanonicalCardPrice, getCanonicalPrice } from '@/lib/canonical-pricing';

interface Product {
  id: string;
  name: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  category?: string | null;
  slug?: string | null;
}

interface CompleteTheLookProps {
  products: Product[];
  isLoading?: boolean;
  currentProductName: string;
  sourceProductId: string;
  sourceProductName: string;
}

const CompleteTheLookSkeleton = () => (
  <div className="bg-gradient-to-br from-accent/30 via-background to-primary/5 rounded-2xl p-6 border border-accent/20">
    {/* Header Skeleton */}
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-36 md:w-44" />
          <Skeleton className="h-4 w-44 md:w-56" />
        </div>
      </div>
      {/* Navigation arrows skeleton - Desktop only */}
      <div className="hidden md:flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
    
    {/* Products Carousel Skeleton */}
    <div className="flex gap-4 overflow-hidden -mx-2 px-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div 
          key={i} 
          className="flex-shrink-0 w-[160px] md:w-[200px]"
        >
          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            <Skeleton className="aspect-square w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex items-baseline gap-1.5 pt-1">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
    
    {/* Mobile swipe indicator skeleton */}
    <div className="flex md:hidden justify-center mt-3">
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export const CompleteTheLook = ({
  products,
  isLoading,
  currentProductName,
  sourceProductId,
  sourceProductName,
}: CompleteTheLookProps) => {
  const { addItem } = useCart();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track impression when visible
  useEffect(() => {
    if (products.length === 0 || impressionTracked.current || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          trackCrossSellImpression(
            sourceProductId,
            sourceProductName,
            products.map((p, idx) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              category: p.category || undefined,
              position: idx,
            })),
            'upsell'
          );
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [products, sourceProductId, sourceProductName, isLoading]);

  // Reset tracking when source changes
  useEffect(() => {
    impressionTracked.current = false;
  }, [sourceProductId]);

  const handleProductClick = useCallback((product: Product, index: number) => {
    trackCrossSellClick(
      sourceProductId,
      sourceProductName,
      {
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category || undefined,
        position: index,
      },
      'upsell'
    );
  }, [sourceProductId, sourceProductName]);

  const handleQuickAdd = useCallback((product: Product, index: number) => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image_url || '/placeholder.svg',
    });

    trackCrossSellAddToCart(
      sourceProductId,
      sourceProductName,
      {
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category || undefined,
        position: index,
      },
      1,
      'upsell'
    );

    toast.success('Added to cart', {
      description: product.name,
      duration: 2000,
    });
  }, [addItem, sourceProductId, sourceProductName]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 280;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (isLoading) {
    return <CompleteTheLookSkeleton />;
  }

  if (products.length === 0) {
    return null;
  }

  // Extract product type for display
  const productType = currentProductName.toLowerCase().split(' ').pop() || 'item';

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-gradient-to-br from-accent/30 via-background to-primary/5 rounded-2xl p-6 border border-accent/20"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
            <Wand2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Complete the Look</h3>
            <p className="text-sm text-muted-foreground">
              Perfect additions for your {productType}
            </p>
          </div>
        </div>

        {/* Navigation arrows - Desktop only */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => scroll('right')}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Products Grid/Scroll */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide -mx-2 px-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {products.map((product, index) => {
          const productUrl = product.slug 
            ? `/product/${product.slug}` 
            : `/product/${product.id}`;
          const discount = product.compare_at_price 
            ? Math.round((1 - product.price / product.compare_at_price) * 100)
            : 0;

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="flex-shrink-0 w-[160px] md:w-[200px] snap-start group"
            >
              <div className="bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                {/* Image */}
                <Link 
                  to={productUrl}
                  onClick={() => handleProductClick(product, index)}
                  className="block relative aspect-square overflow-hidden"
                >
                  <img
                    src={product.image_url || '/placeholder.svg'}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {discount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute top-2 left-2 text-xs"
                    >
                      -{discount}%
                    </Badge>
                  )}
                </Link>

                {/* Content */}
                <div className="p-3">
                  <Link 
                    to={productUrl}
                    onClick={() => handleProductClick(product, index)}
                  >
                    <h4 className="text-sm font-medium line-clamp-2 hover:text-primary transition-colors min-h-[2.5rem]">
                      {product.name}
                    </h4>
                  </Link>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-primary">
                        ${product.price.toFixed(2)}
                      </span>
                      {product.compare_at_price && (
                        <span className="text-xs text-muted-foreground line-through">
                          ${product.compare_at_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Add Button */}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full mt-2 gap-1.5 text-xs h-8"
                    onClick={() => handleQuickAdd(product, index)}
                  >
                    <ShoppingCart className="w-3 h-3" />
                    Add
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Mobile swipe indicator */}
      <div className="flex md:hidden justify-center mt-3">
        <span className="text-xs text-muted-foreground">
          Swipe for more →
        </span>
      </div>
    </motion.div>
  );
};
