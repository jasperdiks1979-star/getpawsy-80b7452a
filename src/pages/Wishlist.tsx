import { useState, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Heart, ShoppingCart, Trash2, ArrowLeft, ArrowUpDown, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StarRating } from '@/components/ui/star-rating';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWishlist } from '@/contexts/WishlistContext';
import { useCart } from '@/contexts/CartContext';
import { useProductRatings } from '@/hooks/useProductRatings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { safeString, safeNumber } from '@/lib/safe-render';

// Wishlist item skeleton component
const WishlistItemSkeleton = memo(() => (
  <div className="bg-card rounded-xl overflow-hidden shadow-card">
    <Skeleton className="aspect-square w-full" />
    <div className="p-4 space-y-3">
      <Skeleton className="h-3 w-16" />
      <div className="space-y-1.5">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  </div>
));
WishlistItemSkeleton.displayName = 'WishlistItemSkeleton';

const WishlistGridSkeleton = memo(({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {[...Array(count)].map((_, i) => (
      <WishlistItemSkeleton key={i} />
    ))}
  </div>
));
WishlistGridSkeleton.displayName = 'WishlistGridSkeleton';

type SortOption = 'added-desc' | 'added-asc' | 'price-asc' | 'price-desc';

const Wishlist = () => {
  const { wishlist, removeFromWishlist, clearWishlist, getAddedAt } = useWishlist();
  const { addItem } = useCart();
  const [sortBy, setSortBy] = useState<SortOption>('added-desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { data: products, isLoading } = useQuery({
    queryKey: ['wishlist-products', wishlist],
    queryFn: async () => {
      if (wishlist.length === 0) return [];
      
      const { data, error } = await supabase
        .from('products_public')
        .select('*')
        .in('id', wishlist);
      
      if (error) throw error;
      return data;
    },
    enabled: wishlist.length > 0,
  });

  // Get product IDs for ratings
  const productIds = useMemo(() => products?.map(p => p.id).filter((id): id is string => !!id) || [], [products]);
  const { data: ratingsMap } = useProductRatings(productIds);

  // Get unique categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const cats = products
      .map(p => p.category)
      .filter((cat): cat is string => !!cat);
    return [...new Set(cats)].sort();
  }, [products]);

  const sortedProducts = useMemo(() => {
    if (!products) return [];
    
    // First filter by category
    let filtered = [...products];
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }
    
    // Then sort
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return Number(a.price) - Number(b.price);
        case 'price-desc':
          return Number(b.price) - Number(a.price);
        case 'added-asc': {
          const addedAtA = getAddedAt(a.id) || 0;
          const addedAtB = getAddedAt(b.id) || 0;
          return addedAtA - addedAtB;
        }
        case 'added-desc':
        default: {
          const addedAtA = getAddedAt(a.id) || 0;
          const addedAtB = getAddedAt(b.id) || 0;
          return addedAtB - addedAtA;
        }
      }
    });
  }, [products, sortBy, categoryFilter, getAddedAt]);

  const handleAddToCart = (product: any) => {
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });
    toast.success(`${product.name} added to cart!`);
  };

  const handleAddAllToCart = () => {
    if (!products || products.length === 0) return;
    
    products.forEach((product) => {
      addItem({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        image: product.image_url || '/placeholder.svg',
      });
    });
    toast.success(`${products.length} ${products.length === 1 ? 'item' : 'items'} added to cart!`);
  };

  const handleRemove = (productId: string, productName: string) => {
    removeFromWishlist(productId);
    toast.success(`${productName} removed from wishlist`);
  };

  if (wishlist.length === 0) {
    return (
      <Layout>
        <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
        <div className="container px-4 md:px-6 py-16 text-center">
          <div className="max-w-md mx-auto">
            <Heart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Your wishlist is empty</h2>
            <p className="text-muted-foreground mb-6">
              Add products to your wishlist by clicking the heart icon.
            </p>
            <Link to="/products">
              <Button className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Browse Products
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="container px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-primary fill-primary" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">My Wishlist</h1>
              <p className="text-muted-foreground">
                {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="gap-2"
              onClick={handleAddAllToCart}
              disabled={isLoading || !products?.length}
            >
              <ShoppingCart className="w-4 h-4" />
              Add All to Cart
            </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
              <Trash2 className="w-4 h-4" />
              Clear Wishlist
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear wishlist?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove all {wishlist.length} items from your wishlist? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    clearWishlist();
                    toast.success('Wishlist cleared');
                  }}
                >
                  Yes, clear wishlist
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        </div>

        {/* Filter & Sort */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryFilter !== 'all' && (
              <span className="text-sm text-muted-foreground">
                ({sortedProducts.length} {sortedProducts.length === 1 ? 'item' : 'items'})
              </span>
            )}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="added-desc">Recently Added</SelectItem>
                <SelectItem value="added-asc">First Added</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <WishlistGridSkeleton count={wishlist.length} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {sortedProducts.map((product) => {
                const productRating = product.id ? ratingsMap?.[product.id] : undefined;
                return (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.3 }}
                  className="bg-card rounded-xl overflow-hidden shadow-card group"
                >
                  {/* Image */}
                  <Link to={`/product/${product.id}`}>
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <img
                        src={product.image_url || '/placeholder.svg'}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                  </Link>

                  {/* Content */}
                  <div className="p-4">
                    <Link to={`/product/${product.id}`}>
                      {product.category && (
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                          {safeString(product.category)}
                        </p>
                      )}
                      <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                        {safeString(product.name)}
                      </h3>
                    </Link>

                    {/* Rating */}
                    {productRating && productRating.reviewCount > 0 && (
                      <div className="mt-2">
                        <StarRating rating={productRating.averageRating} reviewCount={productRating.reviewCount} size="sm" />
                      </div>
                    )}

                    {/* Price */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-lg font-bold text-primary">
                        ${safeNumber(product.price).toFixed(2)}
                      </span>
                      {product.compare_at_price && (
                        <span className="text-sm text-muted-foreground line-through">
                          ${safeNumber(product.compare_at_price).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4">
                      <Button
                        className="flex-1 gap-2"
                        size="sm"
                        onClick={() => handleAddToCart(product)}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Add to Cart
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemove(product.id, product.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Continue Shopping */}
        <div className="mt-8 text-center">
          <Link to="/products">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Continue Shopping
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default Wishlist;
