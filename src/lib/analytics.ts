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
