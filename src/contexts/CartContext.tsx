import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { trackAddToCart, trackRemoveFromCart } from '@/lib/analytics';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variant?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('pawsy-cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      // If parsing fails, clear corrupted data
      localStorage.removeItem('pawsy-cart');
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('pawsy-cart', JSON.stringify(items));
  }, [items]);

  // Track cart activity for visitor map
  const trackCartActivity = useCallback(async () => {
    try {
      let sessionId = sessionStorage.getItem("visitor_session_id");
      if (!sessionId) {
        sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        sessionStorage.setItem("visitor_session_id", sessionId);
      }
      
      // Get location from cache
      let locationData: { latitude?: number; longitude?: number; country?: string; city?: string } = {};
      const cachedLocation = sessionStorage.getItem("visitor_location");
      
      if (cachedLocation) {
        try {
          locationData = JSON.parse(cachedLocation);
        } catch {
          // Ignore parse errors
        }
      } else {
        // Try to fetch location, but don't wait or fail if it doesn't work
        try {
          const response = await fetch("https://ipapi.co/json/", { 
            signal: AbortSignal.timeout(3000) // 3 second timeout
          });
          if (response.ok) {
            const data = await response.json();
            locationData = {
              latitude: data.latitude,
              longitude: data.longitude,
              country: data.country_name,
              city: data.city,
            };
            sessionStorage.setItem("visitor_location", JSON.stringify(locationData));
          }
        } catch {
          // Ignore location errors - proceed without location
        }
      }
      
      // Always insert the activity, even without location
      const { error } = await supabase.from("visitor_activity").insert({
        session_id: sessionId,
        activity_type: "cart",
        latitude: locationData.latitude || null,
        longitude: locationData.longitude || null,
        country: locationData.country || null,
        city: locationData.city || null,
      });
      
      if (error) {
        console.error("Error tracking cart activity:", error);
      }
    } catch (err) {
      console.error("Error in trackCartActivity:", err);
      // Silently fail - don't impact cart functionality
    }
  }, []);

  const addItem = (newItem: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(item => item.id === newItem.id);
      if (existing) {
        toast.success(`${newItem.name} quantity increased`, {
          description: `Now ${existing.quantity + 1} in cart`,
          duration: 2000,
        });
        return prev.map(item =>
          item.id === newItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      toast.success(`Added to cart`, {
        description: newItem.name,
        duration: 2000,
      });
      return [...prev, { ...newItem, quantity: 1 }];
    });
    trackAddToCart(newItem.id, newItem.name, newItem.price, 1);
    trackCartActivity();
  };

  const removeItem = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) {
      trackRemoveFromCart(id, item.name, item.price, item.quantity);
    }
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      totalItems,
      totalPrice
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
