import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
// ⚡ Analytics deferred — not needed for initial render
const trackAddToCart = (productId: string, productName: string, price: number, qty?: number) =>
  import('@/lib/analytics').then(m => m.trackAddToCart(productId, productName, price, qty));
const trackRemoveFromCart = (productId: string, productName: string, price: number, qty?: number) =>
  import('@/lib/analytics').then(m => m.trackRemoveFromCart(productId, productName, price, qty));
const trackGoogleAdsAddToCart = (productId: string, productName: string, price: number, qty?: number) =>
  import('@/lib/analytics').then(m => m.trackGoogleAdsAddToCart(productId, productName, price, qty));
// ⚡ supabase is NOT imported at top level — dynamic import keeps ~138KB SDK off critical path
const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);
import { PRODUCTION_DOMAINS } from '@/lib/constants';
// ⚡ CRITICAL FIX: sonner, marketingClient, and useVisitorTracking were sync-imported,
// pulling ~160KB (sonner + supabase SDK via trackVisitorEvent) into the main bundle.
// Now all three are lazily imported — only loaded when actually called.
const showToast = (msg: string) => import('sonner').then(m => m.toast.success(msg)).catch(() => {});
const showErrorToast = (msg: string) => import('sonner').then(m => m.toast.error(msg)).catch(() => {});
const getFireMarketingAsync = () => import('@/lib/marketingClient').then(m => m.fireMarketingAsync);
const getTrackVisitorEvent = () => import('@/hooks/useVisitorTracking').then(m => m.trackVisitorEvent);

export interface CartItem {
  id: string;
  slug?: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variant?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: (markRecovered?: boolean) => void;
  setAbandonedCartEmail: (email: string) => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Get or create a persistent session ID for abandoned cart tracking
const getCartSessionId = (): string => {
  let sessionId = localStorage.getItem('pawsy-cart-session-id');
  if (!sessionId) {
    sessionId = `cart-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem('pawsy-cart-session-id', sessionId);
  }
  return sessionId;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('pawsy-cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      localStorage.removeItem('pawsy-cart');
      return [];
    }
  });
  
  const abandonedCartEmail = useRef<string | null>(localStorage.getItem('pawsy-cart-email'));
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync cart to abandoned_carts table
  const syncAbandonedCart = useCallback(async (cartItems: CartItem[], email?: string | null) => {
    if (cartItems.length === 0) return;
    
    const sessionId = getCartSessionId();
    const customerEmail = email || abandonedCartEmail.current;
    const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    
    // Simplify items to JSON-compatible format
    const simplifiedItems = cartItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      quantity: item.quantity,
      variant: item.variant || null,
    }));
    
    try {
      const supabase = await getSupabase();
      // Check if cart already exists for this session
      const { data: existingCart } = await supabase
        .from('abandoned_carts')
        .select('id')
        .eq('session_id', sessionId)
        .is('recovered_at', null)
        .maybeSingle();

      if (existingCart) {
        const { error } = await supabase
          .from('abandoned_carts')
          .update({
            cart_items: JSON.parse(JSON.stringify(simplifiedItems)),
            cart_total: cartTotal,
            customer_email: customerEmail,
          })
          .eq('id', existingCart.id);
        if (error) console.error('Error updating abandoned cart:', error);
      } else {
        const { error } = await supabase
          .from('abandoned_carts')
          .insert([{
            session_id: sessionId,
            customer_email: customerEmail,
            cart_items: JSON.parse(JSON.stringify(simplifiedItems)),
            cart_total: cartTotal,
          }]);
        if (error) console.error('Error inserting abandoned cart:', error);
      }
    } catch (error) {
      console.error('Error syncing abandoned cart:', error);
    }
  }, []);

  // Debounced sync - wait 2 seconds after last cart change
  const debouncedSync = useCallback((cartItems: CartItem[]) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      syncAbandonedCart(cartItems);
    }, 2000);
  }, [syncAbandonedCart]);

  useEffect(() => {
    localStorage.setItem('pawsy-cart', JSON.stringify(items));
    if (items.length > 0) {
      debouncedSync(items);
    }
  }, [items, debouncedSync]);

  // Set email for abandoned cart tracking
  const setAbandonedCartEmail = useCallback((email: string) => {
    abandonedCartEmail.current = email;
    localStorage.setItem('pawsy-cart-email', email);
    // Immediately sync with email
    if (items.length > 0) {
      syncAbandonedCart(items, email);
    }
  }, [items, syncAbandonedCart]);

  // Import shared production domains constant
  
  // Track cart activity for visitor map
  const trackCartActivity = useCallback(async () => {
    // NOTE: previously gated on PRODUCTION_DOMAINS, which silently dropped
    // every cart event from preview/lovable.app — leaving us blind to TikTok
    // and other paid/test traffic. Now we always insert; the hook layer marks
    // non-prod / NL traffic as is_internal so it stays out of reporting.
    const isProdHost = PRODUCTION_DOMAINS.includes(window.location.hostname);

    try {
      let sessionId = sessionStorage.getItem("visitor_session_id");
      if (!sessionId) {
        sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        sessionStorage.setItem("visitor_session_id", sessionId);
      }
      
      // Get location from cache
      let locationData: { latitude?: number; longitude?: number; country?: string; city?: string } = {};
      const cachedLocation = sessionStorage.getItem("visitor_location");
      
      if (cachedLocation) {
        try {
          locationData = JSON.parse(cachedLocation);
        } catch {
          // Ignore parse errors
        }
      } else {
        // Try to fetch location, but don't wait or fail if it doesn't work
        try {
          const response = await fetch("https://ipapi.co/json/", { 
            signal: AbortSignal.timeout(3000) // 3 second timeout
          });
          if (response.ok) {
            const data = await response.json();
            locationData = {
              latitude: data.latitude,
              longitude: data.longitude,
              country: data.country_name,
              city: data.city,
            };
            sessionStorage.setItem("visitor_location", JSON.stringify(locationData));
          }
        } catch {
          // Ignore location errors - proceed without location
        }
      }
      
      // Preserve UTM parameters from session storage (set on initial page load)
      const utmSource = sessionStorage.getItem("utm_source") || null;
      const utmMedium = sessionStorage.getItem("utm_medium") || null;
      const utmCampaign = sessionStorage.getItem("utm_campaign") || null;
      const referrer = sessionStorage.getItem("original_referrer") || null;
      
      // Always insert the activity, even without location
      const supabase = await getSupabase();
      const { error } = await supabase.from("visitor_activity").insert({
        session_id: sessionId,
        activity_type: "cart",
        latitude: locationData.latitude || null,
        longitude: locationData.longitude || null,
        country: locationData.country || null,
        city: locationData.city || null,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        referrer: referrer,
        is_internal: !isProdHost || locationData.country === 'Netherlands' || locationData.country === 'The Netherlands',
      });
      
      if (error) {
        console.error("Error tracking cart activity:", error);
      }
    } catch (err) {
      console.error("Error in trackCartActivity:", err);
      // Silently fail - don't impact cart functionality
    }
  }, []);

  const addItem = (newItem: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(item => item.id === newItem.id);
      if (existing) {
        showToast(`${newItem.name} quantity increased`);
        // toast options removed — lazy-loaded toast is simpler
        return prev.map(item =>
          item.id === newItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      showToast(`Added to cart: ${newItem.name}`);
      return [...prev, { ...newItem, quantity: 1 }];
    });
    
    // GA4 Add to Cart
    trackAddToCart(newItem.id, newItem.name, newItem.price, 1);
    
    // Google Ads Add to Cart
    trackGoogleAdsAddToCart(newItem.id, newItem.name, newItem.price, 1);
    
    // Internal visitor_activity tracking for funnel analysis
    getTrackVisitorEvent().then(fn => fn('add_to_cart', {
      productId: newItem.id,
      productName: newItem.name,
      productPrice: newItem.price,
      productQuantity: 1,
    })).catch(() => {});
    
    // Legacy cart activity (for map visualization)
    trackCartActivity();
    
    // Pinterest AddToCart tracking — deferred, non-blocking
    getFireMarketingAsync().then(fn => fn('pinterest-addtocart', async () => {
      const { trackPinterestEvent } = await import('@/hooks/usePinterestTracking');
      trackPinterestEvent('addtocart', {
        value: newItem.price,
        currency: 'USD',
        order_quantity: 1,
        product_name: newItem.name,
        product_id: newItem.id,
        product_price: newItem.price,
        line_items: [{
          product_name: newItem.name,
          product_id: newItem.id,
          product_price: newItem.price,
          product_quantity: 1,
        }],
      });
    }, 'pinterest')).catch(() => {});
  };

  const removeItem = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      trackRemoveFromCart(id, item.name, item.price, item.quantity);
    }
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = useCallback(async (markRecovered = false) => {
    if (markRecovered && items.length > 0) {
      // Mark cart as recovered in database
      const sessionId = getCartSessionId();
      try {
        const supabase = await getSupabase();
        await supabase
          .from('abandoned_carts')
          .update({ recovered_at: new Date().toISOString() })
          .eq('session_id', sessionId)
          .is('recovered_at', null);
      } catch (error) {
        console.error('Error marking cart as recovered:', error);
      }
      // Generate new session ID for future carts
      localStorage.removeItem('pawsy-cart-session-id');
    }
    setItems([]);
  }, [items.length]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      setAbandonedCartEmail,
      totalItems,
      totalPrice
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
