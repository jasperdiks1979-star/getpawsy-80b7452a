import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'recently-viewed-products';
const MAX_ITEMS = 8;

interface RecentlyViewedProduct {
  id: string;
  viewedAt: number;
}

export const useRecentlyViewed = () => {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedProduct[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Save to localStorage whenever the list changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentlyViewed));
  }, [recentlyViewed]);

  // Add a product to recently viewed
  const addToRecentlyViewed = useCallback((productId: string) => {
    setRecentlyViewed((prev) => {
      // Remove if already exists
      const filtered = prev.filter((item) => item.id !== productId);
      // Add to beginning
      const updated = [{ id: productId, viewedAt: Date.now() }, ...filtered];
      // Limit to max items
      return updated.slice(0, MAX_ITEMS);
    });
  }, []);

  // Get recently viewed product IDs (excluding current product)
  const getRecentlyViewedIds = useCallback((excludeId?: string): string[] => {
    return recentlyViewed
      .filter((item) => item.id !== excludeId)
      .map((item) => item.id);
  }, [recentlyViewed]);

  // Clear all recently viewed
  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
  }, []);

  return {
    recentlyViewed,
    addToRecentlyViewed,
    getRecentlyViewedIds,
    clearRecentlyViewed,
  };
};
