import { useState, useRef, useEffect, forwardRef, memo } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  aspectRatio?: 'square' | 'video' | 'portrait' | 'auto';
  priority?: boolean;
  width?: number;
  height?: number;
  onLoad?: () => void;
  /** Callback to get a ref to the underlying <img> element (e.g. for perf tracking) */
  onImgRef?: (img: HTMLImageElement | null) => void;
}

/**
 * OptimizedImage component with CLS prevention
 * - Always reserves space using aspect-ratio CSS
 * - Uses skeleton placeholder during load
 * - Lazy loads non-priority images
 */
export const OptimizedImage = memo(forwardRef<HTMLDivElement, OptimizedImageProps>(({
  src,
  alt,
  className,
  containerClassName,
  aspectRatio = 'square',
  priority = false,
  width = 400,
  height = 400,
  onLoad,
  onImgRef,
}, forwardedRef) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const internalRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading with larger margin
  useEffect(() => {
    if (priority || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '300px', // Preload images 300px before viewport
        threshold: 0,
      }
    );

    if (internalRef.current) {
      observer.observe(internalRef.current);
    }

    return () => observer.disconnect();
  }, [priority, isInView]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  // Map aspect ratio to CSS class - always define dimensions to prevent CLS
  const aspectRatioClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
    auto: 'aspect-square', // Default to square for 'auto' to prevent CLS
  }[aspectRatio];

  // Combine refs
  const setRefs = (node: HTMLDivElement | null) => {
    (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  };

  return (
    <div
      ref={setRefs}
      className={cn(
        'relative overflow-hidden bg-muted',
        aspectRatioClass,
        containerClassName
      )}
      // Always include explicit dimensions for layout calculation
      style={{ 
        contain: 'layout',
        contentVisibility: priority ? 'visible' : 'auto',
      }}
    >
      {/* Simple skeleton placeholder - always shown until image loads */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted skeleton-pulse" />
      )}

      {/* Actual image - hardware accelerated */}
      {isInView && (
        <img
          ref={(el) => onImgRef?.(el)}
          src={hasError ? '/placeholder.svg' : src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover',
            priority 
              ? 'opacity-100' // No transition on LCP-path images
              : isLoaded ? 'opacity-100' : 'opacity-0',
            !priority && 'transition-opacity duration-200',
            className
          )}
          style={{ contentVisibility: 'auto' }}
        />
      )}
    </div>
  );
}));

OptimizedImage.displayName = 'OptimizedImage';
