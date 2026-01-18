import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const ProductCardSkeleton = memo(() => {
  return (
    <div className="bg-card rounded-2xl overflow-hidden shadow-card">
      {/* Image skeleton */}
      <Skeleton className="aspect-square w-full" />
      
      {/* Content */}
      <div className="p-5 space-y-3">
        {/* Category */}
        <Skeleton className="h-3 w-16" />
        
        {/* Title */}
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        
        {/* Price */}
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
        
        {/* Mobile button placeholder */}
        <div className="flex gap-2 pt-2 md:hidden">
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
