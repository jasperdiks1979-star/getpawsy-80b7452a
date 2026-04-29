// Google Analytics 4 Event Tracking Utility
import { getFounderModeStatus, getTrafficType, logFounderEvent } from '@/lib/founder-mode';
import {
  ttTrackViewContent,
  ttTrackAddToCart,
  ttTrackInitiateCheckout,
  ttTrackPurchase,
} from '@/lib/tiktok-pixel';
import { enrichEventWithLpCta } from '@/lib/lpCtaCorrelation';
import { validateUtmAttribution } from '@/lib/utmAttributionValidator';
import { mirrorLpFunnelEvent } from '@/lib/lpFunnelMirror';
import { getPersistedUtm } from '@/lib/utmNormalizer';

/**
 * Conversion-event UTM enricher. Pulls the persisted attribution
 * (session → 30-day localStorage) and exposes it on the GA4 event so
 * downstream funnel reports can group revenue by the original
 * utm_source / utm_campaign / utm_content even when the user landed
 * on /checkout or /payment-success without UTMs in the URL.
 */
function withPersistedUtm(
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  const utm = getPersistedUtm();
  return {
    ...params,
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
    utm_content: utm.utm_content ?? null,
    utm_term: utm.utm_term ?? null,
  };
}

declare global {
  interface Window {
    gtag: (
      command: 'event' | 'config' | 'js' | 'set',
      action: string,
      params?: Record<string, unknown>
    ) => void;
    dataLayer: unknown[];
  }
}

// Check if gtag is available
const isGtagAvailable = (): boolean => {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
};

// Initialize founder user properties on gtag (call once on app init)
export const initAnalyticsUserProperties = (): void => {
  if (!isGtagAvailable()) return;
  const trafficType = getTrafficType();
  window.gtag('set', 'user_properties', { traffic_type: trafficType });
  if (getFounderModeStatus()) {
    console.debug('[Analytics] Founder Mode active — traffic_type=internal, events will be suppressed');
  }
};

// Conversion-critical events that MUST be suppressed for founder
const SUPPRESSED_EVENTS = new Set([
  'purchase', 'begin_checkout', 'add_to_cart', 'remove_from_cart',
  'add_to_wishlist', 'sign_up',
]);

// Generic event tracking — with founder guard
export const trackEvent = (
  eventName: string,
  params?: Record<string, unknown>
): void => {
  if (!isGtagAvailable()) {
    console.debug('[Analytics] gtag not available, skipping event:', eventName);
    return;
  }

  const isFounder = getFounderModeStatus();

  // Hard suppress conversion events for founder
  if (isFounder && SUPPRESSED_EVENTS.has(eventName)) {
    logFounderEvent(eventName, true);
    console.debug(`[Analytics] ${eventName} suppressed (Founder Mode)`);
    return;
  }

  // Tag all events with traffic_type
  const lpEnrichment = enrichEventWithLpCta(eventName, params);
  const enrichedParams = {
    ...params,
    traffic_type: getTrafficType(),
    ...(isFounder ? { gp_client: 'founder' } : {}),
    ...(lpEnrichment ?? {}),
  };

  logFounderEvent(eventName, false);
  window.gtag('event', eventName, enrichedParams);
  console.debug('[Analytics] Event tracked:', eventName, enrichedParams);

  // Mirror funnel + downstream events to Postgres for the admin
  // drop-off report (best-effort, never blocks the UX).
  try {
    mirrorLpFunnelEvent(eventName, enrichedParams);
  } catch (err) {
    console.debug('[Analytics] funnel mirror failed:', err);
  }

  // Cross-event UTM consistency guard. Runs AFTER dispatch so the
  // primary event still ships even if validation throws. Skip the
  // mismatch event itself to avoid infinite recursion.
  if (eventName !== 'lp_attribution_mismatch') {
    try {
      const violation = validateUtmAttribution(eventName, enrichedParams);
      if (violation) {
        window.gtag('event', 'lp_attribution_mismatch', {
          violating_event: violation.event,
          source_event: violation.source_event,
          expected_utm_source: violation.expected.utm_source ?? null,
          expected_utm_medium: violation.expected.utm_medium ?? null,
          expected_utm_campaign: violation.expected.utm_campaign ?? null,
          actual_utm_source: violation.actual.utm_source ?? null,
          actual_utm_medium: violation.actual.utm_medium ?? null,
          actual_utm_campaign: violation.actual.utm_campaign ?? null,
          page: violation.page,
          traffic_type: getTrafficType(),
        });
      }
    } catch (err) {
      console.debug('[Analytics] UTM validator failed:', err);
    }
  }
};

// Newsletter subscription
export const trackNewsletterSignup = (email?: string): void => {
  trackEvent('newsletter_signup', {
    method: 'footer_form',
    email_domain: email ? email.split('@')[1] : undefined,
  });
};

// Wishlist actions
export const trackAddToWishlist = (productId: string, productName?: string, productPrice?: number): void => {
  trackEvent('add_to_wishlist', {
    currency: 'EUR',
    value: productPrice,
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
    }],
  });
};

export const trackRemoveFromWishlist = (productId: string, productName?: string): void => {
  trackEvent('remove_from_wishlist', {
    item_id: productId,
    item_name: productName,
  });
};

// Cart actions
export const trackAddToCart = (
  productId: string,
  productName: string,
  productPrice: number,
  quantity: number = 1
): void => {
  trackEvent('add_to_cart', withPersistedUtm({
    currency: 'USD',
    value: productPrice * quantity,
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
      quantity,
    }],
  }));

  // TikTok Pixel — respect founder mode suppression
  if (!getFounderModeStatus()) {
    ttTrackAddToCart({
      contentId: productId,
      contentName: productName,
      value: productPrice * quantity,
      quantity,
      currency: 'USD',
    });
  }
};

export const trackRemoveFromCart = (
  productId: string,
  productName: string,
  productPrice: number,
  quantity: number = 1
): void => {
  trackEvent('remove_from_cart', {
    currency: 'EUR',
    value: productPrice * quantity,
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
      quantity,
    }],
  });
};

// Product view
export const trackViewItem = (
  productId: string,
  productName: string,
  productPrice: number,
  category?: string
): void => {
  trackEvent('view_item', {
    currency: 'USD',
    value: productPrice,
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
      item_category: category,
    }],
  });

  // TikTok Pixel — respect founder mode suppression
  if (!getFounderModeStatus()) {
    ttTrackViewContent({
      contentId: productId,
      contentName: productName,
      value: productPrice,
      currency: 'USD',
    });
  }
};

// Search
export const trackSearch = (searchTerm: string): void => {
  trackEvent('search', {
    search_term: searchTerm,
  });
};

// Begin checkout
export const trackBeginCheckout = (
  items: Array<{ id: string; name: string; price: number; quantity: number }>,
  totalValue: number
): void => {
  // Idempotency: prevent duplicate begin_checkout within the same checkout session.
  // Key = stable cart signature (sorted item ids + qty + value). Cleared on purchase.
  try {
    const sig = items
      .map(i => `${i.id}:${i.quantity}`)
      .sort()
      .join('|') + `@${totalValue.toFixed(2)}`;
    const STORAGE_KEY = 'gp_begin_checkout_fired';
    const prev = sessionStorage.getItem(STORAGE_KEY);
    if (prev === sig) {
      console.debug('[Analytics] begin_checkout suppressed (idempotent)', sig);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, sig);
  } catch {
    // sessionStorage unavailable — fall through and fire event
  }

  trackEvent('begin_checkout', withPersistedUtm({
    currency: 'USD',
    value: totalValue,
    funnel_step: 5,
    items: items.map(item => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  }));

  // TikTok Pixel — respect founder mode suppression
  if (!getFounderModeStatus()) {
    ttTrackInitiateCheckout({
      value: totalValue,
      currency: 'USD',
      contents: items.map(item => ({
        content_id: item.id,
        quantity: item.quantity,
        price: item.price,
      })),
    });
  }
};


// Purchase complete — with US-only guard for GA4
export const trackPurchase = (
  transactionId: string,
  items: Array<{ id: string; name: string; price: number; quantity: number }>,
  totalValue: number
): void => {
  // Idempotency: a single transaction_id must only fire purchase once,
  // even across reloads of the success page. Use localStorage with a 24h TTL
  // and a small ring buffer to avoid unbounded growth.
  const PURCHASE_KEY = 'gp_purchase_fired';
  const TTL_MS = 24 * 60 * 60 * 1000;
  try {
    const raw = localStorage.getItem(PURCHASE_KEY);
    const now = Date.now();
    let fired: Array<{ id: string; ts: number }> = raw ? JSON.parse(raw) : [];
    fired = fired.filter(f => now - f.ts < TTL_MS);
    if (fired.some(f => f.id === transactionId)) {
      console.debug('[Analytics] purchase suppressed (idempotent)', transactionId);
      return;
    }
    fired.push({ id: transactionId, ts: now });
    // Keep last 50 entries max
    if (fired.length > 50) fired = fired.slice(-50);
    localStorage.setItem(PURCHASE_KEY, JSON.stringify(fired));
  } catch {
    // localStorage unavailable — fall through and fire event
  }

  // Clear begin_checkout signature so a follow-up cart re-enters cleanly
  try { sessionStorage.removeItem('gp_begin_checkout_fired'); } catch {}

  // Country guard: only send purchase to GA4 for US traffic
  const cachedLocation = sessionStorage.getItem('visitor_location');
  if (cachedLocation) {
    try {
      const loc = JSON.parse(cachedLocation);
      if (loc.country && loc.country !== 'United States') {
        console.debug('[Analytics] Purchase event blocked for GA4: non-US country', loc.country);
        return;
      }
    } catch {
      // Parse error — allow event through
    }
  }

  trackEvent('purchase', withPersistedUtm({
    transaction_id: transactionId,
    currency: 'USD',
    value: totalValue,
    funnel_step: 6,
    items: items.map(item => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  }));

  // TikTok Pixel — respect founder mode suppression
  if (!getFounderModeStatus()) {
    ttTrackPurchase({
      orderId: transactionId,
      value: totalValue,
      currency: 'USD',
      contents: items.map(item => ({
        content_id: item.id,
        content_name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
    });
  }
};


// User authentication
export const trackLogin = (method: string): void => {
  trackEvent('login', { method });
};

export const trackSignUp = (method: string): void => {
  trackEvent('sign_up', { method });
};

// Page/category view
export const trackViewCategory = (categoryName: string): void => {
  trackEvent('view_item_list', {
    item_list_id: categoryName.toLowerCase().replace(/\s+/g, '_'),
    item_list_name: categoryName,
  });
};

// View item list with products (enhanced ecommerce)
export const trackViewItemList = (
  listId: string,
  listName: string,
  items: Array<{ 
    id: string; 
    name: string; 
    price: number; 
    category?: string;
    position?: number;
  }>
): void => {
  trackEvent('view_item_list', {
    item_list_id: listId,
    item_list_name: listName,
    items: items.map((item, index) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      item_category: item.category,
      index: item.position ?? index,
      currency: 'USD',
    })),
  });
};

// Select item from list (click tracking)
export const trackSelectItem = (
  listId: string,
  listName: string,
  item: { id: string; name: string; price: number; category?: string; position?: number }
): void => {
  trackEvent('select_item', {
    item_list_id: listId,
    item_list_name: listName,
    items: [{
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      item_category: item.category,
      index: item.position,
      currency: 'EUR',
    }],
  });
};

// Cross-sell / Related Products tracking
export const trackCrossSellImpression = (
  sourceProductId: string,
  sourceProductName: string,
  relatedItems: Array<{ 
    id: string; 
    name: string; 
    price: number; 
    category?: string;
    position?: number;
  }>,
  crossSellType: 'related_products' | 'frequently_bought' | 'upsell' | 'cart_upsell' | 'customers_also_bought' = 'related_products'
): void => {
  trackEvent('view_item_list', {
    item_list_id: `cross_sell_${crossSellType}`,
    item_list_name: `Cross-sell: ${crossSellType.replace(/_/g, ' ')}`,
    cross_sell_type: crossSellType,
    source_product_id: sourceProductId,
    source_product_name: sourceProductName,
    items: relatedItems.map((item, index) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      item_category: item.category,
      index: item.position ?? index,
      currency: 'EUR',
    })),
  });
};

export const trackCrossSellClick = (
  sourceProductId: string,
  sourceProductName: string,
  clickedItem: { 
    id: string; 
    name: string; 
    price: number; 
    category?: string; 
    position?: number;
  },
  crossSellType: 'related_products' | 'frequently_bought' | 'upsell' | 'cart_upsell' | 'customers_also_bought' = 'related_products'
): void => {
  // Standard select_item event for GA4 ecommerce
  trackEvent('select_item', {
    item_list_id: `cross_sell_${crossSellType}`,
    item_list_name: `Cross-sell: ${crossSellType.replace(/_/g, ' ')}`,
    items: [{
      item_id: clickedItem.id,
      item_name: clickedItem.name,
      price: clickedItem.price,
      item_category: clickedItem.category,
      index: clickedItem.position,
      currency: 'EUR',
    }],
  });

  // Custom cross-sell click event for detailed analysis
  trackEvent('cross_sell_click', {
    source_product_id: sourceProductId,
    source_product_name: sourceProductName,
    clicked_product_id: clickedItem.id,
    clicked_product_name: clickedItem.name,
    clicked_product_price: clickedItem.price,
    clicked_product_category: clickedItem.category,
    cross_sell_type: crossSellType,
    position: clickedItem.position,
    currency: 'EUR',
  });
};

export const trackCrossSellAddToCart = (
  sourceProductId: string,
  sourceProductName: string,
  addedItem: { 
    id: string; 
    name: string; 
    price: number; 
    category?: string; 
    position?: number;
  },
  quantity: number = 1,
  crossSellType: 'related_products' | 'frequently_bought' | 'upsell' | 'cart_upsell' | 'customers_also_bought' = 'related_products'
): void => {
  // Standard add_to_cart event
  trackEvent('add_to_cart', {
    currency: 'USD',
    value: addedItem.price * quantity,
    items: [{
      item_id: addedItem.id,
      item_name: addedItem.name,
      price: addedItem.price,
      item_category: addedItem.category,
      quantity,
    }],
  });

  // Custom cross-sell add to cart event
  trackEvent('cross_sell_add_to_cart', {
    source_product_id: sourceProductId,
    source_product_name: sourceProductName,
    added_product_id: addedItem.id,
    added_product_name: addedItem.name,
    added_product_price: addedItem.price,
    added_product_category: addedItem.category,
    cross_sell_type: crossSellType,
    position: addedItem.position,
    quantity,
    value: addedItem.price * quantity,
    currency: 'USD',
  });
};

// Bundle tracking for Frequently Bought Together
export const trackBundleImpression = (
  bundleItems: Array<{ item_id: string; item_name: string; price: number }>,
  bundleDiscount: number,
  sourceProductId?: string,
  sourceProductName?: string
): void => {
  trackEvent('view_promotion', {
    promotion_id: 'frequently_bought_together',
    promotion_name: 'Frequently Bought Together Bundle',
    items: bundleItems,
    bundle_discount: bundleDiscount,
    source_product_id: sourceProductId,
    source_product_name: sourceProductName,
  });
};

export const trackBundleAddToCart = (
  bundleItems: Array<{ item_id: string; item_name: string; price: number }>,
  bundleTotal: number,
  bundleDiscount: number,
  savingsAmount: number,
  sourceProductId?: string,
  sourceProductName?: string
): void => {
  trackEvent('add_to_cart', {
    currency: 'USD',
    value: bundleTotal,
    items: bundleItems.map((item, index) => ({
      ...item,
      index,
      quantity: 1,
    })),
  });

  trackEvent('bundle_add_to_cart', {
    bundle_type: 'frequently_bought_together',
    bundle_size: bundleItems.length,
    bundle_total: bundleTotal,
    bundle_discount_percent: bundleDiscount,
    savings_amount: savingsAmount,
    source_product_id: sourceProductId,
    source_product_name: sourceProductName,
    item_ids: bundleItems.map(i => i.item_id),
  });
};

// Did You Mean / Search Fallback Tracking - Enhanced with granular parameters

export interface DidYouMeanCategoryData {
  id: string;
  name: string;
  slug: string;
  parentCategory?: string;
  imageUrl?: string;
}

export interface DidYouMeanProductData {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
  compareAtPrice?: number;
  inStock?: boolean;
}

export const trackDidYouMeanImpression = (
  searchQuery: string,
  resultsCount: number,
  suggestedCategories: string[],
  suggestedProductCount: number,
  options?: {
    categoryDetails?: DidYouMeanCategoryData[];
    productDetails?: DidYouMeanProductData[];
    searchDuration?: number;
    fuzzyMatchUsed?: boolean;
    synonymsExpanded?: string[];
  }
): void => {
  trackEvent('did_you_mean_impression', {
    search_query: searchQuery,
    search_query_length: searchQuery.length,
    search_query_word_count: searchQuery.split(/\s+/).filter(w => w.length > 0).length,
    original_results_count: resultsCount,
    suggested_categories: suggestedCategories,
    suggested_category_count: suggestedCategories.length,
    suggested_product_count: suggestedProductCount,
    has_zero_results: resultsCount === 0,
    has_low_results: resultsCount > 0 && resultsCount <= 10,
    suggestion_type: resultsCount === 0 ? 'zero_results_fallback' : 'low_results_enhancement',
    // Enhanced category details
    category_ids: options?.categoryDetails?.map(c => c.id) || [],
    category_slugs: options?.categoryDetails?.map(c => c.slug) || [],
    // Enhanced product details  
    product_ids: options?.productDetails?.map(p => p.id) || [],
    product_price_range: options?.productDetails?.length 
      ? {
          min: Math.min(...options.productDetails.map(p => p.price)),
          max: Math.max(...options.productDetails.map(p => p.price)),
          avg: options.productDetails.reduce((sum, p) => sum + p.price, 0) / options.productDetails.length,
        }
      : null,
    // Search algorithm insights
    fuzzy_match_used: options?.fuzzyMatchUsed ?? false,
    synonyms_expanded: options?.synonymsExpanded || [],
    search_duration_ms: options?.searchDuration,
  });
};

export const trackDidYouMeanCategoryClick = (
  searchQuery: string,
  categoryName: string,
  categorySlug: string,
  resultsCount: number,
  options?: {
    categoryId?: string;
    categoryIndex?: number;
    totalCategoriesShown?: number;
    parentCategory?: string;
    categoryImageUrl?: string;
    timeToClick?: number;
  }
): void => {
  trackEvent('did_you_mean_category_click', {
    search_query: searchQuery,
    search_query_length: searchQuery.length,
    category_id: options?.categoryId,
    category_name: categoryName,
    category_slug: categorySlug,
    category_index: options?.categoryIndex ?? 0,
    total_categories_shown: options?.totalCategoriesShown ?? 1,
    parent_category: options?.parentCategory,
    category_image_url: options?.categoryImageUrl,
    original_results_count: resultsCount,
    has_zero_results: resultsCount === 0,
    click_context: resultsCount === 0 ? 'zero_results' : 'low_results',
    time_to_click_ms: options?.timeToClick,
  });

  // Also fire standard select_item for consistency
  trackEvent('select_item', {
    item_list_id: 'did_you_mean_categories',
    item_list_name: 'Did You Mean - Categories',
    items: [{
      item_id: options?.categoryId || categorySlug,
      item_name: categoryName,
      item_category: options?.parentCategory || 'suggested_category',
      index: options?.categoryIndex ?? 0,
    }],
  });
};

export const trackDidYouMeanProductClick = (
  searchQuery: string,
  productId: string,
  productName: string,
  productPrice: number,
  position: number,
  resultsCount: number,
  options?: {
    productCategory?: string;
    productImageUrl?: string;
    compareAtPrice?: number;
    isOnSale?: boolean;
    totalProductsShown?: number;
    timeToClick?: number;
    matchType?: 'fuzzy' | 'synonym' | 'exact' | 'popular';
  }
): void => {
  const discount = options?.compareAtPrice && options.compareAtPrice > productPrice
    ? Math.round((1 - productPrice / options.compareAtPrice) * 100)
    : 0;

  trackEvent('did_you_mean_product_click', {
    search_query: searchQuery,
    search_query_length: searchQuery.length,
    product_id: productId,
    product_name: productName,
    product_price: productPrice,
    product_category: options?.productCategory,
    product_image_url: options?.productImageUrl,
    compare_at_price: options?.compareAtPrice,
    discount_percentage: discount,
    is_on_sale: options?.isOnSale ?? discount > 0,
    position,
    total_products_shown: options?.totalProductsShown ?? 6,
    original_results_count: resultsCount,
    has_zero_results: resultsCount === 0,
    click_context: resultsCount === 0 ? 'zero_results' : 'low_results',
    match_type: options?.matchType || 'fuzzy',
    time_to_click_ms: options?.timeToClick,
    currency: 'USD',
  });

  // Fire standard select_item for ecommerce tracking
  trackEvent('select_item', {
    item_list_id: 'did_you_mean_products',
    item_list_name: 'Did You Mean - Products',
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
      item_category: options?.productCategory,
      index: position,
      discount: discount,
      currency: 'USD',
    }],
  });
};

export const trackDidYouMeanViewAllClick = (
  searchQuery: string,
  resultsCount: number,
  options?: {
    categoriesShown?: number;
    productsShown?: number;
    timeToClick?: number;
  }
): void => {
  trackEvent('did_you_mean_view_all_click', {
    search_query: searchQuery,
    search_query_length: searchQuery.length,
    original_results_count: resultsCount,
    has_zero_results: resultsCount === 0,
    categories_shown: options?.categoriesShown ?? 0,
    products_shown: options?.productsShown ?? 0,
    time_to_click_ms: options?.timeToClick,
    click_context: 'browse_all_products',
  });
};

// Track when user adds a product from Did You Mean section to cart
export const trackDidYouMeanAddToCart = (
  searchQuery: string,
  productId: string,
  productName: string,
  productPrice: number,
  position: number,
  resultsCount: number,
  quantity: number = 1,
  options?: {
    productCategory?: string;
    matchType?: 'fuzzy' | 'synonym' | 'exact' | 'popular';
  }
): void => {
  trackEvent('did_you_mean_add_to_cart', {
    search_query: searchQuery,
    product_id: productId,
    product_name: productName,
    product_price: productPrice,
    product_category: options?.productCategory,
    position,
    quantity,
    value: productPrice * quantity,
    original_results_count: resultsCount,
    has_zero_results: resultsCount === 0,
    match_type: options?.matchType || 'fuzzy',
    currency: 'USD',
  });

  // Standard add_to_cart event
  trackEvent('add_to_cart', {
    currency: 'USD',
    value: productPrice * quantity,
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
      item_category: options?.productCategory,
      item_list_id: 'did_you_mean_products',
      item_list_name: 'Did You Mean - Products',
      index: position,
    quantity,
    }],
  });
};

// ============================================
// GOOGLE ADS CONVERSION TRACKING
// ============================================

// Google Ads Conversion IDs
const GOOGLE_ADS_CONVERSION_ID = 'AW-381705659';

interface GoogleAdsConversionParams {
  transactionId: string;
  value: number;
  currency?: string;
  items?: Array<{ id: string; name: string; price: number; quantity: number }>;
  // Enhanced Conversions data (optional, for better attribution)
  email?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Track Google Ads Purchase Conversion
 * Sends conversion data to Google Ads for campaign optimization
 * 
 * Note: The conversion label needs to be set up in Google Ads:
 * 1. Go to Google Ads → Tools & Settings → Conversions
 * 2. Create a "Purchase" conversion action
 * 3. Copy the conversion label (e.g., 'abc123DEF456')
 * 4. Replace the label in this function
 */
export const trackGoogleAdsConversion = (params: GoogleAdsConversionParams): void => {
  if (!isGtagAvailable()) {
    console.debug('[Google Ads] gtag not available, skipping conversion tracking');
    return;
  }

  // Primary conversion event with enhanced data
  const conversionData: Record<string, unknown> = {
    // Use the full conversion ID format: AW-CONVERSION_ID/CONVERSION_LABEL
    // You need to get your CONVERSION_LABEL from Google Ads dashboard
    send_to: `${GOOGLE_ADS_CONVERSION_ID}`,
    value: params.value,
    currency: params.currency || 'USD',
    transaction_id: params.transactionId,
  };

  // Add item-level data for Smart Bidding optimization
  if (params.items && params.items.length > 0) {
    conversionData.items = params.items.map(item => ({
      id: item.id,
      google_business_vertical: 'retail',
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));
  }

  // Enhanced Conversions user data (hashed automatically by gtag)
  // This improves conversion attribution by 5-15% on average
  if (params.email || params.phoneNumber) {
    conversionData.user_data = {};
    if (params.email) {
      (conversionData.user_data as Record<string, string>).email = params.email;
    }
    if (params.phoneNumber) {
      (conversionData.user_data as Record<string, string>).phone_number = params.phoneNumber;
    }
    if (params.firstName) {
      (conversionData.user_data as Record<string, string>).address = {
        first_name: params.firstName,
        last_name: params.lastName,
        city: params.city,
        region: params.region,
        postal_code: params.postalCode,
        country: params.country,
      } as unknown as string;
    }
  }

  // Fire the conversion event
  window.gtag('event', 'conversion', conversionData);
  
  console.debug('[Google Ads] Purchase conversion tracked:', {
    conversion_id: GOOGLE_ADS_CONVERSION_ID,
    transaction_id: params.transactionId,
    value: params.value,
    currency: params.currency || 'USD',
    items_count: params.items?.length || 0,
    has_enhanced_conversions: !!(params.email || params.phoneNumber),
  });
};

/**
 * Track Google Ads Dynamic Remarketing Event
 * Sends product/page view data for remarketing campaigns
 */
export const trackGoogleAdsPageView = (
  pageType: 'home' | 'category' | 'product' | 'cart' | 'purchase' | 'other',
  items?: Array<{ id: string; name: string; price: number; category?: string }>
): void => {
  if (!isGtagAvailable()) {
    return;
  }

  const eventData: Record<string, unknown> = {
    send_to: GOOGLE_ADS_CONVERSION_ID,
    ecomm_pagetype: pageType,
  };

  if (items && items.length > 0) {
    eventData.ecomm_prodid = items.map(i => i.id);
    eventData.ecomm_totalvalue = items.reduce((sum, i) => sum + i.price, 0);
    eventData.items = items.map(item => ({
      id: item.id,
      google_business_vertical: 'retail',
      name: item.name,
      price: item.price,
    }));
  }

  window.gtag('event', 'page_view', eventData);
  console.debug('[Google Ads] Remarketing page view:', pageType, items?.length || 0, 'items');
};

/**
 * Track Add to Cart for Google Ads Smart Shopping campaigns
 */
export const trackGoogleAdsAddToCart = (
  productId: string,
  productName: string,
  productPrice: number,
  quantity: number = 1
): void => {
  if (!isGtagAvailable()) {
    return;
  }

  window.gtag('event', 'add_to_cart', {
    send_to: GOOGLE_ADS_CONVERSION_ID,
    value: productPrice * quantity,
    currency: 'USD',
    items: [{
      id: productId,
      google_business_vertical: 'retail',
      name: productName,
      price: productPrice,
      quantity,
    }],
  });
  
  console.debug('[Google Ads] Add to cart tracked:', productId, productName);
};

/**
 * Track Begin Checkout for Google Ads funnel optimization
 */
export const trackGoogleAdsBeginCheckout = (
  items: Array<{ id: string; name: string; price: number; quantity: number }>,
  totalValue: number
): void => {
  if (!isGtagAvailable()) {
    return;
  }

  window.gtag('event', 'begin_checkout', {
    send_to: GOOGLE_ADS_CONVERSION_ID,
    value: totalValue,
    currency: 'USD',
    items: items.map(item => ({
      id: item.id,
      google_business_vertical: 'retail',
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
  
  console.debug('[Google Ads] Begin checkout tracked:', items.length, 'items, total:', totalValue);
};
