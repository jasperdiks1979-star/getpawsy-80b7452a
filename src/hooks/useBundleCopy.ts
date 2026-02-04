import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { UserSegment, useUserSegment } from './useUserSegment';

export type BundleVariantType = 'FBT' | 'Volume' | 'OrderBump';

// Base copy templates per segment (calm, helpful, trustworthy)
const COPY_TEMPLATES: Record<UserSegment, string[]> = {
  'first-time': [
    "Most dog owners add this for extra stability and peace of mind.",
    "First-time buyers often pair this for a complete setup.",
    "A popular choice for keeping your dog comfortable and secure.",
  ],
  'returning': [
    "Complete your setup — this pairs perfectly with your dog car bed.",
    "Welcome back — customers often add this for the full experience.",
    "Great to see you again — this completes your travel kit.",
  ],
  'mobile': [
    "Quick add — keeps your car clean and your dog secure.",
    "Easy addition — perfect for stress-free car rides.",
    "One tap to complete your pet travel setup.",
  ],
  'high-intent': [
    "Customers who buy this often add it for safer, stress-free trips.",
    "Frequently added together for maximum comfort and protection.",
    "Most popular combination for safe and comfortable journeys.",
  ],
  'multi-item-cart': [
    "Finish your setup — ideal for road trips and longer journeys.",
    "Complete your order — pairs well with what you've already chosen.",
    "Round out your purchase for the ultimate travel experience.",
  ],
};

// Product-specific copy variations
const PRODUCT_COPY_HINTS: Record<string, string> = {
  'car-seat': 'car seat protection',
  'bed': 'comfort and stability',
  'harness': 'safety and control',
  'blanket': 'coziness during rides',
  'mat': 'interior protection',
  'cover': 'seat protection',
  'carrier': 'secure travel',
};

interface BundleCopyResult {
  copy: string;
  segment: UserSegment;
  allSegments: UserSegment[];
  trackCopyShown: (productId: string, variantType: BundleVariantType) => void;
}

/**
 * Generates dynamic bundle copy based on user segment.
 * Updates in real-time when user behavior changes (e.g., becomes high-intent).
 */
export const useBundleCopy = (productName?: string): BundleCopyResult => {
  const { primarySegment, allSegments } = useUserSegment();
  const [copyIndex, setCopyIndex] = useState(0);
  const lastTrackedRef = useRef<string | null>(null);
  
  // Select a random copy variant on mount (consistent per session)
  useEffect(() => {
    const sessionSeed = sessionStorage.getItem('bundle_copy_seed');
    if (sessionSeed) {
      setCopyIndex(parseInt(sessionSeed, 10) % 3);
    } else {
      const newSeed = Math.floor(Math.random() * 100);
      sessionStorage.setItem('bundle_copy_seed', newSeed.toString());
      setCopyIndex(newSeed % 3);
    }
  }, []);
  
  // Generate copy based on segment
  const copy = useMemo(() => {
    const templates = COPY_TEMPLATES[primarySegment];
    let baseCopy = templates[copyIndex] || templates[0];
    
    // Add product-specific variation if product name matches hints
    if (productName) {
      const nameLower = productName.toLowerCase();
      for (const [keyword, hint] of Object.entries(PRODUCT_COPY_HINTS)) {
        if (nameLower.includes(keyword)) {
          // Slight variation based on product type (doesn't change core message)
          break;
        }
      }
    }
    
    return baseCopy;
  }, [primarySegment, copyIndex, productName]);
  
  // Tracking function
  const trackCopyShown = useCallback((productId: string, variantType: BundleVariantType) => {
    const trackingKey = `${productId}-${variantType}-${primarySegment}`;
    
    // Prevent duplicate tracking
    if (lastTrackedRef.current === trackingKey) return;
    lastTrackedRef.current = trackingKey;
    
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'bundle_copy_variant_shown', {
        segment: primarySegment,
        all_segments: allSegments.join(','),
        product_id: productId,
        variant_type: variantType,
      });
      console.debug('[Bundle Copy] Tracked:', { 
        segment: primarySegment, 
        productId, 
        variantType 
      });
    }
  }, [primarySegment, allSegments]);
  
  return {
    copy,
    segment: primarySegment,
    allSegments,
    trackCopyShown,
  };
};

/**
 * Get static copy for a segment (useful for server-side or initial render)
 */
export const getSegmentCopy = (segment: UserSegment): string => {
  return COPY_TEMPLATES[segment][0];
};
