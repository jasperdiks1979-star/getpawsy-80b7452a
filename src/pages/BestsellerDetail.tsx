import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { 
  ShoppingCart, 
  Heart, 
  Truck, 
  Shield, 
  Star, 
  ChevronRight,
  Check,
  ArrowLeft,
  Sparkles,
  Award,
  Clock,
  Package
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useHaptic } from '@/hooks/useHaptic';
import { toast } from 'sonner';

// Generate JSON-LD structured data for product
const generateProductJsonLd = (product: {
  id: string;
  name: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  images?: string[] | null;
  description?: string | null;
  category?: string | null;
  stock?: number | null;
}, bestseller: {
  seo_description?: string | null;
  hero_headline?: string | null;
  slug: string;
}) => {
  const availability = product.stock && product.stock > 0 
    ? 'https://schema.org/InStock' 
    : 'https://schema.org/OutOfStock';

  const images = product.images?.length 
    ? product.images 
    : product.image_url 
      ? [product.image_url] 
      : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: bestseller.hero_headline || product.name,
    description: bestseller.seo_description || product.description || '',
    image: images,
    sku: product.id,
    brand: {
      '@type': 'Brand',
      name: 'GetPawsy'
    },
    category: product.category || 'Pet Products',
    offers: {
      '@type': 'Offer',
      url: `https://getpawsy.lovable.app/bestseller/${bestseller.slug}`,
      priceCurrency: 'EUR',
      price: product.price.toFixed(2),
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'GetPawsy'
      },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: '0',
          currency: 'EUR'
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'NL'
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 3,
            unitCode: 'DAY'
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: 5,
            maxValue: 15,
            unitCode: 'DAY'
          }
        }
      }
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '128',
      bestRating: '5',
      worstRating: '1'
    }
  };
};

// Generate BreadcrumbList JSON-LD
const generateBreadcrumbJsonLd = (productName: string, slug: string) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://getpawsy.lovable.app'
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Producten',
      item: 'https://getpawsy.lovable.app/products'
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: productName,
      item: `https://getpawsy.lovable.app/bestseller/${slug}`
    }
  ]
});

interface SellingPoint {
  icon: string;
  title: string;
  description: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  shield: Shield,
  star: Star,
  truck: Truck,
  check: Check,
  sparkles: Sparkles,
  award: Award,
  clock: Clock,
  package: Package,
};

const BestsellerDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { trigger } = useHaptic();

  // Fetch bestseller with product data
  const { data: bestseller, isLoading, error } = useQuery({
    queryKey: ['bestseller', slug],
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
            images,
            description,
            category,
            stock,
            shipping_time
          )
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const product = bestseller?.products;
  const sellingPoints: SellingPoint[] = bestseller?.selling_points 
    ? (bestseller.selling_points as unknown as SellingPoint[])
    : [];

  const handleAddToCart = () => {
    if (!product) return;
    trigger('medium');
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image_url || '/placeholder.svg',
    });
  };

  const handleToggleWishlist = () => {
    if (!product) return;
    trigger('light');
    toggleWishlist(product.id);
    toast.success(
      isInWishlist(product.id) 
        ? 'Removed from wishlist' 
        : 'Added to wishlist'
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container px-4 py-20">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="grid lg:grid-cols-2 gap-12">
              <div className="aspect-square bg-muted rounded-3xl" />
              <div className="space-y-4">
                <div className="h-12 bg-muted rounded w-3/4" />
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="h-32 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !bestseller || !product) {
    return (
      <Layout>
        <div className="container px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
          <Button onClick={() => navigate('/products')}>
            View All Products
          </Button>
        </div>
      </Layout>
    );
  }

  const discount = product.compare_at_price 
    ? Math.round((1 - product.price / product.compare_at_price) * 100)
    : 0;

  // Generate structured data
  const productJsonLd = generateProductJsonLd(product, bestseller);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(product.name, bestseller.slug);

  return (
    <Layout>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{bestseller.seo_title || `${product.name} | GetPawsy Bestseller`}</title>
        <meta 
          name="description" 
          content={bestseller.seo_description || product.description || `Discover ${product.name} - one of our bestsellers. Buy now with free shipping on orders over €50.`}
        />
        {bestseller.meta_keywords && (
          <meta name="keywords" content={bestseller.meta_keywords.join(', ')} />
        )}
        <link rel="canonical" href={`https://getpawsy.lovable.app/bestseller/${bestseller.slug}`} />
        
        {/* Open Graph */}
        <meta property="og:type" content="product" />
        <meta property="og:title" content={bestseller.hero_headline || product.name} />
        <meta property="og:description" content={bestseller.seo_description || product.description || ''} />
        <meta property="og:image" content={product.image_url || '/og-image.png'} />
        <meta property="og:url" content={`https://getpawsy.lovable.app/bestseller/${bestseller.slug}`} />
        <meta property="product:price:amount" content={product.price.toFixed(2)} />
        <meta property="product:price:currency" content="EUR" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={bestseller.hero_headline || product.name} />
        <meta name="twitter:description" content={bestseller.seo_description || product.description || ''} />
        <meta name="twitter:image" content={product.image_url || '/og-image.png'} />

        {/* JSON-LD Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(productJsonLd)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbJsonLd)}
        </script>
      </Helmet>
        {/* Breadcrumb */}
        <div className="bg-muted/30 border-b">
          <div className="container px-4 py-3">
            <nav className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              <ChevronRight className="w-4 h-4" />
              <Link to="/products" className="hover:text-primary transition-colors">Products</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-foreground font-medium truncate">{product.name}</span>
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/5 to-background py-8 lg:py-16">
          <div className="container px-4">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
              {/* Product Image */}
              <motion.div 
                className="relative"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Bestseller Badge */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-2 text-sm font-semibold shadow-lg">
                    <Award className="w-4 h-4 mr-1" />
                    Bestseller #{bestseller.rank}
                  </Badge>
                  {discount > 0 && (
                    <Badge variant="destructive" className="px-3 py-2">
                      -{discount}%
                    </Badge>
                  )}
                </div>

                {/* Main Image */}
                <div className="aspect-square rounded-3xl overflow-hidden bg-white shadow-2xl">
                  <img
                    src={product.image_url || '/placeholder.svg'}
                    alt={product.name}
                    className="w-full h-full object-contain p-8"
                  />
                </div>

                {/* Thumbnail Gallery */}
                {product.images && product.images.length > 1 && (
                  <div className="flex gap-3 mt-4 overflow-x-auto pb-2">
                    {product.images.slice(0, 5).map((img, idx) => (
                      <button
                        key={idx}
                        className="w-20 h-20 rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-colors flex-shrink-0"
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Category */}
                {product.category && (
                  <Link 
                    to={`/products?category=${encodeURIComponent(product.category)}`}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    {product.category}
                  </Link>
                )}

                {/* Headline */}
                <h1 className="text-3xl lg:text-4xl xl:text-5xl font-display font-bold leading-tight">
                  {bestseller.hero_headline || product.name}
                </h1>

                {/* Subheadline */}
                {bestseller.hero_subheadline && (
                  <p className="text-lg text-muted-foreground">
                    {bestseller.hero_subheadline}
                  </p>
                )}

                {/* Rating */}
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    4.9 (128+ reviews)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-primary">
                    €{product.price.toFixed(2)}
                  </span>
                  {product.compare_at_price && (
                    <span className="text-xl text-muted-foreground line-through">
                      €{product.compare_at_price.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Stock Status */}
                <div className="flex items-center gap-2">
                {product.stock && product.stock > 0 ? (
                    <>
                      <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-sm text-green-600 font-medium">
                        In Stock - Ready to Ship
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm text-red-600 font-medium">
                        Out of Stock
                      </span>
                    </>
                  )}
                </div>

                {/* Shipping Info */}
                {product.shipping_time && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Truck className="w-4 h-4" />
                    <span>Delivery Time: {product.shipping_time}</span>
                  </div>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button 
                    size="lg" 
                    className="flex-1 h-14 text-lg btn-organic gap-2"
                    onClick={handleAddToCart}
                    disabled={!product.stock || product.stock <= 0}
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Add to Cart
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="h-14 w-14"
                    onClick={handleToggleWishlist}
                  >
                    <Heart 
                      className={`w-5 h-5 ${isInWishlist(product.id) ? 'fill-accent text-accent' : ''}`} 
                    />
                  </Button>
                </div>

                {/* Trust Badges */}
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                    <Truck className="w-5 h-5 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">Free Shipping</p>
                      <p className="text-muted-foreground">On orders over €50</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                    <Shield className="w-5 h-5 text-primary" />
                    <div className="text-sm">
                      <p className="font-medium">30-Day Returns</p>
                      <p className="text-muted-foreground">Not satisfied? Money back</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Selling Points */}
        {sellingPoints.length > 0 && (
          <section className="py-16 bg-muted/30">
            <div className="container px-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-center mb-12">
                Why Choose This Product?
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {sellingPoints.map((point, idx) => {
                  const IconComponent = iconMap[point.icon] || Star;
                  return (
                    <motion.div
                      key={idx}
                      className="bg-background p-6 rounded-2xl shadow-soft text-center"
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <IconComponent className="w-7 h-7 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{point.title}</h3>
                      <p className="text-sm text-muted-foreground">{point.description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Long Description */}
        {bestseller.long_description && (
          <section className="py-16">
            <div className="container px-4">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl lg:text-3xl font-bold mb-8">
                  About This Product
                </h2>
                <div 
                  className="prose prose-lg max-w-none text-muted-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: bestseller.long_description.replace(/\n/g, '<br/>') }}
                />
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="py-16 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10">
          <div className="container px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl lg:text-3xl font-bold mb-4">
                Ready to Treat Your Pet?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Order now and give your loyal companion the care they deserve. 
                Free shipping on orders over €50.
              </p>
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg btn-organic gap-2"
                onClick={handleAddToCart}
                disabled={!product.stock || product.stock <= 0}
              >
                <ShoppingCart className="w-5 h-5" />
                Order Now - €{product.price.toFixed(2)}
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Back to products */}
        <div className="container px-4 py-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/products')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to All Products
          </Button>
        </div>
      </Layout>
  );
};

export default BestsellerDetail;
