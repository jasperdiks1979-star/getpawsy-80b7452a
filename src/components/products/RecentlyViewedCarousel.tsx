import { useRef } from 'react';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductCard, Product } from '@/components/products/ProductCard';

interface RecentlyViewedCarouselProps {
  products: Product[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
}

const CarouselSkeleton = () => (
  <div className="flex gap-4 overflow-hidden">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="flex-shrink-0 w-[45%] sm:w-[35%] md:w-[28%] lg:w-[22%] xl:w-[18%]">
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <Skeleton className="aspect-square w-full" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center justify-between gap-2 pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const RecentlyViewedCarousel = ({
  products,
  isLoading = false,
  title = 'Recently Viewed',
  subtitle = 'Products you viewed earlier',
}: RecentlyViewedCarouselProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <section className="w-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-48" />
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
      transition={{ delay: 0.5 }}
      className="w-full max-w-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-secondary-foreground" />
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
            >
              <ProductCard 
                product={product} 
                listId="recently-viewed"
                listName="Recently Viewed"
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
