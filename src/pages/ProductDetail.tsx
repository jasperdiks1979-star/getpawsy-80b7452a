import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, Heart, Truck, Shield, Minus, Plus, ChevronLeft, ChevronRight, ZoomIn, Package, Award, Star, Clock, MessageSquare, Ruler, Weight, Box, Info, Home } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileProductGallery } from '@/components/products/MobileProductGallery';
import { DesktopProductGallery } from '@/components/products/DesktopProductGallery';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { PinchZoomImage } from '@/components/ui/pinch-zoom-image';
import { useCart } from '@/contexts/CartContext';
import { useCartAnimation } from '@/contexts/CartAnimationContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { useRecentlyViewedProducts } from '@/hooks/useRecentlyViewedProducts';
import { useHaptic } from '@/hooks/useHaptic';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ReviewsList } from '@/components/reviews/ReviewsList';
import { sanitizeHtml } from '@/lib/sanitize';
import { trackViewItem } from '@/lib/analytics';
import { calculateSellingPrice } from '@/lib/pricing';
import { safeString, safeNumber, safeArray } from '@/lib/safe-render';
import { computeAvailability } from '@/lib/availability';
import USProductDescription from '@/components/products/USProductDescription';
import { generateClarityIntro } from '@/components/products/ClarityIntro';
import { DeliveryReassurance } from '@/components/products/DeliveryReassurance';
import { TrustMicrocopy } from '@/components/products/TrustMicrocopy';
import { ShippingTransparency } from '@/components/products/ShippingTransparency';
import { ProductShippingReturns } from '@/components/products/ProductShippingReturns';
import { WhyPetParentsLoveThis } from '@/components/products/WhyPetParentsLoveThis';
import { ProductSchema } from '@/components/seo/ProductSchema';
import { FAQSchema, generateProductFAQs } from '@/components/seo/FAQSchema';
import { ProductDetailSkeleton } from '@/components/products/ProductDetailSkeleton';
import { StockNotificationForm } from '@/components/products/StockNotificationForm';
import { RecentlyViewedCarousel } from '@/components/products/RecentlyViewedCarousel';
import { RelatedProductsCarousel } from '@/components/products/RelatedProductsCarousel';
import { FrequentlyBoughtTogether } from '@/components/products/FrequentlyBoughtTogether';
import { CompleteTheLook } from '@/components/products/CompleteTheLook';
import { useRelatedProducts } from '@/hooks/useRelatedProducts';
import { useCompleteTheLook } from '@/hooks/useCompleteTheLook';
import { CustomersAlsoBought } from '@/components/products/CustomersAlsoBought';
import { CustomersAlsoTrainWith } from '@/components/products/CustomersAlsoTrainWith';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { BuyingGuideBlock } from '@/components/seo/BuyingGuideBlock';
import { PopularGuidesBlock } from '@/components/seo/PopularGuidesBlock';
import { HeroProductBoost } from '@/components/products/HeroProductBoost';
import { ProductBundleUpsell } from '@/components/products/ProductBundleUpsell';
import { ExploreMoreCategory } from '@/components/seo/ExploreMoreCategory';
import { ProductUseCases } from '@/components/products/ProductUseCases';
import { CatTreeAuthorityBadges } from '@/components/products/CatTreeAuthorityBadges';
import { PriceAnchoringSection } from '@/components/products/PriceAnchoringSection';
import { FreeShippingBar } from '@/components/products/FreeShippingBar';
import { ProductComparisonTable } from '@/components/products/ProductComparisonTable';
import { ProductFAQAccordion } from '@/components/products/ProductFAQAccordion';
import { ProductProblemSolution } from '@/components/products/ProductProblemSolution';
import { ClusterAuthorityBlock } from '@/components/authority/ClusterAuthorityBlock';
import { inferClusterFromCategory } from '@/lib/cluster-config';
import { ProductFeatureGrid } from '@/components/products/ProductFeatureGrid';
import { ProductSpecsTable } from '@/components/products/ProductSpecsTable';
import { SimilarProductsCompare } from '@/components/products/SimilarProductsCompare';
import { LowStockBadge } from '@/components/products/LowStockBadge';
import { useGuidesList } from '@/hooks/useGuides';
import {
  DELIVERY_TIME_STANDARD,
  TRUST_BADGES,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  US_FULFILLMENT_NOTE,
} from '@/lib/shipping-constants';
import { isAdTraffic } from '@/lib/ad-traffic';
import { VolumeDiscountSelector } from '@/components/products/VolumeDiscountSelector';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface ProductVariant {
  vid: string;
  pid: string;
  variantNameEn: string;
  variantSku: string;
  variantImage?: string;
  variantKey: string;
  variantWeight: number;
  variantSellPrice: number;
  variantCostPrice?: number; // Original cost price from CJ
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { addToRecentlyViewed, getRecentlyViewedIds } = useRecentlyViewed();
  const addToCartButtonRef = useRef<HTMLButtonElement>(null);
  const mainAddToCartRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [volumeDiscount, setVolumeDiscount] = useState(0);
  const autoplayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const haptic = useHaptic();
  const isMobile = useIsMobile();

  const handleDragEnd = (imagesLength: number, offsetX: number, velocityX: number) => {
    const swipe = offsetX + velocityX * 50; // Factor in velocity for snappier feel
    
    if (swipe < -minSwipeDistance) {
      // Swiped left - next image
      setSelectedImage(prev => prev === imagesLength - 1 ? 0 : prev + 1);
      haptic.lightTap(); // Haptic feedback on swipe
      pauseAutoplay();
    } else if (swipe > minSwipeDistance) {
      // Swiped right - previous image
      setSelectedImage(prev => prev === 0 ? imagesLength - 1 : prev - 1);
      haptic.lightTap(); // Haptic feedback on swipe
      pauseAutoplay();
    }
    
    setDragX(0);
    setIsDragging(false);
  };

  // Pause autoplay helper (defined early for use in handleDragEnd)
  const pauseAutoplay = () => {
    setAutoplayPaused(true);
    if (autoplayTimeoutRef.current) {
      clearTimeout(autoplayTimeoutRef.current);
    }
    autoplayTimeoutRef.current = setTimeout(() => {
      setAutoplayPaused(false);
    }, 8000);
  };

  // Helper function to check if a string is a valid UUID
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Fetch product from database - supports both UUID and slug
  // Uses products_public view which filters out duplicates automatically
  // If product not found in view, checks if it's a duplicate and redirects to canonical
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      if (!id) return null;

      // If it's a valid UUID, query by id
      if (isValidUUID(id)) {
        const { data, error } = await supabase
          .from('products_public')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        
        if (error) throw error;
        
        // If not found in view, check if it's a duplicate product
        if (!data) {
          const { data: dupData } = await supabase
            .from('products')
            .select('is_duplicate, canonical_product_id')
            .eq('id', id)
            .maybeSingle();
          
          if (dupData?.is_duplicate && dupData?.canonical_product_id) {
            // Fetch canonical product's slug for redirect
            const { data: canonical } = await supabase
              .from('products_public')
              .select('slug, id')
              .eq('id', dupData.canonical_product_id)
              .maybeSingle();
            
            if (canonical) {
              return { ...canonical, _redirect: true } as any;
            }
          }
        }
        
        return data;
      }

      // Otherwise, try to find by slug first
      const { data: slugData, error: slugError } = await supabase
        .from('products_public')
        .select('*')
        .eq('slug', id)
        .maybeSingle();
      
      if (slugError) throw slugError;
      if (slugData && slugData.is_active) return slugData;

      // If slug not found in view, check if it's a duplicate
      if (!slugData) {
        const { data: dupBySlug } = await supabase
          .from('products')
          .select('is_duplicate, canonical_product_id')
          .eq('slug', id)
          .maybeSingle();
        
        if (dupBySlug?.is_duplicate && dupBySlug?.canonical_product_id) {
          const { data: canonical } = await supabase
            .from('products_public')
            .select('slug, id')
            .eq('id', dupBySlug.canonical_product_id)
            .maybeSingle();
          
          if (canonical) {
            return { ...canonical, _redirect: true } as any;
          }
        }
      }

      // Fallback: try to find by name (for legacy URLs)
      const searchName = id.replace(/-/g, ' ').toLowerCase();
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .ilike('name', `%${searchName}%`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Redirect to canonical product if this is a duplicate, or to slug URL if accessed via UUID
  useEffect(() => {
    if (product?._redirect) {
      navigate(`/product/${product.slug || product.id}`, { replace: true });
      return;
    }
    if (product?.slug && id && isValidUUID(id)) {
      navigate(`/product/${product.slug}`, { replace: true });
    }
  }, [product, id, navigate]);

  // Get recently viewed product IDs ONCE at the top level
  // This prevents duplicate useRecentlyViewed hook calls in child hooks
  const recentlyViewedIds = useMemo(() => getRecentlyViewedIds(id), [getRecentlyViewedIds, id]);

  // Fetch related products with enhanced category and keyword matching
  // Pass recentlyViewedIds to avoid duplicate hook calls
  const { data: relatedProducts, isLoading: relatedLoading } = useRelatedProducts({
    productId: product?.id || '',
    category: product?.category || null,
    productName: product?.name || '',
    maxItems: 8,
    enabled: !!product?.id,
    recentlyViewedIds,
  });

  // Fetch complementary products for "Complete the Look"
  const { data: complementaryProducts, isLoading: complementaryLoading } = useCompleteTheLook({
    productId: product?.id || '',
    productName: product?.name || '',
    category: product?.category || null,
    maxItems: 4,
    enabled: !!product?.id,
  });

  // Fetch recently viewed products with React Query caching
  // Pass recentlyViewedIds to avoid duplicate hook calls
  const { data: recentlyViewedProducts, isLoading: recentlyViewedLoading } = useRecentlyViewedProducts({
    recentlyViewedIds,
  });

  // Fetch guides for Related Guides section
  const { data: allGuides } = useGuidesList();
  const relatedGuides = useMemo(() => {
    if (!allGuides || !product?.category) return [];
    const cat = product.category.toLowerCase();
    return allGuides.filter((g) =>
      g.keywords.some((kw) => cat.includes(kw.split(' ')[0])) ||
      g.relatedCategories.some((rc) => cat.includes(rc.replace(/-/g, ' ').split(' ')[0]))
    ).slice(0, 3);
  }, [allGuides, product?.category]);

  // Fetch product reviews
  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', id)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const handleReviewsRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product-reviews', id] });
  };

  // Parse variants from JSON and ensure prices are calculated correctly
  // Also ensure all string properties are properly converted to avoid React error #310
  // CRITICAL: Only extract the fields we need - do NOT spread the original variant object
  // as it may contain nested objects (inventories, combineVariants, etc.) that cause React #310
  const variants: ProductVariant[] = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    
    const productPrice = Number(product.price) || 0;
    const productWeight = Number(product.weight) || 200;
    
    return (product.variants as unknown[]).map((rawVariant) => {
      // Type guard - ensure we have an object
      if (!rawVariant || typeof rawVariant !== 'object') return null;
      
      const variant = rawVariant as Record<string, unknown>;
      
      const variantPrice = Number(variant.variantSellPrice) || 0;
      const variantWeight = Number(variant.variantWeight) || productWeight;
      
      // CRITICAL: Helper to safely extract string - converts null/undefined/objects to empty string
      // This prevents React error #310 "Objects are not valid as a React child"
      const extractString = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return '';
        return String(val);
      };
      
      // Extract ONLY the fields we need - never spread the raw variant
      const vid = extractString(variant.vid);
      const pid = extractString(variant.pid);
      const safeVariantKey = extractString(variant.variantKey);
      const safeVariantNameEn = extractString(variant.variantNameEn);
      const safeVariantSku = extractString(variant.variantSku);
      const variantImage = extractString(variant.variantImage) || undefined;
      
      // Generate a display-friendly name, prioritizing variantKey or variantNameEn
      const displayName = safeVariantKey || safeVariantNameEn || safeVariantSku || 'Option';
      
      // Check if the variant price seems like a cost price (much lower than product selling price)
      // If variantSellPrice is less than 40% of product price, it's likely still the cost price
      const isProbablyCostPrice = variantPrice > 0 && variantPrice < productPrice * 0.4;
      
      // Build a clean variant object with ONLY the fields we need
      const cleanVariant: ProductVariant = {
        vid,
        pid,
        variantKey: displayName,
        variantNameEn: safeVariantNameEn || displayName,
        variantSku: safeVariantSku,
        variantImage,
        variantWeight,
        variantSellPrice: isProbablyCostPrice 
          ? calculateSellingPrice(variantPrice, variantWeight).sellingPrice 
          : variantPrice,
        variantCostPrice: isProbablyCostPrice ? variantPrice : undefined,
      };
      
      return cleanVariant;
    }).filter((v): v is ProductVariant => v !== null);
  }, [product]);

  // Group variants - CJ uses variantKey as the display name
  // CRITICAL: Must be wrapped in useMemo to ensure stable hook count
  const variantGroups = useMemo(() => {
    return variants.reduce((groups, variant) => {
      const groupName = 'Option';
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      
      if (!groups[groupName].find(v => v.vid === variant.vid)) {
        groups[groupName].push(variant);
      }
      
      return groups;
    }, {} as Record<string, ProductVariant[]>);
  }, [variants]);

  // Scroll to top when navigating to product page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // Track product views in visitor analytics
  const { trackProductView } = useVisitorTracking();

  // Reset selected image when product changes and add to recently viewed
  useEffect(() => {
    setSelectedImage(0);
    setSelectedVariant(null);
    
    // Add current product to recently viewed and track view
    if (id && product) {
      addToRecentlyViewed(id);
      trackViewItem(id, product.name || '', product.price || 0, product.category || undefined);
      // Track in visitor analytics for enhanced product view insights
      trackProductView(product.id, product.name || '');
    }
  }, [id, product, addToRecentlyViewed, trackProductView]);

  // Update selected image when variant is selected
  useEffect(() => {
    if (selectedVariant?.variantImage) {
      const productImages = Array.isArray(product?.images) ? product.images : [];
      const images = productImages.length > 0 
        ? productImages 
        : [product?.image_url || '/placeholder.svg'];
      const variantImageIndex = images.findIndex(img => img === selectedVariant.variantImage);
      if (variantImageIndex !== -1) {
        setSelectedImage(variantImageIndex);
      }
    }
  }, [selectedVariant, product]);

  // Track if change was from autoplay (to avoid scroll interference)
  const isAutoplayChangeRef = useRef(false);

  // Auto-scroll thumbnail into view (only for user-initiated changes)
  useEffect(() => {
    // Skip scroll if this was an autoplay change
    if (isAutoplayChangeRef.current) {
      isAutoplayChangeRef.current = false;
      return;
    }
    
    const thumbnail = thumbnailRefs.current[selectedImage];
    if (thumbnail) {
      thumbnail.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedImage]);

  // Flatten images array (handle nested arrays from database) and filter valid URLs
  // CRITICAL: Must be wrapped in useMemo for stable hook count across renders
  const images = useMemo(() => {
    const productImagesArray = Array.isArray(product?.images) ? product.images : [];
    const rawImages = productImagesArray.length > 0 
      ? productImagesArray.flat().filter((img): img is string => 
          typeof img === 'string' && 
          img.startsWith('http') && 
          !img.includes('undefined')
        )
      : [];
    
    // Use image_url as fallback if no valid images
    return rawImages.length > 0 
      ? rawImages 
      : (product?.image_url ? [product.image_url] : ['/placeholder.svg']);
  }, [product?.images, product?.image_url]);

  // Auto-slideshow effect - moved before early returns to follow hooks rules
  useEffect(() => {
    if (!product || images.length <= 1 || autoplayPaused || lightboxOpen) return;

    const interval = setInterval(() => {
      isAutoplayChangeRef.current = true; // Mark as autoplay change to prevent scroll
      setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, [product, images.length, autoplayPaused, lightboxOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoplayTimeoutRef.current) {
        clearTimeout(autoplayTimeoutRef.current);
      }
    };
  }, []);

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
        rootMargin: '-100px 0px 0px 0px', // Trigger a bit before it's completely out of view
      }
    );

    observer.observe(mainAddToCartRef.current);

    return () => observer.disconnect();
  }, [product]);

  // Redirect to products page with search parameter if product not found
  // LANDING INTENT LOCK: Do NOT redirect ad traffic — show stable "Not Found" UI instead
  // This prevents Pinterest in-app browser issues (blank screens, content switching)
  useEffect(() => {
    if (!isLoading && !product && id) {
      // Never redirect ad traffic — stability > helpfulness for paid visitors
      if (isAdTraffic()) return;
      
      // Extract keywords from the slug/id for search
      const searchKeywords = id
        .replace(/-/g, ' ')  // Convert hyphens to spaces
        .replace(/[^a-zA-Z\s]/g, '')  // Remove non-letter characters
        .trim();
      
      const searchParam = searchKeywords ? `?search=${encodeURIComponent(searchKeywords)}` : '';
      toast.info('Product not found. Searching for similar products...');
      navigate(`/products${searchParam}`, { replace: true });
    }
  }, [isLoading, product, navigate, id]);

  if (isLoading) {
    return (
      <Layout>
        <ProductDetailSkeleton />
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <Helmet>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="min-h-[60vh] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md px-4"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Package className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Product Not Available</h1>
            <p className="text-muted-foreground mb-6">
              This product may have been renamed or is no longer available.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate('/bestsellers')}>
                View Bestsellers
              </Button>
              <Button variant="outline" onClick={() => navigate('/products')}>
                Browse All Products
              </Button>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // Use centralized availability logic (real supplier stock)
  const availabilityResult = computeAvailability(product);
  const inStock = availabilityResult.isInStock;

  const handleAddToCart = () => {
    // Prevent adding out-of-stock items
    if (!inStock) {
      toast.error('This product is out of stock');
      return;
    }
    
    haptic.success(); // Success haptic on add to cart
    
    // Trigger flying animation
    triggerAddToCart(
      selectedVariant?.variantImage || product.image_url || '/placeholder.svg',
      addToCartButtonRef.current
    );
    
    // Use variant price if selected, otherwise use product price
    const basePrice = selectedVariant?.variantSellPrice 
      ? Number(selectedVariant.variantSellPrice) 
      : Number(product.price);
    
    // Apply volume discount
    const cartPrice = volumeDiscount > 0 
      ? basePrice * (1 - volumeDiscount / 100) 
      : basePrice;
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id + (selectedVariant ? `-${selectedVariant.vid}` : ''),
        name: product.name + (selectedVariant ? ` - ${selectedVariant.variantKey || selectedVariant.variantNameEn}` : ''),
        price: Math.round(cartPrice * 100) / 100,
        image: selectedVariant?.variantImage || product.image_url || '/placeholder.svg',
        variant: selectedVariant?.variantKey || selectedVariant?.variantNameEn,
      });
    }
    
    const savings = volumeDiscount > 0 ? ` (${volumeDiscount}% off!)` : '';
    toast.success(`${quantity}x ${product.name} added to cart!${savings}`);
  };

  const handleWishlistToggle = () => {
    haptic.selection(); // Selection haptic on wishlist toggle
    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
      toast.info('Removed from wishlist');
    } else {
      addToWishlist(product.id);
      toast.success('Added to wishlist!');
    }
  };

  const discount = product.compare_at_price
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : null;

  // Check if description contains HTML
  const descriptionHasHtml = product.description?.includes('<') && product.description?.includes('>');

  const handlePrevImage = () => {
    pauseAutoplay();
    setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1);
  };

  const handleNextImage = () => {
    pauseAutoplay();
    setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
  };

  const inWishlist = isInWishlist(product.id);

  return (
    <Layout>
      {/* Tier C products: noindex, follow — remain purchasable but hidden from search */}
      {((product as any).seo_tier === 'C') && (
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
      )}
      <ProductSchema 
        product={{
          id: product.id,
          name: product.name || '',
          slug: product.slug,
          description: product.description,
          price: Number(product.price),
          compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
          image_url: product.image_url,
          images: product.images as string[] | null,
          category: product.category,
          stock: product.stock,
          sku: product.sku,
          seo_tier: (product as any).seo_tier || null,
        }}
        reviews={reviews}
      />
      <FAQSchema 
        faqs={generateProductFAQs(product.name || '', product.category || undefined)}
        pageUrl={`https://getpawsy.pet/product/${product.slug || product.id}`}
      />
      {/* Decorative background - hidden on mobile to prevent overflow */}
      <div className="hidden md:block fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-40 -left-40 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-[100vw] px-4 md:px-6 3xl:px-8 py-8 3xl:py-12 mx-auto md:container ultrawide:max-w-[1800px]">
        {/* Breadcrumbs */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 3xl:mb-8"
        >
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
                  <Link to="/products">Products</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {product.category && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to={`/products?category=${encodeURIComponent(safeString(product.category).toLowerCase().replace(/\s+/g, '-'))}`}>
                        {safeString(product.category)}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-[200px] truncate">{safeString(product.name)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 3xl:gap-24 ultrawide:gap-32 w-full">
          {/* Image Gallery */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-4 w-full max-w-full"
          >
            {/* Mobile Gallery - uses Embla Carousel for reliable swipe */}
            {isMobile ? (
              <MobileProductGallery
                images={images}
                productName={safeString(product.name)}
                discount={discount}
                onImageClick={(index) => {
                  setSelectedImage(index);
                  setLightboxOpen(true);
                }}
              />
            ) : (
              <DesktopProductGallery
                images={images}
                productName={safeString(product.name)}
                discount={discount}
                onImageClick={(index) => {
                  setSelectedImage(index);
                  setLightboxOpen(true);
                }}
              />
            )}
          </motion.div>

          {/* Product Details */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-6 w-full max-w-full overflow-hidden"
          >
            {/* Category & Title */}
            <div>
              {product.category && (
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-primary font-medium uppercase tracking-wider mb-2"
                >
                  {safeString(product.category)}
                </motion.p>
              )}
              <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground leading-tight break-words">
                {safeString(product.name)}
              </h1>
              
              {/* Rating — only shown when real verified reviews exist */}
              {reviews.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => {
                      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
                      return (
                        <Star key={i} className={`w-4 h-4 ${i < Math.round(avgRating) ? 'text-warning fill-warning' : 'text-muted'}`} />
                      );
                    })}
                  </div>
                  <a href="#reviews" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    ({reviews.length} verified review{reviews.length !== 1 ? 's' : ''})
                  </a>
                </div>
              )}
              
              {/* Cat Tree / Litter Authority Badges */}
              <CatTreeAuthorityBadges
                productName={safeString(product.name)}
                category={product.category}
                price={Number(product.price)}
                weight={product.weight ? Number(product.weight) : null}
              />
            </div>

            {/* Price */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-muted/50 rounded-2xl p-5"
            >
              {(() => {
                const displayPrice = selectedVariant?.variantSellPrice 
                  ? Number(selectedVariant.variantSellPrice) 
                  : Number(product.price);
                const originalPrice = product.compare_at_price 
                  ? Number(product.compare_at_price) 
                  : (selectedVariant?.variantSellPrice ? Number(product.price) : null);
                const currentDiscount = originalPrice 
                  ? Math.round((1 - displayPrice / originalPrice) * 100) 
                  : null;
                
                return (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl md:text-4xl font-display font-bold text-primary">
                      ${displayPrice.toFixed(2)}
                    </span>
                    {originalPrice && originalPrice > displayPrice && (
                      <>
                        <span className="text-xl text-muted-foreground line-through">
                          ${originalPrice.toFixed(2)}
                        </span>
                        {currentDiscount && currentDiscount > 0 && (
                          <Badge className="bg-accent/20 text-accent-foreground border-accent/30">
                            Save {currentDiscount}%
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
              
              {/* Selected variant badge */}
              {selectedVariant && (
                <Badge variant="outline" className="mt-3">
                  {selectedVariant.variantKey}
                </Badge>
              )}
            </motion.div>

            {/* Variants - PRIORITY: Show immediately after price for visibility */}
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
                    const displayValue = variant.variantKey || variant.variantNameEn || 'Option';
                    
                    // Detect if this is a color variant
                    const colorMap: Record<string, string> = {
                      // Basic colors
                      'red': '#ef4444', 'blue': '#3b82f6', 'green': '#22c55e', 'yellow': '#eab308',
                      'orange': '#f97316', 'purple': '#a855f7', 'pink': '#ec4899', 'black': '#000000',
                      'white': '#ffffff', 'gray': '#6b7280', 'grey': '#6b7280', 'brown': '#92400e',
                      'beige': '#d4a574', 'navy': '#1e3a5a', 'teal': '#14b8a6', 'cyan': '#06b6d4',
                      'gold': '#fbbf24', 'silver': '#9ca3af', 'rose': '#fb7185', 'coral': '#f97171',
                      'mint': '#6ee7b7', 'lavender': '#c4b5fd', 'burgundy': '#7f1d1d', 'khaki': '#c9b896',
                      'cream': '#fffdd0', 'ivory': '#fffff0', 'tan': '#d2b48c', 'chocolate': '#7b3f00',
                      // Extended colors
                      'maroon': '#800000', 'olive': '#808000', 'lime': '#00ff00', 'aqua': '#00ffff',
                      'magenta': '#ff00ff', 'violet': '#ee82ee', 'indigo': '#4b0082', 'turquoise': '#40e0d0',
                      'salmon': '#fa8072', 'peach': '#ffdab9', 'plum': '#dda0dd', 'charcoal': '#36454f',
                      'wine': '#722f37', 'mustard': '#ffdb58', 'sand': '#c2b280', 'rust': '#b7410e',
                    };
                    
                    const lowerValue = displayValue.toLowerCase();
                    const detectedColor = Object.keys(colorMap).find(color => 
                      lowerValue.includes(color) || lowerValue === color
                    );
                    const isColorVariant = !!detectedColor;
                    const colorHex = detectedColor ? colorMap[detectedColor] : null;
                    const hasImage = !!variant.variantImage;
                    
                    return (
                      <motion.button
                        key={variant.vid}
                        onClick={() => setSelectedVariant(isSelected ? null : variant)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-soft ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        {/* Color indicator dot if color detected */}
                        {isColorVariant && colorHex && (
                          <span 
                            className={`w-4 h-4 rounded-full flex-shrink-0 ${
                              ['white', 'ivory', 'cream', 'beige'].includes(detectedColor!) 
                                ? 'border border-border' 
                                : ''
                            }`}
                            style={{ backgroundColor: colorHex }}
                          />
                        )}
                        {/* Image thumbnail if available (and no color) */}
                        {hasImage && !isColorVariant && (
                          <img 
                            src={variant.variantImage} 
                            alt=""
                            className="w-6 h-6 rounded object-cover flex-shrink-0"
                          />
                        )}
                        {/* Variant name - ALWAYS shown */}
                        <span className="text-sm font-medium">{displayValue}</span>
                        {/* Price difference indicator */}
                        {variant.variantSellPrice && variant.variantSellPrice !== Number(product.price) && (
                          <span className="text-xs text-muted-foreground">
                            ${Number(variant.variantSellPrice).toFixed(2)}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Benefit Bullets — problem→outcome based for cold traffic */}
            <div className="space-y-2">
              <ul className="space-y-2">
                {(() => {
                  const cat = (product.category || '').toLowerCase();
                  const n = (product.name || '').toLowerCase();
                  const bullets: string[] = [];
                  
                  // Category-aware benefit bullets (problem → outcome)
                  if (n.includes('bed') || cat.includes('bed')) {
                    bullets.push(
                      'Relieves joint pressure so your pet wakes up rested',
                      'Removable cover for easy machine washing',
                      'Non-slip base stays put on any floor',
                      'Fits small to extra-large breeds',
                    );
                  } else if (n.includes('harness') || cat.includes('harness')) {
                    bullets.push(
                      'Stops pulling without choking or neck strain',
                      'Padded straps prevent rubbing and chafing',
                      'Reflective trim for safe evening walks',
                      'Quick-snap buckle for easy on/off',
                    );
                  } else if (/cat\s*tree|cat\s*condo|scratching/i.test(n + ' ' + cat)) {
                    bullets.push(
                      'Saves your furniture with dedicated scratching posts',
                      'Multi-level design keeps cats mentally stimulated',
                      'Supports cats up to 25+ lbs safely',
                      'Sturdy base prevents tipping during play',
                    );
                  } else if (/litter/i.test(n + ' ' + cat)) {
                    bullets.push(
                      'Sealed design traps odors at the source',
                      'Less scooping — efficient waste separation',
                      'Easy-clean removable tray saves time',
                      'High walls prevent litter scatter',
                    );
                  } else if (n.includes('toy') || cat.includes('toy')) {
                    bullets.push(
                      'Channels energy away from furniture destruction',
                      'Durable build withstands aggressive chewers',
                      'Non-toxic, pet-safe materials throughout',
                      'Engages natural problem-solving instincts',
                    );
                  } else if (n.includes('carrier') || cat.includes('carrier')) {
                    bullets.push(
                      'Reduces travel anxiety with ventilated comfort',
                      'Fits under most airline cabin seats',
                      'Secure zippers prevent escape attempts',
                      'Padded base cushions bumpy rides',
                    );
                  } else {
                    bullets.push(
                      'Premium materials built for daily pet life',
                      'Designed for comfort and ease of use',
                      'Ships fast from US warehouses',
                      'Backed by 30-day satisfaction guarantee',
                    );
                  }
                  
                  return bullets.slice(0, 5).map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <span className="text-primary mt-0.5 flex-shrink-0">✓</span>
                      <span>{b}</span>
                    </li>
                  ));
                })()}
              </ul>
            </div>

            {/* Short Description - Clarity-first intro for cold traffic */}
            <div className="text-muted-foreground leading-relaxed break-words overflow-hidden">
              <p className="text-[15px] leading-relaxed">
                {generateClarityIntro(product.name, product.category || '')}
              </p>
            </div>

            {/* Price Anchoring & Investment Reframe — luxury positioning */}
            <PriceAnchoringSection
              productName={safeString(product.name)}
              category={product.category}
              price={Number(product.price)}
            />

            {/* Why Pet Parents Choose This - Benefit-driven scannable section */}
            <WhyPetParentsLoveThis 
              productName={product.name} 
              category={product.category || ''} 
            />

            {/* Hero Product Conversion Boost — Who is this for / FAQ / urgency */}
            {product.slug && <HeroProductBoost productSlug={product.slug} />}

            {/* Free Shipping Progress Bar */}
            <FreeShippingBar previewAmount={Number(product.price)} />

            {/* Stock Status - Simple, no quantity pressure */}
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${inStock ? 'bg-success' : 'bg-destructive'}`} />
              <span className="font-medium text-foreground">
                {inStock ? 'In Stock — Ships within 24 hours from US warehouse' : 'Out of Stock'}
              </span>
            </div>

            {/* Low Stock Badge — real inventory driven */}
            <LowStockBadge stock={product.stock} threshold={10} />

            {/* Stock Notification Form - Show when out of stock */}
            {!inStock && (
              <StockNotificationForm 
                productId={product.id} 
                productName={product.name || ''} 
              />
            )}

            {/* Shipping Info - Calm, factual delivery estimate */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Truck className="w-4 h-4 text-primary" />
              <span className="text-sm">
                Estimated delivery: {DELIVERY_TIME_STANDARD}
              </span>
            </div>

            {/* Volume Discount — Buy More Save More */}
            {inStock && (
              <VolumeDiscountSelector
                basePrice={selectedVariant?.variantSellPrice ? Number(selectedVariant.variantSellPrice) : Number(product.price)}
                onQuantityChange={(newQty, discountPct) => {
                  setQuantity(newQty);
                  setVolumeDiscount(discountPct);
                }}
                selectedQuantity={quantity}
              />
            )}

            {/* Quantity & Actions - tracked for sticky bar visibility */}
            <motion.div 
              ref={mainAddToCartRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap items-center gap-4 pt-4"
            >
              {/* Quantity Selector */}
              <div className="flex items-center bg-muted/50 rounded-xl overflow-hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-none h-12 w-12 hover:bg-muted"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-12 text-center font-semibold text-lg">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-none h-12 w-12 hover:bg-muted"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Add to Cart */}
              <Button
                ref={addToCartButtonRef}
                size="lg"
                className="flex-1 h-12 gap-2 btn-organic text-base font-semibold"
                onClick={handleAddToCart}
                disabled={!inStock}
               >
                <ShoppingCart className="w-5 h-5" />
                Get This for My Pet
              </Button>

              {/* Wishlist */}
              <Button 
                variant="outline" 
                size="lg"
                className={`h-12 w-12 rounded-xl border-2 ${inWishlist ? 'border-accent bg-accent/10 text-accent' : ''}`}
                onClick={handleWishlistToggle}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? 'fill-current' : ''}`} />
              </Button>
            </motion.div>

            {/* Trust Microcopy - Below Add to Cart (Above-the-fold trust stack) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="pt-4 pb-2"
            >
              <TrustMicrocopy />
              <ShippingTransparency variant="inline" className="mt-2" />
              <ProductShippingReturns className="mt-3" />
            </motion.div>

            {/* Bundle Upsell — contextual companion product */}
            {product.slug && (
              <ProductBundleUpsell
                productSlug={product.slug}
                mainProductPrice={product.price}
                mainProductName={product.name}
              />
            )}

            {/* Compare With Similar — mini comparison module */}
            {relatedProducts && relatedProducts.length >= 2 && (
              <SimilarProductsCompare
                products={(relatedProducts || []).slice(0, 3).map(p => ({
                  id: p.id,
                  name: p.name,
                  price: Number(p.price),
                  image_url: p.image_url,
                  slug: (p as any).slug,
                  category: p.category,
                  weight: p.weight ? Number(p.weight) : null,
                }))}
                currentProductName={safeString(product.name)}
              />
            )}

            {/* Trust Features - Complementary to above microcopy */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="grid grid-cols-2 gap-3 pt-4"
            >
              {[
                { icon: Shield, title: 'Secure Checkout', subtitle: 'Powered by Stripe' },
                { icon: Award, title: TRUST_BADGES.quality.title, subtitle: TRUST_BADGES.quality.subtitle },
              ].map((feature, idx) => (
                <motion.div 
                  key={feature.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + idx * 0.1 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-foreground">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.subtitle}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Mid-Page Delivery & Returns Reassurance - Visible before scrolling to tabs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12"
        >
          <DeliveryReassurance />
        </motion.div>

        {/* Tabs Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12"
        >
          <Tabs defaultValue="description" className="w-full">
            <TabsList className="w-full justify-start border-b border-border/50 bg-transparent p-0 h-auto flex-wrap">
              <TabsTrigger 
                value="description" 
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Description
              </TabsTrigger>
              <TabsTrigger 
                value="specifications"
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Specifications
              </TabsTrigger>
              <TabsTrigger 
                value="size-guide"
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Size Guide
              </TabsTrigger>
              <TabsTrigger 
                value="shipping"
                className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
              >
                Shipping
              </TabsTrigger>
              {variants.length > 0 && (
                <TabsTrigger 
                  value="variants"
                  className="px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none font-medium"
                >
                  Options ({variants.length})
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="description" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <USProductDescription 
                  description={product.description || 'No description available.'}
                  productName={product.name}
                />
              </div>
            </TabsContent>
            
            {/* Specifications Tab */}
            <TabsContent value="specifications" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Product Specifications */}
                  <div className="space-y-4">
                    <h3 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
                      <Box className="w-5 h-5 text-primary" />
                      Product Details
                    </h3>
                    <div className="space-y-3">
                      {/* SKU hidden from customers - only visible in admin */}
                      {product.category && (
                        <div className="flex justify-between items-center py-2 border-b border-border/50">
                          <span className="text-muted-foreground">Category</span>
                          <span className="font-medium text-foreground">{product.category}</span>
                        </div>
                      )}
                      {product.weight && (
                        <div className="flex justify-between items-center py-2 border-b border-border/50">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Weight className="w-4 h-4" />
                            Weight
                          </span>
                          <span className="font-medium text-foreground">{Number(product.weight).toFixed(2)} lbs</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-2 border-b border-border/50">
                        <span className="text-muted-foreground">Availability</span>
                        <span className={`font-medium ${inStock ? 'text-success' : 'text-destructive'}`}>
                          {inStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-border/50">
                        <span className="text-muted-foreground">Sold by</span>
                        <span className="font-medium text-foreground">GetPawsy</span>
                      </div>
                    </div>
                  </div>

                  {/* Features & Benefits */}
                  <div className="space-y-4">
                    <h3 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
                      <Info className="w-5 h-5 text-primary" />
                      Features & Benefits
                    </h3>
                    <ul className="space-y-3">
                      {[
                        'Premium quality materials',
                        'Safe for all pets',
                        'Easy to clean and maintain',
                        'Durable construction',
                        'Eco-friendly packaging',
                      ].map((feature, idx) => (
                        <motion.li 
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 * idx }}
                          className="flex items-center gap-2 text-muted-foreground"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {feature}
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            {/* Size Guide Tab */}
            <TabsContent value="size-guide" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-foreground">
                    <Ruler className="w-5 h-5 text-primary" />
                    <h3 className="font-display font-semibold text-lg">Pet Size Guide</h3>
                  </div>
                  
                  <p className="text-muted-foreground">
                    Use this guide to find the perfect size for your pet. Measure your pet and compare with the chart below.
                  </p>
                  
                  {/* Size Chart Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Size</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Pet Weight</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Neck</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Chest</th>
                          <th className="py-3 px-4 text-left font-semibold text-foreground">Back Length</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { size: 'XS', weight: 'Up to 5 lbs', neck: '6-8"', chest: '10-12"', back: '8-10"' },
                          { size: 'S', weight: '5-10 lbs', neck: '8-10"', chest: '12-15"', back: '10-12"' },
                          { size: 'M', weight: '10-25 lbs', neck: '10-14"', chest: '15-20"', back: '12-16"' },
                          { size: 'L', weight: '25-50 lbs', neck: '14-18"', chest: '20-26"', back: '16-20"' },
                          { size: 'XL', weight: '50-80 lbs', neck: '18-22"', chest: '26-32"', back: '20-24"' },
                          { size: 'XXL', weight: '80+ lbs', neck: '22-26"', chest: '32-38"', back: '24-28"' },
                        ].map((row, idx) => (
                          <motion.tr 
                            key={row.size}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 * idx }}
                            className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                          >
                            <td className="py-3 px-4 font-medium text-primary">{row.size}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.weight}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.neck}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.chest}</td>
                            <td className="py-3 px-4 text-muted-foreground">{row.back}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Measuring Tips */}
                  <div className="bg-secondary/30 rounded-xl p-4 mt-4">
                    <h4 className="font-semibold text-foreground mb-2">📏 How to Measure Your Pet</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li><strong>Neck:</strong> Measure around the base of the neck where the collar sits</li>
                      <li><strong>Chest:</strong> Measure the widest part of the chest, behind the front legs</li>
                      <li><strong>Back Length:</strong> Measure from the base of the neck to the base of the tail</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="shipping" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-6">
                {[
                    { emoji: '🇺🇸', text: US_FULFILLMENT_NOTE },
                    { emoji: '📦', text: `Standard delivery: ${DELIVERY_TIME_STANDARD}` },
                    { emoji: '✨', text: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}` },
                    { emoji: '💰', text: `$${FLAT_SHIPPING_RATE.toFixed(2)} flat rate under $${FREE_SHIPPING_THRESHOLD}` },
                  ].map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className="flex items-center gap-3 text-muted-foreground"
                    >
                      <span className="text-2xl">{item.emoji}</span>
                      <span>{item.text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            {variants.length > 0 && (
              <TabsContent value="variants" className="mt-6">
                <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {variants.map((variant) => (
                      <motion.button
                        key={variant.vid}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setSelectedVariant(variant);
                          if (variant.variantImage) {
                            const idx = images.findIndex(img => img === variant.variantImage);
                            if (idx !== -1) setSelectedImage(idx);
                          }
                        }}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${
                          selectedVariant?.vid === variant.vid
                            ? 'border-primary bg-primary/10 shadow-soft'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        {variant.variantImage && (
                          <img 
                            src={variant.variantImage} 
                            alt={variant.variantNameEn || variant.variantKey || 'Product variant'}
                            className="w-full aspect-square rounded-lg object-cover mb-3"
                          />
                        )}
                        <p className="text-sm font-medium line-clamp-2 text-foreground">
                          {variant.variantNameEn || variant.variantKey || 'Option'}
                        </p>
                        {variant.variantSellPrice && (
                          <p className="text-xs text-primary mt-1 font-semibold">
                            ${Number(variant.variantSellPrice).toFixed(2)}
                          </p>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </motion.div>

        {/* Problem → Solution Block */}
        <ProductProblemSolution productName={product.name} category={product.category || ''} />

        {/* Feature Grid — 4 feature cards */}
        <ProductFeatureGrid productName={product.name} category={product.category || ''} />

        {/* Specifications Table — semantic, real product data */}
        <ProductSpecsTable product={{
          name: product.name,
          category: product.category,
          weight: product.weight ? Number(product.weight) : null,
          sku: product.sku,
        }} />

        {/* Use Case Segmentation — "Best For" */}
        <ProductUseCases productName={product.name} category={product.category || ''} />

        {/* Comparison Table — GetPawsy vs Generic */}
        <ProductComparisonTable productName={product.name} />

        {/* Visible FAQ Accordion — 10 Questions */}
        <ProductFAQAccordion productName={product.name} category={product.category || undefined} />

        {/* Cluster Authority Block — "Learn More About [Topic]" */}
        <ClusterAuthorityBlock
          clusterId={inferClusterFromCategory(product.category || '')}
          productName={product.name}
        />

        {/* Reviews Section */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-16 w-full max-w-full overflow-hidden"
          id="reviews"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
                Customer Reviews
              </h2>
              {reviews.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {reviews.length} review{reviews.length !== 1 ? 's' : ''} from our customers
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 w-full">
            {/* Review Form */}
            <div className="lg:col-span-1">
              <ReviewForm 
                productId={product.id} 
                onReviewSubmitted={handleReviewsRefresh} 
              />
            </div>

            {/* Reviews List */}
            <div className="lg:col-span-2">
              <ReviewsList 
                reviews={reviews} 
                onReviewDeleted={handleReviewsRefresh} 
              />
            </div>
          </div>
        </motion.section>

        {/* Contextual Buying Guide — category-matched cornerstone link */}
        {product?.category && (
          <BuyingGuideBlock category={product.category} />
        )}

        {/* Related Guides */}
        {relatedGuides.length > 0 && (
          <RelatedGuides guides={relatedGuides} />
        )}

        {/* Popular Buying Guides — cornerstone authority block */}
        <PopularGuidesBlock compact />

        {/* Explore More in Category — silo closure */}
        {product?.category && (
          <ExploreMoreCategory 
            category={product.category}
            currentProductId={product.id}
            currentProductSlug={product.slug}
          />
        )}

        {/* Frequently Bought Together */}
        {(relatedLoading || (relatedProducts && relatedProducts.length >= 2)) && (
          <div className="mt-16">
            <FrequentlyBoughtTogether
              currentProduct={{
                id: product.id,
                name: product.name,
                price: Number(product.price),
                compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
                image_url: product.image_url,
                slug: product.slug,
                category: product.category,
              }}
              relatedProducts={(relatedProducts || []).map(p => ({
                id: p.id,
                name: p.name,
                price: Number(p.price),
                compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
                image_url: p.image_url,
                slug: (p as { slug?: string }).slug,
                category: p.category,
              }))}
              maxItems={3}
              sourceProductId={product.id}
              sourceProductName={product.name}
              isLoading={relatedLoading}
            />
          </div>
        )}

        {/* Complete the Look */}
        {complementaryProducts && complementaryProducts.length > 0 && (
          <div className="mt-16">
            <CompleteTheLook
              products={complementaryProducts.map(p => ({
                id: p.id,
                name: p.name,
                price: Number(p.price),
                compare_at_price: p.compare_at_price ? Number(p.compare_at_price) : null,
                image_url: p.image_url,
                slug: (p as { slug?: string }).slug,
                category: p.category,
              }))}
              isLoading={complementaryLoading}
              currentProductName={product.name}
              sourceProductId={product.id}
              sourceProductName={product.name}
            />
          </div>
        )}

        {/* Related Products Carousel */}
        <div className="mt-16">
          <RelatedProductsCarousel 
            products={relatedProducts || []}
            isLoading={relatedLoading}
            title="You May Also Like"
            subtitle="Products that complement your choice"
            listId="related-products"
            listName="Related Products"
            sourceProductId={product.id}
            sourceProductName={product.name}
            crossSellType="related_products"
          />
        </div>

        {/* Customers Also Train With - Training-specific cross-sell */}
        <CustomersAlsoTrainWith
          productId={product.id}
          productName={product.name}
          productCategory={product.category || ''}
          maxItems={4}
        />

        {/* Customers Also Bought - Based on Real Purchase Data */}
        <div className="mt-16">
          <CustomersAlsoBought
            productId={product.id}
            productName={product.name}
            maxItems={4}
          />
        </div>

        {/* Recently Viewed Products Carousel */}
        {(recentlyViewedLoading || (recentlyViewedProducts && recentlyViewedProducts.length > 0)) && (
          <div className="mt-16">
            <RecentlyViewedCarousel 
              products={(recentlyViewedProducts || []).map(p => ({
                ...p,
                created_at: p.created_at || new Date().toISOString(),
                updated_at: p.updated_at || new Date().toISOString(),
              }))} 
              isLoading={recentlyViewedLoading}
            />
          </div>
        )}
      </div>

      {/* Image Lightbox */}
      <ImageLightbox
        images={images}
        initialIndex={selectedImage}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        alt={product.name}
      />

      {/* Sticky Add to Cart - Mobile Only - Shows when main button is out of view */}
      <AnimatePresence>
        {showStickyBar && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] safe-area-bottom"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
              {/* Price */}
              <div className="flex-shrink-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-primary">
                    ${Number(product.price).toFixed(2)}
                  </span>
                  {product.compare_at_price && (
                    <span className="text-xs text-muted-foreground line-through">
                      ${Number(product.compare_at_price).toFixed(2)}
                    </span>
                  )}
                </div>
                {inStock ? (
                  <span className="text-xs text-success">In Stock</span>
                ) : (
                  <span className="text-xs text-destructive">Out of Stock</span>
                )}
              </div>

              {/* Trust badge - desktop only */}
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                <Truck className="w-3.5 h-3.5 text-primary" />
                <span>Free US Shipping ${FREE_SHIPPING_THRESHOLD}+</span>
                <span className="mx-1">•</span>
                <Shield className="w-3.5 h-3.5 text-primary" />
                <span>30-Day Returns</span>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => {
                    haptic.selection();
                    setQuantity(Math.max(1, quantity - 1));
                  }}
                  disabled={quantity <= 1}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => {
                    haptic.selection();
                    setQuantity(quantity + 1);
                  }}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              {/* Add to Cart Button */}
              <Button
                className="flex-1 md:flex-none md:min-w-[220px] gap-2 rounded-full font-semibold shadow-soft"
                size="lg"
                onClick={handleAddToCart}
                disabled={!inStock}
               >
                <ShoppingCart className="w-4 h-4" />
                Get This for My Pet
              </Button>

              {/* Wishlist Button */}
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 flex-shrink-0 rounded-full border-2"
                onClick={handleWishlistToggle}
              >
                <Heart className={`w-5 h-5 transition-colors ${inWishlist ? 'fill-destructive text-destructive' : ''}`} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer for sticky bar */}
      <div className={`transition-all ${showStickyBar ? 'h-20' : 'h-0'}`} />
    </Layout>
  );
};

export default ProductDetail;
