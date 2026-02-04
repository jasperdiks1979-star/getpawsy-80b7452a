import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ProductCard, Product } from '@/components/products/ProductCard';
import { Package, ArrowRight } from 'lucide-react';

interface CategoryEmptyStateProps {
  categoryName?: string;
  recommendedProducts?: Product[];
  subcategories?: Array<{
    id: string;
    name: string;
    slug: string;
    productCount?: number;
  }>;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export const CategoryEmptyState = ({
  categoryName,
  recommendedProducts = [],
  subcategories = [],
  onClearFilters,
  hasActiveFilters,
}: CategoryEmptyStateProps) => {
  const displayProducts = recommendedProducts.slice(0, 4);
  const displaySubcategories = subcategories.filter(s => (s.productCount || 0) > 0).slice(0, 6);

  return (
    <div className="py-8">
      {/* Main Message */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <Package className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {categoryName 
            ? `No products found in ${categoryName}` 
            : 'No products found'}
        </h2>
        <p className="text-muted-foreground mb-4">
          {hasActiveFilters 
            ? 'Try adjusting your filters to see more products.'
            : 'Check out our recommendations below or browse other categories.'}
        </p>
        {hasActiveFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear All Filters
          </Button>
        )}
      </div>

      {/* Subcategories - Show if available */}
      {displaySubcategories.length > 0 && (
        <div className="mb-10">
          <h3 className="text-lg font-semibold mb-4">
            Browse {categoryName ? `${categoryName}` : 'Categories'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {displaySubcategories.map((subcategory) => (
              <Link
                key={subcategory.id}
                to={`/products?category=${encodeURIComponent(subcategory.slug)}`}
                className="group p-4 rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all text-center"
              >
                <span className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
                  {subcategory.name}
                </span>
                {subcategory.productCount !== undefined && subcategory.productCount > 0 && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    {subcategory.productCount} product{subcategory.productCount !== 1 ? 's' : ''}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Products */}
      {displayProducts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {categoryName ? `Popular in ${categoryName.split(' ')[0]}` : 'Recommended for You'}
            </h3>
            <Link 
              to="/products" 
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all products
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {/* Fallback if nothing to show */}
      {displaySubcategories.length === 0 && displayProducts.length === 0 && (
        <div className="text-center">
          <Link to="/products">
            <Button>
              Browse All Products
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};
