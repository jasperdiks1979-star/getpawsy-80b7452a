import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Award, Star, TrendingUp, Sparkles, ArrowRight, ShoppingCart, Heart, Home, Truck, ShieldCheck, RotateCcw, HelpCircle, CheckCircle } from 'lucide-react';
import { useEffect, useRef, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Skeleton } from '@/components/ui/skeleton';
import { StarRating } from '@/components/ui/star-rating';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useProductRatings } from '@/hooks/useProductRatings';
import { toast } from 'sonner';
import { trackViewItemList, trackSelectItem, trackAddToCart, trackAddToWishlist, trackRemoveFromWishlist } from '@/lib/analytics';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SoftEmailCapture } from '@/components/email/SoftEmailCapture';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface SellingPoint {
  icon: string;
  title: string;
  description: string;
}

interface ProductReview {
  product_id: string;
  rating: number;
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

const BestsellerCard = ({ bestseller, index, onSelect, rating, reviewCount }: { 
  bestseller: BestsellerWithProduct; 
  index: number;
  onSelect: () => void;
  rating?: number;
  reviewCount?: number;
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

            {/* Rating */}
            {rating !== undefined && reviewCount !== undefined && reviewCount > 0 && (
              <div>
                <StarRating rating={rating} reviewCount={reviewCount} size="sm" />
              </div>
            )}

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

  // Fetch ratings using the hook
  const productIds = useMemo(() => bestsellers?.map(b => b.product.id) || [], [bestsellers]);
  const { data: ratingsMap } = useProductRatings(productIds);

  // Fetch all reviews for aggregate stats
  const { data: allReviews = [] } = useQuery({
    queryKey: ['bestsellers-reviews', productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data, error } = await supabase
        .from('product_reviews')
        .select('product_id, rating')
        .in('product_id', productIds);

      if (error) throw error;
      return data as ProductReview[];
    },
    enabled: productIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate aggregate stats from real reviews
  const reviewStats = useMemo(() => {
    if (allReviews.length === 0) {
      return { averageRating: 0, totalReviews: 0 };
    }
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    return {
      averageRating: totalRating / allReviews.length,
      totalReviews: allReviews.length,
    };
  }, [allReviews]);

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

  // Bestseller FAQ data
  const bestsellerFaqs = [
    { question: 'How are GetPawsy bestsellers selected?', answer: 'Our bestsellers are ranked by a combination of verified customer reviews, repeat purchase rate, and overall sales volume. Every product on this page has been purchased and loved by real pet owners across the United States.' },
    { question: 'Are bestseller prices guaranteed?', answer: 'Yes — the price you see is the price you pay. We never inflate prices before applying discounts. All bestseller prices include free US shipping on orders over $35.' },
    { question: 'What is the return policy for bestseller products?', answer: 'All bestseller products are covered by our 30-day hassle-free return policy. If you or your pet are not satisfied, contact us for a full refund or exchange — no questions asked.' },
    { question: 'Do you offer bundles with bestseller items?', answer: 'Yes! Many bestseller product pages feature a "Frequently Bought Together" section where you can save by bundling complementary items. Bundle discounts are applied automatically at checkout.' },
    { question: 'How fast is shipping on bestseller items?', answer: 'Bestseller items ship within 1–3 business days. Standard US delivery takes 7–15 business days depending on your location. Free shipping is available on orders over $35.' },
    { question: 'Are these products safe for puppies and kittens?', answer: 'Product safety varies by item. Each product page includes age and size recommendations. For puppies under 6 months or kittens, always check the specific product details or contact our support team.' },
    { question: 'Can I see real customer reviews?', answer: 'Absolutely. Every bestseller product page features verified customer reviews with photos. We never filter or remove honest feedback — positive or negative.' },
    { question: 'Do you ship internationally?', answer: 'Currently we ship to the United States only. We are working on expanding to Canada and the UK. Sign up for our newsletter to be notified when international shipping becomes available.' },
  ];

  // Generate JSON-LD structured data
  const generateJsonLd = () => {
    if (!bestsellers?.length) return null;

    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Best Pet Products 2026 – Top Rated by Pet Owners',
      description: 'Curated bestselling pet products ranked by verified reviews and sales. Shop top-rated dog beds, cat toys, feeders, and accessories with free US shipping over $35.',
      numberOfItems: bestsellers.length,
      itemListElement: bestsellers.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `https://getpawsy.pet/bestseller/${item.slug}`,
        name: item.hero_headline || item.product.name,
      })),
    };
  };

  const generateFAQJsonLd = () => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: bestsellerFaqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  });

  return (
    <Layout>
      <Helmet>
        <title>Best Pet Products 2026 – Top Rated Bestsellers | GetPawsy</title>
        <meta 
          name="description" 
          content="Shop the #1 bestselling pet products in 2026. Top-rated dog beds, cat toys, slow feeders & more — ranked by verified reviews. Free US shipping over $35." 
        />
        <meta name="keywords" content="best pet products 2026, bestselling pet supplies, top rated dog toys, popular cat accessories, best pet beds" />
        <link rel="canonical" href="https://getpawsy.pet/bestsellers" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Best Pet Products 2026 – Top Rated Bestsellers | GetPawsy" />
        <meta property="og:description" content="Shop the #1 bestselling pet products in 2026. Top-rated & verified by real pet owners. Free US shipping over $35." />
        <meta property="og:url" content="https://getpawsy.pet/bestsellers" />
        <meta property="og:type" content="website" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Best Pet Products 2026 – Top Rated Bestsellers | GetPawsy" />
        <meta name="twitter:description" content="Shop the #1 bestselling pet products in 2026. Top-rated & verified by real pet owners." />

        {/* JSON-LD */}
        {bestsellers && (
          <script type="application/ld+json">
            {JSON.stringify(generateJsonLd())}
          </script>
        )}
        <script type="application/ld+json">
          {JSON.stringify(generateFAQJsonLd())}
        </script>
      </Helmet>

      {/* Breadcrumbs */}
      <div className="container px-4 md:px-6 pt-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" className="flex items-center gap-1">
                  <Home className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only">Home</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Bestsellers</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

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
                  {reviewStats.totalReviews > 0 
                    ? reviewStats.averageRating.toFixed(1) 
                    : '—'}
                </div>
                <p className="text-sm text-muted-foreground">Avg. Rating</p>
              </div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-primary">
                  {reviewStats.totalReviews > 0 ? reviewStats.totalReviews : '—'}
                </div>
                <p className="text-sm text-muted-foreground">
                  {reviewStats.totalReviews === 1 ? 'Review' : 'Reviews'}
                </p>
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
              {bestsellers.map((bestseller, index) => {
                const productRating = ratingsMap?.[bestseller.product.id];
                return (
                  <BestsellerCard 
                    key={bestseller.id} 
                    bestseller={bestseller} 
                    index={index} 
                    onSelect={() => handleProductSelect(bestseller, index)}
                    rating={productRating?.averageRating}
                    reviewCount={productRating?.reviewCount}
                  />
                );
              })}
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

      {/* Featured Snippet Block */}
      <section className="py-12 md:py-16 bg-muted/20">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">What Are the Best Pet Products in 2026?</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            The best pet products in 2026 include ergonomic dog beds with memory foam, interactive puzzle feeders for mental stimulation, self-cleaning litter boxes, durable chew toys, and slow feeder bowls that prevent bloat. These top-rated items are chosen by thousands of US pet owners based on verified reviews, durability, and value for money.
          </p>
        </div>
      </section>

      {/* How We Select Our Bestsellers */}
      <section className="py-12 md:py-16">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">How We Select Our Bestsellers</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Our bestseller ranking is not based on marketing spend or paid placements. Every product earns its position through a transparent, data-driven process that prioritizes real customer satisfaction.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-card border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Star className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Verified Reviews</h3>
              <p className="text-sm text-muted-foreground">Products must maintain a 4+ star average from verified buyers to remain on this page.</p>
            </div>
            <div className="bg-card border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Sales Performance</h3>
              <p className="text-sm text-muted-foreground">Rankings reflect real purchase volume and repeat order rates across the past 90 days.</p>
            </div>
            <div className="bg-card border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Award className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Quality Assurance</h3>
              <p className="text-sm text-muted-foreground">Each item is evaluated for durability, pet safety, and material quality before inclusion.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Top Categories Among Bestsellers */}
      <section className="py-12 md:py-16 bg-muted/20">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">Top Categories Among Our Bestsellers</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Our bestsellers span the most important pet care categories. Whether you're outfitting a new puppy, upgrading your cat's play area, or solving mealtime challenges, these categories consistently deliver the highest satisfaction scores.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { name: 'Dog Beds & Furniture', desc: 'Orthopedic and calming beds rated for comfort and durability.', link: '/products?category=dog-beds' },
              { name: 'Cat Trees & Condos', desc: 'Multi-level play structures built for active indoor cats.', link: '/cat-trees-condos' },
              { name: 'Interactive Dog Toys', desc: 'Puzzle feeders and enrichment toys for mental stimulation.', link: '/collections/best-interactive-dog-toys' },
              { name: 'Slow Feeder Bowls', desc: 'Anti-bloat bowls that slow eating by 5–10x.', link: '/collections/best-slow-feeder-dog-bowls' },
            ].map((cat) => (
              <Link key={cat.name} to={cat.link} className="flex items-start gap-3 bg-card border rounded-xl p-4 hover:shadow-md transition-shadow group">
                <CheckCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">{cat.name}</h3>
                  <p className="text-sm text-muted-foreground">{cat.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Reinforcement Section */}
      <section className="py-12 md:py-16">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">Shop With Confidence</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Truck className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Free US Shipping</h3>
              <p className="text-sm text-muted-foreground">
                Free shipping on all orders over $35. Standard delivery 7–15 business days.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <RotateCcw className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">30-Day Returns</h3>
              <p className="text-sm text-muted-foreground">
                Not happy? Return any product within 30 days for a full refund — no questions asked.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Pet-Safe Guarantee</h3>
              <p className="text-sm text-muted-foreground">
                Every product is tested for safety and quality. Your pet's wellbeing is our top priority.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 md:py-16 bg-muted/20">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-5 h-5 text-primary" />
            <h2 className="text-2xl md:text-3xl font-bold">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {bestsellerFaqs.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Email Capture */}
      <section className="py-12 md:py-16">
        <div className="container px-4 md:px-6 max-w-4xl mx-auto">
          <SoftEmailCapture variant="collection" />
        </div>
      </section>
    </Layout>
  );
};

export default Bestsellers;
