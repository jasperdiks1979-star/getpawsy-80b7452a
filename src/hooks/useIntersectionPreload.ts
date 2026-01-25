import { useEffect, useRef, useCallback } from 'react';

interface UseIntersectionPreloadOptions {
  rootMargin?: string;
  threshold?: number;
  onIntersect?: () => void;
}

/**
 * Hook that triggers a callback when an element is about to enter the viewport
 * Useful for preloading data or images before they're visible
 */
export function useIntersectionPreload<T extends HTMLElement>(
  options: UseIntersectionPreloadOptions = {}
) {
  const { rootMargin = '200px', threshold = 0, onIntersect } = options;
  const ref = useRef<T>(null);
  const hasTriggered = useRef(false);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && !hasTriggered.current) {
        hasTriggered.current = true;
        onIntersect?.();
      }
    },
    [onIntersect]
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || !onIntersect) return;

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin,
      threshold,
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [handleIntersect, rootMargin, threshold, onIntersect]);

  return ref;
}

/**
 * Hook that preloads the next page of data when user scrolls near the end
 */
export function usePreloadOnScroll(
  preloadFn: () => void,
  options: { offset?: number; enabled?: boolean } = {}
) {
  const { offset = 500, enabled = true } = options;
  const hasPreloaded = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleScroll = () => {
      if (hasPreloaded.current) return;

      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const clientHeight = window.innerHeight;

      if (scrollHeight - scrollTop - clientHeight < offset) {
        hasPreloaded.current = true;
        preloadFn();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [preloadFn, offset, enabled]);

  // Reset when enabled changes
  useEffect(() => {
    if (enabled) {
      hasPreloaded.current = false;
    }
  }, [enabled]);
}
