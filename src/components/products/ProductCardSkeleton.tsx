import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getConversionFlag } from '@/lib/conversionFlags';

export const ProductCardSkeleton = memo(() => {
  const calm = getConversionFlag('premiumSkeleton');
  return (
    <div className={
      calm
        ? "bg-card rounded-2xl overflow-hidden border border-border/40"
        : "bg-card rounded-2xl overflow-hidden shadow-card"
    }>
      {/* Image skeleton — exact match: aspect-square with bg-muted like OptimizedImage */}
      <div className={
        calm
          ? "aspect-square w-full bg-muted/60 skeleton-pulse"
          : "aspect-square w-full bg-muted skeleton-pulse"
      } />
      
      {/* Content — matches ProductCard p-5 space-y-3 exactly */}
      <div className="p-5 space-y-3">
        {/* Category — matches text-xs uppercase tracking-wider */}
        <Skeleton className="h-3 w-16" />
        
        {/* Title — matches min-h-[2.5rem] text-base leading-snug line-clamp-2 */}
        <div className="min-h-[2.5rem]">
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        {/* Price — matches text-lg font-bold + compare price */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>

        {/* "Ships from US" text — matches text-xs */}
        <Skeleton className="h-3 w-44" />
        
        {/* Mobile button placeholder — matches flex gap-2 pt-1 md:hidden */}
        <div className="flex gap-2 pt-1 md:hidden">
          <Skeleton className="h-9 flex-1 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </div>
  );
});

export const ProductGridSkeleton = memo(({ count = 12 }: { count?: number }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
});
