import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const BestsellerCardSkeleton = memo(() => (
  <div className="rounded-xl overflow-hidden border border-border/50 bg-card">
    <Skeleton className="aspect-square w-full" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-3 w-14" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex items-baseline gap-2 pt-1">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  </div>
));
BestsellerCardSkeleton.displayName = 'BestsellerCardSkeleton';

export const BestsellersGridSkeleton = memo(({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-6xl mx-auto">
    {Array.from({ length: count }).map((_, i) => (
      <BestsellerCardSkeleton key={i} />
    ))}
  </div>
));
BestsellersGridSkeleton.displayName = 'BestsellersGridSkeleton';
