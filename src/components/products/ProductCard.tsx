import React, { useState, memo, forwardRef, useCallback } from 'react';
import { Link } from 'react-router-dom'
import { ShoppingCart, Heart, Eye } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useCartAnimation } from '@/contexts/CartAnimationContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useHaptic } from '@/hooks/useHaptic';
import { useProductPrefetch } from '@/hooks/useProductPrefetch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { StarRating } from '@/components/ui/star-rating';
import { toast } from 'sonner';
import { trackSelectItem, trackAddToCart, trackAddToWishlist, trackRemoveFromWishlist } from '@/lib/analytics';

export interface Product {
  id: string;
  cj_product_id?: string | null;
  name: string;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  price: number;
  cost_price?: number | null;
  compare_at_price?: number | null;
  sku?: string | null;
  variants?: unknown;
  stock?: number | null;
  is_active?: boolean | null;
  weight?: number | null;
  shipping_time?: string | null;
  supplier_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductCardProps {
  product: Product;
  listId?: string;
  listName?: string;
  position?: number;
  rating?: number;
  reviewCount?: number;
}

export const ProductCard = memo(forwardRef<HTMLAnchorElement, ProductCardProps>(({ 
  product, 
  listId = 'products', 
  listName = 'Products',
  position = 0,
  rating,
  reviewCount,
}, ref) => {
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { success: hapticSuccess, selection: hapticSelection } = useHaptic();
  const { prefetchProduct } = useProductPrefetch();
  const inWishlist = isInWishlist(product.id);
  const [isAnimating, setIsAnimating] = useState(false);

  // Prefetch product data on hover for faster navigation
  const handleMouseEnter = useCallback(() => {
    prefetchProduct({
      productId: product.id,
      productSlug: product.slug,
      category: product.category,
    });
  }, [product.id, product.slug, product.category, prefetchProduct]);
  

  const isOutOfStock = product.stock === 0 || product.stock === null;

  const handleCardClick = () => {
    // Track select_item event for GA4 enhanced ecommerce
    trackSelectItem(listId, listName, {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      category: product.category || undefined,
      position,
    });
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Prevent adding out-of-stock items
    if (isOutOfStock) {
      toast.error('This product is out of stock');
      return;
    }
    
    // Trigger haptic feedback on mobile
    hapticSuccess();
    
    // Trigger flying animation
    triggerAddToCart(
      product.image_url || '/placeholder.svg',
      e.currentTarget as HTMLElement
    );
    
    addItem({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image: product.image_url || '/placeholder.svg',
    });

    // Track add_to_cart for GA4
    trackAddToCart(product.id, product.name, Number(product.price), 1);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAnimating(true);
    hapticSelection();
    toggleWishlist(product.id);
    
    // Track wishlist events for GA4
    if (inWishlist) {
      trackRemoveFromWishlist(product.id, product.name);
      toast.success('Removed from wishlist!');
    } else {
      trackAddToWishlist(product.id, product.name, Number(product.price));
      toast.success('Added to wishlist!');
    }
    
    setTimeout(() => setIsAnimating(false), 300);
  };

  const discount = product.compare_at_price
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : null;

  // Use slug for SEO-friendly URLs, fallback to id
  const productUrl = product.slug ? `/product/${product.slug}` : `/product/${product.id}`;

  return (
    <Link ref={ref} to={productUrl} className="group block" onClick={handleCardClick} onMouseEnter={handleMouseEnter}>
      <div 
        className="relative bg-card rounded-2xl overflow-hidden shadow-card transition-all duration-200 hover:shadow-card-hover hover:-translate-y-1"
      >
        {/* Image Container */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <OptimizedImage
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            aspectRatio="square"
            className="group-hover:scale-105"
          />
          
          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {discount && discount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground shadow-soft">
                -{discount}%
              </Badge>
            )}
            {product.stock !== null && product.stock !== undefined && product.stock > 0 && product.stock <= 5 && (
              <Badge variant="secondary" className="bg-amber-500/90 text-white shadow-soft border-0 animate-pulse">
                Only {product.stock} left!
              </Badge>
            )}
            {product.stock !== null && product.stock !== undefined && product.stock > 5 && product.stock <= 10 && (
              <Badge variant="secondary" className="bg-amber-600/80 text-white shadow-soft border-0">
                Low stock
              </Badge>
            )}
          </div>

          {/* Quick Actions - Desktop */}
          <div className="absolute top-3 right-3 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-card/90 backdrop-blur-sm hover:bg-card shadow-soft h-10 w-10"
              onClick={handleToggleWishlist}
            >
              <Heart className={`w-4 h-4 transition-all ${inWishlist ? 'fill-destructive text-destructive scale-110' : ''} ${isAnimating ? 'animate-heartPop' : ''}`} />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-card/90 backdrop-blur-sm hover:bg-card shadow-soft h-10 w-10"
            >
              <Eye className="w-4 h-4" />
            </Button>
          </div>

          {/* Add to Cart Button - Desktop */}
          <div className="absolute bottom-0 left-0 right-0 p-4 hidden md:block translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
            <Button
              className="w-full gap-2 rounded-full shadow-soft"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              variant={isOutOfStock ? "secondary" : "default"}
            >
              <ShoppingCart className="w-4 h-4" />
              {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {product.category && (
            <p className="text-xs text-primary font-medium uppercase tracking-wider mb-2">
              {product.category}
            </p>
          )}
          <h3 className="font-display font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-lg leading-snug">
            {product.name}
          </h3>

          {/* Rating Stars */}
          {rating !== undefined && reviewCount !== undefined && reviewCount > 0 && (
            <div className="mt-2">
              <StarRating rating={rating} reviewCount={reviewCount} size="sm" />
            </div>
          )}

          {/* Price */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xl font-bold text-primary">
              ${Number(product.price).toFixed(2)}
            </span>
            {product.compare_at_price && (
              <span className="text-sm text-muted-foreground line-through">
                ${Number(product.compare_at_price).toFixed(2)}
              </span>
            )}
          </div>

          {/* Mobile Actions */}
          <div className="flex gap-2 mt-4 md:hidden">
            <Button
              className="flex-1 gap-2 rounded-full"
              size="sm"
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              variant={isOutOfStock ? "secondary" : "default"}
            >
              <ShoppingCart className="w-4 h-4" />
              {isOutOfStock ? 'Out of Stock' : 'Add'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 flex-shrink-0 rounded-full"
              onClick={handleToggleWishlist}
            >
              <Heart className={`w-4 h-4 transition-colors ${inWishlist ? 'fill-destructive text-destructive' : ''} ${isAnimating ? 'animate-heartPop' : ''}`} />
            </Button>
          </div>

          {/* Stock indicator */}
          {product.stock === 0 && (
            <p className="text-xs text-destructive mt-3 font-medium">Out of Stock</p>
          )}
        </div>
      </div>
    </Link>
  );
}));

ProductCard.displayName = 'ProductCard';
