import { useState, useRef, useEffect } from 'react';
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

export const OptimizedImage = ({
  src,
  alt,
  className,
  containerClassName,
  aspectRatio = 'auto',
  priority = false,
  onLoad,
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
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
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
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

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-muted',
        aspectRatioClass,
        containerClassName
      )}
    >
      {/* Blur placeholder / skeleton */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-500',
          isLoaded ? 'opacity-0' : 'opacity-100'
        )}
      >
        {/* Animated gradient shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted-foreground/10 to-muted animate-shimmer bg-[length:200%_100%]" />
        
        {/* Blur overlay for smooth transition */}
        <div className="absolute inset-0 backdrop-blur-sm bg-muted/50" />
      </div>

      {/* Actual image */}
      {isInView && (
        <img
          ref={imgRef}
          src={hasError ? '/placeholder.svg' : src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover transition-all duration-500',
            isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105',
            className
          )}
        />
      )}
    </div>
  );
};
