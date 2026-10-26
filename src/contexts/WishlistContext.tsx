import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// ⚡ Analytics deferred — not needed for initial render
const trackAddToWishlist = (productId: string, productName?: string, productPrice?: number) =>
  import('@/lib/analytics').then(m => m.trackAddToWishlist(productId, productName, productPrice));
const trackRemoveFromWishlist = (productId: string, productName?: string) =>
  import('@/lib/analytics').then(m => m.trackRemoveFromWishlist(productId, productName));

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

/** Keep only well-formed entries, one per product id (first one wins). */
export function normalizeWishlist(raw: unknown): WishlistItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WishlistItem[] = [];
  for (const it of raw) {
    const id = it && typeof it === 'object' ? (it as WishlistItem).productId : undefined;
    if (typeof id !== 'string' || !id || id.length > 64 || seen.has(id)) continue;
    seen.add(id);
    const at = Number((it as WishlistItem).addedAt);
    out.push({ productId: id, addedAt: Number.isFinite(at) ? at : Date.now() });
  }
  return out.slice(0, 200);
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>(() => {
    try {
      const saved = localStorage.getItem('wishlist-items');
      if (saved) {
        return normalizeWishlist(JSON.parse(saved));
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
    setWishlistItems((prev) => normalizeWishlist([...prev, { productId, addedAt: Date.now() }]));
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
