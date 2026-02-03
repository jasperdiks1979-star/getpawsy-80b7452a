import { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useHaptic } from '@/hooks/useHaptic';
import { cn } from '@/lib/utils';

interface PinchZoomImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  onTap?: () => void;
  disabled?: boolean;
}

interface TouchPoint {
  x: number;
  y: number;
}

const getDistance = (touch1: TouchPoint, touch2: TouchPoint): number => {
  const dx = touch1.x - touch2.x;
  const dy = touch1.y - touch2.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const getMidpoint = (touch1: TouchPoint, touch2: TouchPoint): TouchPoint => ({
  x: (touch1.x + touch2.x) / 2,
  y: (touch1.y + touch2.y) / 2,
});

export const PinchZoomImage = ({
  src,
  alt,
  className,
  containerClassName,
  onTap,
  disabled = false,
}: PinchZoomImageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const haptic = useHaptic();

  // Motion values for smooth animations
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Track initial touch state
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const initialMidpoint = useRef<TouchPoint>({ x: 0, y: 0 });
  const initialPosition = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);

  const minScale = 1;
  const maxScale = 4;

  const resetZoom = useCallback(() => {
    animate(scale, 1, { type: 'spring', stiffness: 300, damping: 30 });
    animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
    setIsZoomed(false);
  }, [scale, x, y]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    if (e.touches.length === 2) {
      // Pinch start
      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      
      initialDistance.current = getDistance(touch1, touch2);
      initialScale.current = scale.get();
      initialMidpoint.current = getMidpoint(touch1, touch2);
      initialPosition.current = { x: x.get(), y: y.get() };
    } else if (e.touches.length === 1) {
      // Single touch - prepare for pan or double tap
      initialPosition.current = { x: x.get(), y: y.get() };
      initialMidpoint.current = { 
        x: e.touches[0].clientX, 
        y: e.touches[0].clientY 
      };
    }
  }, [disabled, scale, x, y]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    if (e.touches.length === 2) {
      // Pinch zoom
      e.preventDefault();
      
      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      
      const currentDistance = getDistance(touch1, touch2);
      const currentMidpoint = getMidpoint(touch1, touch2);
      
      // Calculate new scale
      const scaleChange = currentDistance / initialDistance.current;
      let newScale = initialScale.current * scaleChange;
      newScale = Math.min(Math.max(newScale, minScale), maxScale);
      
      // Calculate position adjustment to zoom towards midpoint
      const midpointDelta = {
        x: currentMidpoint.x - initialMidpoint.current.x,
        y: currentMidpoint.y - initialMidpoint.current.y,
      };
      
      scale.set(newScale);
      x.set(initialPosition.current.x + midpointDelta.x);
      y.set(initialPosition.current.y + midpointDelta.y);
      
      if (newScale > 1 && !isZoomed) {
        setIsZoomed(true);
        haptic.lightTap();
      }
    } else if (e.touches.length === 1 && scale.get() > 1) {
      // Pan when zoomed
      e.preventDefault();
      
      const touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const delta = {
        x: touch.x - initialMidpoint.current.x,
        y: touch.y - initialMidpoint.current.y,
      };
      
      x.set(initialPosition.current.x + delta.x);
      y.set(initialPosition.current.y + delta.y);
    }
  }, [disabled, scale, x, y, isZoomed, haptic]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (disabled) return;

    // Double tap to zoom
    if (e.changedTouches.length === 1 && e.touches.length === 0) {
      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime.current;
      
      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Double tap detected
        haptic.mediumTap();
        
        if (scale.get() > 1) {
          // Zoom out
          resetZoom();
        } else {
          // Zoom in to 2x at tap position
          const touch = e.changedTouches[0];
          const rect = containerRef.current?.getBoundingClientRect();
          
          if (rect) {
            const tapX = touch.clientX - rect.left - rect.width / 2;
            const tapY = touch.clientY - rect.top - rect.height / 2;
            
            animate(scale, 2.5, { type: 'spring', stiffness: 300, damping: 30 });
            animate(x, -tapX * 1.5, { type: 'spring', stiffness: 300, damping: 30 });
            animate(y, -tapY * 1.5, { type: 'spring', stiffness: 300, damping: 30 });
            setIsZoomed(true);
          }
        }
        lastTapTime.current = 0;
        return;
      }
      
      lastTapTime.current = now;
      
      // Single tap - call onTap after delay if no double tap
      if (scale.get() === 1) {
        setTimeout(() => {
          if (Date.now() - lastTapTime.current >= 300 && lastTapTime.current !== 0) {
            onTap?.();
          }
        }, 300);
      }
    }

    // Snap back if under-zoomed
    if (scale.get() < 1) {
      resetZoom();
    }

    // Constrain pan when zoomed
    if (scale.get() > 1) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const currentScale = scale.get();
        const maxX = (rect.width * (currentScale - 1)) / 2;
        const maxY = (rect.height * (currentScale - 1)) / 2;
        
        const currentX = x.get();
        const currentY = y.get();
        
        if (Math.abs(currentX) > maxX) {
          animate(x, currentX > 0 ? maxX : -maxX, { type: 'spring', stiffness: 300, damping: 30 });
        }
        if (Math.abs(currentY) > maxY) {
          animate(y, currentY > 0 ? maxY : -maxY, { type: 'spring', stiffness: 300, damping: 30 });
        }
      }
    }
  }, [disabled, scale, x, y, onTap, haptic, resetZoom]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        'relative overflow-hidden select-none',
        // Only apply touch-none when zoomed to allow parent swipe gestures
        isZoomed ? 'touch-none' : 'touch-pan-x',
        containerClassName
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <motion.img
        src={src}
        alt={alt}
        className={cn('w-full h-full object-contain', className)}
        style={{ scale, x, y }}
        draggable={false}
      />
      
      {/* Zoom indicator */}
      {isZoomed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute bottom-3 right-3 bg-background/80 backdrop-blur-sm text-foreground text-xs px-2 py-1 rounded-full"
        >
          {Math.round(scale.get() * 100)}%
        </motion.div>
      )}
    </div>
  );
};
