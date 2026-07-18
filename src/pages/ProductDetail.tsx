import { useParams, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useKlarnaEligibility } from "@/hooks/useKlarnaEligibility";
import { displayName as productDisplayName } from "@/lib/displayName";
import { splitKlarnaInstallments, formatKlarnaInstallment } from "@/lib/klarna";
import { trackCheckoutFunnel } from "@/lib/checkoutFunnel";
import { ensureGeoClassified, getCachedGeoCountry } from "@/lib/geoClassify";
import {
  ShoppingCart,
  Heart,
  Truck,
  Shield,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Package,
  Award,
  Star,
  Clock,
  MessageSquare,
  Ruler,
  Weight,
  Box,
  Info,
  Home,
  CheckCircle,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { MobileProductGallery } from "@/components/products/MobileProductGallery";
import { DesktopProductGallery } from "@/components/products/DesktopProductGallery";
import { ProductVideoSection } from "@/components/products/ProductVideoSection";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { ProductCard } from "@/components/products/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { PinchZoomImage } from "@/components/ui/pinch-zoom-image";
import { useCart } from "@/contexts/CartContext";
import { useCartAnimation } from "@/contexts/CartAnimationContext";
import { trackCci } from "@/lib/cci";
import { useWishlist } from "@/contexts/WishlistContext";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { usePdpFunnelTracking } from "@/hooks/usePdpFunnelTracking";
import { useRecentlyViewedProducts } from "@/hooks/useRecentlyViewedProducts";
import { useHaptic } from "@/hooks/useHaptic";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CreatePinterestAdButton from "@/components/admin/pinterest-ad-studio/CreatePinterestAdButton";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { TrustStripAboveATC } from "@/components/trust/TrustStripAboveATC";
import { sanitizeHtml } from "@/lib/sanitize";
import { trackViewItem, trackEvent } from "@/lib/analytics";
import { ttTrackViewContent } from "@/lib/tiktok-pixel";
import { logUtmCheckpoint } from "@/lib/utmDebugLog";
import { calculateSellingPrice } from "@/lib/pricing";
import { getProductDiscount } from "@/lib/discount";
import { safeString, safeNumber, safeArray } from "@/lib/safe-render";
import { computeAvailability } from "@/lib/availability";
import { getProductBySlugOrId } from "@/data/products";
import USProductDescription from "@/components/products/USProductDescription";
import { generateClarityIntro } from "@/components/products/ClarityIntro";
// TrustMicrocopy removed — consolidated into TrustBadgesBlock
import { TrustBadgesBlock } from "@/components/shared/TrustBadgesBlock";
import { RealSocialProofLine } from "@/components/products/RealSocialProofLine";
import { ProductGuaranteeBadge } from "@/components/products/ProductGuaranteeBadge";
import { ProductSchema } from "@/components/seo/ProductSchema";
import { FAQSchema, generateProductFAQs } from "@/components/seo/FAQSchema";
import { ProductDetailSkeleton } from "@/components/products/ProductDetailSkeleton";
import { StockNotificationForm } from "@/components/products/StockNotificationForm";
import { RecentlyViewedCarousel } from "@/components/products/RecentlyViewedCarousel";
import { usePdpBotRenderTrace } from "@/hooks/usePdpBotRenderTrace";
import { RelatedProductsCarousel } from "@/components/products/RelatedProductsCarousel";
import { FrequentlyBoughtTogether } from "@/components/products/FrequentlyBoughtTogether";
import { useRelatedProducts } from "@/hooks/useRelatedProducts";
import { RelatedGuides } from "@/components/guides/RelatedGuides";
import { DogBedsClusterLinks } from "@/components/seo/DogBedsClusterLinks";
import { PDPClusterLinks } from "@/components/seo/PDPClusterLinks";
import { WhyTrustGetPawsy } from "@/components/seo/WhyTrustGetPawsy";
import NotFound from "@/pages/NotFound";
import SlugResolverFallback from "@/components/products/SlugResolverFallback";

// PriceAnchoringSection removed — fabricated price comparisons flagged by Google Merchant Center

import { ProductFAQAccordion } from "@/components/products/ProductFAQAccordion";
import { isSectionHiddenForProduct } from "@/config/product-content-overrides";
import { ProductProblemSolution } from "@/components/products/ProductProblemSolution";

import { FinalCtaBlock } from "@/components/products/FinalCtaBlock";

// ProductFeatureGrid removed — redundant with benefit bullets + ProblemSolution
import { ProductWhyChoose } from "@/components/products/ProductWhyChoose";
import { ProductHowItWorks } from "@/components/products/ProductHowItWorks";
import { ProductUseCases } from "@/components/products/ProductUseCases";
import { ProductVsAlternatives } from "@/components/products/ProductVsAlternatives";
import { ProductSpecsTable } from "@/components/products/ProductSpecsTable";
import { ProductIdealFor } from "@/components/products/ProductIdealFor";
import { LowStockBadge } from "@/components/products/LowStockBadge";
import { ConversionBlock } from "@/components/products/ConversionBlock";
import { WhyCustomersChoose } from "@/components/products/WhyCustomersChoose";
import { MicroFrictionBlock } from "@/components/products/MicroFrictionBlock";
import { useAdIntent } from "@/hooks/useAdIntent";
import { computeIntentMatch } from "@/lib/intentMatch";
import { CrawlableRelatedLinks } from "@/components/products/CrawlableRelatedLinks";
import { PinterestLandingBanner } from "@/components/products/PinterestLandingBanner";
import { TikTokHero } from "@/components/products/TikTokHero";
import { TikTokSalesFunnel } from "@/components/products/TikTokSalesFunnel";
import { TikTokStickyCTA } from "@/components/products/TikTokStickyCTA";
import { PdpStickyAtc } from "@/components/products/PdpStickyAtc";
import { EmotionalHook } from "@/components/pdp/emotional/EmotionalHook";
import { SwipeBenefitChips } from "@/components/pdp/emotional/SwipeBenefitChips";
import { MobileStickyTrustBar } from "@/components/pdp/emotional/MobileStickyTrustBar";
import { ReassuranceCallout } from "@/components/pdp/emotional/ReassuranceCallout";
import { getEmotionalCopy } from "@/lib/categoryEmotional";
import { getConversionFlag } from "@/lib/conversionFlags";
import {
  LitterBoxConversionBoost,
  LitterBoxLovedSection,
} from "@/components/products/LitterBoxConversionBoost";
import { useTikTokLanding } from "@/hooks/useTikTokLanding";
import TikTokPdpVariant from "@/components/product/TikTokPdpVariant";
import { useGuidesList } from "@/hooks/useGuides";
import {
  DELIVERY_TIME_STANDARD,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  US_FULFILLMENT_NOTE,
  RETURN_WINDOW_DAYS,
} from "@/lib/shipping-constants";
import { VolumeDiscountSelector } from "@/components/products/VolumeDiscountSelector";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

type ProductRecord = Record<string, any>;

async function fetchExistingProduct(productIdentifier: string): Promise<ProductRecord | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productIdentifier);

  // Hard 10s timeout: if Supabase hangs (slow network, Pinterest in-app browser
  // proxy stall, cold edge), the PDP must not stay in skeleton forever.
  // Any rejection here falls through to the catch below which returns local
  // fallback or null, so the query resolves with a definitive result.
  const PDP_FETCH_TIMEOUT_MS = 10_000;
  const withTimeout = <T,>(p: PromiseLike<T>, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`PDP_TIMEOUT:${label}:${PDP_FETCH_TIMEOUT_MS}ms`)),
        PDP_FETCH_TIMEOUT_MS,
      );
      Promise.resolve(p).then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });

  const mapLocalProduct = (localProduct: any): ProductRecord => ({
    id: localProduct.id,
    slug: localProduct.slug,
    name: localProduct.name,
    description: localProduct.description,
    price: localProduct.price,
    compare_at_price: localProduct.comparePrice ?? null,
    image_url: localProduct.image,
    images: localProduct.images ?? [localProduct.image],
    category: localProduct.category,
    sku: localProduct.id,
    stock: localProduct.inStock ? 999 : 0,
    is_active: true,
    weight: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const getLocalFallback = () => {
    const localProduct = getProductBySlugOrId(productIdentifier);
    return localProduct ? mapLocalProduct(localProduct) : null;
  };

  const fetchPublicBy = async (column: "id" | "slug", value: string) => {
    // products_detail exposes ALL active non-duplicate products (including out-of-stock)
    // so the PDP URL stays reachable for SEO. The page itself renders an OOS state
    // and disables Add to Cart when availability fails.
    const { data, error } = await withTimeout(
      supabase.from("products_detail").select("*").eq(column, value).maybeSingle(),
      `public:${column}`,
    );

    if (error) throw error;
    return data;
  };

  const fetchBaseBy = async (column: "id" | "slug", value: string) => {
    const { data, error } = await withTimeout(
      supabase
        .from("products_detail")
        .select("*")
        .eq(column, value)
        .eq("is_active", true)
        .maybeSingle(),
      `base:${column}`,
    );

    if (error) throw error;
    return data;
  };

  const resolveDuplicateRedirect = async (column: "id" | "slug", value: string) => {
    const { data } = await supabase
      .from("products_detail")
      .select("is_duplicate, canonical_product_id")
      .eq(column, value)
      .maybeSingle();

    if (data?.is_duplicate && data?.canonical_product_id) {
      const canonical = await fetchPublicBy("id", data.canonical_product_id);
      if (canonical) return { ...canonical, _redirect: true };
    }

    return null;
  };

  const resolveLegacyBestsellerSlug = async (value: string) => {
    const { data, error } = await supabase
      .from("bestsellers")
      .select(`
        slug,
        products_detail!bestsellers_product_id_fkey (
          *
        )
      `)
      .eq("slug", value)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    const canonicalProduct = Array.isArray((data as any)?.products_detail)
      ? (data as any)?.products_detail?.[0]
      : (data as any)?.products_detail;

    if (canonicalProduct) {
      return { ...canonicalProduct, _redirect: true, _aliasSlug: value };
    }

    return null;
  };

  try {
    if (isUuid) {
      const publicById = await fetchPublicBy("id", productIdentifier);
      if (publicById) return publicById;

      const duplicateRedirect = await resolveDuplicateRedirect("id", productIdentifier);
      if (duplicateRedirect) return duplicateRedirect;

      const baseById = await fetchBaseBy("id", productIdentifier);
      if (baseById) return baseById;

      return getLocalFallback();
    }

    const publicBySlug = await fetchPublicBy("slug", productIdentifier);
    if (publicBySlug) return publicBySlug;

    const duplicateRedirect = await resolveDuplicateRedirect("slug", productIdentifier);
    if (duplicateRedirect) return duplicateRedirect;

    const baseBySlug = await fetchBaseBy("slug", productIdentifier);
    if (baseBySlug) return baseBySlug;

    const legacyBestsellerRedirect = await resolveLegacyBestsellerSlug(productIdentifier);
    if (legacyBestsellerRedirect) return legacyBestsellerRedirect;

    const searchName = productIdentifier.replace(/-/g, " ").toLowerCase();
    const { data, error } = await supabase
      .from("products_detail")
      .select("*")
      .ilike("name", `%${searchName}%`)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    return getLocalFallback();
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[PDP] fetchExistingProduct fallback for ${productIdentifier}:`, err);
    }
    return getLocalFallback();
  }
}

const ProductDetail = () => {
  const { slug } = useParams<{ slug: string }>();
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
  const [userHasSelectedVariant, setUserHasSelectedVariant] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [volumeDiscount, setVolumeDiscount] = useState(0);
  const stickyScrollDir = useScrollDirection(10);
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
      setSelectedImage((prev) => (prev === imagesLength - 1 ? 0 : prev + 1));
      haptic.lightTap(); // Haptic feedback on swipe
      pauseAutoplay();
    } else if (swipe > minSwipeDistance) {
      // Swiped right - previous image
      setSelectedImage((prev) => (prev === 0 ? imagesLength - 1 : prev - 1));
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
  const {
    data: product,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      if (!slug) return null;
      return fetchExistingProduct(slug);
    },
    enabled: !!slug,
    // Cap retries so the PDP can never stay in skeleton longer than ~3s
    // before resolving to product, replacement (via SlugResolverFallback),
    // or visible error/retry state.
    retry: 1,
    retryDelay: 600,
    // Do NOT keep failed results around for 10 minutes — that keeps the page
    // broken even after a network blip recovers.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  // Bot-render diagnostics: log whether crawlers see the loading shell
  // or real product data on this PDP. No-op for human users.
  usePdpBotRenderTrace({
    slug,
    isLoading,
    hasProduct: !!product,
  });

  // Redirect to canonical product if this is a duplicate, or to slug URL if accessed via UUID
  useEffect(() => {
    // Revenue guard: internal test SKUs must never be reachable by real
    // visitors. Production evidence (14d) showed 5 real PDP views and 2
    // add-to-cart attempts on `internal-stripe-production-test-do-not-index`
    // — those visitors hit a test Stripe flow and cannot buy. Redirect any
    // slug that starts with `internal-` or contains `do-not-index` to the
    // homepage so intent is preserved on live inventory.
    if (slug && (slug.startsWith('internal-') || slug.includes('do-not-index'))) {
      navigate('/', { replace: true });
      return;
    }
    if (product?._redirect) {
      navigate(`/products/${product.slug || product.id}`, { replace: true });
      return;
    }
    if (product?.slug && slug && isValidUUID(slug)) {
      navigate(`/products/${product.slug}`, { replace: true });
    }
  }, [product, slug, navigate]);

  // Get recently viewed product IDs ONCE at the top level
  // This prevents duplicate useRecentlyViewed hook calls in child hooks
  const recentlyViewedIds = useMemo(() => getRecentlyViewedIds(product?.id), [getRecentlyViewedIds, product?.id]);

  // Fetch related products with enhanced category and keyword matching
  // Pass recentlyViewedIds to avoid duplicate hook calls
  const { data: relatedProducts, isLoading: relatedLoading } = useRelatedProducts({
    productId: product?.id || "",
    category: product?.category || null,
    productName: product?.name || "",
    maxItems: 8,
    enabled: !!product?.id,
    recentlyViewedIds,
  });

  // Fetch recently viewed products with React Query caching
  // Pass recentlyViewedIds to avoid duplicate hook calls
  const { data: recentlyViewedProducts, isLoading: recentlyViewedLoading } = useRecentlyViewedProducts({
    recentlyViewedIds,
  });

  // Ad intent detection — ?kw= param or category fallback
  const adIntent = useAdIntent(product?.category);
  // CI-3 — gate ad-driven overrides by intent strength. Weak/no-match traffic
  // sees the baseline PDP so we never surface a "cooling" headline to a
  // winter cat-tree shopper.
  const intentMatch = useMemo(
    () => computeIntentMatch(adIntent, product?.category),
    [adIntent, product?.category],
  );
  const intentGatingOn = getConversionFlag('intentGating');
  const allowHeadlineOverride =
    !intentGatingOn || intentMatch.allowHeadlineOverride;
  const allowPinterestBanner =
    !intentGatingOn ||
    (intentMatch.source === 'pinterest' && intentMatch.tier !== 'weak');
  const allowReassuranceStack =
    !intentGatingOn || intentMatch.allowEmotionalStack;
  const { isTikTok, scrollToBuy } = useTikTokLanding();

  // Phase 4+5 — additive funnel instrumentation (lazy, never blocks render)
  usePdpFunnelTracking({
    productId: product?.id ?? null,
    productName: product?.name ?? null,
    price: product?.price ?? null,
  });

  const isLitterBoxProduct =
    !!product && /litter\s*box/i.test(`${product.name} ${product.category || ''}`);
  const showTikTokVariant = isTikTok && isLitterBoxProduct;

  // Fire a single PDP-load analytics event capturing which variant actually
  // activated for this visitor. Pairs with `tiktok_deep_link_click` on the
  // source page to measure end-to-end deep-link → variant activation.
  // Guarded by a ref so React StrictMode double-invokes don't double-fire.
  const pdpVariantTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!product) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const sp = new URLSearchParams(search);
    const variant = showTikTokVariant
      ? 'tiktok_litterbox'
      : isTikTok
        ? 'tiktok_param_no_match'
        : adIntent.keyword
          ? `intent_${adIntent.keyword}`
          : 'standard';

    // Dedupe per (product, variant, search) so SPA re-renders don't spam GA4.
    const trackingKey = `${product.id}:${variant}:${search}`;
    if (pdpVariantTrackedRef.current === trackingKey) return;
    pdpVariantTrackedRef.current = trackingKey;

    trackEvent('pdp_variant_activated', {
      variant,
      product_id: product.id,
      product_slug: product.slug || null,
      product_name: product.name,
      is_tiktok: isTikTok,
      is_litter_box: isLitterBoxProduct,
      intent_keyword: adIntent.keyword,
      intent_source: adIntent.source,
      utm_source: sp.get('utm_source'),
      utm_medium: sp.get('utm_medium'),
      utm_campaign: sp.get('utm_campaign'),
      utm_content: sp.get('utm_content'),
      ad: sp.get('ad'),
      landing_url: typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : null,
    });
  }, [product, showTikTokVariant, isTikTok, isLitterBoxProduct, adIntent.keyword, adIntent.source]);

  // Fetch guides for Related Guides section — improved category matching
  const { data: allGuides } = useGuidesList();
  const relatedGuides = useMemo(() => {
    if (!allGuides || !product?.category) return [];
    const cat = product.category.toLowerCase().replace(/-/g, " ");
    const animalType = cat.includes("dog") ? "dog" : cat.includes("cat") ? "cat" : "";

    return allGuides
      .filter((g) => {
        // Match by relatedCategories (strongest signal)
        const catMatch = g.relatedCategories?.some((rc) => {
          const rcNorm = rc.replace(/-/g, " ").toLowerCase();
          return cat.includes(rcNorm) || rcNorm.includes(cat);
        });
        if (catMatch) return true;

        // Match by keywords against product category
        const kwMatch = g.keywords?.some((kw) => {
          const kwNorm = kw.toLowerCase();
          return cat.split(" ").some((w) => w.length > 3 && kwNorm.includes(w));
        });
        if (kwMatch) return true;

        // Match by animal type + guide category
        if (animalType && g.category?.toLowerCase().includes(animalType)) {
          const guideCategory = g.category.toLowerCase();
          return cat.split(" ").some((w) => w.length > 3 && guideCategory.includes(w));
        }

        return false;
      })
      .slice(0, 4);
  }, [allGuides, product?.category]);

  // Fetch product reviews
  const { data: reviews = [] } = useQuery({
    queryKey: ["product-reviews", product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data, error } = await supabase
        .from("product_reviews")
        .select("id, product_id, rating, title, content, created_at, helpful_count, is_verified_buyer, reviewer_name")
        .eq("product_id", product.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!product?.id,
  });

  const handleReviewsRefresh = () => {
    if (!product?.id) return;
    queryClient.invalidateQueries({ queryKey: ["product-reviews", product.id] });
  };

  // Parse variants from JSON and ensure prices are calculated correctly
  // Also ensure all string properties are properly converted to avoid React error #310
  // CRITICAL: Only extract the fields we need - do NOT spread the original variant object
  // as it may contain nested objects (inventories, combineVariants, etc.) that cause React #310
  const variants: ProductVariant[] = useMemo(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];

    const productPrice = Number(product.price) || 0;
    const productWeight = Number(product.weight) || 200;

    return (product.variants as unknown[])
      .map((rawVariant) => {
        // Type guard - ensure we have an object
        if (!rawVariant || typeof rawVariant !== "object") return null;

        const variant = rawVariant as Record<string, unknown>;

        const variantPrice = Number(variant.variantSellPrice) || 0;
        const variantWeight = Number(variant.variantWeight) || productWeight;

        // CRITICAL: Helper to safely extract string - converts null/undefined/objects to empty string
        // This prevents React error #310 "Objects are not valid as a React child"
        const extractString = (val: unknown): string => {
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return "";
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
        const displayName = safeVariantKey || safeVariantNameEn || safeVariantSku || "Option";

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
      })
      .filter((v): v is ProductVariant => v !== null);
  }, [product]);

  // Group variants - CJ uses variantKey as the display name
  // CRITICAL: Must be wrapped in useMemo to ensure stable hook count
  const variantGroups = useMemo(() => {
    return variants.reduce(
      (groups, variant) => {
        const groupName = "Option";

        if (!groups[groupName]) {
          groups[groupName] = [];
        }

        if (!groups[groupName].find((v) => v.vid === variant.vid)) {
          groups[groupName].push(variant);
        }

        return groups;
      },
      {} as Record<string, ProductVariant[]>,
    );
  }, [variants]);

  // Scroll to top when navigating to product page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  // Debug checkpoint #3 — captures UTM state at PDP load. Compared against
  // /go's go_mount and cta_click in the admin "TikTok Funnel Debug" view
  // to localize where utm_campaign was dropped (URL/redirect/session).
  // Cheap no-op unless ?debug_utm=1 is set on the session.
  useEffect(() => {
    if (!slug) return;
    logUtmCheckpoint('pdp_load', { slug });
  }, [slug]);

  // Track product views in visitor analytics
  const { trackProductView } = useVisitorTracking();

  // Klarna eligibility — checked against base price (hook-stable, runs unconditionally).
  const klarna = useKlarnaEligibility(
    product?.price ? Number(product.price) : null,
    { country: "US", currency: "usd" },
  );

  // Track Klarna BNPL messaging impression on PDP (fires once per product when eligible).
  const klarnaTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!klarna.eligible || !product?.id) return;
    const key = `pdp:${product.id}`;
    if (klarnaTrackedRef.current === key) return;
    klarnaTrackedRef.current = key;
    const split = splitKlarnaInstallments(Number(product.price) || 0, 'USD');
    trackCheckoutFunnel({
      step: 'klarna_message_shown',
      placement: 'pdp',
      value: Number(product.price) || 0,
      currency: 'USD',
      metadata: {
        product_id: product.id,
        product_name: product.name,
        installment_amount: split.perInstallment,
      },
    });
  }, [klarna.eligible, product?.id, product?.name, product?.price]);

  // Reset state and auto-select first variant when PRODUCT ID changes (not object ref)
  const currentProductId = product?.id;
  useEffect(() => {
    if (!currentProductId) return;
    setSelectedImage(0);
    // Auto-select first variant for internal state (images, SKU), but do NOT
    // promote its price into display — the storefront shows product.price until
    // the user explicitly picks a variant.
    // Prefer the first IN-STOCK variant so visitors landing on a multi-variant
    // PDP don't see a disabled CTA when option #1 happens to be sold out.
    const firstInStock =
      variants.find((v) => {
        const s = (v as { variantStock?: number | null }).variantStock;
        return s === undefined || s === null || s > 0;
      }) || variants[0] || null;
    setSelectedVariant(firstInStock);
    setUserHasSelectedVariant(false);

    addToRecentlyViewed(currentProductId);
    if (product) {
      trackViewItem(currentProductId, product.name || "", product.price || 0, product.category || undefined);
      trackProductView(currentProductId, product.name || "");
      // TikTok Pixel ViewContent — closes attribution loop for cold TikTok traffic
      ttTrackViewContent({
        contentId: currentProductId,
        contentName: product.name || "",
        value: Number(product.price) || 0,
        currency: "USD",
      });
      // Pinterest ViewContent — fires after consent, non-blocking
      import('@/lib/marketingClient').then(({ fireMarketingAsync }) =>
        fireMarketingAsync('pinterest-viewcontent', async () => {
          const { trackPinterestEvent } = await import('@/hooks/usePinterestTracking');
          trackPinterestEvent('viewcontent', {
            product_id: currentProductId,
            product_name: product.name || '',
            product_price: Number(product.price) || 0,
            product_category: product.category || undefined,
            value: Number(product.price) || 0,
            currency: 'USD',
          });
        }, 'pinterest')
      ).catch(() => {});
      // Server-side attribution mirror → gi_attribution_events (pin/board/product enrichment in edge fn)
      import('@/lib/pinterestTracker')
        .then((m) =>
          m.trackPinterestEvent('product_view', {
            product_id: currentProductId,
            product_slug: product.slug ?? null,
            value: Number(product.price) || 0,
            currency: 'USD',
          })
        )
        .catch(() => {});
      try {
        trackCci('product_view', {
          product_id: currentProductId,
          funnel_stage: 'product_view',
          meta: {
            slug: product.slug ?? null,
            price: Number(product.price) || 0,
            currency: 'USD',
          },
        });
      } catch { /* swallow */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProductId]);

  // Update selected image when variant is selected
  useEffect(() => {
    if (selectedVariant?.variantImage) {
      const productImages = Array.isArray(product?.images) ? product.images : [];
      const images = productImages.length > 0 ? productImages : [product?.image_url || "/placeholder.svg"];
      const variantImageIndex = images.findIndex((img) => img === selectedVariant.variantImage);
      if (variantImageIndex !== -1) {
        setSelectedImage(variantImageIndex);
      }
    }
  }, [selectedVariant, product]);

  // Track if change was from autoplay (to avoid scroll interference)
  const isAutoplayChangeRef = useRef(false);

  // Flatten images array (handle nested arrays from database) and filter valid URLs
  // CRITICAL: Must be wrapped in useMemo for stable hook count across renders
  const images = useMemo(() => {
    const productImagesArray = Array.isArray(product?.images) ? product.images : [];
    const rawImages =
      productImagesArray.length > 0
        ? productImagesArray
            .flat()
            .filter(
              (img): img is string => typeof img === "string" && img.startsWith("http") && !img.includes("undefined"),
            )
        : [];

    // Use image_url as fallback if no valid images
    return rawImages.length > 0 ? rawImages : product?.image_url ? [product.image_url] : ["/placeholder.svg"];
  }, [product?.images, product?.image_url]);

  // Cleanup autoplay timeout on unmount
  useEffect(() => {
    return () => {
      if (autoplayTimeoutRef.current) {
        clearTimeout(autoplayTimeoutRef.current);
      }
    };
  }, []);

  // Show/hide sticky bar based on main add-to-cart button visibility
  // Uses a ref to avoid the oscillation loop: spacer height change → observer fires → spacer toggles → loop
  const stickyBarValueRef = useRef(false);
  useEffect(() => {
    if (!mainAddToCartRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldShow = !entry.isIntersecting;
        // Only update state when value actually changes to prevent re-render churn
        if (stickyBarValueRef.current !== shouldShow) {
          stickyBarValueRef.current = shouldShow;
          setShowStickyBar(shouldShow);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px 0px 0px",
      },
    );

    observer.observe(mainAddToCartRef.current);

    return () => observer.disconnect();
  }, [product]);

  // ── Geo shipping gate (HOOKS — must run unconditionally before any early
  //    return below, otherwise React #310 fires when product transitions
  //    from loading → loaded). DO NOT move these below the if-returns.
  const [visitorCountry, setVisitorCountry] = useState<string | null>(null);
  useEffect(() => {
    ensureGeoClassified();
    const read = () => {
      const c = (getCachedGeoCountry() || '').toUpperCase();
      if (c) { setVisitorCountry(c); return true; }
      return false;
    };
    if (read()) return;
    const iv = window.setInterval(() => { if (read()) window.clearInterval(iv); }, 400);
    const to = window.setTimeout(() => window.clearInterval(iv), 5000);
    return () => { window.clearInterval(iv); window.clearTimeout(to); };
  }, []);
  const productWarehouse = ((product as any)?.supplier_warehouse || '').toUpperCase();
  const geoBlocked =
    productWarehouse === 'US' &&
    !!visitorCountry &&
    visitorCountry !== 'US' &&
    visitorCountry !== 'CA';
  useEffect(() => {
    if (!geoBlocked || !product?.id) return;
    const key = `gp_geo_blocked_${product.id}_${visitorCountry}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* ignore */ }
    trackCheckoutFunnel({
      step: 'shipping_country_blocked',
      placement: 'pdp',
      metadata: {
        destination_country: visitorCountry,
        product_id: product.id,
        warehouse: productWarehouse,
      },
    });
  }, [geoBlocked, product?.id, visitorCountry, productWarehouse]);

  // SEO-safe loading state: emit proper head tags so crawlers never see
  // noindex or 404 signals while product data is still resolving.
  if (isLoading) {
    const slugName = slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Product";
    const truncatedSlugName = slugName.length > 80 ? slugName.substring(0, 77) + "..." : slugName;
    const loadingCanonical = `https://getpawsy.pet/products/${slug || ""}`;

    return (
      <Layout>
        <Helmet>
          <title>{`${truncatedSlugName} | GetPawsy - Premium Pet Products`}</title>
          <meta
            name="description"
            content={`Shop ${truncatedSlugName} at GetPawsy. Premium quality, US shipping & 30-day returns.`}
          />
          <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
          <meta
            name="googlebot"
            content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
          /></Helmet>
        <ProductDetailSkeleton />
      </Layout>
    );
  }

  // On network/query error, show skeleton with retry — do NOT render NotFound
  // so crawlers don't see a false 404 for a valid product URL.
  if (isError) {
    const slugName = slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Product";
    const truncatedSlugName = slugName.length > 80 ? slugName.substring(0, 77) + "..." : slugName;

    return (
      <Layout>
        <Helmet>
          <title>{`${truncatedSlugName} | GetPawsy - Premium Pet Products`}</title>
          <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
          <meta
            name="googlebot"
            content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
          /></Helmet>
        <div className="container mx-auto px-4 py-16 max-w-xl text-center">
          <h2 className="text-2xl font-semibold mb-3">We couldn't load this product</h2>
          <p className="text-muted-foreground mb-6">
            A temporary network issue prevented loading <strong>{truncatedSlugName}</strong>. Please try again — your cart is safe.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition"
            >
              Try again
            </button>
            <a
              href="/products"
              className="inline-flex items-center justify-center rounded-md border px-5 py-2.5 text-sm font-medium hover:bg-muted transition"
            >
              Browse all products
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  // TRUE 404: loading is complete, no error, and no product found.
  // Only now is it safe to render NotFound with noindex.
  if (!product) {
    return <SlugResolverFallback slug={slug ?? ""} />;
  }

  // ── TikTok Bio fast PDP ────────────────────────────────────────────────
  // For ALL products, when the visitor arrives via TikTok (utm_source=tiktok,
  // ad=tt, src=tiktok, TikTok webview UA, or tiktok.com referrer), render a
  // dedicated single-screen above-the-fold PDP optimized for the 96.6% <5s
  // bounce we measured on the canonical layout. Opt-out via ?notiktok=1
  // so admins/QA can compare. Disabled when the legacy litterbox-specific
  // TikTok variant (`showTikTokVariant`) is active so we don't double-render.
  const tiktokFastOptOut =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('notiktok');
  const showTikTokFastPdp = isTikTok && !showTikTokVariant && !tiktokFastOptOut;
  if (showTikTokFastPdp) {
    return (
      <Layout>
        <Helmet>
          <meta name="robots" content="index, follow, max-image-preview:large" />
        </Helmet>
        <TikTokPdpVariant
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name || '',
            description: product.description,
            price: Number(product.price),
            compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
            image_url: product.image_url,
            images: (product.images as string[] | null) ?? null,
            category: product.category,
            stock: product.stock,
          }}
          reviews={reviews ?? []}
        />
      </Layout>
    );
  }

  // Use centralized availability logic with variant-aware fallback
  // Variant stock overrides product stock only when a variant is selected
  const variantStock = selectedVariant ? (selectedVariant as any).stock : undefined;
  const availabilityResult = computeAvailability(product, variantStock);
  const inStock = availabilityResult.isInStock;

  const handleAddToCart = () => {
    // NEVER block ATC on geo. Final shipping eligibility is enforced at
    // checkout (`ShippingPrecheck` + `create-checkout` server validation).
    // Single click event per tap — fold geo metadata into the one emission so
    // we stay observable without duplicating the funnel step.
    const clickMeta: Record<string, unknown> = {};
    if (!visitorCountry) {
      clickMeta.shipping_eligibility = 'unknown_pending_checkout';
      clickMeta.warehouse = productWarehouse;
    } else if (geoBlocked) {
      clickMeta.shipping_eligibility = 'region_warning';
      clickMeta.destination_country = visitorCountry;
      clickMeta.warehouse = productWarehouse;
    }
    trackCci('add_to_cart_click', {
      product_id: product?.id,
      funnel_stage: 'add_to_cart',
      ...(Object.keys(clickMeta).length ? { meta: clickMeta } : {}),
    });
    // Soft signal for unknown-geo so the funnel stays observable.
    if (!visitorCountry) {
      trackCci('geo_lookup_failed', {
        product_id: product?.id,
        meta: { stage: 'pdp_atc', shipping_eligibility: 'unknown_pending_checkout' },
      });
    } else if (geoBlocked) {
      toast.message('Limited shipping to your region — we\'ll confirm at checkout.');
    }
    // Prevent adding out-of-stock items
    if (!inStock) {
      toast.error("This product is out of stock");
      trackCci('add_to_cart_error', { product_id: product?.id, meta: { reason: 'out_of_stock' } });
      return;
    }

    haptic.success(); // Success haptic on add to cart

    // Trigger flying animation
    triggerAddToCart(
      selectedVariant?.variantImage || product.image_url || "/placeholder.svg",
      addToCartButtonRef.current,
    );

    // Cart uses variant price if user explicitly selected one, else base price
    const basePrice = userHasSelectedVariant && selectedVariant?.variantSellPrice
      ? Number(selectedVariant.variantSellPrice)
      : Number(product.price);

    // Apply volume discount
    const cartPrice = volumeDiscount > 0 ? basePrice * (1 - volumeDiscount / 100) : basePrice;

    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id + (selectedVariant ? `-${selectedVariant.vid}` : ""),
        slug: product.slug ?? undefined,
        name:
          product.name + (selectedVariant ? ` - ${selectedVariant.variantKey || selectedVariant.variantNameEn}` : ""),
        price: Math.round(cartPrice * 100) / 100,
        image: selectedVariant?.variantImage || product.image_url || "/placeholder.svg",
        variant: selectedVariant?.variantKey || selectedVariant?.variantNameEn,
      });
    }

    const savings = volumeDiscount > 0 ? ` (${volumeDiscount}% off!)` : "";
    toast.success(`${quantity}x ${product.name} added to cart!${savings}`);
    trackCci('add_to_cart_success', {
      product_id: product?.id,
      variant_id: selectedVariant?.vid ? String(selectedVariant.vid) : null,
      funnel_stage: 'add_to_cart',
      meta: { quantity, price: Math.round(cartPrice * 100) / 100 },
    });
  };

  const handleWishlistToggle = () => {
    haptic.selection(); // Selection haptic on wishlist toggle
    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
      toast.info("Removed from wishlist");
    } else {
      addToWishlist(product.id);
      toast.success("Added to wishlist!");
    }
  };

  // DISPLAY PRICE POLICY: Always show product.price (base price) unless the
  // user has explicitly clicked a variant.  This prevents the Google Merchant
  // mismatch where cards show $268.99 but PDP auto-selects variant at $193.67.
  const activePrice = userHasSelectedVariant && selectedVariant?.variantSellPrice
    ? Number(selectedVariant.variantSellPrice)
    : Number(product.price);
  const compareAtPrice = product.compare_at_price ? Number(product.compare_at_price) : null;
  const validCompareAt = compareAtPrice && compareAtPrice > activePrice ? compareAtPrice : null;

  // CANONICAL discount — always derived from BASE product.price, not variant price.
  // This keeps the gallery badge stable when variants change.
  const { percent: discount } = getProductDiscount(product.price, product.compare_at_price);

  // Check if description contains HTML
  const descriptionHasHtml = product.description?.includes("<") && product.description?.includes(">");

  const handlePrevImage = () => {
    pauseAutoplay();
    setSelectedImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    pauseAutoplay();
    setSelectedImage((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const inWishlist = isInWishlist(product.id);

  return (
    <Layout>
      {/* Tier C products get noindex to preserve crawl budget; all others stay indexable */}
      <Helmet>
        {(product as any).seo_tier === "C" ? (
          <>
            <meta name="robots" content="noindex, follow" />
            <meta name="googlebot" content="noindex, follow" />
          </>
        ) : (
          <>
            <meta
              name="robots"
              content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
            />
            <meta
              name="googlebot"
              content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
            />
          </>
        )}
      </Helmet>
      <ProductSchema
        product={{
          id: product.id,
          name: product.name || "",
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
          product_type: (product as any).product_type || null,
          google_product_category: (product as any).google_product_category || null,
        }}
        reviews={reviews}
      />
      <FAQSchema
        faqs={generateProductFAQs(product.name || "", product.category || undefined)}
        pageUrl={`https://getpawsy.pet/products/${product.slug || product.id}`}
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
                      <Link
                        to={`/collections/${encodeURIComponent(safeString(product.category).toLowerCase().replace(/\s+/g, "-"))}`}
                      >
                        {safeString(product.category)}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-[200px] truncate">{safeString(productDisplayName(product))}</BreadcrumbPage>
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
              <>
                {/* CI-9: when premiumPdpV2 is on, the hairline trust bar
                    above the gallery is suppressed — the SwipeBenefitChips
                    + price block + sticky ATC already carry trust. Keeps
                    above-the-fold quiet for cold mobile traffic. */}
                {!getConversionFlag('premiumPdpV2') && <MobileStickyTrustBar />}
                {/*
                  P0-2 (conversion sprint): the product H1 must be above the
                  fold on iPhone widths. We render the title block here on
                  mobile only; the duplicate title block in the right column
                  is suppressed on mobile so we keep exactly one H1 in the DOM.
                */}
                <div className="mb-3">
                  {product.category && (
                    <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-1.5">
                      {safeString(product.category)}
                    </p>
                  )}
                  <h1 className="text-2xl font-display font-bold text-foreground leading-tight break-words">
                    {safeString(productDisplayName(product))}
                  </h1>
                </div>
                <SwipeBenefitChips
                  category={product.category || undefined}
                  productName={product.name}
                />
                <MobileProductGallery
                images={images}
                productName={safeString(product.name)}
                category={product.category || undefined}
                discount={discount}
                productId={product.id}
                onImageClick={(index) => {
                  setSelectedImage(index);
                  setLightboxOpen(true);
                }}
                />
              </>
            ) : (
              <DesktopProductGallery
                images={images}
                productName={safeString(product.name)}
                category={product.category || undefined}
                discount={discount}
                productId={product.id}
                onImageClick={(index) => {
                  setSelectedImage(index);
                  setLightboxOpen(true);
                }}
              />
            )}
              {/* CJ-imported product videos (tap-to-play, safe for CWV) */}
              <ProductVideoSection
                productId={product.id}
                productName={safeString(product.name)}
                posterUrl={images?.[0]}
                className="mt-4"
              />
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
              {/* TikTok ad landing — only on litter box PDP, only with ?utm_source=tiktok */}
              {showTikTokVariant && (
                <TikTokHero onCtaClick={scrollToBuy} inStock={inStock} />
              )}
              {/*
                Universal Litter Box conversion booster — shown to ALL traffic
                on the automatic litter box PDP (mobile + desktop). Above the
                title for maximum above-the-fold conversion impact.
                Suppressed when the TikTok-only hero is already taking the
                top slot to avoid stacking two heroes.
              */}
              {isLitterBoxProduct && !showTikTokVariant && (
                <LitterBoxConversionBoost
                  images={safeArray<string>(product.images)}
                  productName={product.name}
                  inStock={inStock}
                  reviewCount={reviews.length}
                />
              )}
              {/* Pinterest continuity banner — only when arriving from a pin */}
              {adIntent.source === 'pinterest' && allowPinterestBanner && (
                <div className="mb-3">
                  <PinterestLandingBanner hook={adIntent.keyword} />
                </div>
              )}
              {/* Desktop-only title block — the mobile copy renders above the
                  gallery so the H1 sits above the fold on iPhone widths.
                  Runtime gate (not `hidden md:block`) so we keep exactly ONE
                  H1 in the DOM at all times, per SEO core rule. */}
              {!isMobile && product.category && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-primary font-medium uppercase tracking-wider mb-2"
                >
                  {safeString(product.category)}
                </motion.p>
              )}
              {!isMobile && (
                <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground leading-tight break-words">
                  {safeString(productDisplayName(product))}
                </h1>
              )}
              {/* Benefit headline — Pinterest hook / ad intent override OR static category default */}
              {adIntent.headline && allowHeadlineOverride && (
                <p className="text-base md:text-lg font-semibold text-primary mt-1.5">
                  {adIntent.headline}
                </p>
              )}
              {/* Benefit subline — short, scannable value prop. Use ad-intent subline when available. */}
              <p className="text-[15px] text-muted-foreground mt-2 leading-relaxed">
                {(allowHeadlineOverride && adIntent.subline) ||
                  generateClarityIntro(product.name, product.category || "")}
              </p>

              {/* CI-2: Emotional hook — deterministic per category, gated by flag.
                  CI-9: under premiumPdpV2 we hide it on mobile (the subline +
                  SwipeBenefitChips already carry the emotional read above the
                  fold). Desktop still renders it. */}
              <div
                className={
                  getConversionFlag('premiumPdpV2') ? 'mt-3 hidden md:block' : 'mt-3'
                }
              >
                <EmotionalHook
                  category={product.category || undefined}
                  productName={product.name}
                />
              </div>

              {/* Rating — only shown when real verified reviews exist */}
              {reviews.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => {
                      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
                      return (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < Math.round(avgRating) ? "text-warning fill-warning" : "text-muted"}`}
                        />
                      );
                    })}
                  </div>
                  <a href="#reviews" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    ({reviews.length} verified review{reviews.length !== 1 ? "s" : ""})
                  </a>
                </div>
              )}
            </div>

            {/* Price */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-muted/50 rounded-2xl p-5"
            >
              {(() => {
                // Use the already-computed activePrice (base price unless user selected variant)
                const displayPrice = activePrice;
                const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
                // P0-3 (conversion sprint): block the synthetic 1.20×–1.30×
                // anchor band (seeded by an old import that wrote
                // compare_at = price * 1.25 on every row). Show compare-at
                // only when the discount is real and material.
                const ratio = compareAt && displayPrice > 0 ? compareAt / displayPrice : 0;
                const isSyntheticAnchor = ratio >= 1.20 && ratio <= 1.30;
                const showCompare =
                  compareAt !== null &&
                  compareAt > displayPrice &&
                  ratio >= 1.08 &&
                  !isSyntheticAnchor;
                const currentDiscount = discount;

                return (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl md:text-4xl font-display font-bold text-primary">
                      ${displayPrice.toFixed(2)}
                    </span>
                    {showCompare && (
                      <>
                        <span className="text-xl text-muted-foreground line-through">${compareAt!.toFixed(2)}</span>
                        {currentDiscount && currentDiscount > 0 && (
                          <Badge className="bg-accent/20 text-accent-foreground border-accent/30">
                            Save {currentDiscount}% (${(compareAt! - displayPrice).toFixed(2)} off)
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Klarna BNPL messaging — only shown when Stripe-eligible. */}
              {klarna.eligible && (
                <p className="mt-2 text-sm text-muted-foreground">
                  or 4 interest-free payments of{' '}
                  <span className="font-semibold text-foreground">
                    {formatKlarnaInstallment(activePrice, 'USD')}
                  </span>{' '}
                  with{' '}
                  <span className="font-semibold" style={{ color: '#FFA8C5' }}>Klarna</span>
                  <span className="text-muted-foreground/80">. Available at checkout.</span>
                </p>
              )}

              {/* Selected variant badge */}
              {selectedVariant && (
                <Badge variant="outline" className="mt-3">
                  {selectedVariant.variantKey}
                </Badge>
              )}
            </motion.div>

            {/* Real social proof — verified shopper signals only.
                Hidden entirely when no signal clears its threshold. */}
            <RealSocialProofLine productId={product.id} />

            {/*
              Above-the-fold conversion block with winner badge.
              On mobile, when the new MobileStickyTrustBar (hairline strip
              above the gallery) is active, we render a compact variant that
              drops the duplicated shipping/delivery/returns triplet. Desktop
              keeps the full block since the mobile strip is `md:hidden`.
              Fully reversible by toggling `mobileTrustBar`.
            */}
            {getConversionFlag('mobileTrustBar') ? (
              <>
                <div className="md:hidden">
                  <ConversionBlock
                    productName={product.name}
                    category={product.category || undefined}
                    productId={product.id}
                    bestForOverride={adIntent.bestFor}
                    trustCompact
                  />
                </div>
                <div className="hidden md:block">
                  <ConversionBlock
                    productName={product.name}
                    category={product.category || undefined}
                    productId={product.id}
                    bestForOverride={adIntent.bestFor}
                  />
                </div>
              </>
            ) : (
              <ConversionBlock productName={product.name} category={product.category || undefined} productId={product.id} bestForOverride={adIntent.bestFor} />
            )}
            {/*
              Trust Stack — PDP merchant trust signals. Fully duplicates the
              top MobileStickyTrustBar on mobile, so we hide it there when
              the strip is active. Desktop keeps the full block.
            */}
            <div
              className={`bg-muted/40 rounded-xl p-4 space-y-2.5 border border-border/50 ${getConversionFlag('mobileTrustBar') ? 'hidden md:block' : ''}`}
            >
              <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                <CheckCircle className={`w-4 h-4 flex-shrink-0 ${inStock ? 'text-green-600' : 'text-destructive'}`} />
                {inStock ? 'In stock — Ships to United States' : 'Currently unavailable'}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Truck className="w-4 h-4 text-primary flex-shrink-0" />
                Estimated delivery: {DELIVERY_TIME_STANDARD}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-primary flex-shrink-0" />
                Secure checkout
              </div>
              <div className="border-t border-border/50 pt-2.5 mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">✔ Free shipping over ${FREE_SHIPPING_THRESHOLD}</span>
                <a href="/returns" className="flex items-center gap-1 hover:text-primary hover:underline">✔ {RETURN_WINDOW_DAYS}-day returns</a>
                <a href="/shipping" className="flex items-center gap-1 hover:text-primary hover:underline">✔ Shipping policy</a>
                <span className="flex items-center gap-1">✔ Secure checkout</span>
              </div>
            </div>

            {/* Variants - PRIORITY: Show immediately after price for visibility */}
            {variants.length > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="space-y-3 bg-muted/30 rounded-2xl p-4 border border-border/50"
              >
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Choose your option:{" "}
                  <span className="text-primary">{selectedVariant ? selectedVariant.variantKey : "Select one"}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {variants.map((variant) => {
                    const isSelected = selectedVariant?.vid === variant.vid;
                    const displayValue = variant.variantKey || variant.variantNameEn || "Option";

                    // Detect if this is a color variant
                    const colorMap: Record<string, string> = {
                      // Basic colors
                      red: "#ef4444",
                      blue: "#3b82f6",
                      green: "#22c55e",
                      yellow: "#eab308",
                      orange: "#f97316",
                      purple: "#a855f7",
                      pink: "#ec4899",
                      black: "#000000",
                      white: "#ffffff",
                      gray: "#6b7280",
                      grey: "#6b7280",
                      brown: "#92400e",
                      beige: "#d4a574",
                      navy: "#1e3a5a",
                      teal: "#14b8a6",
                      cyan: "#06b6d4",
                      gold: "#fbbf24",
                      silver: "#9ca3af",
                      rose: "#fb7185",
                      coral: "#f97171",
                      mint: "#6ee7b7",
                      lavender: "#c4b5fd",
                      burgundy: "#7f1d1d",
                      khaki: "#c9b896",
                      cream: "#fffdd0",
                      ivory: "#fffff0",
                      tan: "#d2b48c",
                      chocolate: "#7b3f00",
                      // Extended colors
                      maroon: "#800000",
                      olive: "#808000",
                      lime: "#00ff00",
                      aqua: "#00ffff",
                      magenta: "#ff00ff",
                      violet: "#ee82ee",
                      indigo: "#4b0082",
                      turquoise: "#40e0d0",
                      salmon: "#fa8072",
                      peach: "#ffdab9",
                      plum: "#dda0dd",
                      charcoal: "#36454f",
                      wine: "#722f37",
                      mustard: "#ffdb58",
                      sand: "#c2b280",
                      rust: "#b7410e",
                    };

                    const lowerValue = displayValue.toLowerCase();
                    const detectedColor = Object.keys(colorMap).find(
                      (color) => lowerValue.includes(color) || lowerValue === color,
                    );
                    const isColorVariant = !!detectedColor;
                    const colorHex = detectedColor ? colorMap[detectedColor] : null;
                    const hasImage = !!variant.variantImage;

                    return (
                      <motion.button
                        key={variant.vid}
                        onClick={() => { if (!isSelected) { setSelectedVariant(variant); setUserHasSelectedVariant(true); } }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary shadow-soft ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50 bg-background"
                        }`}
                      >
                        {/* Color indicator dot if color detected */}
                        {isColorVariant && colorHex && (
                          <span
                            className={`w-4 h-4 rounded-full flex-shrink-0 ${
                              ["white", "ivory", "cream", "beige"].includes(detectedColor!)
                                ? "border border-border"
                                : ""
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
                  const cat = (product.category || "").toLowerCase();
                  const n = (product.name || "").toLowerCase();
                  const bullets: string[] = [];
                  const hay = `${n} ${cat}`;

                  // P0-4 (conversion sprint): grooming / supplement / dispenser
                  // branches MUST run before the toy branch — otherwise a
                  // "Dog Paw Cleaner" or "Grooming Brush" filed under
                  // "Dog Toys" picks up chew-toy copy ("aggressive chewers"),
                  // which is the category-copy leak flagged in the PDP audit.
                  const isGrooming = /paw\s*cleaner|brush|comb|groom|shampoo|nail|deshed|wipe/.test(hay);
                  const isSupplement = /supplement|vitamin|calming\s*chew|probiotic|joint\s*chew|treat\s*chew/.test(hay);
                  const isFeeder = /feeder|dispenser|water\s*fountain|automatic\s*food/.test(hay);

                  // Category-aware benefit bullets (problem → outcome)
                  if (isGrooming) {
                    bullets.push(
                      "Gently cleans paws, coat, or nails without stress",
                      "Skin-safe materials designed for sensitive pets",
                      "Easy to rinse and store between uses",
                      "Compact size — works at home or on the go",
                    );
                  } else if (isSupplement) {
                    bullets.push(
                      "Formulated for daily routine support",
                      "Made with pet-friendly, palatable ingredients",
                      "Clear dosing guidance on every label",
                      "Trusted by US pet parents — ships from the United States",
                    );
                  } else if (isFeeder) {
                    bullets.push(
                      "Portion-controlled meals keep feeding consistent",
                      "Quiet motor — won't startle anxious pets",
                      "Easy to clean: dishwasher-safe parts",
                      "Backup power option protects scheduled meals",
                    );
                  } else if (n.includes("bed") || cat.includes("bed")) {
                    bullets.push(
                      "Designed to support joint comfort and recovery",
                      "May help improve sleep quality for your pet",
                      "Suitable for older, recovering, and active dogs",
                      "Soft, breathable cover helps regulate temperature",
                    );
                  } else if (n.includes("harness") || cat.includes("harness")) {
                    bullets.push(
                      "Stops pulling without choking or neck strain",
                      "Padded straps prevent rubbing and chafing",
                      "Reflective trim for safe evening walks",
                      "Quick-snap buckle for easy on/off",
                    );
                  } else if (/cat\s*tree|cat\s*condo|scratching/i.test(n + " " + cat)) {
                    bullets.push(
                      "Saves your furniture with dedicated scratching posts",
                      "Multi-level design keeps cats mentally stimulated",
                      "Supports cats up to 25+ lbs safely",
                      "Sturdy base prevents tipping during play",
                    );
                  } else if (/litter/i.test(n + " " + cat)) {
                    bullets.push(
                      "Automatic cleaning helps reduce daily scooping",
                      "Designed to help manage litter box odors",
                      "Built-in sensors for pet safety",
                      "Designed for multi-cat households",
                    );
                  } else if (n.includes("toy") || cat.includes("toy")) {
                    bullets.push(
                      "Channels energy away from furniture destruction",
                      "Durable build withstands aggressive chewers",
                      "Non-toxic, pet-safe materials throughout",
                      "Engages natural problem-solving instincts",
                    );
                  } else if (n.includes("carrier") || cat.includes("carrier")) {
                    bullets.push(
                      "Reduces travel anxiety with ventilated comfort",
                      "Fits under most airline cabin seats",
                      "Secure zippers prevent escape attempts",
                      "Padded base cushions bumpy rides",
                    );
                  } else {
                    bullets.push(
                      "Premium materials built for daily pet life",
                      "Designed for comfort and ease of use",
                      "Shipping to the United States in 5–10 business days",
                      "30-day return policy included",
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

            {/* Short description moved to subline under title */}

            {/* PriceAnchoringSection REMOVED — fabricated price comparisons flagged by Google Merchant Center */}

            {/* Stock Status */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${inStock ? "bg-success" : "bg-destructive"}`} />
                <span className="font-semibold text-foreground">
                  {inStock ? "In Stock – Ready to Ship" : "Currently Unavailable"}
                </span>
              </div>
              {inStock && (
                <p className="text-xs text-muted-foreground pl-6">
                  Orders processed within 1–2 business days
                </p>
              )}
              {/* Safe urgency signal */}
              {inStock && (
                <p className="text-xs font-medium text-primary pl-6 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  High demand item — frequently purchased
                </p>
              )}
            </div>

            {/* Low Stock Badge — real inventory driven */}
            <LowStockBadge stock={product.stock} threshold={10} />

            {/* Stock Notification Form - Show when out of stock */}
            {!inStock && <StockNotificationForm productId={product.id} productName={product.name || ""} />}

            {/* Volume Discount — Buy More Save More */}
            {inStock && (
              <VolumeDiscountSelector
                basePrice={activePrice}
                onQuantityChange={(newQty, discountPct) => {
                  setQuantity(newQty);
                  setVolumeDiscount(discountPct);
                }}
                selectedQuantity={quantity}
                contextLabel={
                  (product.category || '').toLowerCase().includes('cat')
                    ? 'Great value for multi-cat homes'
                    : (product.category || '').toLowerCase().includes('dog')
                      ? 'Perfect for multi-dog households'
                      : 'Great value for pet owners'
                }
              />
            )}

            {/* Social proof line */}
            {reviews.length > 0 && (
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5 pt-1">
                <span className="text-amber-400">★★★★★</span>
                <span>{reviews.length} verified review{reviews.length !== 1 ? 's' : ''}</span>
              </p>
            )}

            {/* Quantity & Actions - tracked for sticky bar visibility */}
            {/* Above-ATC 5-signal trust strip — Mission First Revenue P0.2 */}
            <TrustStripAboveATC className="mt-2" />

            <motion.div
              ref={mainAddToCartRef}
              id="pdp-buy-box"
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

              {/* Add to Cart — high-contrast CTA */}
              <Button
                ref={addToCartButtonRef}
                size="lg"
                className="flex-1 h-14 gap-2 text-base font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white shadow-lg rounded-xl"
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
                className={`h-12 w-12 rounded-xl border-2 ${inWishlist ? "border-accent bg-accent/10 text-accent" : ""}`}
                onClick={handleWishlistToggle}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? "fill-current" : ""}`} />
              </Button>
            </motion.div>
            {geoBlocked && (
              <div
                role="status"
                className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              >
                Limited shipping availability for your region — we'll confirm eligibility at checkout.
              </div>
            )}

            {/* Trust Badges — single consolidated trust block */}
            {/*
              On mobile, when the new top MobileStickyTrustBar (hairline strip
              above the gallery) is active, we hide this legacy 4-card grid to
              avoid duplicate reassurance. Desktop keeps it (the mobile strip
              is `md:hidden`). Fully reversible by toggling `mobileTrustBar`.
            */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className={`pt-2 ${getConversionFlag('mobileTrustBar') ? 'hidden md:block' : ''}`}
            >
              <TrustBadgesBlock compact />
            </motion.div>

            {/* Category-specific guarantee — deterministic, no medical claims. */}
            <ProductGuaranteeBadge
              productName={product.name}
              category={product.category}
            />

            {/* Micro-friction reduction */}
            <MicroFrictionBlock />

            {/* Why pet owners choose this */}
            <WhyCustomersChoose />
          </motion.div>
        </div>

        {/* Emotional trigger + delivery info consolidated */}

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
                  description={product.description || "No description available."}
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
                        <span className={`font-medium ${inStock ? "text-success" : "text-destructive"}`}>
                          {inStock ? "In Stock" : "Out of Stock"}
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
                        "Premium quality materials",
                        "Safe for all pets",
                        "Easy to clean and maintain",
                        "Durable construction",
                        "Carefully packaged for safe delivery",
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
                    Use this guide to find the perfect size for your pet. Measure your pet and compare with the chart
                    below.
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
                          { size: "XS", weight: "Up to 5 lbs", neck: '6-8"', chest: '10-12"', back: '8-10"' },
                          { size: "S", weight: "5-10 lbs", neck: '8-10"', chest: '12-15"', back: '10-12"' },
                          { size: "M", weight: "10-25 lbs", neck: '10-14"', chest: '15-20"', back: '12-16"' },
                          { size: "L", weight: "25-50 lbs", neck: '14-18"', chest: '20-26"', back: '16-20"' },
                          { size: "XL", weight: "50-80 lbs", neck: '18-22"', chest: '26-32"', back: '20-24"' },
                          { size: "XXL", weight: "80+ lbs", neck: '22-26"', chest: '32-38"', back: '24-28"' },
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
                      <li>
                        <strong>Neck:</strong> Measure around the base of the neck where the collar sits
                      </li>
                      <li>
                        <strong>Chest:</strong> Measure the widest part of the chest, behind the front legs
                      </li>
                      <li>
                        <strong>Back Length:</strong> Measure from the base of the neck to the base of the tail
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="shipping" className="mt-6">
              <div className="bg-muted/30 rounded-2xl p-6 md:p-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    { emoji: "🚚", text: US_FULFILLMENT_NOTE },
                    { emoji: "📦", text: `Standard delivery: ${DELIVERY_TIME_STANDARD}` },
                    { emoji: "✨", text: `Free shipping on orders over $${FREE_SHIPPING_THRESHOLD}` },
                    {
                      emoji: "💰",
                      text: `$${FLAT_SHIPPING_RATE.toFixed(2)} flat rate under $${FREE_SHIPPING_THRESHOLD}`,
                    },
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
                          setUserHasSelectedVariant(true);
                          if (variant.variantImage) {
                            const idx = images.findIndex((img) => img === variant.variantImage);
                            if (idx !== -1) setSelectedImage(idx);
                          }
                        }}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${
                          selectedVariant?.vid === variant.vid
                            ? "border-primary bg-primary/10 shadow-soft"
                            : "border-border hover:border-primary/50 bg-background"
                        }`}
                      >
                        {variant.variantImage && (
                          <img
                            src={variant.variantImage}
                            alt={variant.variantNameEn || variant.variantKey || "Product variant"}
                            className="w-full aspect-square rounded-lg object-cover mb-3"
                          />
                        )}
                        <p className="text-sm font-medium line-clamp-2 text-foreground">
                          {variant.variantNameEn || variant.variantKey || "Option"}
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

        {/* 0. Who Is This For? — audience targeting */}
        {allowReassuranceStack && (
          <ReassuranceCallout
            category={product.category || undefined}
            productName={product.name}
          />
        )}
        <ProductIdealFor productName={product.name} category={product.category || ""} />

        {/* 1. Problem → Solution Block */}
        <ProductProblemSolution productName={product.name} category={product.category || ""} />

        {/* Comparison block — "Why this is a better choice" */}
        <ProductVsAlternatives productName={product.name} category={product.category || ""} />

        {/* 4. Visible FAQ Accordion */}
        <ProductFAQAccordion productName={product.name} category={product.category || undefined} />

        {/* E-E-A-T Trust Block */}
        <WhyTrustGetPawsy variant="pdp" className="mt-8" />

        {/* 9. Final CTA Block — conversion closer */}
        <FinalCtaBlock
          onAddToCart={handleAddToCart}
          inStock={inStock}
          price={activePrice}
          compareAtPrice={validCompareAt}
          productName={product.name}
          category={product.category || ""}
        />

        {/* TikTok-optimized funnel — only shown when arriving from a TikTok ad */}
        {showTikTokVariant && (
          <TikTokSalesFunnel
            onCtaClick={scrollToBuy}
            inStock={inStock}
            price={activePrice}
          />
        )}

        {showTikTokVariant && (
          <TikTokStickyCTA
            onCtaClick={scrollToBuy}
            inStock={inStock}
            price={activePrice}
          />
        )}

        {/*
          Universal mobile sticky ATC for every other PDP visitor. Shown only
          when the TikTok-variant sticky bar is NOT active so we never stack
          two fixed bars on top of each other.
        */}
        {!showTikTokVariant && (
          <PdpStickyAtc
            onCtaClick={handleAddToCart}
            inStock={inStock}
            price={activePrice}
            productId={product?.id}
            ctaLabel={
              getConversionFlag('dynamicAtcLabel')
                ? getEmotionalCopy(product.category, product.name).ctaLabel
                : undefined
            }
          />
        )}

        {/* Litter Box-only emotional reinforcement before reviews */}
        {isLitterBoxProduct && <LitterBoxLovedSection />}

        {/* Reviews Section — only show list when ≥3 reviews exist */}
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
              <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">Customer Reviews</h2>
              {reviews.length >= 3 ? (
                <p className="text-sm text-muted-foreground">
                  {reviews.length} verified review{reviews.length !== 1 ? "s" : ""} from our customers
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Be the first to review this product
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 w-full">
            {/* Review Form — always visible */}
            <div className="lg:col-span-1">
              <ReviewForm productId={product.id} onReviewSubmitted={handleReviewsRefresh} />
            </div>

            {/* Reviews List — only render when ≥3 reviews */}
            {reviews.length >= 3 && (
              <div className="lg:col-span-2">
                <ReviewsList reviews={reviews} onReviewDeleted={handleReviewsRefresh} />
              </div>
            )}
          </div>
        </motion.section>

        {/* Dog Beds Cluster Links — hub + guide */}
        <DogBedsClusterLinks productCategory={product.category} productName={product.name} />

        {/* Universal Cluster Links — collection + guide authority flow */}
        <PDPClusterLinks productCategory={product.category} productName={product.name} />

        {/* Related Guides — max 3 */}
        {relatedGuides.length > 0 && <RelatedGuides guides={relatedGuides} />}

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
              relatedProducts={(relatedProducts || []).map((p) => ({
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

        {/* Internal link to collection — SEO authority flow */}
        {product.category && (
          <div className="mt-8 text-center">
            <Link
              to={`/collections/${encodeURIComponent(safeString(product.category).toLowerCase().replace(/\s+/g, "-"))}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors underline underline-offset-4"
            >
              Browse all {safeString(product.category)} products →
            </Link>
          </div>
        )}

        {/* Related Products */}
        <div className="mt-16">
          <RelatedProductsCarousel
            products={relatedProducts || []}
            isLoading={relatedLoading}
            title="You May Also Like"
            subtitle="Popular picks from the same category"
            listId="related-products"
            listName="Related Products"
            sourceProductId={product.id}
            sourceProductName={product.name}
            crossSellType="related_products"
          />
        </div>

        {/* Crawlable related product links — visible to search engines */}
        {relatedProducts && relatedProducts.length > 0 && (
          <CrawlableRelatedLinks
            products={relatedProducts.map((p) => ({
              id: p.id,
              name: p.name,
              slug: (p as any).slug || null,
              price: Number(p.price),
              category: p.category,
            }))}
            currentCategory={product.category}
          />
        )}

        {/* Recently Viewed Products Carousel */}
        {(recentlyViewedLoading || (recentlyViewedProducts && recentlyViewedProducts.length > 0)) && (
          <div className="mt-16">
            <RecentlyViewedCarousel
              products={(recentlyViewedProducts || []).map((p) => ({
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
        {showStickyBar && (() => {
          const pdpStickyV2 = getConversionFlag('premiumPdpStickyV2');
          const hideOnScroll = pdpStickyV2 && stickyScrollDir === 'down';
          return (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: hideOnScroll ? 100 : 0, opacity: hideOnScroll ? 0 : 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={
              // CRITICAL: keep this legacy desktop sticky bar hidden on mobile.
              // PdpStickyAtc (md:hidden, z-40) owns the mobile sticky CTA. When
              // this z-50 bar also renders on mobile, its wrapper div sits on
              // top of the mobile ATC button and silently swallows every tap
              // (the wrapper has no onClick) — pawsy-cart stays []. That single
              // overlap killed every mobile purchase (167 PDP / 0 sales, 7d).
              pdpStickyV2
                ? "hidden md:block fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/60 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] safe-area-bottom"
                : "hidden md:block fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.15)] safe-area-bottom"
            }
          >
            {pdpStickyV2 && (
              <div className="hidden md:flex max-w-7xl mx-auto px-4 pt-2 items-center gap-4 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-2">
                <span className="inline-flex items-center gap-1.5"><Truck className="w-3 h-3" strokeWidth={1.75} />Free Shipping ${FREE_SHIPPING_THRESHOLD}+</span>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1.5"><Shield className="w-3 h-3" strokeWidth={1.75} />30-Day Returns</span>
              </div>
            )}
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
              {/* Product name + Price */}
              <div className="flex-shrink-0 min-w-0">
                <p className="text-xs font-medium text-foreground truncate max-w-[120px] md:max-w-none">{safeString(product.name)}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-primary">${activePrice.toFixed(2)}</span>
                  {validCompareAt && (
                    <span className="text-xs text-muted-foreground line-through">
                      ${validCompareAt.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Trust badge - desktop only (legacy variant; hairline row above replaces it when v2 is on) */}
              {!pdpStickyV2 && (
                <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                  <Truck className="w-3.5 h-3.5 text-primary" />
                  <span>Free Shipping Available ${FREE_SHIPPING_THRESHOLD}+</span>
                  <span className="mx-1">•</span>
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span>30-Day Returns</span>
                </div>
              )}

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
                className="flex-1 md:flex-none md:min-w-[220px] gap-2 rounded-full font-bold shadow-soft bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white"
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
                <Heart
                  className={`w-5 h-5 transition-colors ${inWishlist ? "fill-destructive text-destructive" : ""}`}
                />
              </Button>
            </div>
          </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Spacer for sticky bar — fixed height, no transition to prevent layout oscillation */}
      {showStickyBar && <div className="h-20" />}
      <CreatePinterestAdButton slug={product?.slug ?? slug ?? ""} />
    </Layout>
  );
};

export default ProductDetail;
