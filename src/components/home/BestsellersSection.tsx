import { useMemo, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ui/star-rating';
import { supabase } from '@/integrations/supabase/client';
import { useProductRatings } from '@/hooks/useProductRatings';
import { BestsellersGridSkeleton } from './BestsellersSkeleton';
import { safeString, safePrice } from '@/lib/safe-render';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useIsMobile } from '@/hooks/use-mobile';
import Autoplay from 'embla-carousel-autoplay';

// Carousel item animation variants - staggered entrance
const cardVariants = {
  hidden: { 
    opacity: 0, 
    y: 30,
    scale: 0.9,
  },
  visible: (index: number) => ({ 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      delay: index * 0.15,
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
};

interface BestsellersCarouselProps {
  bestsellers: any[];
  ratingsMap: Record<string, { averageRating: number; reviewCount: number }> | undefined;
}

const BestsellersCarousel = ({ bestsellers, ratingsMap }: BestsellersCarouselProps) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!api) return;

    const onSelect = () => {
      setCurrent(api.selectedScrollSnap());
    };

    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  return (
    <div className="relative">
      {/* Carousel Controls - Desktop */}
      <div className="hidden md:flex absolute -left-4 -right-4 top-1/2 -translate-y-1/2 justify-between pointer-events-none z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={scrollPrev}
          className="pointer-events-auto rounded-full shadow-lg bg-background/90 backdrop-blur-sm hover:bg-background border-border/50"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={scrollNext}
          className="pointer-events-auto rounded-full shadow-lg bg-background/90 backdrop-blur-sm hover:bg-background border-border/50"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <Carousel
        setApi={setApi}
        opts={{
          align: 'start',
          loop: true,
        }}
        plugins={[
          Autoplay({
            delay: 4000,
            stopOnInteraction: true,
            stopOnMouseEnter: true,
          }),
        ]}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          <AnimatePresence>
            {bestsellers.map((bestseller, index) => {
              const product = bestseller.products;
              if (!product) return null;
              
              const productPrice = typeof product.price === 'number' ? product.price : 0;
              const comparePrice = typeof product.compare_at_price === 'number' ? product.compare_at_price : 0;
              const discount = comparePrice > 0
                ? Math.round((1 - productPrice / comparePrice) * 100)
                : 0;

              const productRating = ratingsMap?.[product.id];
              
              const safeName = safeString(product.name);
              const safeHeadline = safeString(bestseller.hero_headline);
              const safeCategory = safeString(product.category);
              const safeImageUrl = safeString(product.image_url) || '/placeholder.svg';
              const safeSlug = safeString(bestseller.slug);

              return (
                <CarouselItem 
                  key={bestseller.id} 
                  className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/5"
                >
                  <motion.div
                    custom={index}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                    variants={cardVariants}
                    whileHover={{ y: -8, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Link
                      to={`/bestseller/${safeSlug}`}
                      className="group block bg-card rounded-2xl overflow-hidden shadow-soft hover:shadow-soft-lg transition-all duration-300"
                    >
                      {/* Image Container */}
                      <div className="relative aspect-square overflow-hidden">
                        {/* Rank Badge */}
                        <div className="absolute top-3 left-3 z-10">
                          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-3 py-1 text-xs font-bold shadow-lg">
                            <Award className="w-3 h-3 mr-1" />
                            #{bestseller.rank}
                          </Badge>
                        </div>

                        {/* Discount Badge */}
                        {discount > 0 && (
                          <div className="absolute top-3 right-3 z-10">
                            <Badge variant="destructive" className="px-2 py-1 text-xs font-bold">
                              -{discount}%
                            </Badge>
                          </div>
                        )}

                        {/* Product Image */}
                        <img
                          src={safeImageUrl}
                          alt={safeName}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />

                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        {/* View Button on hover */}
                        <div className="absolute inset-0 flex items-end justify-center pb-6 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                          <span className="bg-white text-foreground px-4 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2">
                            View Product
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        {/* Category */}
                        {safeCategory && (
                          <p className="text-xs text-primary font-medium mb-1 truncate">
                            {safeCategory}
                          </p>
                        )}

                        {/* Product Name */}
                        <h3 className="font-semibold text-sm mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                          {safeHeadline || safeName}
                        </h3>

                        {/* Rating */}
                        {productRating && productRating.reviewCount > 0 ? (
                          <div className="mb-2">
                            <StarRating 
                              rating={productRating.averageRating} 
                              reviewCount={productRating.reviewCount}
                              size="sm"
                            />
                          </div>
                        ) : null}

                        {/* Price */}
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-primary">
                            ${safePrice(productPrice)}
                          </span>
                          {comparePrice > 0 && (
                            <span className="text-sm text-muted-foreground line-through">
                              ${safePrice(comparePrice)}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                </CarouselItem>
              );
            })}
          </AnimatePresence>
        </CarouselContent>
      </Carousel>

      {/* Dots Indicator */}
      <div className="flex justify-center gap-2 mt-6">
        {bestsellers.map((_, index) => (
          <button
            key={index}
            onClick={() => api?.scrollTo(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              current === index 
                ? 'w-8 bg-primary' 
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export const BestsellersSection = () => {
  const { data: bestsellers, isLoading } = useQuery({
    queryKey: ['homepage-bestsellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          *,
          products:product_id (
            id,
            name,
            price,
            compare_at_price,
            image_url,
            category,
            stock
          )
        `)
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(10);

      if (error) throw error;
      return data?.filter(b => b.products) || [];
    },
  });

  // Get product IDs for ratings
  const productIds = useMemo(() => 
    bestsellers?.map(b => b.products?.id).filter((id): id is string => !!id) || [], 
    [bestsellers]
  );
  
  // Fetch ratings
  const { data: ratingsMap } = useProductRatings(productIds);

  // Don't render if no bestsellers
  if (!isLoading && (!bestsellers || bestsellers.length === 0)) {
    return null;
  }

  return (
    <section className="py-20 bg-gradient-to-b from-primary/5 via-accent/5 to-background">
      <div className="container px-4 md:px-6">
        {/* Header */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-400 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Award className="w-4 h-4" />
            Our Top Products
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Bestsellers
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            The most loved products by pet owners. Discover why thousands of customers choose these products.
          </p>
        </motion.div>

        {/* Loading State */}
        {isLoading && <BestsellersGridSkeleton count={5} />}

        {/* Bestsellers Carousel */}
        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <BestsellersCarousel bestsellers={bestsellers} ratingsMap={ratingsMap} />
        )}

        {/* CTA */}
        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <motion.div 
            className="text-center mt-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Link to="/products">
              <Button size="lg" variant="outline" className="gap-2 rounded-full px-8">
                View All Products
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default BestsellersSection;
