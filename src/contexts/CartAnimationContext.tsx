import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import Check from 'lucide-react/dist/esm/icons/check';

/**
 * CartAnimationContext — v2, zero framer-motion.
 * Uses CSS keyframe animations defined in index.css to eliminate
 * the animations chunk from the critical rendering path (~60KB gzip saved).
 */

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

  const getCartPosition = useCallback(() => {
    if (cartIconRef.current) {
      const rect = cartIconRef.current.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return { x: window.innerWidth - 60, y: 60 };
  }, []);

  const triggerAddToCart = useCallback((image: string, startElement?: HTMLElement | null) => {
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

  const contextValue = useMemo(() => ({
    triggerAddToCart,
    cartIconRef,
  }), [triggerAddToCart]);

  return (
    <CartAnimationContext.Provider value={contextValue}>
      {children}
      
      {/* Flying items layer — pure CSS animations */}
      <div className="fixed inset-0 pointer-events-none z-[9999]">
        {flyingItems.map((item) => {
          const endPos = getCartPosition();
          const midX = (item.startX + endPos.x) / 2;
          const midY = Math.min(item.startY, endPos.y) - 100;
          
          return (
            <div
              key={item.id}
              className="absolute"
              style={{
                left: item.startX - 35,
                top: item.startY - 35,
                '--fly-dx-start': '0px',
                '--fly-dy-start': '0px',
                '--fly-dx-mid': `${midX - item.startX}px`,
                '--fly-dy-mid': `${midY - item.startY}px`,
                '--fly-dx-end': `${endPos.x - item.startX - 15}px`,
                '--fly-dy-end': `${endPos.y - item.startY - 15}px`,
                animation: 'flyToCart 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
              } as React.CSSProperties}
            >
              <div className="w-[70px] h-[70px] rounded-2xl overflow-hidden shadow-2xl bg-background border-2 border-primary ring-4 ring-primary/20">
                <img 
                  src={item.image} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          );
        })}

        {/* Cart bounce indicator */}
        {cartBounce && cartIconRef.current && (() => {
          const pos = getCartPosition();
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: pos.x - 25,
                top: pos.y - 25,
                animation: 'cartBounce 0.3s ease-out',
              }}
            >
              <div className="w-[50px] h-[50px] rounded-full bg-primary/20" />
            </div>
          );
        })()}

        {/* Success burst on cart icon */}
        {showSuccess && (() => {
          const pos = getCartPosition();
          return (
            <div
              className="absolute"
              style={{
                left: pos.x - 18,
                top: pos.y - 18,
                animation: 'successPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              }}
            >
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg">
                <Check className="w-5 h-5 text-primary-foreground" strokeWidth={3} />
              </div>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-primary"
                  style={{
                    animation: `ripple 0.6s ease-out ${i * 0.1}s forwards`,
                  }}
                />
              ))}
            </div>
          );
        })()}
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

export const useCartIconRef = () => {
  const context = useContext(CartAnimationContext);
  return context?.cartIconRef;
};
