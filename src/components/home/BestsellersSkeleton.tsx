import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const BestsellerCardSkeleton = memo(() => {
  return (
    <div className="bg-card rounded-2xl overflow-hidden shadow-soft">
      {/* Image */}
      <Skeleton className="aspect-square w-full" />
      
      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Category */}
        <Skeleton className="h-3 w-16" />
        
        {/* Title */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        {/* Rating */}
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-3 rounded-full" />
          ))}
          <Skeleton className="h-3 w-6 ml-1" />
        </div>
        
        {/* Price */}
        <div className="flex items-baseline gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
});

BestsellerCardSkeleton.displayName = 'BestsellerCardSkeleton';

export const BestsellersGridSkeleton = memo(({ count = 5 }: { count?: number }) => {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <BestsellerCardSkeleton key={i} />
      ))}
    </div>
  );
});

BestsellersGridSkeleton.displayName = 'BestsellersGridSkeleton';
