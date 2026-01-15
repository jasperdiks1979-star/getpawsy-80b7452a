import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
    return [];
  });

  useEffect(() => {
    localStorage.setItem('wishlist-items', JSON.stringify(wishlistItems));
    // Keep old format for backwards compatibility
    localStorage.setItem('wishlist', JSON.stringify(wishlistItems.map(item => item.productId)));
  }, [wishlistItems]);

  const wishlist = wishlistItems.map(item => item.productId);

  const addToWishlist = (productId: string) => {
    setWishlistItems((prev) => [...prev, { productId, addedAt: Date.now() }]);
  };

  const removeFromWishlist = (productId: string) => {
    setWishlistItems((prev) => prev.filter((item) => item.productId !== productId));
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
