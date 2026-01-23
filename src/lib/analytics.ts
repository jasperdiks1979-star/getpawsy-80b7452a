// Google Analytics 4 Event Tracking Utility

declare global {
  interface Window {
    gtag: (
      command: 'event' | 'config' | 'js',
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

// Generic event tracking
export const trackEvent = (
  eventName: string,
  params?: Record<string, unknown>
): void => {
  if (!isGtagAvailable()) {
    console.debug('[Analytics] gtag not available, skipping event:', eventName);
    return;
  }
  
  window.gtag('event', eventName, params);
  console.debug('[Analytics] Event tracked:', eventName, params);
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
  trackEvent('add_to_cart', {
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
    currency: 'EUR',
    value: productPrice,
    items: [{
      item_id: productId,
      item_name: productName,
      price: productPrice,
      item_category: category,
    }],
  });
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
  trackEvent('begin_checkout', {
    currency: 'EUR',
    value: totalValue,
    items: items.map(item => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
};

// Purchase complete
export const trackPurchase = (
  transactionId: string,
  items: Array<{ id: string; name: string; price: number; quantity: number }>,
  totalValue: number
): void => {
  trackEvent('purchase', {
    transaction_id: transactionId,
    currency: 'EUR',
    value: totalValue,
    items: items.map(item => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
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
      currency: 'EUR',
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
