import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Award, Star, TrendingUp, Sparkles, ArrowRight, ShoppingCart, Heart } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { toast } from 'sonner';
import { trackViewItemList, trackSelectItem, trackAddToCart, trackAddToWishlist, trackRemoveFromWishlist } from '@/lib/analytics';

interface SellingPoint {
  icon: string;
  title: string;
  description: string;
}

interface BestsellerWithProduct {
  id: string;
  slug: string;
  rank: number;
  hero_headline: string | null;
  hero_subheadline: string | null;
  seo_description: string | null;
  long_description: string | null;
  selling_points: SellingPoint[] | null;
  product: {
    id: string;
    name: string;
    price: number;
    compare_at_price: number | null;
    image_url: string | null;
    images: string[] | null;
    category: string | null;
    stock: number | null;
  };
}

const BestsellerCard = ({ bestseller, index, onSelect }: { 
  bestseller: BestsellerWithProduct; 
  index: number;
  onSelect: () => void;
}) => {
  const { addItem } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const inWishlist = isInWishlist(bestseller.product.id);

  const discount = bestseller.product.compare_at_price 
    ? Math.round((1 - bestseller.product.price / bestseller.product.compare_at_price) * 100)
    : 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      id: bestseller.product.id,
      name: bestseller.product.name,
      price: bestseller.product.price,
      image: bestseller.product.image_url || '/placeholder.svg',
    });
    // Track add to cart
    trackAddToCart(
      bestseller.product.id,
      bestseller.product.name,
      bestseller.product.price,
      1
    );
    toast.success('Added to cart!');
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inWishlist) {
      removeFromWishlist(bestseller.product.id);
      trackRemoveFromWishlist(bestseller.product.id, bestseller.product.name);
      toast.success('Removed from wishlist');
    } else {
      addToWishlist(bestseller.product.id);
      trackAddToWishlist(bestseller.product.id, bestseller.product.name, bestseller.product.price);
      toast.success('Added to wishlist!');
    }
  };

  const handleClick = () => {
    onSelect();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Link to={`/bestseller/${bestseller.slug}`} onClick={handleClick}>
        <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 h-full">
          <div className="relative aspect-square overflow-hidden bg-muted">
            {/* Rank badge */}
            <div className="absolute top-3 left-3 z-10">
              <Badge className="bg-primary text-primary-foreground gap-1 shadow-lg">
                <Award className="w-3 h-3" />
                #{bestseller.rank}
              </Badge>
            </div>

            {/* Discount badge */}
            {discount > 0 && (
              <div className="absolute top-3 right-3 z-10">
                <Badge variant="destructive" className="shadow-lg">
                  -{discount}%
                </Badge>
              </div>
            )}

            {/* Image */}
            <OptimizedImage
              src={bestseller.product.image_url || '/placeholder.svg'}
              alt={bestseller.hero_headline || bestseller.product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />

            {/* Quick actions overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
              <Button
                size="icon"
                variant="secondary"
                className="rounded-full shadow-lg"
                onClick={handleToggleWishlist}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? 'fill-accent text-accent' : ''}`} />
              </Button>
              <Button
                size="icon"
                className="rounded-full shadow-lg"
                onClick={handleAddToCart}
              >
                <ShoppingCart className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <CardContent className="p-4 space-y-3">
            {/* Category */}
            {bestseller.product.category && (
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {bestseller.product.category}
              </p>
            )}

            {/* Title */}
            <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
              {bestseller.hero_headline || bestseller.product.name}
            </h3>

            {/* Subheadline */}
            {bestseller.hero_subheadline && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {bestseller.hero_subheadline}
              </p>
            )}

            {/* Price */}
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-primary">
                ${bestseller.product.price.toFixed(2)}
              </span>
              {bestseller.product.compare_at_price && (
                <span className="text-sm text-muted-foreground line-through">
                  ${bestseller.product.compare_at_price.toFixed(2)}
                </span>
              )}
            </div>

            {/* Selling points preview */}
            {bestseller.selling_points && bestseller.selling_points.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {bestseller.selling_points.slice(0, 2).map((point, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {point.title.length > 20 ? point.title.slice(0, 20) + '...' : point.title}
                  </Badge>
                ))}
              </div>
            )}

            {/* CTA */}
            <div className="pt-2">
              <Button variant="outline" className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                View Details
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
};

const BestsellerSkeleton = () => (
  <Card className="overflow-hidden">
    <Skeleton className="aspect-square w-full" />
    <CardContent className="p-4 space-y-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
);

const Bestsellers = () => {
  const hasTrackedImpressions = useRef(false);

  const { data: bestsellers, isLoading, error } = useQuery({
    queryKey: ['bestsellers-page'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          id,
          slug,
          rank,
          hero_headline,
          hero_subheadline,
          seo_description,
          long_description,
          selling_points,
          product:products!bestsellers_product_id_fkey (
            id,
            name,
            price,
            compare_at_price,
            image_url,
            images,
            category,
            stock
          )
        `)
        .eq('is_active', true)
        .order('rank', { ascending: true });

      if (error) throw error;

      return (data || []).map((item) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
        selling_points: item.selling_points as unknown as SellingPoint[] | null,
      })) as BestsellerWithProduct[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Track product impressions when bestsellers load
  useEffect(() => {
    if (bestsellers && bestsellers.length > 0 && !hasTrackedImpressions.current) {
      hasTrackedImpressions.current = true;
      trackViewItemList(
        'bestsellers',
        'Bestsellers',
        bestsellers.map((item, index) => ({
          id: item.product.id,
          name: item.product.name,
          price: item.product.price,
          category: item.product.category || undefined,
          position: index + 1,
        }))
      );
    }
  }, [bestsellers]);

  // Handle product click tracking
  const handleProductSelect = (bestseller: BestsellerWithProduct, index: number) => {
    trackSelectItem('bestsellers', 'Bestsellers', {
      id: bestseller.product.id,
      name: bestseller.product.name,
      price: bestseller.product.price,
      category: bestseller.product.category || undefined,
      position: index + 1,
    });
  };

  // Generate JSON-LD structured data
  const generateJsonLd = () => {
    if (!bestsellers?.length) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'GetPawsy Bestsellers',
      description: 'Our most popular pet products, loved by thousands of pet owners.',
      numberOfItems: bestsellers.length,
      itemListElement: bestsellers.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `https://getpawsy.pet/bestseller/${item.slug}`,
        name: item.hero_headline || item.product.name,
      })),
    };
  };

  return (
    <Layout>
      <Helmet>
        <title>Bestsellers - Top Pet Products | GetPawsy</title>
        <meta 
          name="description" 
          content="Discover our most popular pet products! Shop bestselling pet beds, toys, accessories, and more. Trusted by thousands of happy pet owners." 
        />
        <meta name="keywords" content="bestseller pet products, popular pet supplies, top rated pet accessories, best pet toys, trending pet items" />
        <link rel="canonical" href="https://getpawsy.pet/bestsellers" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Bestsellers - Top Pet Products | GetPawsy" />
        <meta property="og:description" content="Discover our most popular pet products! Shop bestselling pet beds, toys, accessories, and more." />
        <meta property="og:url" content="https://getpawsy.pet/bestsellers" />
        <meta property="og:type" content="website" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Bestsellers - Top Pet Products | GetPawsy" />
        <meta name="twitter:description" content="Discover our most popular pet products! Shop bestselling pet beds, toys, accessories, and more." />

        {/* JSON-LD */}
        {bestsellers && (
          <script type="application/ld+json">
            {JSON.stringify(generateJsonLd())}
          </script>
        )}
      </Helmet>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 md:py-24 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-20 -right-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-20 -left-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, delay: 1 }}
          />
        </div>

        <div className="container px-4 md:px-6 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Trending Now</span>
            </motion.div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Our <span className="text-primary">Bestsellers</span>
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Discover the products that pet owners love most. These top-rated items have been carefully selected based on customer reviews and sales performance.
            </p>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-12">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-2xl md:text-3xl font-bold text-primary">
                  <Star className="w-6 h-6 fill-primary" />
                  4.9
                </div>
                <p className="text-sm text-muted-foreground">Avg. Rating</p>
              </div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-primary">10k+</div>
                <p className="text-sm text-muted-foreground">Happy Customers</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-2xl md:text-3xl font-bold text-primary">
                  <Sparkles className="w-6 h-6" />
                  {bestsellers?.length || 0}
                </div>
                <p className="text-sm text-muted-foreground">Top Products</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-12 md:py-16">
        <div className="container px-4 md:px-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <BestsellerSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">Failed to load bestsellers</p>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          ) : bestsellers && bestsellers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {bestsellers.map((bestseller, index) => (
                <BestsellerCard 
                  key={bestseller.id} 
                  bestseller={bestseller} 
                  index={index} 
                  onSelect={() => handleProductSelect(bestseller, index)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Award className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No bestsellers yet</h2>
              <p className="text-muted-foreground mb-4">
                Check back soon for our top-rated products!
              </p>
              <Link to="/products">
                <Button className="gap-2">
                  Browse All Products
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Bestsellers CTA */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="container px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Star className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Top Rated</h3>
                <p className="text-sm text-muted-foreground">
                  All bestsellers have 4+ star ratings from verified buyers
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Most Popular</h3>
                <p className="text-sm text-muted-foreground">
                  Based on real sales data and customer preferences
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Award className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Quality Guaranteed</h3>
                <p className="text-sm text-muted-foreground">
                  Curated selection with satisfaction guarantee
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
};

export default Bestsellers;
