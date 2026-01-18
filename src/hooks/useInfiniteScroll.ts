import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInfiniteScrollOptions<T> {
  items: T[];
  itemsPerPage?: number;
  threshold?: number;
}

export function useInfiniteScroll<T>({
  items,
  itemsPerPage = 12,
  threshold = 200,
}: UseInfiniteScrollOptions<T>) {
  const [displayCount, setDisplayCount] = useState(itemsPerPage);
  const [isLoading, setIsLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.slice(0, displayCount);
  const hasMore = displayCount < items.length;

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    
    setIsLoading(true);
    // Small delay to show loading state
    setTimeout(() => {
      setDisplayCount((prev) => Math.min(prev + itemsPerPage, items.length));
      setIsLoading(false);
    }, 300);
  }, [hasMore, isLoading, itemsPerPage, items.length]);

  // Reset when items change (e.g., filters change)
  useEffect(() => {
    setDisplayCount(itemsPerPage);
  }, [items.length, itemsPerPage]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: `${threshold}px` }
    );

    observer.observe(loader);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore, threshold]);

  return {
    visibleItems,
    hasMore,
    isLoading,
    loaderRef,
    loadMore,
    displayCount,
    totalCount: items.length,
  };
}
