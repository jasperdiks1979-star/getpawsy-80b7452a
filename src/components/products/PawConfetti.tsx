import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PawPrint {
  id: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  delay: number;
}

interface PawConfettiProps {
  trigger: boolean;
  originX?: number;
  originY?: number;
  onComplete?: () => void;
}

const PawIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <ellipse cx="12" cy="17" rx="4" ry="3.5" />
    <ellipse cx="6" cy="10" rx="2.5" ry="2" />
    <ellipse cx="18" cy="10" rx="2.5" ry="2" />
    <ellipse cx="8.5" cy="6" rx="2" ry="1.8" />
    <ellipse cx="15.5" cy="6" rx="2" ry="1.8" />
  </svg>
);

export const PawConfetti = ({ trigger, originX = 50, originY = 50, onComplete }: PawConfettiProps) => {
  const [paws, setPaws] = useState<PawPrint[]>([]);

  const generatePaws = useCallback(() => {
    const newPaws: PawPrint[] = [];
    const numPaws = 8;

    for (let i = 0; i < numPaws; i++) {
      const angle = (i / numPaws) * Math.PI * 2;
      const distance = 30 + Math.random() * 40;
      
      newPaws.push({
        id: Date.now() + i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 20,
        rotation: Math.random() * 60 - 30,
        scale: 0.6 + Math.random() * 0.5,
        delay: i * 0.05,
      });
    }

    return newPaws;
  }, []);

  useEffect(() => {
    if (trigger) {
      setPaws(generatePaws());
      
      const timer = setTimeout(() => {
        setPaws([]);
        onComplete?.();
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [trigger, generatePaws, onComplete]);

  return (
    <AnimatePresence>
      {paws.length > 0 && (
        <div 
          className="fixed pointer-events-none z-50"
          style={{ 
            left: `${originX}px`, 
            top: `${originY}px`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {paws.map((paw) => (
            <motion.div
              key={paw.id}
              initial={{ 
                opacity: 0, 
                scale: 0,
                x: 0,
                y: 0,
                rotate: 0 
              }}
              animate={{ 
                opacity: [0, 1, 1, 0],
                scale: [0, paw.scale * 1.3, paw.scale, paw.scale * 0.8],
                x: paw.x,
                y: paw.y,
                rotate: paw.rotation
              }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ 
                duration: 0.7,
                delay: paw.delay,
                ease: [0.34, 1.56, 0.64, 1]
              }}
              className="absolute"
            >
              <PawIcon className="w-6 h-6 text-primary drop-shadow-md" />
            </motion.div>
          ))}
          
          {/* Center burst */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.5, 0],
              opacity: [0, 0.3, 0]
            }}
            transition={{ duration: 0.4 }}
            className="absolute w-16 h-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30"
          />
        </div>
      )}
    </AnimatePresence>
  );
};

// Hook to manage paw confetti state
export const usePawConfetti = () => {
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const triggerConfetti = useCallback((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    setIsActive(true);
  }, []);

  const handleComplete = useCallback(() => {
    setIsActive(false);
  }, []);

  return {
    isActive,
    position,
    triggerConfetti,
    handleComplete,
  };
};

export default PawConfetti;
