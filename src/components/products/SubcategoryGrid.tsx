import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Subcategory {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  productCount?: number;
}

interface SubcategoryGridProps {
  subcategories: Subcategory[];
  parentCategoryName: string;
  isLoading?: boolean;
}

const SubcategoryGridSkeleton = () => (
  <div className="mb-10">
    <div className="flex items-center justify-between mb-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-24" />
    </div>
    
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="relative aspect-square rounded-xl overflow-hidden">
          <Skeleton className="w-full h-full" />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <Skeleton className="h-4 w-3/4 mb-1" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const SubcategoryGrid = ({ subcategories, parentCategoryName, isLoading }: SubcategoryGridProps) => {
  if (isLoading) {
    return <SubcategoryGridSkeleton />;
  }

  if (!subcategories || subcategories.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          Shop {parentCategoryName} by Category
        </h2>
        <span className="text-sm text-muted-foreground">
          {subcategories.length} subcategories
        </span>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
        {subcategories.map((subcategory, index) => (
          <motion.div
            key={subcategory.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <Link
              to={`/products?category=${encodeURIComponent(subcategory.slug)}`}
              className="group block"
            >
              <div className="relative aspect-square rounded-xl overflow-hidden bg-muted border border-border/50 transition-all duration-300 group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/10">
                {subcategory.image_url ? (
                  <img
                    src={subcategory.image_url}
                    alt={subcategory.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                    <span className="text-4xl opacity-50">🐾</span>
                  </div>
                )}
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                
                {/* Content */}
                <div className="absolute inset-0 p-3 flex flex-col justify-end">
                  <h3 className="text-white font-medium text-sm md:text-base leading-tight line-clamp-2 group-hover:text-primary-foreground transition-colors">
                    {subcategory.name}
                  </h3>
                  {subcategory.productCount !== undefined && subcategory.productCount > 0 && (
                    <p className="text-white/70 text-xs mt-1">
                      {subcategory.productCount} product{subcategory.productCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {/* Hover arrow */}
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
