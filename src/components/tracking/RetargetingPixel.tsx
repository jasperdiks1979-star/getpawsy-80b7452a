import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PIXEL_CONFIGURATION, determineAudience, TrackingEvent } from '@/lib/retargeting-audiences';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Access tracking pixels from window object
const getPixelFunctions = () => {
  const win = window as any;
  return {
    fbq: win.fbq as ((...args: unknown[]) => void) | undefined,
    gtag: win.gtag as ((...args: unknown[]) => void) | undefined,
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

interface RetargetingPixelProps {
  /** Product ID for product view events */
  productId?: string;
  /** Product name for product view events */
  productName?: string;
  /** Collection slug for collection view events */
  collectionSlug?: string;
  /** Whether this is a blog page */
  isBlog?: boolean;
  /** Whether this is a collection page */
  isCollection?: boolean;
  /** Whether this is a product page */
  isProduct?: boolean;
}

/**
 * RetargetingPixel component fires appropriate Meta and Google events
 * based on the page type for building retargeting audiences.
 * 
 * Strategy:
 * - No aggressive selling
 * - Build audiences for trust-based retargeting
 * - Focus on reassurance and convenience messaging
 */
export function RetargetingPixel({
  productId,
  productName,
  collectionSlug,
  isBlog,
  isCollection,
  isProduct,
}: RetargetingPixelProps) {
  const location = useLocation();

  useEffect(() => {
    const pagePath = location.pathname;
    const { fbq, gtag } = getPixelFunctions();
    
    // Fire Meta Pixel events
    if (fbq) {
      if (isBlog) {
        fbq('track', PIXEL_CONFIGURATION.meta.blogView.event, {
          ...PIXEL_CONFIGURATION.meta.blogView.params,
          content_name: pagePath,
        });
      } else if (isCollection) {
        fbq('track', PIXEL_CONFIGURATION.meta.collectionView.event, {
          ...PIXEL_CONFIGURATION.meta.collectionView.params,
          content_name: collectionSlug || pagePath,
        });
      } else if (isProduct && productId) {
        fbq('track', PIXEL_CONFIGURATION.meta.productView.event, {
          ...PIXEL_CONFIGURATION.meta.productView.params,
          content_ids: [productId],
          content_name: productName,
        });
      }
    }

    // Fire Google Ads events
    if (gtag) {
      if (isBlog) {
        gtag('event', PIXEL_CONFIGURATION.google.blogView.event, {
          ...PIXEL_CONFIGURATION.google.blogView.params,
          item_list_id: pagePath,
        });
      } else if (isCollection) {
        gtag('event', PIXEL_CONFIGURATION.google.collectionView.event, {
          ...PIXEL_CONFIGURATION.google.collectionView.params,
          item_list_id: collectionSlug || pagePath,
        });
      } else if (isProduct && productId) {
        gtag('event', PIXEL_CONFIGURATION.google.productView.event, {
          items: [{
            item_id: productId,
            item_name: productName,
          }],
        });
      }
    }
  }, [location.pathname, productId, productName, collectionSlug, isBlog, isCollection, isProduct]);

  // This component doesn't render anything
  return null;
}

/**
 * Hook to store tracking events for audience determination
 */
export function useRetargetingEvents() {
  const storeEvent = (event: TrackingEvent) => {
    try {
      const storedEvents = sessionStorage.getItem('retargeting_events');
      const events: TrackingEvent[] = storedEvents ? JSON.parse(storedEvents) : [];
      
      events.push(event);
      
      // Keep only last 20 events
      const trimmedEvents = events.slice(-20);
      sessionStorage.setItem('retargeting_events', JSON.stringify(trimmedEvents));
    } catch (error) {
      console.error('Error storing retargeting event:', error);
    }
  };

  const getEvents = (): TrackingEvent[] => {
    try {
      const storedEvents = sessionStorage.getItem('retargeting_events');
      return storedEvents ? JSON.parse(storedEvents) : [];
    } catch {
      return [];
    }
  };

  const getAudience = () => {
    const events = getEvents();
    return determineAudience(events);
  };

  return {
    storeEvent,
    getEvents,
    getAudience,
  };
}
