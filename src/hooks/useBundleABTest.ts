import { useState, useEffect, useMemo, useCallback } from 'react';

// A/B Test variants
export type BundleVariant = 'A' | 'B';

// Variant A = Frequently Bought Together (FBT) - 10% discount
// Variant B = Buy More, Save More (Volume) - tiered discounts

const STORAGE_KEY = 'bundle_ab_variant';

/**
 * Determines device type for tracking
 */
const getDeviceType = (): 'mobile' | 'desktop' => {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
};

/**
 * Assigns a random variant (50/50 split)
 */
const assignVariant = (): BundleVariant => {
  return Math.random() < 0.5 ? 'A' : 'B';
};

/**
 * Gets or creates a persistent variant assignment for the session/user
 */
const getOrCreateVariant = (): BundleVariant => {
  if (typeof window === 'undefined') return 'A';
  
  try {
    // Check localStorage first for persistence
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'A' || stored === 'B') {
      return stored;
    }
    
    // Assign new variant and persist
    const newVariant = assignVariant();
    localStorage.setItem(STORAGE_KEY, newVariant);
    return newVariant;
  } catch {
    // Fallback if localStorage unavailable
    return assignVariant();
  }
};

export interface BundleABTestResult {
  variant: BundleVariant;
  isVariantA: boolean;
  isVariantB: boolean;
  deviceType: 'mobile' | 'desktop';
  trackVariantViewed: (productId: string) => void;
  trackBundleItemAdded: (data: BundleItemAddedData) => void;
  trackAddToCart: (data: AddToCartData) => void;
  trackCheckoutStarted: (cartValue: number) => void;
  trackPurchaseCompleted: (data: PurchaseCompletedData) => void;
}

export interface BundleItemAddedData {
  bundleType: 'FBT' | 'Volume';
  numberOfItemsAdded: number;
  addedValueUsd: number;
}

export interface AddToCartData {
  totalItemsInCart: number;
  cartValueUsd: number;
}

export interface PurchaseCompletedData {
  orderValueUsd: number;
  numberOfItems: number;
}

/**
 * Hook for A/B testing bundle strategies on product pages
 * - Variant A: Frequently Bought Together (FBT) inline bundle
 * - Variant B: Buy More, Save More (Volume) tiered discounts
 * 
 * Features:
 * - 50/50 random assignment
 * - Persistent across session via localStorage
 * - Comprehensive tracking for all funnel events
 */
export const useBundleABTest = (): BundleABTestResult => {
  const [variant, setVariant] = useState<BundleVariant>('A');
  const [deviceType, setDeviceType] = useState<'mobile' | 'desktop'>('desktop');
  
  // Initialize variant on mount (client-side only)
  useEffect(() => {
    const assignedVariant = getOrCreateVariant();
    setVariant(assignedVariant);
    setDeviceType(getDeviceType());
    
    // Update device type on resize
    const handleResize = () => setDeviceType(getDeviceType());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Computed properties
  const isVariantA = variant === 'A';
  const isVariantB = variant === 'B';
  
  // Helper to fire gtag events
  const fireEvent = useCallback((eventName: string, params: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
      console.debug(`[A/B Test] Event: ${eventName}`, params);
    }
  }, []);
  
  // Track when variant is viewed
  const trackVariantViewed = useCallback((productId: string) => {
    fireEvent('bundle_variant_viewed', {
      variant,
      product_id: productId,
      device_type: deviceType,
    });
  }, [variant, deviceType, fireEvent]);
  
  // Track when bundle items are added
  const trackBundleItemAdded = useCallback((data: BundleItemAddedData) => {
    fireEvent('bundle_item_added', {
      variant,
      bundle_type: data.bundleType,
      number_of_items_added: data.numberOfItemsAdded,
      added_value_usd: data.addedValueUsd,
    });
  }, [variant, fireEvent]);
  
  // Track add to cart with variant context
  const trackAddToCart = useCallback((data: AddToCartData) => {
    fireEvent('add_to_cart', {
      variant,
      total_items_in_cart: data.totalItemsInCart,
      cart_value_usd: data.cartValueUsd,
    });
  }, [variant, fireEvent]);
  
  // Track checkout started
  const trackCheckoutStarted = useCallback((cartValue: number) => {
    fireEvent('checkout_started', {
      variant,
      cart_value_usd: cartValue,
    });
  }, [variant, fireEvent]);
  
  // Track purchase completed
  const trackPurchaseCompleted = useCallback((data: PurchaseCompletedData) => {
    fireEvent('purchase_completed', {
      variant,
      order_value_usd: data.orderValueUsd,
      number_of_items: data.numberOfItems,
    });
  }, [variant, fireEvent]);
  
  return useMemo(() => ({
    variant,
    isVariantA,
    isVariantB,
    deviceType,
    trackVariantViewed,
    trackBundleItemAdded,
    trackAddToCart,
    trackCheckoutStarted,
    trackPurchaseCompleted,
  }), [
    variant, 
    isVariantA, 
    isVariantB, 
    deviceType,
    trackVariantViewed, 
    trackBundleItemAdded, 
    trackAddToCart, 
    trackCheckoutStarted, 
    trackPurchaseCompleted
  ]);
};
