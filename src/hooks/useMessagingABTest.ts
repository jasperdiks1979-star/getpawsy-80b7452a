import { useState, useEffect, useMemo, useCallback } from 'react';

// Second A/B Test: Copy vs Discount Messaging
export type MessagingVariant = 'discount' | 'benefit';

const STORAGE_KEY = 'messaging_ab_variant';

// Variant A (discount): "Save 10%", "You save $X"
// Variant B (benefit): "Perfect for road trips", "Most customers add this"

/**
 * Assigns a random variant (50/50 split)
 */
const assignVariant = (): MessagingVariant => {
  return Math.random() < 0.5 ? 'discount' : 'benefit';
};

/**
 * Gets or creates a persistent variant assignment
 */
const getOrCreateVariant = (): MessagingVariant => {
  if (typeof window === 'undefined') return 'discount';
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'discount' || stored === 'benefit') {
      return stored;
    }
    
    const newVariant = assignVariant();
    localStorage.setItem(STORAGE_KEY, newVariant);
    return newVariant;
  } catch {
    return assignVariant();
  }
};

// Discount messaging copy
export const DISCOUNT_COPY = {
  bundleHeader: 'Frequently Bought Together',
  bundleSave: (percent: number) => `Save ${percent}%`,
  bundleSavings: (amount: number) => `You save $${amount.toFixed(2)}`,
  bundleCta: 'Add Bundle to Cart',
  volumeHeader: 'Buy More, Save More',
  volumeSublabel: (percent: number) => `Save ${percent}%`,
  orderBump: (percent: number) => `Save ${percent}%`,
};

// Benefit messaging copy (max 5% discount shown)
export const BENEFIT_COPY = {
  bundleHeader: 'Complete Your Setup',
  bundleSave: () => 'Most Popular',
  bundleSavings: () => 'Most customers add this',
  bundleCta: 'Get the Complete Set',
  volumeHeader: 'Perfect for Multi-Pet Homes',
  volumeSublabel: () => 'Best for road trips',
  orderBump: () => 'Customers love this combo',
};

export interface MessagingABTestResult {
  variant: MessagingVariant;
  isDiscount: boolean;
  isBenefit: boolean;
  getCopy: () => typeof DISCOUNT_COPY | typeof BENEFIT_COPY;
  trackMessagingViewed: (productId: string, deviceType: string) => void;
  trackMessagingAction: (action: string, data: Record<string, unknown>) => void;
}

/**
 * Hook for A/B testing messaging strategies on bundle sections
 * - Variant A (discount): Discount-driven messaging
 * - Variant B (benefit): Benefit-driven copy with max 5% discount visible
 */
export const useMessagingABTest = (): MessagingABTestResult => {
  const [variant, setVariant] = useState<MessagingVariant>('discount');
  
  useEffect(() => {
    const assignedVariant = getOrCreateVariant();
    setVariant(assignedVariant);
  }, []);
  
  const isDiscount = variant === 'discount';
  const isBenefit = variant === 'benefit';
  
  const getCopy = useCallback(() => {
    return isDiscount ? DISCOUNT_COPY : BENEFIT_COPY;
  }, [isDiscount]);
  
  const fireEvent = useCallback((eventName: string, params: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
      console.debug(`[Messaging A/B Test] Event: ${eventName}`, params);
    }
  }, []);
  
  const trackMessagingViewed = useCallback((productId: string, deviceType: string) => {
    fireEvent('messaging_variant_viewed', {
      messaging_variant: variant,
      product_id: productId,
      device_type: deviceType,
    });
  }, [variant, fireEvent]);
  
  const trackMessagingAction = useCallback((action: string, data: Record<string, unknown>) => {
    fireEvent('messaging_action', {
      messaging_variant: variant,
      action,
      ...data,
    });
  }, [variant, fireEvent]);
  
  return useMemo(() => ({
    variant,
    isDiscount,
    isBenefit,
    getCopy,
    trackMessagingViewed,
    trackMessagingAction,
  }), [variant, isDiscount, isBenefit, getCopy, trackMessagingViewed, trackMessagingAction]);
};
