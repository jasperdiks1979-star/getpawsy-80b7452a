import { memo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export const BlogPostDetailSkeleton = memo(() => {
  return (
    <div className="container max-w-4xl py-8">
      {/* Back Button */}
      <Skeleton className="h-5 w-28 mb-6" />

      {/* Header */}
      <div className="mb-8">
        {/* Category Badge */}
        <Skeleton className="h-6 w-20 rounded-full mb-4" />
        
        {/* Title */}
        <div className="space-y-2 mb-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </div>
        
        {/* Excerpt */}
        <div className="space-y-2 mb-6">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        
        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20 ml-auto rounded-md" />
        </div>
      </div>

      {/* Featured Image */}
      <Skeleton className="aspect-video w-full rounded-2xl mb-8" />

      {/* Content */}
      <div className="space-y-6">
        {/* Paragraph 1 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        
        {/* Heading */}
        <Skeleton className="h-7 w-2/3 mt-4" />
        
        {/* Paragraph 2 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        
        {/* List Items */}
        <div className="space-y-2 ml-6">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        
        {/* Paragraph 3 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        
        {/* Another Heading */}
        <Skeleton className="h-7 w-1/2 mt-4" />
        
        {/* Paragraph 4 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      {/* Tags Section */}
      <div className="mt-12 pt-8 border-t">
        <Skeleton className="h-4 w-12 mb-3" />
        <div className="flex flex-wrap gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>

      {/* Related Products Section */}
      <div className="mt-12 pt-8 border-t">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square w-full" />
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-5 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Related Articles Section */}
      <div className="mt-12 pt-8 border-t">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <div className="flex gap-3 pt-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
});

BlogPostDetailSkeleton.displayName = 'BlogPostDetailSkeleton';
