import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCategoryCollectionUrl } from '@/lib/category-collection-map';
import { sanitizeHtml } from '@/lib/sanitize';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileProductGallery } from '@/components/products/MobileProductGallery';
import { DesktopProductGallery } from '@/components/products/DesktopProductGallery';
import { useQuery } from '@tanstack/react-query';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useCanonical } from '@/components/seo/CanonicalTag';
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
  Gift,
  Zap,
  BadgeCheck,
  RotateCcw,
  Timer,
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
import { BestsellerBundleSection } from '@/components/products/BestsellerBundleSection';
import { PostAddUpsellModal } from '@/components/products/PostAddUpsellModal';
import { VolumeDiscountSelector } from '@/components/products/VolumeDiscountSelector';
import { OrderBump } from '@/components/products/OrderBump';
import { TrustMicrocopy } from '@/components/products/TrustMicrocopy';
import { ShippingTransparency } from '@/components/products/ShippingTransparency';
import { LowStockBadge } from '@/components/products/LowStockBadge';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useBundleABTest } from '@/hooks/useBundleABTest';
import { useRecentlyViewedProducts } from '@/hooks/useRecentlyViewedProducts';
import { useRelatedProducts } from '@/hooks/useRelatedProducts';
import {
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  RETURN_WINDOW_DAYS,
  TRUST_BADGES,
} from '@/lib/shipping-constants';
import { computeAvailability } from '@/lib/availability';
import { getProductDiscount } from '@/lib/discount';
import { getDisplayPrice } from '@/lib/merchant-safe-product';
import type { MerchantProduct } from '@/lib/merchant-safe-product';

// Generate JSON-LD structured data for product
// NOTE: Reviews/ratings intentionally removed - Google requires real customer reviews
const generateProductJsonLd = (
  product: {
    id: string;
    name: string;
    slug?: string | null;
    price: number;
    compare_at_price?: number | null;
    image_url?: string | null;
    images?: string[] | null;
    description?: string | null;
    category?: string | null;
    stock?: number | null;
    is_active?: boolean | null;
  },
  bestseller: {
    seo_description?: string | null;
    hero_headline?: string | null;
    slug: string;
  },
  reviews: Array<{ rating: number; title: string; content: string | null }> = []
) => {
  // CANONICAL URL: Always use the product's canonical URL, never the bestseller URL
  // This prevents "Duplicate page without user-selected canonical" in GSC
  const canonicalProductUrl = `https://getpawsy.pet/product/${product.slug || product.id}`;
  // Use centralized availability logic
  const schemaAvailability = computeAvailability(product);
  const availability = schemaAvailability.isInStock
    ? 'https://schema.org/InStock' 
    : 'https://schema.org/OutOfStock';

  const imagesArray = Array.isArray(product.images) ? product.images : [];
  const images = imagesArray.length > 0
    ? imagesArray 
    : product.image_url 
      ? [product.image_url] 
      : [];

  // Dynamic priceValidUntil - 12 months from now
  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);
  const priceValidUntilStr = priceValidUntil.toISOString().split('T')[0];

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
      url: canonicalProductUrl,
      priceCurrency: 'USD',
      price: getDisplayPrice(product as MerchantProduct).price.toFixed(2),
      priceValidUntil: priceValidUntilStr,
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: 'GetPawsy',
        url: 'https://getpawsy.pet'
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        '@id': 'https://getpawsy.pet/#returnpolicy',
        url: 'https://getpawsy.pet/returns',
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
        refundType: 'https://schema.org/FullRefund'
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
              maxValue: 1,
              unitCode: 'd'
            },
            transitTime: {
              '@type': 'QuantitativeValue',
              minValue: 0,
              maxValue: 6,
              unitCode: 'd'
            }
          }
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
              maxValue: 1,
              unitCode: 'd'
            },
            transitTime: {
              '@type': 'QuantitativeValue',
              minValue: 0,
              maxValue: 6,
              unitCode: 'd'
            }
          }
        }
      ]
    },
    // Conditionally add real review data when approved reviews exist
    ...(reviews.length > 0 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1),
        reviewCount: reviews.length,
        bestRating: '5',
        worstRating: '1',
      },
      review: reviews.slice(0, 10).map((r) => ({
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: r.rating,
          bestRating: 5,
          worstRating: 1,
        },
        reviewBody: r.content || r.title || '',
        author: { '@type': 'Person', name: 'Verified Buyer' },
      })),
    } : {}),
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
  const [searchParams] = useSearchParams();
  const isDebugMode = searchParams.get('debug') === '1';
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { trigger } = useHaptic();
  const { addToRecentlyViewed, getRecentlyViewedIds } = useRecentlyViewed();
  const isMobile = useIsMobile();
  useCanonical(`/product/${slug || ''}`);
  
  // A/B Test for bundle strategies
  // Variant A: Frequently Bought Together (FBT) - 10% discount
  // Variant B: Buy More, Save More (Volume) - tiered discounts
  const abTest = useBundleABTest();
  
  // Image gallery state
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [volumeDiscount, setVolumeDiscount] = useState(0);
  const [orderBumpChecked, setOrderBumpChecked] = useState(false);
  const [orderBumpProduct, setOrderBumpProduct] = useState<{id: string; name: string; price: number; image_url?: string | null; slug?: string | null; is_active?: boolean | null;} | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [showPostAddUpsell, setShowPostAddUpsell] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<{
    vid: string;
    pid: string;
    variantKey: string;
    variantNameEn: string;
    variantSku: string;
    variantImage?: string;
    variantWeight: number;
    variantSellPrice: number;
    variantCostPrice?: number;
  } | null>(null);
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
          products_public!bestsellers_product_id_fkey (
            id,
            name,
            slug,
            price,
            compare_at_price,
            image_url,
            images,
            description,
            category,
            stock,
            shipping_time,
            is_active,
            variants
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

  const product = bestseller?.products_public;
  const sellingPoints: SellingPoint[] = bestseller?.selling_points 
    ? (bestseller.selling_points as unknown as SellingPoint[])
    : [];

  // Parse product variants with safe extraction
  interface ProductVariant {
    vid: string;
    pid: string;
    variantKey: string;
    variantNameEn: string;
    variantSku: string;
    variantImage?: string;
    variantWeight: number;
    variantSellPrice: number;
    variantCostPrice?: number;
  }

  const variants: ProductVariant[] = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    
    const productPrice = Number(product.price) || 0;
    const productWeight = 200; // Default weight
    
    return (product.variants as unknown[]).map((rawVariant) => {
      if (!rawVariant || typeof rawVariant !== 'object') return null;
      
      const variant = rawVariant as Record<string, unknown>;
      
      const variantPrice = Number(variant.variantSellPrice) || 0;
      const variantWeight = Number(variant.variantWeight) || productWeight;
      
      // Helper to safely extract string
      const extractString = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return '';
        return String(val);
      };
      
      const vid = extractString(variant.vid);
      const pid = extractString(variant.pid);
      const safeVariantKey = extractString(variant.variantKey);
      const safeVariantNameEn = extractString(variant.variantNameEn);
      const safeVariantSku = extractString(variant.variantSku);
      const variantImage = extractString(variant.variantImage) || undefined;
      
      const displayName = safeVariantKey || safeVariantNameEn || safeVariantSku || 'Option';
      
      // Check if the variant price seems like a cost price
      const isProbablyCostPrice = variantPrice > 0 && variantPrice < productPrice * 0.4;
      
      const cleanVariant: ProductVariant = {
        vid,
        pid,
        variantKey: displayName,
        variantNameEn: safeVariantNameEn || displayName,
        variantSku: safeVariantSku,
        variantImage,
        variantWeight,
        variantSellPrice: isProbablyCostPrice ? productPrice : variantPrice,
        variantCostPrice: isProbablyCostPrice ? variantPrice : undefined,
      };
      
      return cleanVariant;
    }).filter((v): v is ProductVariant => v !== null);
  }, [product?.variants, product?.price]);

  // Auto-select first variant when variants load
  useEffect(() => {
    if (variants.length > 0 && !selectedVariant) {
      setSelectedVariant(variants[0]);
    }
  }, [variants, selectedVariant]);

  // Fetch reviews for this product
  const { data: reviews = [], refetch: refetchReviews } = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data, error } = await supabase
        .from('product_reviews')
        .select('id, product_id, rating, title, content, created_at, helpful_count, is_verified_buyer, reviewer_name')
        .eq('product_id', product.id)
        .eq('is_approved', true)
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
    setVolumeDiscount(0);
    setOrderBumpChecked(false);
    setShowStickyBar(false);
    
    // Add current product to recently viewed
    if (product?.id) {
      addToRecentlyViewed(product.id);
    }
  }, [slug, product?.id, addToRecentlyViewed]);

  // Track A/B test variant viewed
  useEffect(() => {
    if (product?.id && abTest.variant) {
      abTest.trackVariantViewed(product.id);
    }
  }, [product?.id, abTest]);

  // Set order bump product when related products load
  useEffect(() => {
    if (relatedProducts.length >= 3) {
      // Use the third related product for order bump (first two used in bundle)
      const bumpProduct = relatedProducts[2];
      setOrderBumpProduct({
        id: bumpProduct.id,
        name: bumpProduct.name,
        price: Number(bumpProduct.price),
        image_url: bumpProduct.image_url,
        slug: (bumpProduct as { slug?: string }).slug,
        is_active: bumpProduct.is_active,
      });
    }
  }, [relatedProducts]);

  // Show/hide sticky bar based on main add-to-cart button visibility
  useEffect(() => {
    if (!mainAddToCartRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky bar when main button is NOT visible
        const shouldShow = !entry.isIntersecting;
        setShowStickyBar(prev => prev === shouldShow ? prev : shouldShow);
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
        <Helmet>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="container px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Product Not Found</h2>
          <p className="text-muted-foreground mb-6">
            This product may have been renamed or is no longer available.
          </p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => navigate('/bestsellers')}>
              View Bestsellers
            </Button>
            <Button variant="outline" onClick={() => navigate('/products')}>
              Browse All Products
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // Use centralized availability logic — no variant stock field exists, use product stock
  const availabilityResult = computeAvailability(product);
  const inStock = availabilityResult.isInStock;

  // Temporary debug log for stock diagnosis
  console.log("PDP STOCK STATE", {
    productId: product.id,
    stock: product.stock,
    is_active: product.is_active,
    inStock,
    reason: availabilityResult.reason,
  });

  const handleAddToCart = () => {
    if (!product || !inStock) return;
    
    trigger('medium');
    
    // Trigger flying animation
    triggerAddToCart(
      images[selectedImage] || product.image_url || '/placeholder.svg',
      addToCartButtonRef.current
    );
    
    // Calculate the discounted price (volume discount applies for Variant B)
    const discountedPrice = volumeDiscount > 0 
      ? product.price * (1 - volumeDiscount / 100)
      : product.price;
    
    // Add main product(s) with volume discount applied and variant info
    const variantSuffix = selectedVariant ? ` - ${selectedVariant.variantKey}` : '';
    const cartItemImage = selectedVariant?.variantImage || product.image_url || '/placeholder.svg';
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: selectedVariant ? `${product.id}_${selectedVariant.vid}` : product.id,
        slug: product.slug ?? undefined,
        name: `${product.name}${variantSuffix}`,
        price: discountedPrice,
        image: cartItemImage,
      });
    }
    
    // Add order bump product if checked
    if (orderBumpChecked && orderBumpProduct) {
      const bumpDiscountedPrice = orderBumpProduct.price * 0.9; // 10% discount
      addItem({
        id: orderBumpProduct.id,
        slug: orderBumpProduct.slug ?? undefined,
        name: orderBumpProduct.name,
        price: bumpDiscountedPrice,
        image: orderBumpProduct.image_url || '/placeholder.svg',
      });
    }
    
    // Calculate total savings for toast message
    const volumeSavings = volumeDiscount > 0 ? (product.price * quantity * volumeDiscount / 100) : 0;
    const bumpSavings = orderBumpChecked && orderBumpProduct ? orderBumpProduct.price * 0.1 : 0;
    const totalSavings = volumeSavings + bumpSavings;
    
    // Track A/B test for Volume bundle (Variant B)
    if (abTest.isVariantB && quantity > 1) {
      abTest.trackBundleItemAdded({
        bundleType: 'Volume',
        numberOfItemsAdded: quantity,
        addedValueUsd: discountedPrice * quantity,
      });
    }
    
    // Track add_to_cart with variant context
    const totalItems = quantity + (orderBumpChecked && orderBumpProduct ? 1 : 0);
    const totalValue = (discountedPrice * quantity) + (orderBumpChecked && orderBumpProduct ? orderBumpProduct.price * 0.9 : 0);
    abTest.trackAddToCart({
      totalItemsInCart: totalItems,
      cartValueUsd: totalValue,
    });
    
    if (totalSavings > 0) {
      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Added to cart!</span>
          <span className="text-sm text-muted-foreground">
            You saved ${totalSavings.toFixed(2)} on this order
          </span>
        </div>
      );
    } else {
      toast.success(`${quantity}x ${product.name} added to cart!`);
    }
    
    // Show post-add upsell modal on mobile (only if we have related products and not already showing order bump)
    if (isMobile && relatedProducts.length > 0 && !orderBumpChecked) {
      setTimeout(() => setShowPostAddUpsell(true), 500);
    }
  };

  // Handle volume discount selection
  const handleVolumeChange = (newQuantity: number, discountPercent: number) => {
    setQuantity(newQuantity);
    setVolumeDiscount(discountPercent);
  };

  // Handle order bump toggle
  const handleOrderBumpToggle = (checked: boolean, bumpProduct: { id: string; name: string; price: number }) => {
    setOrderBumpChecked(checked);
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

  const { percent: discount } = getProductDiscount(product.price, product.compare_at_price);

  // Generate structured data with real reviews when available
  const productJsonLd = generateProductJsonLd(product, bestseller, reviews);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd(product.name, bestseller.slug);

  return (
    <Layout>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>{bestseller.seo_title || `${product.name} | GetPawsy Bestseller`}</title>
        <meta 
          name="description" 
          content={bestseller.seo_description || product.description || `Discover ${product.name} - one of our bestsellers. Buy now with free shipping on eligible orders over $35.`}
        />
        {bestseller.meta_keywords && (
          <meta name="keywords" content={bestseller.meta_keywords.join(', ')} />
        )}
        {/* Canonical managed by useCanonical hook — not duplicated here */}
        {/* NOINDEX: Bestseller pages are marketing views of canonical products, not separate indexable entities */}
        <meta name="robots" content="noindex, follow" />
        
        {/* Open Graph */}
        <meta property="og:type" content="product" />
        <meta property="og:title" content={bestseller.hero_headline || product.name} />
        <meta property="og:description" content={bestseller.seo_description || product.description || ''} />
        <meta property="og:image" content={product.image_url || '/og-image.png'} />
        <meta property="og:url" content={`https://getpawsy.pet/product/${product.slug || product.id}`} />
        <meta property="product:price:amount" content={getDisplayPrice(product as MerchantProduct).price.toFixed(2)} />
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
        <section className="relative py-6 lg:py-10 overflow-hidden bestseller-hero-section">
          {/* Decorative background */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background pointer-events-none" />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-primary/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-accent/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          <div className="container px-4 relative z-10">
            <div className="grid lg:grid-cols-2 gap-6 lg:gap-12 items-start bestseller-grid">
              {/* Product Image Gallery */}
              <motion.div 
                className="relative space-y-4 bestseller-gallery"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Mobile Gallery - uses Embla Carousel for reliable swipe */}
                {isMobile ? (
                  <MobileProductGallery
                    images={images}
                    productName={product.name}
                    discount={discount}
                    productId={product.id}
                    onImageClick={(index) => {
                      setSelectedImage(index);
                      setLightboxOpen(true);
                    }}
                    badge={
                      <div className="flex gap-2 flex-wrap">
                        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-3 py-1.5 text-sm font-semibold shadow-lg">
                          <Award className="w-3 h-3 mr-1" />
                          #{bestseller.rank}
                        </Badge>
                        {discount > 0 && (
                          <Badge variant="destructive" className="px-2 py-1.5 text-xs">
                            -{discount}%
                          </Badge>
                        )}
                      </div>
                    }
                  />
                ) : (
                  <DesktopProductGallery
                    images={images}
                    productName={product.name}
                    discount={discount}
                    productId={product.id}
                    onImageClick={(index) => {
                      setSelectedImage(index);
                      setLightboxOpen(true);
                    }}
                    badge={
                      <div className="flex gap-2 flex-wrap">
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
                    }
                  />
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div 
                className="space-y-6 lg:sticky lg:top-24 bestseller-info-section"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Category & Bestseller Tag */}
                <div className="flex items-center gap-3 flex-wrap">
                  {product.category && (
                    <Link 
                      to={getCategoryCollectionUrl(product.category)}
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

                {/* Trust Line - Compact Trust Signals */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>Loved by 500+ dog owners across the US</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-primary" />
                    <span>Estimated delivery: 5–10 business days</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-primary" />
                    <span>30-Day Return Policy</span>
                  </span>
                </div>

                {/* Rating with social proof */}
                <motion.div 
                  className="flex items-center gap-4 p-3 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl border border-amber-200/50 dark:border-amber-800/30"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex">
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
                  </div>
                  <div className="flex-1 text-sm">
                    {reviews.length > 0 ? (
                      <>
                        <span className="font-semibold">{averageRating.toFixed(1)}</span>
                        <span className="text-muted-foreground ml-1">
                          ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Be the first to review</span>
                    )}
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

                {/* Variant Selector - Show when multiple variants exist */}
                {variants.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35 }}
                    className="space-y-3 bg-muted/30 rounded-2xl p-4 border border-border/50"
                  >
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      Choose your option: <span className="text-primary">{selectedVariant ? selectedVariant.variantKey : 'Select one'}</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {variants.map((variant) => {
                        const isSelected = selectedVariant?.vid === variant.vid;
                        
                        // Color detection for visual indicator
                        const colorMap: Record<string, string> = {
                          'blue': '#3b82f6', 'light blue': '#7dd3fc', 'red': '#ef4444',
                          'green': '#22c55e', 'yellow': '#eab308', 'orange': '#f97316',
                          'purple': '#a855f7', 'pink': '#ec4899', 'black': '#171717',
                          'white': '#f5f5f5', 'gray': '#6b7280', 'grey': '#6b7280',
                          'brown': '#92400e', 'beige': '#d4a574', 'navy': '#1e3a5a',
                        };
                        
                        const variantLower = variant.variantKey.toLowerCase();
                        const detectedColor = Object.keys(colorMap).find(c => variantLower.includes(c));
                        const colorHex = detectedColor ? colorMap[detectedColor] : null;
                        
                        return (
                          <motion.button
                            key={variant.vid}
                            onClick={() => setSelectedVariant(variant)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary shadow-soft ring-2 ring-primary/20'
                                : 'border-border hover:border-primary/50 bg-background'
                            }`}
                          >
                            {colorHex && (
                              <span 
                                className="w-4 h-4 rounded-full border border-border/50 flex-shrink-0"
                                style={{ backgroundColor: colorHex }}
                              />
                            )}
                            <span className="text-sm font-medium">{variant.variantKey}</span>
                            {isSelected && <Check className="w-4 h-4 text-primary" />}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* A/B Test: Variant A shows Frequently Bought Together */}
                {abTest.isVariantA && (relatedLoading || relatedProducts.length > 0) && (
                  <BestsellerBundleSection
                    currentProduct={{
                      id: product.id,
                      name: product.name,
                      price: Number(product.price),
                      compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
                      image_url: product.image_url,
                      slug: bestseller.slug,
                      category: product.category,
                      is_active: product.is_active,
                    }}
                    relatedProducts={(relatedProducts || []).map(p => ({
                      id: p.id,
                      name: p.name,
                      price: Number(p.price),
                      compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
                      image_url: p.image_url,
                      slug: (p as { slug?: string }).slug,
                      category: p.category,
                      is_active: p.is_active,
                    }))}
                    isLoading={relatedLoading}
                    onBundleAdd={(data) => {
                      abTest.trackBundleItemAdded({
                        bundleType: 'FBT',
                        numberOfItemsAdded: data.itemCount,
                        addedValueUsd: data.totalValue,
                      });
                    }}
                  />
                )}

                {/* Stock Debug - Only visible with ?debug=1 */}
                {isDebugMode && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 rounded-lg text-xs font-mono">
                    <p className="font-bold text-yellow-800 dark:text-yellow-200 mb-1">Stock Debug (Dropship Model):</p>
                    <ul className="space-y-0.5 text-yellow-700 dark:text-yellow-300">
                      <li>• is_active: {String(product.is_active)}</li>
                      <li>• available: {String((product as { available?: boolean }).available)}</li>
                      <li>• stock: {product.stock === null ? 'null' : product.stock === undefined ? 'undefined' : product.stock}</li>
                      <li>• computed: {availabilityResult.isInStock ? 'in_stock' : 'out_of_stock'}</li>
                      <li>• reason: {availabilityResult.reason}</li>
                      <li>• inStock: {String(inStock)}</li>
                      <li>• product.id: {product.id}</li>
                    </ul>
                    <p className="font-bold text-blue-800 dark:text-blue-200 mt-2 mb-1">A/B Test Debug:</p>
                    <ul className="space-y-0.5 text-blue-700 dark:text-blue-300">
                      <li>• variant: {abTest.variant} ({abTest.isVariantA ? 'Frequently Bought Together' : 'Buy More, Save More'})</li>
                      <li>• device: {abTest.deviceType}</li>
                    </ul>
                  </div>
                )}

                {/* Low Stock Badge */}
                {inStock && product.stock != null && product.stock > 0 && product.stock <= 10 && (
                  <LowStockBadge stock={product.stock} />
                )}

                {/* Stock Status */}
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

                {/* Shipping Info */}
                <ShippingCountdown />

                <Separator className="my-2" />

                {/* A/B Test: Variant B shows Buy More, Save More */}
                {abTest.isVariantB && (
                  <VolumeDiscountSelector
                    basePrice={product.price}
                    onQuantityChange={handleVolumeChange}
                    selectedQuantity={quantity}
                  />
                )}

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
                      Get This for My Pet
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

                {/* Trust Microcopy - Below Add to Cart */}
                <TrustMicrocopy className="pt-3" />
                <ShippingTransparency variant="inline" className="mt-2" />

                {/* Order Bump - Inline Upsell */}
                {orderBumpProduct && (
                  <OrderBump
                    product={orderBumpProduct}
                    isChecked={orderBumpChecked}
                    onToggle={handleOrderBumpToggle}
                    discountPercent={10}
                  />
                )}

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
                      <p className="font-semibold">Free Shipping Available</p>
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
                      <p className="text-muted-foreground text-xs">Easy return process</p>
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

              {/* Reviews List — only show when ≥3 reviews */}
              {reviews.length >= 3 && (
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
              )}
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
                      We offer free shipping on eligible orders over ${FREE_SHIPPING_THRESHOLD}. Orders under ${FREE_SHIPPING_THRESHOLD} ship for a flat rate of ${FLAT_SHIPPING_RATE.toFixed(2)}. 
                      Standard delivery takes {DELIVERY_TIME_STANDARD}. Once your order is shipped, you'll receive a tracking number to monitor your package.
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
                      We offer a {RETURN_WINDOW_DAYS}-day return policy. Items must be unused and in original packaging. 
                      Contact us to arrange a return per our policy.
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
                Find the right products for your pet. Browse our selection and enjoy free shipping on eligible orders over $35.
                <span className="block mt-2 text-primary font-medium">Estimated delivery: 5–10 business days.</span>
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
                  <span>30-day return policy</span>
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
              className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  {/* Product thumbnail */}
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 border border-border/50 shadow-sm">
                    <img
                      src={images[0]}
                      alt={product?.name || ''}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  
                  {/* Product info with discount badge */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">{product?.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-base font-bold text-primary">${product?.price.toFixed(2)}</span>
                      {product?.compare_at_price && product.compare_at_price > product.price && (
                        <>
                          <span className="text-xs text-muted-foreground line-through">${product.compare_at_price.toFixed(2)}</span>
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-semibold">
                            Save {discount}%
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  {/* CTA Button - Secure Yours Now */}
                  <motion.div whileTap={{ scale: 0.97 }} className="flex-shrink-0">
                    <Button
                      onClick={handleAddToCart}
                      disabled={!inStock}
                      className="h-11 px-5 rounded-full bg-gradient-to-r from-primary to-primary/85 hover:from-primary/95 hover:to-primary/80 shadow-lg shadow-primary/30 font-semibold text-sm"
                    >
                      Secure Yours Now
                    </Button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spacer for sticky bar on mobile */}
        {showStickyBar && <div className="md:hidden h-24" />}

        {/* Post-Add Upsell Modal (Mobile Only) */}
        <PostAddUpsellModal
          isOpen={showPostAddUpsell}
          onClose={() => setShowPostAddUpsell(false)}
          currentProduct={{
            id: product.id,
            name: product.name,
            price: Number(product.price),
            image_url: product.image_url,
            slug: bestseller.slug,
          }}
          upsellProduct={relatedProducts.length > 1 ? {
            id: relatedProducts[1].id,
            name: relatedProducts[1].name,
            price: Number(relatedProducts[1].price),
            compare_at_price: relatedProducts[1].compare_at_price ? Number(relatedProducts[1].compare_at_price) : null,
            image_url: relatedProducts[1].image_url,
            slug: (relatedProducts[1] as { slug?: string }).slug,
            category: relatedProducts[1].category,
            is_active: relatedProducts[1].is_active,
          } : null}
          sourceProductId={product.id}
          sourceProductName={product.name}
        />
      </Layout>
  );
};

export default BestsellerDetail;
