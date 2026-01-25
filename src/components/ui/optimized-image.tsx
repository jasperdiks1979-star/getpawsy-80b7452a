import { useState, useRef, useEffect, forwardRef, memo } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  aspectRatio?: 'square' | 'video' | 'portrait' | 'auto';
  priority?: boolean;
  onLoad?: () => void;
}

export const OptimizedImage = memo(forwardRef<HTMLDivElement, OptimizedImageProps>(({
  src,
  alt,
  className,
  containerClassName,
  aspectRatio = 'auto',
  priority = false,
  onLoad,
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

  const aspectRatioClass = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
    auto: '',
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
    >
      {/* Simple skeleton placeholder */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-muted skeleton-pulse" />
      )}

      {/* Actual image - hardware accelerated */}
      {isInView && (
        <img
          src={hasError ? '/placeholder.svg' : src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover',
            isLoaded ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-200',
            className
          )}
        />
      )}
    </div>
  );
}));

OptimizedImage.displayName = 'OptimizedImage';
