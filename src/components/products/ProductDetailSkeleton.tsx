import { Skeleton } from '@/components/ui/skeleton';

export const ProductDetailSkeleton = () => {
  return (
    <div className="w-full max-w-[100vw] px-4 md:px-6 3xl:px-8 py-8 3xl:py-12 mx-auto md:container ultrawide:max-w-[1800px]">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-5 w-32 mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 3xl:gap-24 ultrawide:gap-32 w-full">
        {/* Image Gallery Skeleton */}
        <div className="space-y-4 w-full max-w-full">
          {/* Main Image */}
          <Skeleton className="w-full aspect-square rounded-2xl md:rounded-3xl" />
          
          {/* Thumbnails */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="flex-1 flex gap-3 overflow-hidden">
              {[...Array(5)].map((_, i) => (
                <Skeleton 
                  key={i} 
                  className="w-16 h-16 md:w-20 md:h-20 rounded-xl flex-shrink-0" 
                />
              ))}
            </div>
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          </div>
        </div>

        {/* Product Details Skeleton */}
        <div className="space-y-6 w-full max-w-full">
          {/* Category & Title */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-8 w-48" />
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-6 w-32" />
            ))}
          </div>

          {/* Variants */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-20" />
            <div className="flex flex-wrap gap-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Quantity & Add to Cart */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Skeleton className="h-12 w-32 rounded-xl" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 w-12 rounded-xl" />
          </div>

          {/* Stock status */}
          <Skeleton className="h-5 w-40" />

          {/* Shipping info */}
          <div className="space-y-3 p-4 rounded-xl border">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </div>

          {/* Tabs skeleton */}
          <div className="space-y-4 pt-4">
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-lg" />
              ))}
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Skeleton */}
      <div className="mt-16 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="w-full aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
