import { useRef } from 'react';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ProductCard, Product } from '@/components/products/ProductCard';

interface RecentlyViewedCarouselProps {
  products: Product[];
  title?: string;
  subtitle?: string;
}

export const RecentlyViewedCarousel = ({
  products,
  title = 'Recently Viewed',
  subtitle = 'Products you viewed earlier',
}: RecentlyViewedCarouselProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
              transition={{ delay: 0.1 * idx }}
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
      <div className="flex justify-center gap-1 mt-4 md:hidden">
        <span className="text-xs text-muted-foreground">Swipe for more →</span>
      </div>
    </motion.section>
  );
};
