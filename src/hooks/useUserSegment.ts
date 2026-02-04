import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCart } from '@/contexts/CartContext';

// User segments ordered by priority (highest first)
export type UserSegment = 
  | 'high-intent'
  | 'multi-item-cart'
  | 'returning'
  | 'mobile'
  | 'first-time';

const STORAGE_KEY = 'pawsy_visitor_seen';
const HIGH_INTENT_TIME_MS = 30000; // 30 seconds
const HIGH_INTENT_SCROLL_DEPTH = 0.6; // 60%
const MULTI_ITEM_CART_THRESHOLD = 2;
const MULTI_ITEM_VALUE_THRESHOLD = 50;
const MOBILE_BREAKPOINT = 768;

interface UserSegmentResult {
  primarySegment: UserSegment;
  allSegments: UserSegment[];
  isHighIntent: boolean;
  isMultiItemCart: boolean;
  isReturning: boolean;
  isMobile: boolean;
  isFirstTime: boolean;
  timeOnPage: number;
  scrollDepth: number;
}

/**
 * Detects user segment based on behavior and context.
 * Priority: High-intent > Multi-item cart > Returning > Mobile > First-time
 */
export const useUserSegment = (): UserSegmentResult => {
  const { items, totalPrice } = useCart();
  
  // Time on page tracking
  const [timeOnPage, setTimeOnPage] = useState(0);
  const [scrollDepth, setScrollDepth] = useState(0);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });
  
  // Check if returning visitor
  const [isReturning] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const hasVisited = localStorage.getItem(STORAGE_KEY);
      if (!hasVisited) {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
  
  // Track time on page
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setTimeOnPage(Date.now() - startTime);
    }, 5000); // Update every 5 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Track scroll depth
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const depth = Math.min(scrollTop / docHeight, 1);
        setScrollDepth(prev => Math.max(prev, depth)); // Only increase, never decrease
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Track viewport changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Computed segment flags
  const isHighIntent = timeOnPage >= HIGH_INTENT_TIME_MS || scrollDepth >= HIGH_INTENT_SCROLL_DEPTH;
  const isMultiItemCart = items.length >= MULTI_ITEM_CART_THRESHOLD || totalPrice >= MULTI_ITEM_VALUE_THRESHOLD;
  const isFirstTime = !isReturning;
  
  // Build segment list by priority
  const allSegments = useMemo(() => {
    const segments: UserSegment[] = [];
    
    if (isHighIntent) segments.push('high-intent');
    if (isMultiItemCart) segments.push('multi-item-cart');
    if (isReturning) segments.push('returning');
    if (isMobile) segments.push('mobile');
    if (isFirstTime) segments.push('first-time');
    
    // Ensure at least one segment
    if (segments.length === 0) {
      segments.push('first-time');
    }
    
    return segments;
  }, [isHighIntent, isMultiItemCart, isReturning, isMobile, isFirstTime]);
  
  const primarySegment = allSegments[0];
  
  return {
    primarySegment,
    allSegments,
    isHighIntent,
    isMultiItemCart,
    isReturning,
    isMobile,
    isFirstTime,
    timeOnPage,
    scrollDepth,
  };
};
