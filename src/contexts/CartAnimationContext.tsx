import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Check } from 'lucide-react';

interface FlyingItem {
  id: string;
  image: string;
  startX: number;
  startY: number;
}

interface CartAnimationContextType {
  triggerAddToCart: (image: string, startElement?: HTMLElement | null) => void;
  cartIconRef: React.RefObject<HTMLDivElement>;
}

const CartAnimationContext = createContext<CartAnimationContextType | undefined>(undefined);

export const CartAnimationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const cartIconRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const triggerAddToCart = useCallback((image: string, startElement?: HTMLElement | null) => {
    // Get start position
    let startX = window.innerWidth / 2;
    let startY = window.innerHeight / 2;

    if (startElement) {
      const rect = startElement.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
    }

    const newItem: FlyingItem = {
      id: `flying-${idCounter.current++}`,
      image,
      startX,
      startY,
    };

    setFlyingItems(prev => [...prev, newItem]);

    // Remove after animation
    setTimeout(() => {
      setFlyingItems(prev => prev.filter(item => item.id !== newItem.id));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 800);
    }, 600);
  }, []);

  // Get cart icon position for end point
  const getCartPosition = () => {
    if (cartIconRef.current) {
      const rect = cartIconRef.current.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    // Fallback to top-right corner
    return { x: window.innerWidth - 60, y: 60 };
  };

  return (
    <CartAnimationContext.Provider value={{ triggerAddToCart, cartIconRef }}>
      {children}
      
      {/* Flying items layer */}
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        <AnimatePresence>
          {flyingItems.map((item) => {
            const endPos = getCartPosition();
            return (
              <motion.div
                key={item.id}
                className="absolute"
                initial={{ 
                  x: item.startX - 30, 
                  y: item.startY - 30,
                  scale: 1,
                  opacity: 1,
                }}
                animate={{ 
                  x: endPos.x - 15,
                  y: endPos.y - 15,
                  scale: 0.3,
                  opacity: 0.8,
                }}
                exit={{ 
                  scale: 0,
                  opacity: 0,
                }}
                transition={{ 
                  duration: 0.6,
                  ease: [0.32, 0, 0.67, 0],
                }}
              >
                <div className="w-[60px] h-[60px] rounded-xl overflow-hidden shadow-lg bg-background border-2 border-primary">
                  <img 
                    src={item.image} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Trail effect */}
                <motion.div
                  className="absolute inset-0 rounded-xl bg-primary/30"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Success burst on cart icon */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              className="absolute"
              style={{ 
                left: getCartPosition().x - 20, 
                top: getCartPosition().y - 20,
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            >
              <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center shadow-lg">
                <Check className="w-5 h-5 text-success-foreground" />
              </div>
              
              {/* Ripple effect */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-success"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 0.5 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CartAnimationContext.Provider>
  );
};

export const useCartAnimation = () => {
  const context = useContext(CartAnimationContext);
  if (!context) {
    throw new Error('useCartAnimation must be used within a CartAnimationProvider');
  }
  return context;
};

// Hook for cart icon to register its ref
export const useCartIconRef = () => {
  const context = useContext(CartAnimationContext);
  return context?.cartIconRef;
};
