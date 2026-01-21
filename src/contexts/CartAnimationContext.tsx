import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface FlyingItem {
  id: string;
  image: string;
  startX: number;
  startY: number;
}

interface CartAnimationContextType {
  triggerAddToCart: (image: string, startElement?: HTMLElement | null) => void;
  cartIconRef: React.RefObject<HTMLDivElement | null>;
}

const CartAnimationContext = createContext<CartAnimationContextType | undefined>(undefined);

export const CartAnimationProvider = ({ children }: { children: React.ReactNode }) => {
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const cartIconRef = useRef<HTMLDivElement | null>(null);
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

    // Remove after animation and trigger cart bounce
    setTimeout(() => {
      setFlyingItems(prev => prev.filter(item => item.id !== newItem.id));
      setShowSuccess(true);
      setCartBounce(true);
      setTimeout(() => {
        setShowSuccess(false);
        setCartBounce(false);
      }, 600);
    }, 700);
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

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    triggerAddToCart,
    cartIconRef,
  }), [triggerAddToCart]);

  return (
    <CartAnimationContext.Provider value={contextValue}>
      {children}
      
      {/* Flying items layer */}
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        <AnimatePresence>
          {flyingItems.map((item) => {
            const endPos = getCartPosition();
            // Calculate arc control point for curved path
            const midX = (item.startX + endPos.x) / 2;
            const midY = Math.min(item.startY, endPos.y) - 100; // Arc upward
            
            return (
              <motion.div
                key={item.id}
                className="absolute"
                initial={{ 
                  x: item.startX - 35, 
                  y: item.startY - 35,
                  scale: 1,
                  opacity: 1,
                  rotate: 0,
                }}
                animate={{ 
                  x: [item.startX - 35, midX - 35, endPos.x - 20],
                  y: [item.startY - 35, midY - 35, endPos.y - 20],
                  scale: [1, 0.8, 0.3],
                  opacity: [1, 1, 0.9],
                  rotate: [0, -15, 0],
                }}
                exit={{ 
                  scale: 0,
                  opacity: 0,
                }}
                transition={{ 
                  duration: 0.7,
                  ease: [0.22, 1, 0.36, 1],
                  times: [0, 0.5, 1],
                }}
              >
                <div className="w-[70px] h-[70px] rounded-2xl overflow-hidden shadow-2xl bg-background border-2 border-primary ring-4 ring-primary/20">
                  <img 
                    src={item.image} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Particle trail effect */}
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full bg-primary"
                    initial={{ scale: 0, opacity: 0.8, x: 0, y: 0 }}
                    animate={{ 
                      scale: [0, 1, 0],
                      opacity: [0.8, 0.5, 0],
                      x: (Math.random() - 0.5) * 60,
                      y: (Math.random() - 0.5) * 60,
                    }}
                    transition={{ 
                      duration: 0.5,
                      delay: i * 0.08,
                      ease: "easeOut"
                    }}
                  />
                ))}
                
                {/* Glow trail */}
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-primary/40 blur-xl"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Cart bounce indicator */}
        <AnimatePresence>
          {cartBounce && cartIconRef.current && (
            <motion.div
              className="absolute pointer-events-none"
              style={{ 
                left: getCartPosition().x - 25, 
                top: getCartPosition().y - 25,
              }}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="w-[50px] h-[50px] rounded-full bg-primary/20" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success burst on cart icon */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              className="absolute"
              style={{ 
                left: getCartPosition().x - 18, 
                top: getCartPosition().y - 18,
              }}
              initial={{ scale: 0, opacity: 0, rotate: -180 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <Check className="w-5 h-5 text-primary-foreground" strokeWidth={3} />
              </div>
              
              {/* Multiple ripple effects */}
              {[0, 0.1, 0.2].map((delay, i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-primary"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.6, delay }}
                />
              ))}
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
