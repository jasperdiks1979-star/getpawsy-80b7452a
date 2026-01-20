import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const BlogPostSkeleton = memo(() => {
  return (
    <Card className="overflow-hidden h-full">
      {/* Image */}
      <Skeleton className="aspect-video w-full" />
      
      {/* Content */}
      <CardContent className="p-5 space-y-3">
        {/* Category badge */}
        <Skeleton className="h-5 w-16 rounded-full" />
        
        {/* Title */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
        </div>
        
        {/* Excerpt */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        {/* Meta info */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
});

BlogPostSkeleton.displayName = 'BlogPostSkeleton';

export const BlogGridSkeleton = memo(({ count = 6 }: { count?: number }) => {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <BlogPostSkeleton key={i} />
      ))}
    </div>
  );
});

BlogGridSkeleton.displayName = 'BlogGridSkeleton';
