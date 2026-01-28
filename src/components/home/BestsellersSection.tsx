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
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!api) return;

    const onSelect = () => {
      setCurrent(api.selectedScrollSnap());
    };

    setScrollSnaps(api.scrollSnapList());
    api.on('select', onSelect);
    api.on('reInit', () => {
      setScrollSnaps(api.scrollSnapList());
      onSelect();
    });
    
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  // Calculate the visual state for each card based on distance from center
  const getCardStyle = (index: number) => {
    const totalItems = bestsellers.length;
    
    // Calculate distance from current slide (accounting for loop)
    let distance = index - current;
    if (distance > totalItems / 2) distance -= totalItems;
    if (distance < -totalItems / 2) distance += totalItems;
    
    const absDistance = Math.abs(distance);
    
    // On mobile: only show the active card prominently, hide others more
    if (isMobile) {
      const scale = absDistance === 0 ? 1 : absDistance === 1 ? 0.7 : 0.5;
      const zIndex = 10 - absDistance;
      const opacity = absDistance === 0 ? 1 : absDistance === 1 ? 0.4 : 0.2;
      // No 3D rotation on mobile to prevent overlap
      const rotateY = 0;
      const translateY = 0;
      
      return {
        scale,
        zIndex,
        opacity,
        rotateY,
        translateY,
        isActive: absDistance === 0,
        isAdjacent: absDistance === 1,
      };
    }
    
    // Desktop: full 3D coverflow effect - no negative translateY to prevent clipping
    const scale = absDistance === 0 ? 1.08 : absDistance === 1 ? 0.82 : 0.68;
    const zIndex = 10 - absDistance;
    const opacity = absDistance === 0 ? 1 : absDistance === 1 ? 0.85 : 0.6;
    const rotateY = distance * -12;
    const translateY = absDistance === 0 ? 0 : absDistance === 1 ? 8 : 16;
    
    return {
      scale,
      zIndex,
      opacity,
      rotateY,
      translateY,
      isActive: absDistance === 0,
      isAdjacent: absDistance === 1,
    };
  };

  return (
    <div className="relative pt-8 pb-4 md:pt-10 md:pb-6">
      {/* Carousel Controls - Desktop */}
      <div className="hidden md:flex absolute -left-6 -right-6 top-1/2 -translate-y-1/2 justify-between pointer-events-none z-20">
        <Button
          variant="outline"
          size="icon"
          onClick={scrollPrev}
          className="pointer-events-auto rounded-full shadow-2xl bg-white/90 backdrop-blur-md hover:bg-white border-0 h-14 w-14 hover:scale-110 transition-all duration-300 ring-1 ring-black/5"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={scrollNext}
          className="pointer-events-auto rounded-full shadow-2xl bg-white/90 backdrop-blur-md hover:bg-white border-0 h-14 w-14 hover:scale-110 transition-all duration-300 ring-1 ring-black/5"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>

      <Carousel
        setApi={setApi}
        opts={{
          align: 'center',
          loop: true,
          skipSnaps: false,
        }}
        plugins={[
          Autoplay({
            delay: 4000,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
          }),
        ]}
        className="w-full"
      >
        <CarouselContent className="-ml-4 md:-ml-4" style={{ perspective: '1200px' }}>
          <AnimatePresence mode="sync">
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

              const cardStyle = getCardStyle(index);

              return (
                <CarouselItem 
                  key={bestseller.id} 
                  className="pl-4 md:pl-4 basis-[92%] sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
                  style={{ zIndex: cardStyle.zIndex }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.8 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ 
                      delay: index * 0.1,
                      duration: 0.6,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    <motion.div
                      animate={{
                        scale: cardStyle.scale,
                        opacity: cardStyle.opacity,
                        rotateY: cardStyle.rotateY,
                        y: cardStyle.translateY,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                        mass: 0.8,
                      }}
                      whileHover={cardStyle.isActive ? { 
                        scale: 1.12,
                        transition: { type: "spring", stiffness: 400, damping: 25 }
                      } : undefined}
                      style={{ 
                        transformStyle: 'preserve-3d',
                        transformOrigin: 'center top',
                      }}
                      className="relative"
                    >
                      {/* Glow effect for active card - enhanced */}
                      {cardStyle.isActive && (
                        <>
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.6 }}
                            exit={{ opacity: 0 }}
                            className="absolute -inset-6 bg-gradient-to-br from-amber-400/30 via-orange-500/25 to-rose-400/20 rounded-[2rem] blur-3xl -z-10"
                          />
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.4 }}
                            exit={{ opacity: 0 }}
                            className="absolute -inset-3 bg-gradient-to-tr from-primary/20 to-amber-300/20 rounded-3xl blur-xl -z-10"
                          />
                        </>
                      )}
                      
                      <Link
                        to={`/bestseller/${safeSlug}`}
                        className={`group block overflow-hidden transition-all duration-500 ${
                          cardStyle.isActive 
                            ? 'rounded-2xl bg-white ring-2 ring-amber-200/60 shadow-[0_20px_60px_-15px_rgba(251,146,60,0.35)]' 
                            : cardStyle.isAdjacent 
                              ? 'rounded-xl bg-card/80 shadow-lg ring-1 ring-black/5' 
                              : 'rounded-xl bg-card/60 shadow-md'
                        }`}
                      >
                        {/* Image Container with glass overlay */}
                        <div className="relative aspect-square overflow-hidden">
                          {/* Subtle inner shine effect */}
                          {cardStyle.isActive && (
                            <div className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                          )}
                          
                          {/* Rank Badge - enhanced with glow */}
                          <div className="absolute top-3 left-3 z-10">
                            <Badge className={`px-3 py-1.5 text-xs font-bold transition-all duration-300 ${
                              cardStyle.isActive 
                                ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white border-0 scale-110 shadow-lg shadow-orange-500/40' 
                                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-md'
                            }`}>
                              <Award className="w-3.5 h-3.5 mr-1" />
                              #{bestseller.rank}
                            </Badge>
                          </div>

                          {/* Discount Badge - enhanced */}
                          {discount > 0 && (
                            <div className="absolute top-3 right-3 z-10">
                              <Badge className={`px-2.5 py-1 text-xs font-bold transition-all duration-300 bg-gradient-to-r from-red-500 to-rose-600 text-white border-0 ${
                                cardStyle.isActive ? 'scale-110 shadow-lg shadow-red-500/30' : 'shadow-md'
                              }`}>
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
                            className={`w-full h-full object-cover transition-all duration-700 ${
                              cardStyle.isActive 
                                ? 'group-hover:scale-110 saturate-105' 
                                : 'filter brightness-90 saturate-90'
                            }`}
                          />

                          {/* Overlay on hover - only for active card */}
                          {cardStyle.isActive && (
                            <>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                              
                              {/* View Button on hover - glassmorphism style */}
                              <div className="absolute inset-0 flex items-end justify-center pb-6 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0">
                                <motion.span 
                                  className="bg-white/95 backdrop-blur-sm text-foreground px-6 py-2.5 rounded-full text-sm font-semibold shadow-xl flex items-center gap-2 ring-1 ring-black/5"
                                  whileHover={{ scale: 1.05 }}
                                >
                                  View Product
                                  <ArrowRight className="w-4 h-4" />
                                </motion.span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Content */}
                        <div className={`p-4 transition-all duration-300 ${
                          cardStyle.isActive ? 'bg-card' : 'bg-muted/30'
                        }`}>
                          {/* Category */}
                          {safeCategory && (
                            <p className={`text-xs font-medium mb-1 truncate transition-colors duration-300 ${
                              cardStyle.isActive ? 'text-primary' : 'text-muted-foreground'
                            }`}>
                              {safeCategory}
                            </p>
                          )}

                          {/* Product Name */}
                          <h3 className={`font-semibold text-sm mb-2 line-clamp-2 transition-colors duration-300 ${
                            cardStyle.isActive ? 'group-hover:text-primary' : ''
                          }`}>
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
                            <span className={`text-lg font-bold transition-colors duration-300 ${
                              cardStyle.isActive ? 'text-primary' : 'text-foreground'
                            }`}>
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
                  </motion.div>
                </CarouselItem>
              );
            })}
          </AnimatePresence>
        </CarouselContent>
      </Carousel>

      {/* Enhanced Dots Indicator */}
      <div className="flex justify-center items-center gap-2 mt-8">
        {bestsellers.map((_, index) => {
          const isActive = current === index;
          return (
            <motion.button
              key={index}
              onClick={() => api?.scrollTo(index)}
              className={`rounded-full transition-all duration-300 ${
                isActive 
                  ? 'bg-gradient-to-r from-primary to-amber-500' 
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              animate={{
                width: isActive ? 32 : 10,
                height: 10,
              }}
              whileHover={{ scale: 1.2 }}
              aria-label={`Go to slide ${index + 1}`}
            />
          );
        })}
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
    <section className="pt-12 pb-16 bg-gradient-to-b from-primary/5 via-accent/5 to-background overflow-visible">
      <div className="container px-4 md:px-6 overflow-visible">
        {/* Header - Minimal */}
        <motion.div 
          className="text-center mb-2"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-medium mb-1">
            <Award className="w-3 h-3" />
            Top Products
          </div>
          <h2 className="text-2xl md:text-3xl font-display font-bold">
            Bestsellers
          </h2>
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
