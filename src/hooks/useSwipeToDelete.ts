import { useCallback, useRef, useState } from 'react';
import { useHaptic } from './useHaptic';
import { useIsMobile } from './use-mobile';

interface UseSwipeToDeleteOptions {
  onDelete: () => void;
  threshold?: number;
  disabled?: boolean;
}

export function useSwipeToDelete({
  onDelete,
  threshold = 100,
  disabled = false,
}: UseSwipeToDeleteOptions) {
  const isMobile = useIsMobile();
  const haptic = useHaptic();
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const hasTriggeredHaptic = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isConfirming) return;
    
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    hasTriggeredHaptic.current = false;
  }, [disabled, isConfirming]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || isConfirming) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = startX.current - currentX;
    const deltaY = Math.abs(startY.current - currentY);
    
    // Determine if this is a horizontal swipe on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || deltaY > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > deltaY;
      }
    }
    
    // Only handle horizontal swipes (left swipe = positive deltaX)
    if (!isHorizontalSwipe.current) return;
    
    // Only allow left swipe (delete direction)
    const distance = Math.max(0, deltaX);
    const resistedDistance = Math.min(distance * 0.8, threshold * 1.5);
    setSwipeDistance(resistedDistance);
    
    // Trigger haptic when threshold is crossed
    if (resistedDistance >= threshold && !hasTriggeredHaptic.current) {
      haptic.warning();
      hasTriggeredHaptic.current = true;
    } else if (resistedDistance < threshold && hasTriggeredHaptic.current) {
      hasTriggeredHaptic.current = false;
    }
  }, [disabled, isConfirming, threshold, haptic]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;
    
    if (swipeDistance >= threshold) {
      setIsConfirming(true);
      haptic.error();
    } else {
      setSwipeDistance(0);
    }
    
    isHorizontalSwipe.current = null;
  }, [disabled, swipeDistance, threshold, haptic]);

  const confirmDelete = useCallback(() => {
    haptic.success();
    onDelete();
    setIsConfirming(false);
    setSwipeDistance(0);
  }, [onDelete, haptic]);

  const cancelDelete = useCallback(() => {
    haptic.lightTap();
    setIsConfirming(false);
    setSwipeDistance(0);
  }, [haptic]);

  const progress = Math.min(swipeDistance / threshold, 1);

  return {
    containerRef,
    swipeDistance,
    isConfirming,
    progress,
    isMobile,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    confirmDelete,
    cancelDelete,
  };
}
