import { useParams, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Heart, Truck, Shield, Minus, Plus, ChevronLeft, ChevronRight, ZoomIn, Package, Award, Star, Clock, MessageSquare, Ruler, Weight, Box, Info, Home } from 'lucide-react';
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
import USProductDescription from '@/components/products/USProductDescription';
import { generateClarityIntro } from '@/components/products/ClarityIntro';
import { DeliveryReassurance } from '@/components/products/DeliveryReassurance';
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
import {
  DELIVERY_TIME_STANDARD,
  TRUST_BADGES,
} from '@/lib/shipping-constants';
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
  const autoplayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const haptic = useHaptic();

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
  // Uses products_public view which is publicly accessible
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

  // Redirect to slug-based URL if accessed via UUID (for SEO)
  // IMPORTANT: This must be in useEffect, NOT in queryFn to avoid hooks issues
  useEffect(() => {
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

  // Fetch product reviews
  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', id)
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
  // IMPORTANT: This hook MUST be before any early returns to follow React hooks rules
  useEffect(() => {
    if (!isLoading && !product && id) {
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
        <div className="min-h-[60vh] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Package className="w-10 h-10 text-muted-foreground animate-pulse" />
            </div>
            <p className="text-muted-foreground">Redirecting to products...</p>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // Check stock status first - used by handleAddToCart and in rendering
  const inStock = product.stock !== null && product.stock > 0;

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
    const cartPrice = selectedVariant?.variantSellPrice 
      ? Number(selectedVariant.variantSellPrice) 
      : Number(product.price);
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id + (selectedVariant ? `-${selectedVariant.vid}` : ''),
        name: product.name + (selectedVariant ? ` - ${selectedVariant.variantKey || selectedVariant.variantNameEn}` : ''),
        price: cartPrice,
        image: selectedVariant?.variantImage || product.image_url || '/placeholder.svg',
        variant: selectedVariant?.variantKey || selectedVariant?.variantNameEn,
      });
    }
    toast.success(`${quantity}x ${product.name} added to cart!`);
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
            {/* Main Image Container with Controls Overlay */}
            <div className="relative w-full">
              {/* Image Container */}
              <div 
                ref={imageContainerRef}
                className="relative w-full aspect-square rounded-2xl md:rounded-3xl overflow-hidden bg-gradient-to-br from-muted/50 to-muted group shadow-soft 3xl:rounded-[2rem]"
              >
                {/* Desktop: Swipeable image container */}
                <motion.div
                  className="absolute inset-0 cursor-zoom-in hidden md:block"
                  drag={images.length > 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragStart={() => setIsDragging(true)}
                  onDrag={(_, info) => setDragX(info.offset.x)}
                  onDragEnd={(_, info) => handleDragEnd(images.length, info.offset.x, info.velocity.x)}
                  onClick={() => !isDragging && setLightboxOpen(true)}
                  whileTap={{ cursor: "grabbing" }}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedImage}
                      className="absolute inset-0"
                      initial={{ opacity: 0, x: dragX > 0 ? -100 : 100 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: dragX > 0 ? 100 : -100 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <OptimizedImage
                        src={images[selectedImage]}
                        alt={product.name}
                        className="object-contain pointer-events-none"
                        containerClassName="w-full h-full"
                        priority={selectedImage === 0}
                      />
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
                
                {/* Mobile: Static image only */}
                <div className="absolute inset-0 md:hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedImage}
                      className="absolute inset-0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <OptimizedImage
                        src={images[selectedImage]}
                        alt={product.name}
                        className="object-contain"
                        containerClassName="w-full h-full"
                        priority={selectedImage === 0}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
                
                {/* Zoom indicator */}
                <motion.div 
                  className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm text-foreground p-2.5 rounded-full shadow-soft z-10 hidden md:flex"
                  initial={{ opacity: 0 }}
                  whileHover={{ scale: 1.1 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <ZoomIn className="w-5 h-5" />
                </motion.div>

                {/* Discount badge */}
                {discount && discount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-4 left-4 z-10"
                  >
                    <Badge className="bg-accent text-accent-foreground font-semibold px-3 py-1.5 text-sm shadow-soft">
                      -{discount}%
                    </Badge>
                  </motion.div>
                )}
                
                {/* Image Counter - Desktop */}
                {images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm text-foreground text-sm px-4 py-1.5 rounded-full shadow-soft font-medium hidden md:block z-10">
                    {selectedImage + 1} / {images.length}
                  </div>
                )}
              </div>
              
              {/* MOBILE Navigation Controls - Overlay on top of image container */}
              {images.length > 1 && (
                <div className="absolute inset-0 md:hidden z-50 pointer-events-none">
                  {/* Left Arrow */}
                  <button
                    type="button"
                    aria-label="Previous image"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-14 w-14 rounded-full shadow-xl bg-white dark:bg-gray-900 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
                    style={{ touchAction: 'manipulation' }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1);
                      pauseAutoplay();
                      haptic.lightTap();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1);
                      pauseAutoplay();
                      haptic.lightTap();
                    }}
                  >
                    <ChevronLeft className="w-7 h-7 text-gray-800 dark:text-gray-100" />
                  </button>
                  
                  {/* Right Arrow */}
                  <button
                    type="button"
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-14 w-14 rounded-full shadow-xl bg-white dark:bg-gray-900 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
                    style={{ touchAction: 'manipulation' }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
                      pauseAutoplay();
                      haptic.lightTap();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
                      pauseAutoplay();
                      haptic.lightTap();
                    }}
                  >
                    <ChevronRight className="w-7 h-7 text-gray-800 dark:text-gray-100" />
                  </button>
                  
                  {/* Dot indicators */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2.5 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2.5 pointer-events-auto">
                    {images.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Go to image ${idx + 1}`}
                        className={`rounded-full transition-all ${
                          selectedImage === idx 
                            ? 'w-7 h-3.5 bg-white' 
                            : 'w-3.5 h-3.5 bg-white/50 active:bg-white/80'
                        }`}
                        style={{ touchAction: 'manipulation' }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedImage(idx);
                          pauseAutoplay();
                          haptic.lightTap();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedImage(idx);
                          pauseAutoplay();
                          haptic.lightTap();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Desktop Navigation Arrows - positioned as siblings */}
            {images.length > 1 && (
              <div className="hidden md:flex justify-between items-center px-2 -mt-[50%] mb-[calc(50%-20px)] relative z-20 pointer-events-none">
                <button
                  type="button"
                  aria-label="Previous image"
                  className="h-10 w-10 rounded-full shadow-lg bg-white/95 dark:bg-gray-900/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 pointer-events-auto"
                  onClick={() => {
                    setSelectedImage(prev => prev === 0 ? images.length - 1 : prev - 1);
                    pauseAutoplay();
                    haptic.lightTap();
                  }}
                >
                  <ChevronLeft className="w-5 h-5 text-gray-800 dark:text-gray-100" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  className="h-10 w-10 rounded-full shadow-lg bg-white/95 dark:bg-gray-900/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 pointer-events-auto"
                  onClick={() => {
                    setSelectedImage(prev => prev === images.length - 1 ? 0 : prev + 1);
                    pauseAutoplay();
                    haptic.lightTap();
                  }}
                >
                  <ChevronRight className="w-5 h-5 text-gray-800 dark:text-gray-100" />
                </button>
              </div>
            )}
            
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
                <div 
                  className="flex-1 overflow-hidden relative touch-pan-x"
                >
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
              
              {/* Rating placeholder */}
              <div className="flex items-center gap-2 mt-3">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < 4 ? 'text-warning fill-warning' : 'text-muted'}`} />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">(24 reviews)</span>
              </div>
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

            {/* Short Description - Clarity-first intro for cold traffic */}
            <div className="text-muted-foreground leading-relaxed break-words overflow-hidden">
              <p className="text-[15px] leading-relaxed">
                {generateClarityIntro(product.name, product.category || '')}
              </p>
            </div>

            {/* Why Pet Parents Choose This - Benefit-driven scannable section */}
            <WhyPetParentsLoveThis 
              productName={product.name} 
              category={product.category || ''} 
            />

            {/* Variants */}
            {variants.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <label className="text-sm font-semibold text-foreground">
                  Choose an option: <span className="text-primary">{selectedVariant ? selectedVariant.variantKey : 'Select'}</span>
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
                    
                    // Render as color swatch if color detected
                    if (isColorVariant && colorHex) {
                      return (
                        <motion.button
                          key={variant.vid}
                          onClick={() => setSelectedVariant(isSelected ? null : variant)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          title={displayValue}
                          className={`relative w-10 h-10 rounded-full transition-all ${
                            isSelected
                              ? 'ring-2 ring-offset-2 ring-primary'
                              : 'hover:ring-2 hover:ring-offset-2 hover:ring-muted-foreground/50'
                          }`}
                          style={{ backgroundColor: colorHex }}
                        >
                          {/* White/light colors need a border */}
                          {['white', 'ivory', 'cream', 'beige'].includes(detectedColor) && (
                            <span className="absolute inset-0 rounded-full border border-border" />
                          )}
                          {/* Checkmark for selected */}
                          {isSelected && (
                            <span className={`absolute inset-0 flex items-center justify-center ${
                              ['white', 'ivory', 'cream', 'beige', 'yellow', 'gold', 'lime', 'mint', 'peach', 'sand', 'khaki'].includes(detectedColor)
                                ? 'text-gray-800'
                                : 'text-white'
                            }`}>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </motion.button>
                      );
                    }
                    
                    // Render as image swatch if has image
                    if (hasImage) {
                      return (
                        <motion.button
                          key={variant.vid}
                          onClick={() => setSelectedVariant(isSelected ? null : variant)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          title={displayValue}
                          className={`relative w-14 h-14 rounded-xl overflow-hidden transition-all ${
                            isSelected
                              ? 'ring-2 ring-offset-2 ring-primary'
                              : 'ring-1 ring-border hover:ring-2 hover:ring-primary/50'
                          }`}
                        >
                          <img 
                            src={variant.variantImage} 
                            alt={displayValue}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <span className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <svg className="w-5 h-5 text-primary drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </motion.button>
                      );
                    }
                    
                    // Default: text button for other variants (sizes, etc.)
                    return (
                      <motion.button
                        key={variant.vid}
                        onClick={() => setSelectedVariant(isSelected ? null : variant)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`px-4 py-2.5 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-soft'
                            : 'border-border hover:border-primary/50 bg-background'
                        }`}
                      >
                        <span className="text-sm font-medium">{displayValue}</span>
                        {variant.variantSellPrice && variant.variantSellPrice !== Number(product.price) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ${Number(variant.variantSellPrice).toFixed(2)}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                
                {/* Color name tooltip when hovering */}
                {selectedVariant && (
                  <p className="text-sm text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">{selectedVariant.variantKey}</span>
                    {selectedVariant.variantSellPrice && selectedVariant.variantSellPrice !== Number(product.price) && (
                      <span className="ml-2 text-primary font-medium">
                        ${Number(selectedVariant.variantSellPrice).toFixed(2)}
                      </span>
                    )}
                  </p>
                )}
              </motion.div>
            )}

            {/* Stock Status - Simple, no quantity pressure */}
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${inStock ? 'bg-success' : 'bg-destructive'}`} />
              <span className="font-medium text-foreground">
                {inStock ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>

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
              Add to Cart
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
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <span className="text-success">✔</span>
                  <span>Free US shipping over $35</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-success">✔</span>
                  <span>Ships from US fulfillment centers</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-success">✔</span>
                  <span>30-day hassle-free returns</span>
                </p>
              </div>
            </motion.div>

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
                    { emoji: '🇺🇸', text: 'Ships from US fulfillment centers' },
                    { emoji: '📦', text: 'Standard delivery: 3-7 business days' },
                    { emoji: '✨', text: 'Free shipping on orders over $35' },
                    { emoji: '💰', text: '$5.99 flat rate under $35' },
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
              <p className="text-sm text-muted-foreground">
                {reviews.length} review{reviews.length !== 1 ? 's' : ''} from our customers
              </p>
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
            className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] safe-area-bottom"
          >
            <div className="px-4 py-3 flex items-center gap-3">
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
                className="flex-1 gap-2 rounded-full font-semibold shadow-soft"
                size="lg"
                onClick={handleAddToCart}
                disabled={!inStock}
              >
                <ShoppingCart className="w-4 h-4" />
                Add to Cart
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

      {/* Spacer for sticky bar on mobile */}
      <div className={`md:hidden transition-all ${showStickyBar ? 'h-20' : 'h-0'}`} />
    </Layout>
  );
};

export default ProductDetail;
