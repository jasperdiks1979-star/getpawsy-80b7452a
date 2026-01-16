import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { trackAddToCart, trackRemoveFromCart } from '@/lib/analytics';
import { supabase } from '@/integrations/supabase/client';

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
    const saved = localStorage.getItem('pawsy-cart');
    return saved ? JSON.parse(saved) : [];
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
      
      // Get location from cache or fetch
      let location = sessionStorage.getItem("visitor_location");
      if (!location) {
        try {
          const response = await fetch("https://ipapi.co/json/");
          if (response.ok) {
            const data = await response.json();
            location = JSON.stringify({
              latitude: data.latitude,
              longitude: data.longitude,
              country: data.country_name,
              city: data.city,
            });
            sessionStorage.setItem("visitor_location", location);
          }
        } catch {
          // Ignore location errors
        }
      }
      
      const loc = location ? JSON.parse(location) : {};
      
      await supabase.from("visitor_activity").insert({
        session_id: sessionId,
        activity_type: "cart",
        latitude: loc.latitude || null,
        longitude: loc.longitude || null,
        country: loc.country || null,
        city: loc.city || null,
      });
    } catch {
      // Silently fail - don't impact cart functionality
    }
  }, []);

  const addItem = (newItem: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(item => item.id === newItem.id);
      if (existing) {
        return prev.map(item =>
          item.id === newItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
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
