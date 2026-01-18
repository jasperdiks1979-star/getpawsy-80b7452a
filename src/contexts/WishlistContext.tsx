import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { trackAddToWishlist, trackRemoveFromWishlist } from '@/lib/analytics';

interface WishlistItem {
  productId: string;
  addedAt: number;
}

interface WishlistContextType {
  wishlist: string[];
  wishlistItems: WishlistItem[];
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
  getAddedAt: (productId: string) => number | undefined;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>(() => {
    try {
      const saved = localStorage.getItem('wishlist-items');
      if (saved) {
        return JSON.parse(saved);
      }
      // Migrate from old format
      const oldSaved = localStorage.getItem('wishlist');
      if (oldSaved) {
        const oldIds: string[] = JSON.parse(oldSaved);
        return oldIds.map((productId, index) => ({
          productId,
          addedAt: Date.now() - (oldIds.length - index) * 1000, // Preserve order
        }));
      }
    } catch {
      // If parsing fails, clear corrupted data
      localStorage.removeItem('wishlist-items');
      localStorage.removeItem('wishlist');
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('wishlist-items', JSON.stringify(wishlistItems));
    // Keep old format for backwards compatibility
    localStorage.setItem('wishlist', JSON.stringify(wishlistItems.map(item => item.productId)));
  }, [wishlistItems]);

  const wishlist = wishlistItems.map(item => item.productId);

  const addToWishlist = (productId: string, productName?: string, productPrice?: number) => {
    setWishlistItems((prev) => [...prev, { productId, addedAt: Date.now() }]);
    trackAddToWishlist(productId, productName, productPrice);
  };

  const removeFromWishlist = (productId: string, productName?: string) => {
    setWishlistItems((prev) => prev.filter((item) => item.productId !== productId));
    trackRemoveFromWishlist(productId, productName);
  };

  const toggleWishlist = (productId: string) => {
    if (wishlist.includes(productId)) {
      removeFromWishlist(productId);
    } else {
      addToWishlist(productId);
    }
  };

  const isInWishlist = (productId: string) => {
    return wishlist.includes(productId);
  };

  const clearWishlist = () => {
    setWishlistItems([]);
  };

  const getAddedAt = (productId: string) => {
    return wishlistItems.find(item => item.productId === productId)?.addedAt;
  };

  return (
    <WishlistContext.Provider
      value={{ 
        wishlist, 
        wishlistItems,
        addToWishlist, 
        removeFromWishlist, 
        toggleWishlist, 
        isInWishlist, 
        clearWishlist,
        getAddedAt
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
