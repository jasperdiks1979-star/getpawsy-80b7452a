import { useEffect } from 'react';

/**
 * Preloads critical images for faster LCP (Largest Contentful Paint)
 * Call this hook early in your app to start loading hero images
 */
export function useCriticalImagePreload(imageUrls: string[]) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Use requestIdleCallback for non-blocking preload
    const preloadImages = () => {
      imageUrls.forEach((url) => {
        if (!url) return;
        
        // Check if already in browser cache
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        link.fetchPriority = 'high';
        
        // Only add if not already present
        const existing = document.querySelector(`link[href="${url}"]`);
        if (!existing) {
          document.head.appendChild(link);
        }
      });
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(preloadImages);
    } else {
      setTimeout(preloadImages, 0);
    }
  }, [imageUrls]);
}

/**
 * Preloads a single critical image with high priority
 */
export function preloadCriticalImage(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  link.fetchPriority = 'high';
  
  const existing = document.querySelector(`link[href="${url}"]`);
  if (!existing) {
    document.head.appendChild(link);
  }
}

/**
 * Prefetches images that will be needed soon (e.g., next carousel slide)
 */
export function prefetchImage(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  
  const img = new Image();
  img.src = url;
}

/**
 * Batch prefetch multiple images with low priority
 */
export function prefetchImages(urls: string[]): void {
  if (typeof window === 'undefined') return;
  
  // Use requestIdleCallback for non-blocking prefetch
  const doPrefetch = () => {
    urls.forEach((url) => {
      if (url) prefetchImage(url);
    });
  };

  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(doPrefetch);
  } else {
    setTimeout(doPrefetch, 100);
  }
}
