import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus, ShoppingCart, Sparkles, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { trackCrossSellImpression, trackBundleAddToCart } from '@/lib/analytics';
import { computeAvailability } from '@/lib/availability';
import { useBundleCopy } from '@/hooks/useBundleCopy';

interface Product {
  id: string;
  name: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  slug?: string | null;
  category?: string | null;
  is_active?: boolean | null;
}

interface BundleAddData {
  itemCount: number;
  totalValue: number;
}

interface BestsellerBundleSectionProps {
  currentProduct: Product;
  relatedProducts: Product[];
  isLoading?: boolean;
  onAddToCart?: () => void;
  onBundleAdd?: (data: BundleAddData) => void;
}

// Legacy static benefit copy (kept as fallback)
const PRODUCT_BENEFITS: Record<string, string> = {
  default: "Enhances your pet's comfort",
  collar: 'Keeps your dog secure',
  leash: 'Perfect for safe walks',
  bed: 'Provides ultimate comfort',
  toy: 'Keeps your pet entertained',
  carrier: 'Safe travel companion',
  harness: 'Prevents pulling & stress',
  bowl: 'Healthier meal times',
  brush: 'Keeps coat shiny & clean',
  mat: 'Protects your car interior',
  cover: 'Prevents slipping & mess',
  protector: 'Guards against scratches',
  blanket: 'Keeps your dog calm during rides',
};

const getBenefitCopy = (productName: string): string => {
  const nameLower = productName.toLowerCase();
  for (const [key, benefit] of Object.entries(PRODUCT_BENEFITS)) {
    if (nameLower.includes(key)) return benefit;
  }
  return PRODUCT_BENEFITS.default;
};

// Bundle discount: 10-15% for 2-3 items
const BUNDLE_DISCOUNT = 12; // 12% bundle discount

// Skeleton for loading state
const BundleSkeleton = () => (
  <div className="bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-xl p-4 border border-primary/10">
    <div className="flex items-center gap-2 mb-4">
      <Skeleton className="w-5 h-5 rounded-full" />
      <Skeleton className="h-5 w-40" />
    </div>
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-muted bg-card">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-14 h-14 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
    <div className="mt-4 pt-4 border-t border-border/50">
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  </div>
);

export const BestsellerBundleSection = ({
  currentProduct,
  relatedProducts,
  isLoading = false,
  onAddToCart,
  onBundleAdd,
}: BestsellerBundleSectionProps) => {
  const { addItem } = useCart();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const impressionTracked = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Dynamic AI-generated copy based on user segment
  const { copy: dynamicCopy, segment, trackCopyShown } = useBundleCopy(currentProduct.name);

  // Get up to 2 complementary products (1 main + 1-2 upsells)
  const bundleProducts = useMemo(() => {
    return relatedProducts
      .filter(p => {
        if (p.id === currentProduct.id || p.price <= 0) return false;
        const availability = computeAvailability(p);
        return availability.isInStock;
      })
      .slice(0, 2);
  }, [relatedProducts, currentProduct.id]);

  // Initialize with main product + first upsell selected
  useEffect(() => {
    const initialSelected = new Set<string>([currentProduct.id]);
    if (bundleProducts.length > 0) {
      initialSelected.add(bundleProducts[0].id);
    }
    setSelectedIds(initialSelected);
  }, [currentProduct.id, bundleProducts]);

  // Track impression and copy variant
  useEffect(() => {
    if (bundleProducts.length === 0 || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          trackCrossSellImpression(
            currentProduct.id,
            currentProduct.name,
            bundleProducts.map((p, idx) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              category: p.category || undefined,
              position: idx,
            })),
            'frequently_bought'
          );
          // Track dynamic copy variant shown
          trackCopyShown(currentProduct.id, 'FBT');
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [bundleProducts, currentProduct, trackCopyShown]);

  // Calculate pricing
  const allProducts = useMemo(() => [currentProduct, ...bundleProducts], [currentProduct, bundleProducts]);
  const selectedProducts = useMemo(() => allProducts.filter(p => selectedIds.has(p.id)), [allProducts, selectedIds]);
  
  const hasUpsell = selectedProducts.length > 1;
  const discountPercent = hasUpsell ? BUNDLE_DISCOUNT : 0;
  
  const { originalTotal, discountAmount, bundleTotal } = useMemo(() => {
    const original = selectedProducts.reduce((sum, p) => sum + p.price, 0);
    const discount = hasUpsell ? (original * discountPercent) / 100 : 0;
    return {
      originalTotal: original,
      discountAmount: discount,
      bundleTotal: original - discount,
    };
  }, [selectedProducts, hasUpsell, discountPercent]);

  // Toggle upsell product selection
  const toggleProduct = useCallback((productId: string) => {
    if (productId === currentProduct.id) return; // Can't deselect main product
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, [currentProduct.id]);

  // Handle add to cart
  const handleAddBundle = async () => {
    setIsAdding(true);
    
    try {
      selectedProducts.forEach(product => {
        const discountedPrice = hasUpsell 
          ? product.price * (1 - discountPercent / 100)
          : product.price;
        
        addItem({
          id: product.id,
          slug: product.slug ?? undefined,
          name: product.name,
          price: discountedPrice,
          image: product.image_url || '/placeholder.svg',
        });
      });

      // Track bundle analytics
      if (hasUpsell) {
        trackBundleAddToCart(
          selectedProducts.map(p => ({
            item_id: p.id,
            item_name: p.name,
            price: p.price * (1 - discountPercent / 100),
          })),
          bundleTotal,
          discountPercent,
          discountAmount,
          currentProduct.id,
          currentProduct.name
        );
      }

      if (hasUpsell) {
        toast.success(
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Bundle added to cart!</span>
            <span className="text-sm text-muted-foreground">
              You saved ${discountAmount.toFixed(2)} with bundle discount
            </span>
          </div>
        );
      }

      // Trigger A/B test tracking callback
      onBundleAdd?.({
        itemCount: selectedProducts.length,
        totalValue: bundleTotal,
      });

      // Trigger post-add upsell callback
      onAddToCart?.();
    } catch {
      toast.error('Failed to add to cart');
    } finally {
      setIsAdding(false);
    }
  };

  // Show skeleton during loading
  if (isLoading) {
    return <BundleSkeleton />;
  }

  // Don't render if no upsell products available
  if (bundleProducts.length === 0) return null;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-xl p-4 border border-primary/10"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-full bg-primary/10">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-base font-semibold">Frequently Bought Together</h3>
        {hasUpsell && (
          <Badge variant="secondary" className="ml-auto bg-accent text-accent-foreground text-xs">
            Save {discountPercent}%
          </Badge>
        )}
      </div>
      
      {/* Dynamic AI-generated copy based on user segment */}
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        {dynamicCopy}
      </p>

      {/* Product List - Mobile-first horizontal cards */}
      <div className="space-y-2.5">
        {/* Main product - always selected */}
        <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary bg-primary/5">
          <Checkbox checked disabled className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-border/50">
            <img
              src={currentProduct.image_url || '/placeholder.svg'}
              alt={currentProduct.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-1">{currentProduct.name}</p>
            <p className="text-xs text-muted-foreground">This item</p>
          </div>
          <span className="text-sm font-semibold text-primary whitespace-nowrap">
            ${currentProduct.price.toFixed(2)}
          </span>
        </div>

        {/* Plus separator */}
        <div className="flex justify-center">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Upsell products */}
        {bundleProducts.map((product) => {
          const isSelected = selectedIds.has(product.id);
          const productUrl = product.slug ? `/product/${product.slug}` : `/product/${product.id}`;
          const benefitCopy = getBenefitCopy(product.name);

          return (
            <motion.div
              key={product.id}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-muted bg-card hover:border-primary/50'
              }`}
              onClick={() => toggleProduct(product.id)}
              whileTap={{ scale: 0.99 }}
            >
              <Checkbox
                checked={isSelected}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Link 
                to={productUrl} 
                onClick={(e) => e.stopPropagation()}
                className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-border/50"
              >
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link 
                  to={productUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-medium line-clamp-1 hover:text-primary transition-colors"
                >
                  {product.name}
                </Link>
                <p className="text-xs text-muted-foreground line-clamp-1">{benefitCopy}</p>
              </div>
              <span className="text-sm font-semibold text-primary whitespace-nowrap">
                ${product.price.toFixed(2)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Price Summary & CTA */}
      <div className="mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2">
            {hasUpsell && discountAmount > 0 && (
              <span className="text-sm text-muted-foreground line-through">
                ${originalTotal.toFixed(2)}
              </span>
            )}
            <span className="text-xl font-bold text-primary">
              ${bundleTotal.toFixed(2)}
            </span>
          </div>
          {hasUpsell && discountAmount > 0 && (
            <motion.span
              key={discountAmount.toFixed(2)}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              className="text-sm font-medium text-accent-foreground"
            >
              Save ${discountAmount.toFixed(2)}
            </motion.span>
          )}
        </div>

        <Button
          onClick={handleAddBundle}
          disabled={isAdding}
          className="w-full h-11 gap-2 font-semibold"
        >
          {isAdding ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4" />
              {hasUpsell ? 'Add Bundle to Cart' : 'Add to Cart'}
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
};
