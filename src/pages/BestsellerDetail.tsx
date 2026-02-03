import { useParams, Link, useNavigate } from 'react-router-dom';
import { sanitizeHtml } from '@/lib/sanitize';
import { useQuery } from '@tanstack/react-query';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { 
  ShoppingCart, 
  Heart, 
  Truck, 
  Shield, 
  Star, 
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Award,
  Clock,
  Package,
  ZoomIn,
  Minus,
  Plus,
  Gift,
  Zap,
  BadgeCheck,
  RotateCcw,
  Timer,
  Users,
  TrendingUp,
  HelpCircle,
  MessageCircle,
  Home
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { PinchZoomImage } from '@/components/ui/pinch-zoom-image';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ReviewsList } from '@/components/reviews/ReviewsList';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { useCartAnimation } from '@/contexts/CartAnimationContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useHaptic } from '@/hooks/useHaptic';
import { toast } from 'sonner';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ShippingCountdown } from '@/components/products/ShippingCountdown';
import { RecentlyViewedCarousel } from '@/components/products/RecentlyViewedCarousel';
import { RelatedProductsCarousel } from '@/components/products/RelatedProductsCarousel';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useRecentlyViewedProducts } from '@/hooks/useRecentlyViewedProducts';
import { useRelatedProducts } from '@/hooks/useRelatedProducts';
import { DELIVERY_TIME_STANDARD } from '@/lib/shipping-constants';

// Generate JSON-LD structured data for product
// NOTE: Reviews/ratings intentionally removed - Google requires real customer reviews
const generateProductJsonLd = (
  product: {
    id: string;
    name: string;
    price: number;
    compare_at_price?: number | null;
    image_url?: string | null;
    images?: string[] | null;
    description?: string | null;
    category?: string | null;
    stock?: number | null;
  },
  bestseller: {
    seo_description?: string | null;
    hero_headline?: string | null;
    slug: string;
  }
) => {
  const availability = product.stock && product.stock > 0 
    ? 'https://schema.org/InStock' 
    : 'https://schema.org/OutOfStock';

  const imagesArray = Array.isArray(product.images) ? product.images : [];
  const images = imagesArray.length > 0
    ? imagesArray 
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
      url: `https://getpawsy.pet/bestseller/${bestseller.slug}`,
      priceCurrency: 'USD',
      price: product.price.toFixed(2),
      priceValidUntil: '2027-12-31',
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'GetPawsy',
        url: 'https://getpawsy.pet'
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn'
      },
      shippingDetails: [
        {
          '@type': 'OfferShippingDetails',
          shippingRate: {
            '@type': 'MonetaryAmount',
            value: '0.00',
            currency: 'USD'
          },
          shippingDestination: {
            '@type': 'DefinedRegion',
            addressCountry: 'US'
          },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: {
              '@type': 'QuantitativeValue',
              minValue: 1,
              maxValue: 2,
              unitCode: 'DAY'
            },
            transitTime: {
              '@type': 'QuantitativeValue',
              minValue: 3,
              maxValue: 7,
              unitCode: 'DAY'
            }
          },
          shippingLabel: 'Free shipping on orders over $35'
        },
        {
          '@type': 'OfferShippingDetails',
          shippingRate: {
            '@type': 'MonetaryAmount',
            value: '5.99',
            currency: 'USD'
          },
          shippingDestination: {
            '@type': 'DefinedRegion',
            addressCountry: 'US'
          },
          deliveryTime: {
            '@type': 'ShippingDeliveryTime',
            handlingTime: {
              '@type': 'QuantitativeValue',
              minValue: 1,
              maxValue: 2,
              unitCode: 'DAY'
            },
            transitTime: {
              '@type': 'QuantitativeValue',
              minValue: 3,
              maxValue: 7,
              unitCode: 'DAY'
            }
          },
          shippingLabel: 'Flat rate $5.99 for orders under $35'
        }
      ]
    }
    // NOTE: aggregateRating and review fields intentionally omitted
    // Google requires real customer reviews - will be added when available
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
      item: 'https://getpawsy.pet'
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Products',
      item: 'https://getpawsy.pet/products'
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: productName,
      item: `https://getpawsy.pet/bestseller/${slug}`
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
  const { triggerAddToCart } = useCartAnimation();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { trigger } = useHaptic();
  const { addToRecentlyViewed, getRecentlyViewedIds } = useRecentlyViewed();
  
  // Image gallery state
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const addToCartButtonRef = useRef<HTMLButtonElement>(null);
  const mainAddToCartRef = useRef<HTMLDivElement>(null);
  
  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;
  
  const handleDragEnd = (imagesLength: number, offsetX: number, velocityX: number) => {
    const swipe = offsetX + velocityX * 50;
    
    if (swipe < -minSwipeDistance) {
      setSelectedImage(prev => prev === imagesLength - 1 ? 0 : prev + 1);
      trigger('light');
    } else if (swipe > minSwipeDistance) {
      setSelectedImage(prev => prev === 0 ? imagesLength - 1 : prev - 1);
      trigger('light');
    }
    
    setDragX(0);
    setIsDragging(false);
  };

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

  // Fetch reviews for this product
  const { data: reviews = [], refetch: refetchReviews } = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!product?.id,
  });

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  // Get recently viewed product IDs ONCE at the top level
  // This prevents duplicate useRecentlyViewed hook calls in child hooks
  const recentlyViewedIds = useMemo(() => getRecentlyViewedIds(product?.id), [getRecentlyViewedIds, product?.id]);

  // Fetch related products with enhanced category and keyword matching
  const { data: relatedProducts = [], isLoading: relatedLoading } = useRelatedProducts({
    productId: product?.id || '',
    category: product?.category || null,
    productName: product?.name || '',
    maxItems: 8,
    enabled: !!product?.id,
    recentlyViewedIds,
  });

  // Fetch recently viewed products with React Query caching
  const { data: recentlyViewedProducts, isLoading: recentlyViewedLoading } = useRecentlyViewedProducts({
    recentlyViewedIds,
  });

  // Build images array - using useMemo to ensure stable reference
  const images = React.useMemo(() => {
    const productImagesArray = Array.isArray(product?.images) ? product.images : [];
    const rawImages = productImagesArray.length > 0 
      ? productImagesArray.filter((img): img is string => 
          typeof img === 'string' && 
          img.startsWith('http') && 
          !img.includes('undefined')
        )
      : [];
    
    return rawImages.length > 0 
      ? rawImages 
      : (product?.image_url ? [product.image_url] : ['/placeholder.svg']);
  }, [product?.images, product?.image_url]);

  // Image navigation handlers
  const handlePrevImage = () => {
    setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1);
  };

  const handleNextImage = () => {
    setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
  };

  // Auto-scroll thumbnail into view
  useEffect(() => {
    const thumbnail = thumbnailRefs.current[selectedImage];
    if (thumbnail) {
      thumbnail.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedImage]);

  // Reset selected image and quantity when product changes, add to recently viewed
  useEffect(() => {
    setSelectedImage(0);
    setQuantity(1);
    setShowStickyBar(false);
    
    // Add current product to recently viewed
    if (product?.id) {
      addToRecentlyViewed(product.id);
    }
  }, [slug, product?.id, addToRecentlyViewed]);

  // Show/hide sticky bar based on main add-to-cart button visibility
  useEffect(() => {
    if (!mainAddToCartRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky bar when main button is NOT visible
        setShowStickyBar(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-100px 0px 0px 0px',
      }
    );

    observer.observe(mainAddToCartRef.current);

    return () => observer.disconnect();
  }, [product]);

  // Move early returns AFTER all hooks to comply with React hooks rules
  // This is critical to prevent "Rendered more hooks than during the previous render" error
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

  const inStock = product.stock !== null && product.stock !== undefined && product.stock > 0;

  const handleAddToCart = () => {
    if (!product || !inStock) return;
    
    trigger('medium');
    
    // Trigger flying animation
    triggerAddToCart(
      images[selectedImage] || product.image_url || '/placeholder.svg',
      addToCartButtonRef.current
    );
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image_url || '/placeholder.svg',
      });
    }
    
    toast.success(`${quantity}x ${product.name} added to cart!`);
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

  const discount = product.compare_at_price 
    ? Math.round((1 - product.price / product.compare_at_price) * 100)
    : 0;

  // Generate structured data (reviews omitted per Google compliance)
  const productJsonLd = generateProductJsonLd(product, bestseller);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(product.name, bestseller.slug);

  return (
    <Layout>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{bestseller.seo_title || `${product.name} | GetPawsy Bestseller`}</title>
        <meta 
          name="description" 
          content={bestseller.seo_description || product.description || `Discover ${product.name} - one of our bestsellers. Buy now with free US shipping on orders over $35.`}
        />
        {bestseller.meta_keywords && (
          <meta name="keywords" content={bestseller.meta_keywords.join(', ')} />
        )}
        <link rel="canonical" href={`https://getpawsy.pet/bestseller/${bestseller.slug}`} />
        
        {/* Open Graph */}
        <meta property="og:type" content="product" />
        <meta property="og:title" content={bestseller.hero_headline || product.name} />
        <meta property="og:description" content={bestseller.seo_description || product.description || ''} />
        <meta property="og:image" content={product.image_url || '/og-image.png'} />
        <meta property="og:url" content={`https://getpawsy.pet/bestseller/${bestseller.slug}`} />
        <meta property="product:price:amount" content={product.price.toFixed(2)} />
        <meta property="product:price:currency" content="USD" />
        
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
        {/* Breadcrumbs */}
        <div className="bg-gradient-to-r from-muted/40 via-muted/20 to-muted/40 border-b border-border/50">
          <div className="container px-4 py-4">
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
                  <BreadcrumbLink asChild>
                    <Link to="/bestsellers">Bestsellers</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[200px] truncate">{product.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>

        {/* Hero Section - Premium */}
        <section className="relative py-10 lg:py-20 overflow-hidden">
          {/* Decorative background */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background pointer-events-none" />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-accent/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          <div className="container px-4 relative z-10">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-20 items-start">
              {/* Product Image Gallery */}
              <motion.div 
                className="relative space-y-4"
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

                {/* Main Image with swipe/navigation */}
                <div 
                  className="relative aspect-[4/5] md:aspect-square rounded-3xl overflow-hidden bg-white shadow-2xl group touch-pan-y"
                >
                  {/* Swipeable image container */}
                  <motion.div
                    className="absolute inset-0 cursor-zoom-in"
                    drag={images.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragStart={() => setIsDragging(true)}
                    onDrag={(_, info) => setDragX(info.offset.x)}
                    onDragEnd={(_, info) => handleDragEnd(images.length, info.offset.x, info.velocity.x)}
                    onClick={() => !isDragging && window.innerWidth >= 768 && setLightboxOpen(true)}
                    whileTap={{ cursor: "grabbing" }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={selectedImage}
                        className="absolute inset-0 p-4 md:p-8"
                        initial={{ opacity: 0, x: dragX > 0 ? -100 : 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: dragX > 0 ? 100 : -100 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      >
                        {/* Desktop: Regular optimized image */}
                        <div className="hidden md:block w-full h-full">
                          <OptimizedImage
                            src={images[selectedImage]}
                            alt={product.name}
                            className="object-contain pointer-events-none"
                            containerClassName="w-full h-full"
                            priority={selectedImage === 0}
                          />
                        </div>
                        
                        {/* Mobile: Pinch-to-zoom image - no lightbox, use native pinch-zoom */}
                        <div className="md:hidden w-full h-full">
                          <PinchZoomImage
                            src={images[selectedImage]}
                            alt={product.name}
                            className="object-contain"
                            containerClassName="w-full h-full"
                          />
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* Swipe hint indicators - only on mobile */}
                    {images.length > 1 && (
                      <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between pointer-events-none md:hidden">
                        <motion.div
                          className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center ml-2"
                          animate={{ opacity: isDragging ? 0 : [0.3, 0.6, 0.3], x: [0, -3, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          <ChevronLeft className="w-4 h-4 text-foreground/60" />
                        </motion.div>
                        <motion.div
                          className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center mr-2"
                          animate={{ opacity: isDragging ? 0 : [0.3, 0.6, 0.3], x: [0, 3, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          <ChevronRight className="w-4 h-4 text-foreground/60" />
                        </motion.div>
                      </div>
                    )}
                  </motion.div>

                  {/* Zoom indicator */}
                  <motion.div 
                    className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm text-foreground p-2.5 rounded-full shadow-soft z-20"
                    initial={{ opacity: 0 }}
                    whileHover={{ scale: 1.1 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <ZoomIn className="w-5 h-5" />
                  </motion.div>

                  {/* Navigation Arrows - Always visible */}
                  {images.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute left-3 top-1/2 -translate-y-1/2 transition-all duration-300 rounded-full shadow-lg bg-background/95 backdrop-blur-sm hover:bg-background hover:scale-110 z-20 border border-border/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrevImage();
                        }}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-300 rounded-full shadow-lg bg-background/95 backdrop-blur-sm hover:bg-background hover:scale-110 z-20 border border-border/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNextImage();
                        }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                      
                      {/* Image Counter - Desktop */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm text-foreground text-sm px-4 py-1.5 rounded-full shadow-soft font-medium hidden md:block z-20">
                        {selectedImage + 1} / {images.length}
                      </div>
                      
                      {/* Dot Indicators - Mobile */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 md:hidden z-20">
                        {images.map((_, idx) => (
                          <motion.button
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedImage(idx);
                            }}
                            className={`rounded-full transition-all ${
                              selectedImage === idx 
                                ? 'w-6 h-2 bg-primary' 
                                : 'w-2 h-2 bg-foreground/30'
                            }`}
                            whileTap={{ scale: 0.9 }}
                            layout
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Thumbnail Carousel */}
                {images.length > 1 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="relative flex items-center gap-3"
                  >
                    {/* Left Arrow */}
                    <Button
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0 h-10 w-10 rounded-full border-2"
                      onClick={handlePrevImage}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    {/* Thumbnails */}
                    <div className="flex-1 overflow-hidden relative touch-pan-x">
                      {/* Fade edges */}
                      <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
                      <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
                      
                      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {images.map((img, idx) => (
                          <motion.button
                            key={idx}
                            ref={(el) => { thumbnailRefs.current[idx] = el; }}
                            onClick={() => setSelectedImage(idx)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden transition-all snap-start ${
                              selectedImage === idx 
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-soft' 
                                : 'opacity-60 hover:opacity-100'
                            }`}
                          >
                            <OptimizedImage
                              src={img}
                              alt={`Product image ${idx + 1}`}
                              aspectRatio="square"
                              className="group-hover:scale-110"
                            />
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Right Arrow */}
                    <Button
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0 h-10 w-10 rounded-full border-2"
                      onClick={handleNextImage}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </motion.div>
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div 
                className="space-y-6 lg:sticky lg:top-24"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Category & Bestseller Tag */}
                <div className="flex items-center gap-3 flex-wrap">
                  {product.category && (
                    <Link 
                      to={`/products?category=${encodeURIComponent(product.category)}`}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      {product.category}
                    </Link>
                  )}
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-xs">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Trending Now
                  </Badge>
                </div>

                {/* Headline */}
                <h1 className="text-3xl lg:text-4xl xl:text-5xl font-display font-bold leading-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
                  {bestseller.hero_headline || product.name}
                </h1>

                {/* Subheadline */}
                {bestseller.hero_subheadline && (
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {bestseller.hero_subheadline}
                  </p>
                )}

                {/* Rating with social proof */}
                <motion.div 
                  className="flex items-center gap-4 p-4 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-2xl border border-amber-200/50 dark:border-amber-800/30"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <Star 
                          className={`w-5 h-5 ${
                            i < Math.round(averageRating) 
                              ? 'fill-amber-400 text-amber-400' 
                              : 'fill-muted text-muted'
                          }`} 
                        />
                      </motion.div>
                    ))}
                  </div>
                  <div className="flex-1">
                    {reviews.length > 0 ? (
                      <>
                        <span className="font-semibold">{averageRating.toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground ml-1">
                          ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">No reviews yet</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>500+ happy pets</span>
                  </div>
                </motion.div>

                {/* Price Section - Premium Design */}
                <div className="p-5 bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-2xl border border-primary/10">
                  <div className="flex items-end gap-3 mb-2">
                    <span className="text-4xl lg:text-5xl font-bold text-primary">
                      ${product.price.toFixed(2)}
                    </span>
                    {product.compare_at_price && (
                      <span className="text-xl text-muted-foreground line-through mb-1">
                        ${product.compare_at_price.toFixed(2)}
                      </span>
                    )}
                    {discount > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 15 }}
                      >
                        <Badge className="bg-red-500 text-white text-sm px-3 py-1 mb-1">
                          SAVE {discount}%
                        </Badge>
                      </motion.div>
                    )}
                  </div>
                  {discount > 0 && product.compare_at_price && (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                      <Gift className="w-4 h-4" />
                      You save ${(product.compare_at_price - product.price).toFixed(2)} on this order!
                    </p>
                  )}
                </div>

                {/* Stock Status - Urgency */}
                <motion.div 
                  className={`flex items-center gap-3 p-4 rounded-xl ${
                    inStock 
                      ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800/50' 
                      : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50'
                  }`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  {inStock ? (
                    <>
                      <motion.div 
                        className="w-3 h-3 rounded-full bg-green-500"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                      <div className="flex-1">
                        <span className="text-sm text-green-700 dark:text-green-400 font-semibold">
                          In Stock - Ready to Ship
                        </span>
                        {product.stock && product.stock < 10 && (
                          <p className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1 mt-0.5">
                            <Timer className="w-3 h-3" />
                            Only {product.stock} left - Order soon!
                          </p>
                        )}
                      </div>
                      <Zap className="w-5 h-5 text-green-500" />
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-sm text-red-700 dark:text-red-400 font-medium">
                        Currently Out of Stock
                      </span>
                    </>
                  )}
                </motion.div>

                {/* Shipping Countdown Timer */}
                <ShippingCountdown cutoffHour={15} />

                {/* Shipping Info - Always show US standard delivery time */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                  <Truck className="w-4 h-4" />
                  <span>Estimated Delivery: {DELIVERY_TIME_STANDARD}</span>
                </div>

                <Separator className="my-2" />

                {/* Quantity Selector */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">Quantity:</span>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-full p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <motion.span 
                      key={quantity}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="w-12 text-center font-semibold text-lg"
                    >
                      {quantity}
                    </motion.span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => setQuantity(q => Math.min(10, q + 1))}
                      disabled={quantity >= 10 || (product.stock !== null && quantity >= product.stock)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">${(product.price * quantity).toFixed(2)}</span>
                  </span>
                </div>

                {/* Action Buttons - Premium - tracked for sticky bar visibility */}
                <div ref={mainAddToCartRef} className="flex gap-3">
                  <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      ref={addToCartButtonRef}
                      size="lg" 
                      className="w-full h-14 text-lg font-semibold gap-3 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                      onClick={handleAddToCart}
                      disabled={!inStock}
                    >
                      <ShoppingCart className="w-5 h-5" />
                      Add to Cart
                      {quantity > 1 && <span className="text-primary-foreground/80">({quantity})</span>}
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className={`h-14 w-14 border-2 transition-all duration-300 ${
                        isInWishlist(product.id) 
                          ? 'border-accent bg-accent/10 hover:bg-accent/20' 
                          : 'hover:border-accent hover:bg-accent/5'
                      }`}
                      onClick={handleToggleWishlist}
                    >
                      <Heart 
                        className={`w-5 h-5 transition-all duration-300 ${
                          isInWishlist(product.id) 
                            ? 'fill-accent text-accent scale-110' 
                            : ''
                        }`} 
                      />
                    </Button>
                  </motion.div>
                </div>

                {/* Trust Badges - Premium Grid */}
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <motion.div 
                    className="flex items-center gap-3 p-4 bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300 cursor-default"
                    whileHover={{ y: -2 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold">Free US Shipping</p>
                      <p className="text-muted-foreground text-xs">On orders over $35</p>
                    </div>
                  </motion.div>
                  <motion.div 
                    className="flex items-center gap-3 p-4 bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300 cursor-default"
                    whileHover={{ y: -2 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <RotateCcw className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold">30-Day Returns</p>
                      <p className="text-muted-foreground text-xs">Money back guarantee</p>
                    </div>
                  </motion.div>
                  <motion.div 
                    className="flex items-center gap-3 p-4 bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300 cursor-default"
                    whileHover={{ y: -2 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold">Secure Checkout</p>
                      <p className="text-muted-foreground text-xs">SSL encrypted</p>
                    </div>
                  </motion.div>
                  <motion.div 
                    className="flex items-center gap-3 p-4 bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300 cursor-default"
                    whileHover={{ y: -2 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <BadgeCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold">Quality Assured</p>
                      <p className="text-muted-foreground text-xs">Premium products</p>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Selling Points - Premium Cards */}
        {sellingPoints.length > 0 && (
          <section className="py-20 bg-gradient-to-b from-muted/50 to-background relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="container px-4 relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-14"
              >
                <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Key Features
                </Badge>
                <h2 className="text-3xl lg:text-4xl font-display font-bold">
                  Why Choose This Product?
                </h2>
              </motion.div>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {sellingPoints.map((point, idx) => {
                  const IconComponent = iconMap[point.icon] || Star;
                  return (
                    <motion.div
                      key={idx}
                      className="relative bg-background/80 backdrop-blur-sm p-6 rounded-2xl border border-border/50 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-500 group"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.1 }}
                      whileHover={{ y: -5 }}
                    >
                      <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <IconComponent className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2 text-center">{point.title}</h3>
                      <p className="text-sm text-muted-foreground text-center leading-relaxed">{point.description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Long Description - Enhanced */}
        {bestseller.long_description && (
          <section className="py-20">
            <div className="container px-4">
              <div className="max-w-4xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="mb-10"
                >
                  <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                    <Package className="w-3 h-3 mr-1" />
                    Product Details
                  </Badge>
                  <h2 className="text-3xl lg:text-4xl font-display font-bold">
                    About This Product
                  </h2>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  className="prose prose-lg max-w-none text-muted-foreground leading-relaxed [&>p]:mb-6"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(bestseller.long_description.replace(/\n/g, '<br/>')) }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Customer Reviews Section */}
        <section className="py-16 lg:py-20 bg-gradient-to-b from-background to-muted/20">
          <div className="container px-4">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-10"
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <Badge className="mb-4 bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <Star className="w-3 h-3 mr-1 fill-amber-500" />
                      Customer Reviews
                    </Badge>
                    <h2 className="text-3xl lg:text-4xl font-display font-bold">
                      What Pet Parents Say
                    </h2>
                    {reviews.length > 0 && (
                      <p className="text-muted-foreground mt-2">
                        {reviews.length} review{reviews.length !== 1 ? 's' : ''} • Average rating: {averageRating.toFixed(1)} / 5
                      </p>
                    )}
                  </div>
                  
                  {/* Quick rating summary */}
                  {reviews.length > 0 && (
                    <div className="flex items-center gap-2 bg-background rounded-2xl px-4 py-3 shadow-soft border border-border/50">
                      <div className="text-3xl font-bold text-foreground">{averageRating.toFixed(1)}</div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                star <= Math.round(averageRating)
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-muted-foreground/30'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{reviews.length} reviews</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Review Form */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mb-10"
              >
                {product && (
                  <ReviewForm
                    productId={product.id}
                    onReviewSubmitted={() => refetchReviews()}
                  />
                )}
              </motion.div>

              {/* Reviews List */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                <ReviewsList
                  reviews={reviews}
                  onReviewDeleted={() => refetchReviews()}
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 lg:py-20 bg-muted/30">
          <div className="container px-4">
            <div className="max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-center mb-10"
              >
                <Badge className="mb-4 bg-blue-500/10 text-blue-600 border-blue-500/20">
                  <HelpCircle className="w-3 h-3 mr-1" />
                  FAQ
                </Badge>
                <h2 className="text-3xl lg:text-4xl font-display font-bold mb-3">
                  Frequently Asked Questions
                </h2>
                <p className="text-muted-foreground">
                  Everything you need to know about this product
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              >
                <Accordion type="single" collapsible className="space-y-4">
                  <AccordionItem value="shipping" className="bg-background rounded-2xl border border-border/50 px-6 shadow-soft">
                    <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Truck className="w-5 h-5 text-primary" />
                        </div>
                        <span>How long does shipping take?</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-5 pl-13">
                      We offer free US shipping on orders over $35. Orders under $35 ship for a flat rate of $5.99. 
                      Standard delivery takes 3-7 business days. Once your order is shipped, you'll receive a tracking number to monitor your package.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="returns" className="bg-background rounded-2xl border border-border/50 px-6 shadow-soft">
                    <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <RotateCcw className="w-5 h-5 text-emerald-600" />
                        </div>
                        <span>What is your return policy?</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-5 pl-13">
                      We offer a 30-day money-back guarantee. If you or your pet aren't completely satisfied with your purchase, 
                      simply contact us and we'll arrange a hassle-free return. Items must be unused and in original packaging.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="quality" className="bg-background rounded-2xl border border-border/50 px-6 shadow-soft">
                    <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <Award className="w-5 h-5 text-amber-600" />
                        </div>
                        <span>Is this product safe for my pet?</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-5 pl-13">
                      Absolutely! All our products undergo rigorous quality testing and are made with pet-safe, 
                      non-toxic materials. We prioritize your pet's health and safety above all else. 
                      Each product is designed with your furry friend's comfort and well-being in mind.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="sizing" className="bg-background rounded-2xl border border-border/50 px-6 shadow-soft">
                    <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-purple-600" />
                        </div>
                        <span>How do I choose the right size?</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-5 pl-13">
                      Check the product description for detailed sizing information. We provide measurements and 
                      weight guidelines to help you choose the perfect fit for your pet. If you're unsure, 
                      feel free to contact our support team for personalized recommendations.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="support" className="bg-background rounded-2xl border border-border/50 px-6 shadow-soft">
                    <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <MessageCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <span>How can I contact customer support?</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground pb-5 pl-13">
                      Our friendly customer support team is here to help! You can reach us through our 
                      <Link to="/contact" className="text-primary hover:underline mx-1">contact page</Link> 
                      or email us directly. We typically respond within 24 hours and are happy to assist 
                      with any questions about your order or our products.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </motion.div>

              {/* Still have questions? */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="mt-10 text-center"
              >
                <p className="text-muted-foreground mb-4">
                  Still have questions? We're here to help!
                </p>
                <Link to="/contact">
                  <Button variant="outline" className="gap-2 rounded-full">
                    <MessageCircle className="w-4 h-4" />
                    Contact Us
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Related Products Carousel */}
        <section className="py-16 lg:py-20">
          <div className="container px-4">
            <RelatedProductsCarousel 
              products={relatedProducts}
              isLoading={relatedLoading}
              title="You May Also Like"
              subtitle="Products that complement your choice"
              listId="bestseller-related-products"
              listName="Bestseller Related Products"
              sourceProductId={product?.id || ''}
              sourceProductName={product?.name || ''}
              crossSellType="related_products"
            />
          </div>
        </section>

        {/* Recently Viewed Products Carousel */}
        {(recentlyViewedLoading || (recentlyViewedProducts && recentlyViewedProducts.length > 0)) && (
          <section className="py-16 lg:py-20 bg-muted/20">
            <div className="container px-4">
              <RecentlyViewedCarousel 
                products={(recentlyViewedProducts || []).map(p => ({
                  ...p,
                  created_at: p.created_at || new Date().toISOString(),
                  updated_at: p.updated_at || new Date().toISOString(),
                }))} 
                isLoading={recentlyViewedLoading}
              />
            </div>
          </section>
        )}

        {/* Premium CTA Section */}
        <section className="py-20 relative overflow-hidden">
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50" />
          
          <div className="container px-4 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center max-w-2xl mx-auto"
            >
              <motion.div
                animate={{ 
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="inline-block mb-6"
              >
                <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
              </motion.div>
              
              <h2 className="text-3xl lg:text-4xl font-display font-bold mb-4">
                Ready to Make Your Pet Happy?
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Join thousands of happy pet owners. Order now and give your loyal companion the care they deserve.
                <span className="block mt-2 text-primary font-medium">Free US shipping on orders over $35!</span>
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    size="lg" 
                    className="h-16 px-10 text-lg font-semibold gap-3 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-xl shadow-primary/30 hover:shadow-2xl hover:shadow-primary/40 transition-all duration-300"
                    onClick={handleAddToCart}
                    disabled={!inStock}
                  >
                    <ShoppingCart className="w-6 h-6" />
                    Order Now - ${(product.price * quantity).toFixed(2)}
                  </Button>
                </motion.div>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>30-day money-back guarantee</span>
                </div>
              </div>

              {/* Social proof */}
              <motion.div 
                className="mt-10 flex items-center justify-center gap-6 flex-wrap"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div 
                        key={i} 
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border-2 border-background flex items-center justify-center text-xs font-medium"
                      >
                        🐕
                      </div>
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">500+ happy pets</span>
                </div>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className={`w-4 h-4 ${
                        i < Math.round(averageRating) 
                          ? 'fill-amber-400 text-amber-400' 
                          : 'fill-muted text-muted'
                      }`} 
                    />
                  ))}
                  <span className="text-sm text-muted-foreground ml-1">
                    {reviews.length > 0 
                      ? `${averageRating.toFixed(1)}/5 rating` 
                      : 'No reviews yet'}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Back to products - Subtle */}
        <div className="container px-4 py-8 border-t border-border/50">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/products')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to All Products
          </Button>
        </div>

        {/* Image Lightbox */}
        <ImageLightbox
          images={images}
          initialIndex={selectedImage}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />

        {/* Sticky Mobile Add-to-Cart Bar - Shows when main button is out of view */}
        <AnimatePresence>
          {showStickyBar && (
            <motion.div 
              className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] pb-safe"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <div className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Product thumbnail & info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-border/50 shadow-sm">
                      <img
                        src={images[0]}
                        alt={product?.name || ''}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{product?.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">${product?.price.toFixed(2)}</span>
                        {product?.compare_at_price && product.compare_at_price > product.price && (
                          <span className="text-xs text-muted-foreground line-through">${product.compare_at_price.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quantity & Add button */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Compact quantity selector */}
                    <div className="flex items-center rounded-full bg-muted/50 border border-border/50">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-background"
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-background"
                        onClick={() => setQuantity(q => Math.min(10, q + 1))}
                        disabled={quantity >= 10}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Add to Cart button */}
                    <motion.div whileTap={{ scale: 0.95 }}>
                      <Button
                        onClick={handleAddToCart}
                        disabled={!inStock}
                        className="h-11 px-5 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span className="font-semibold">Add</span>
                      </Button>
                    </motion.div>
                  </div>
                </div>

                {/* Trust indicators */}
                <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Truck className="w-3 h-3 text-primary" />
                    <span>Free Shipping</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Shield className="w-3 h-3 text-primary" />
                    <span>30-Day Returns</span>
                  </div>
                  {inStock && (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="w-3 h-3" />
                      <span>In Stock</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer for sticky bar on mobile */}
        <div className={`md:hidden transition-all ${showStickyBar ? 'h-24' : 'h-0'}`} />
      </Layout>
  );
};

export default BestsellerDetail;
