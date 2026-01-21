import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Award, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StarRating } from '@/components/ui/star-rating';
import { supabase } from '@/integrations/supabase/client';
import { useProductRatings } from '@/hooks/useProductRatings';
import { BestsellersGridSkeleton } from './BestsellersSkeleton';
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
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
        .limit(5);

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

        {/* Bestsellers Grid */}
        {!isLoading && bestsellers && bestsellers.length > 0 && (
          <motion.div 
            className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {bestsellers.map((bestseller) => {
              const product = bestseller.products;
              if (!product) return null;
              
              const discount = product.compare_at_price 
                ? Math.round((1 - product.price / product.compare_at_price) * 100)
                : 0;

              const productRating = ratingsMap?.[product.id];

              return (
                <motion.div
                  key={bestseller.id}
                  variants={itemVariants}
                  whileHover={{ y: -8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Link
                    to={`/bestseller/${bestseller.slug}`}
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
                        src={product.image_url || '/placeholder.svg'}
                        alt={product.name}
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
                      {product.category && (
                        <p className="text-xs text-primary font-medium mb-1 truncate">
                          {product.category}
                        </p>
                      )}

                      {/* Product Name */}
                      <h3 className="font-semibold text-sm mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {bestseller.hero_headline || product.name}
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
                          ${product.price.toFixed(2)}
                        </span>
                        {product.compare_at_price && (
                          <span className="text-sm text-muted-foreground line-through">
                            ${product.compare_at_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
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
