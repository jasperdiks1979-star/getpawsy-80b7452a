import { useRef, useEffect, useCallback } from 'react';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ProductCard, Product } from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { trackCrossSellImpression, trackCrossSellClick } from '@/lib/analytics';

interface RelatedProductsCarouselProps {
  products: Product[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  listId?: string;
  listName?: string;
  sourceProductId?: string;
  sourceProductName?: string;
  crossSellType?: 'related_products' | 'frequently_bought' | 'upsell' | 'cart_upsell';
}

const CarouselSkeleton = () => (
  <div className="flex gap-4 overflow-hidden">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="flex-shrink-0 w-[45%] sm:w-[35%] md:w-[28%] lg:w-[22%] xl:w-[18%]">
        <div className="space-y-3">
          <Skeleton className="aspect-square rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const RelatedProductsCarousel = ({
  products,
  isLoading = false,
  title = 'You May Also Like',
  subtitle = 'Discover products that complement your choice',
  listId = 'related-products',
  listName = 'Related Products',
  sourceProductId = '',
  sourceProductName = '',
  crossSellType = 'related_products',
}: RelatedProductsCarouselProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasTrackedImpression = useRef(false);

  // Track impression when carousel becomes visible
  useEffect(() => {
    if (products.length > 0 && sourceProductId && !hasTrackedImpression.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !hasTrackedImpression.current) {
            hasTrackedImpression.current = true;
            trackCrossSellImpression(
              sourceProductId,
              sourceProductName,
              products.map((p, idx) => ({
                id: p.id,
                name: p.name,
                price: Number(p.price) || 0,
                category: p.category || undefined,
                position: idx,
              })),
              crossSellType
            );
          }
        },
        { threshold: 0.5 }
      );

      if (scrollContainerRef.current) {
        observer.observe(scrollContainerRef.current);
      }

      return () => observer.disconnect();
    }
  }, [products, sourceProductId, sourceProductName, crossSellType]);

  // Reset impression tracking when source product changes
  useEffect(() => {
    hasTrackedImpression.current = false;
  }, [sourceProductId]);

  const handleProductClick = useCallback((product: Product, position: number) => {
    if (sourceProductId) {
      trackCrossSellClick(
        sourceProductId,
        sourceProductName,
        {
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          category: product.category || undefined,
          position,
        },
        crossSellType
      );
    }
  }, [sourceProductId, sourceProductName, crossSellType]);

  if (isLoading) {
    return (
      <section className="w-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </div>
        <CarouselSkeleton />
      </section>
    );
  }

  if (!products || products.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const scrollAmount = container.clientWidth * 0.6;
    
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="w-full max-w-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        
        {/* Navigation Arrows - Desktop Only */}
        {products.length > 4 && (
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => scroll('left')}
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => scroll('right')}
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Carousel Container */}
      <div className="relative -mx-4 md:mx-0">
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth px-4 md:px-0 pb-2"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {products.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * Math.min(idx, 5) }}
              className="flex-shrink-0 w-[45%] sm:w-[35%] md:w-[28%] lg:w-[22%] xl:w-[18%]"
              style={{ scrollSnapAlign: 'start' }}
              onClick={() => handleProductClick(product, idx)}
            >
              <ProductCard 
                product={product} 
                listId={listId}
                listName={listName}
                position={idx}
              />
            </motion.div>
          ))}
        </div>

        {/* Fade edges - Desktop only */}
        <div className="hidden md:block absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
        <div className="hidden md:block absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
      </div>

      {/* Scroll indicator - Mobile Only */}
      {products.length > 2 && (
        <div className="flex justify-center gap-1 mt-4 md:hidden">
          <span className="text-xs text-muted-foreground">Swipe for more →</span>
        </div>
      )}
    </motion.section>
  );
};
