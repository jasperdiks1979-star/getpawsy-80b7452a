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
