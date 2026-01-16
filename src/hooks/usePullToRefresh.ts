import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from './use-mobile';
import { useHaptic } from './useHaptic';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions) {
  const isMobile = useIsMobile();
  const haptic = useHaptic();
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const hasTriggeredHaptic = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || !containerRef.current) return;
    
    // Only start if we're at the top of the scroll container
    if (containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
      hasTriggeredHaptic.current = false;
    }
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    
    currentY.current = e.touches[0].clientY;
    const distance = Math.max(0, currentY.current - startY.current);
    
    // Apply resistance to the pull
    const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
    setPullDistance(resistedDistance);
    
    // Trigger haptic when threshold is crossed
    if (resistedDistance >= threshold && !hasTriggeredHaptic.current) {
      haptic.mediumTap();
      hasTriggeredHaptic.current = true;
    } else if (resistedDistance < threshold && hasTriggeredHaptic.current) {
      // Reset if user pulls back below threshold
      hasTriggeredHaptic.current = false;
    }
    
    // Prevent default scroll when pulling down
    if (distance > 0 && containerRef.current?.scrollTop === 0) {
      e.preventDefault();
    }
  }, [isPulling, disabled, isRefreshing, threshold, haptic]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;
    
    setIsPulling(false);
    
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      haptic.success(); // Success haptic when refresh starts
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, disabled, pullDistance, threshold, isRefreshing, onRefresh, haptic]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isMobile || disabled) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, disabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef,
    isPulling,
    isRefreshing,
    pullDistance,
    progress,
    isMobile,
  };
}
