import React, { useState, memo, forwardRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Heart, Eye } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCartAnimation } from "@/contexts/CartAnimationContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useProductPrefetch } from "@/hooks/useProductPrefetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { getTrustLabel } from "@/lib/trust-labels";
import { PawConfetti, usePawConfetti } from "@/components/products/PawConfetti";
import { toast } from "sonner";
import { trackSelectItem, trackAddToCart, trackAddToWishlist, trackRemoveFromWishlist } from "@/lib/analytics";
import { safeString, safePrice } from "@/lib/safe-render";
import { computeAvailability } from "@/lib/availability";
import { getProductDiscount } from "@/lib/discount";
import { getCanonicalCardPrice } from "@/lib/canonical-pricing";
import { trackFirstGridImage } from "@/lib/grid-timing";
import { getConversionFlag } from "@/lib/conversionFlags";

export interface Product {
  id: string;
  cj_product_id?: string | null;
  name: string;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  image_alt_text?: string | null;
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
  priority?: boolean;
  popularChoice?: boolean;
  bestSeller?: boolean;
  topRated?: boolean;
  showSpeciesBadge?: boolean;
  species?: "cat" | "dog" | "both" | "unknown" | null;
}

export const ProductCard = memo(
  forwardRef<HTMLAnchorElement, ProductCardProps>(function ProductCard(
    {
      product,
      listId = "products",
      listName = "Products",
      position = 0,
      priority = false,
      popularChoice = false,
      bestSeller = false,
      topRated = false,
      showSpeciesBadge = false,
      species,
    },
    ref,
  ) {
    const { addItem } = useCart();
    const { triggerAddToCart } = useCartAnimation();
    const { toggleWishlist, isInWishlist } = useWishlist();
    const { success: hapticSuccess, selection: hapticSelection } = useHaptic();
    const { prefetchProduct } = useProductPrefetch();
    const inWishlist = isInWishlist(product.id);
    const [isAnimating, setIsAnimating] = useState(false);
    const {
      isActive: isPawActive,
      position: pawPosition,
      triggerConfetti,
      handleComplete: handlePawComplete,
    } = usePawConfetti();

    const handleMouseEnter = useCallback(() => {
      prefetchProduct({
        productId: product.id,
        productSlug: product.slug ?? undefined,
        category: product.category,
      });
    }, [product.id, product.slug, product.category, prefetchProduct]);

    const handleFocus = useCallback(() => {
      handleMouseEnter();
    }, [handleMouseEnter]);

    const isOutOfStock = !computeAvailability(product).isInStock;

    const cardCanonical = getCanonicalCardPrice(product);
    const cardPrice = cardCanonical.price;

    const handleCardClick = () => {
      trackSelectItem(listId, listName, {
        id: product.id,
        name: product.name,
        price: cardPrice,
        category: product.category || undefined,
        position,
      });
    };

    const handleAddToCart = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isOutOfStock) {
        toast.error("This product is out of stock");
        return;
      }

      hapticSuccess();
      triggerConfetti(e.currentTarget as HTMLElement);
      triggerAddToCart(product.image_url || "/placeholder.svg", e.currentTarget as HTMLElement);

      addItem({
        id: product.id,
        slug: product.slug ?? undefined,
        name: product.name,
        price: cardPrice,
        image: product.image_url || "/placeholder.svg",
      });

      trackAddToCart(product.id, product.name, cardPrice, 1);
      toast.success("Added to cart");
    };

    const handleToggleWishlist = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsAnimating(true);
      hapticSelection();
      toggleWishlist(product.id);

      if (inWishlist) {
        trackRemoveFromWishlist(product.id, product.name);
        toast.success("Removed from wishlist");
      } else {
        trackAddToWishlist(product.id, product.name, cardPrice);
        toast.success("Added to wishlist");
      }

      window.setTimeout(() => setIsAnimating(false), 300);
    };

    const handleQuickView = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleCardClick();
      window.location.assign(productUrl);
    };

    const { percent: discount } = getProductDiscount(cardPrice, cardCanonical.compareAtPrice);

    const productUrl =
      product.slug && product.slug.trim() !== "" ? `/product/${product.slug}` : `/product/${product.id}`;

    const premium = getConversionFlag("premiumCard");

    // Premium DTC: surface at most ONE primary badge in priority order
    // (out-of-stock > best seller > top rated > popular > discount). Keeps
    // the card visually calm and editorial. Species badge is informational
    // and shown separately if requested.
    const primaryBadge = (() => {
      if (!premium) return null;
      if (isOutOfStock) {
        return { label: "Sold out", className: "bg-muted text-muted-foreground" } as const;
      }
      if (bestSeller) return { label: "Best Seller", className: "bg-foreground text-background" } as const;
      if (topRated) return { label: "Top Rated", className: "bg-foreground text-background" } as const;
      if (popularChoice) return { label: "Popular", className: "bg-primary text-primary-foreground" } as const;
      if (discount && discount > 0) {
        return { label: `-${discount}%`, className: "bg-destructive text-destructive-foreground" } as const;
      }
      return null;
    })();

    return (
      <>
        <PawConfetti
          trigger={isPawActive}
          originX={pawPosition.x}
          originY={pawPosition.y}
          onComplete={handlePawComplete}
        />

        <Link
          ref={ref}
          to={productUrl}
          className={`group block ${premium ? "transition-transform duration-300 ease-out hover:-translate-y-0.5" : ""}`}
          onClick={handleCardClick}
          onMouseEnter={handleMouseEnter}
          onFocus={handleFocus}
          data-testid="product-card"
        >
          <div
            className={
              premium
                ? "relative rounded-2xl overflow-hidden bg-card border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] transition-shadow duration-300"
                : "relative glass-card rounded-2xl overflow-hidden"
            }
          >
            <div className={`relative aspect-square overflow-hidden ${premium ? "bg-secondary/30" : "bg-muted"}`}>
              <OptimizedImage
                src={product.image_url || "/placeholder.svg"}
                alt={product.image_alt_text || `${product.name}${product.category ? ` - ${product.category}` : ""} – GetPawsy`}
                aspectRatio="square"
                className={premium ? "group-hover:scale-[1.03] transition-transform duration-500 ease-out" : "group-hover:scale-105"}
                priority={priority}
                onImgRef={
                  priority
                    ? (img) => {
                        if (img) trackFirstGridImage(img);
                      }
                    : undefined
                }
              />

              {!premium && (
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              )}

              {premium ? (
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  {primaryBadge && (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider shadow-sm ${primaryBadge.className}`}
                    >
                      {primaryBadge.label}
                    </span>
                  )}
                  {showSpeciesBadge && species && species !== "unknown" && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium bg-card/90 backdrop-blur-sm text-foreground border border-border/60 shadow-sm">
                      {species === "cat" ? "Cat" : species === "dog" ? "Dog" : "Cats & Dogs"}
                    </span>
                  )}
                </div>
              ) : (
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                {bestSeller && !isOutOfStock && (
                  <Badge className="bg-amber-500 text-white shadow-soft text-[10px]">🏆 Best Seller</Badge>
                )}
                {topRated && !isOutOfStock && !bestSeller && (
                  <Badge className="bg-emerald-600 text-white shadow-soft text-[10px]">⭐ Top Rated</Badge>
                )}
                {popularChoice && !isOutOfStock && !bestSeller && !topRated && (
                  <Badge className="bg-primary text-primary-foreground shadow-soft text-[10px]">
                    🔥 Popular Choice
                  </Badge>
                )}
                {discount && discount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground shadow-soft">-{discount}%</Badge>
                )}
                {isOutOfStock && (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground shadow-soft">
                    Out of Stock
                  </Badge>
                )}
                {showSpeciesBadge && species && species !== "unknown" && (
                  <Badge variant="outline" className="bg-card/90 backdrop-blur-sm text-[10px] shadow-soft">
                    {species === "cat" ? "🐱 Cat" : species === "dog" ? "🐶 Dog" : "🐾 Cats & Dogs"}
                  </Badge>
                )}
                </div>
              )}

              <div className="absolute top-3 right-3 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="rounded-full bg-card/90 backdrop-blur-sm hover:bg-card shadow-soft h-10 w-10"
                  onClick={handleToggleWishlist}
                >
                  <Heart
                    className={`w-4 h-4 transition-all ${inWishlist ? "fill-destructive text-destructive scale-110" : ""} ${isAnimating ? "animate-heartPop" : ""}`}
                  />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="rounded-full bg-card/90 backdrop-blur-sm hover:bg-card shadow-soft h-10 w-10"
                  onClick={handleQuickView}
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4 hidden md:block translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                <Button
                  type="button"
                  className="w-full gap-2 rounded-full shadow-soft"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  variant={isOutOfStock ? "secondary" : "default"}
                >
                  <ShoppingCart className="w-4 h-4" />
                  {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </Button>
              </div>
            </div>

            <div className={premium ? "p-4 md:p-5 space-y-2" : "p-5 space-y-3"}>
              {product.category && (
                <p className={premium ? "text-[10px] text-muted-foreground font-medium uppercase tracking-[0.14em]" : "text-xs text-primary font-medium uppercase tracking-wider"}>
                  {safeString(product.category)}
                </p>
              )}

              <h3 className={
                premium
                  ? "font-display font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-[15px] md:text-base leading-snug min-h-[2.5rem]"
                  : "font-display font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-base leading-snug min-h-[2.5rem]"
              }>
                {safeString(product.name)}
              </h3>

              <p className={premium ? "text-[10px] text-muted-foreground/90 font-medium" : "text-[10px] text-primary/80 font-medium mt-0.5"}>
                {getTrustLabel(product.id, position ?? 0)}
              </p>

              <div className={premium ? "flex items-baseline gap-2 pt-0.5" : "flex items-center gap-2"}>
                <span className={premium ? "text-[17px] md:text-lg font-semibold text-foreground tracking-tight" : "text-lg font-bold text-primary"}>
                  {cardCanonical.displayPrice}
                </span>
                {cardCanonical.displayCompareAt && (
                  <span className="text-sm text-muted-foreground line-through">
                    {cardCanonical.displayCompareAt}
                  </span>
                )}
              </div>

              {!premium && (
                <p className="text-xs text-muted-foreground">Shipping to customers in the United States</p>
              )}
              {premium && (
                <p className="hidden md:block text-[11px] text-muted-foreground">Free U.S. shipping</p>
              )}

              <div className="flex gap-2 pt-1 md:hidden">
                <Button
                  type="button"
                  className={premium ? "flex-1 gap-2 rounded-full h-9 text-sm" : "flex-1 gap-2 rounded-full"}
                  size="sm"
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  variant={isOutOfStock ? "secondary" : "default"}
                >
                  <ShoppingCart className="w-4 h-4" />
                  {isOutOfStock ? "Out of Stock" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 flex-shrink-0 rounded-full"
                  onClick={handleToggleWishlist}
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${inWishlist ? "fill-destructive text-destructive" : ""} ${isAnimating ? "animate-heartPop" : ""}`}
                  />
                </Button>
              </div>

              {isOutOfStock && !premium && <p className="text-xs text-destructive font-medium">Out of Stock</p>}
            </div>
          </div>
        </Link>
      </>
    );
  }),
);

ProductCard.displayName = "ProductCard";
