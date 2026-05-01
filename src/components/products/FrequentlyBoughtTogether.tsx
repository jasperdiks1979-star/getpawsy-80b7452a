import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus, ShoppingCart, Sparkles, TrendingUp, PartyPopper } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { trackCrossSellImpression, trackBundleAddToCart } from '@/lib/analytics';
import { getCuratedCompanions, isDogBedProduct, DOG_BED_BUNDLE_TIERS } from '@/config/dog-bed-companions';

interface Product {
  id: string;
  name: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  slug?: string | null;
  category?: string | null;
}

interface FrequentlyBoughtTogetherProps {
  currentProduct: Product;
  relatedProducts: Product[];
  maxItems?: number;
  sourceProductId?: string;
  sourceProductName?: string;
  isLoading?: boolean;
}

// Skeleton component for loading state with shimmer animations
const FrequentlyBoughtTogetherSkeleton = () => (
  <div className="bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-2xl p-6 border border-primary/10">
    {/* Header Skeleton */}
    <div className="flex items-center gap-3 mb-6">
      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-5 w-48 md:w-56" />
        <Skeleton className="h-4 w-40 md:w-44" />
      </div>
    </div>

    {/* Products Row Skeleton */}
    <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          {index > 0 && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
              <Skeleton className="w-4 h-4 rounded" />
            </div>
          )}
          <div className="relative flex flex-col items-center p-3 rounded-xl border-2 border-muted bg-card">
            <Skeleton className="absolute top-2 left-2 w-4 h-4 rounded" />
            <Skeleton className="w-20 h-20 md:w-24 md:h-24 rounded-lg mb-2" />
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>

    {/* Discount Progress Skeleton */}
    <div className="mb-4 p-4 bg-muted/30 rounded-xl border border-muted">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-16 rounded-md" />
      </div>
      <Skeleton className="h-3 w-full rounded-full mb-2" />
      <div className="flex justify-between">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-2 w-10" />
          </div>
        ))}
      </div>
    </div>

    {/* Price Summary Skeleton */}
    <div className="bg-card rounded-xl p-4 border shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <Skeleton className="h-11 w-full md:w-[180px] rounded-lg" />
      </div>
    </div>
  </div>
);

// Dynamic discount tiers based on number of selected items
const DISCOUNT_TIERS = [
  { count: 2, percentage: 10, code: 'BUNDLE10' },
  { count: 3, percentage: 15, code: 'BUNDLE15' },
  { count: 4, percentage: 18, code: 'BUNDLE18' },
  { count: 5, percentage: 20, code: 'BUNDLE20' },
];

const MAX_DISCOUNT = 20;

const getDiscountForCount = (count: number): { percentage: number; code: string } => {
  const tier = DISCOUNT_TIERS.slice().reverse().find(t => count >= t.count);
  return tier ? { percentage: tier.percentage, code: tier.code } : { percentage: 0, code: '' };
};

const getNextTier = (count: number): { count: number; percentage: number } | null => {
  const nextTier = DISCOUNT_TIERS.find(t => t.count > count);
  return nextTier ? { count: nextTier.count, percentage: nextTier.percentage } : null;
};

export const FrequentlyBoughtTogether = ({
  currentProduct,
  relatedProducts,
  maxItems = 3,
  sourceProductId,
  sourceProductName,
  isLoading = false,
}: FrequentlyBoughtTogetherProps) => {
  const { addItem } = useCart();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [hasUnlockedMax, setHasUnlockedMax] = useState(false);
  const impressionTracked = useRef(false);
  const maxDiscountCelebrated = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check for curated companions first (e.g., dog beds), then fall back to generic
  const curatedCompanions = useMemo(() => getCuratedCompanions(currentProduct.id), [currentProduct.id]);
  const isDogBed = useMemo(() => isDogBedProduct(currentProduct.category ?? null, currentProduct.name), [currentProduct.category, currentProduct.name]);

  const bundleProducts = useMemo(() => {
    if (curatedCompanions) {
      // Prioritize curated companions, matching them against available related products
      const curatedIds = curatedCompanions.map(c => c.productId);
      const curated = relatedProducts.filter(p => curatedIds.includes(p.id) && p.price > 0);
      // Fill remaining slots with other related products
      const remaining = relatedProducts
        .filter(p => p.id !== currentProduct.id && p.price > 0 && !curatedIds.includes(p.id))
        .slice(0, maxItems - curated.length);
      return [...curated, ...remaining].slice(0, maxItems);
    }
    return relatedProducts
      .filter(p => p.id !== currentProduct.id && p.price > 0)
      .slice(0, maxItems);
  }, [relatedProducts, currentProduct.id, maxItems, curatedCompanions]);

  // Initialize with all items selected
  useEffect(() => {
    const initialSelected = new Set<string>([currentProduct.id]);
    bundleProducts.forEach(p => initialSelected.add(p.id));
    setSelectedIds(initialSelected);
  }, [currentProduct.id, bundleProducts]);

  // Confetti celebration for max discount - MUST be before any early returns
  const triggerConfetti = useCallback(() => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#22c55e', '#16a34a', '#4ade80', '#86efac', '#fbbf24', '#f59e0b'],
      });
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#22c55e', '#16a34a', '#4ade80', '#86efac', '#fbbf24', '#f59e0b'],
      });
    }, 250);
  }, []);

  // Track impression when visible
  useEffect(() => {
    if (bundleProducts.length === 0 || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          trackCrossSellImpression(
            sourceProductId || currentProduct.id,
            sourceProductName || currentProduct.name,
            bundleProducts.map((p, idx) => ({
              id: p.id,
              name: p.name,
              price: p.price,
              category: p.category || undefined,
              position: idx,
            })),
            'frequently_bought'
          );
        }
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [bundleProducts, sourceProductId, sourceProductName, currentProduct]);

  // Memoize computed values before early returns
  const allProducts = useMemo(() => [currentProduct, ...bundleProducts], [currentProduct, bundleProducts]);
  const selectedProducts = useMemo(() => allProducts.filter(p => selectedIds.has(p.id)), [allProducts, selectedIds]);

  // Calculate dynamic discount based on selection count
  const { percentage: bundleDiscount, code: discountCode } = useMemo(
    () => getDiscountForCount(selectedProducts.length),
    [selectedProducts.length]
  );
  
  // Calculate prices
  const { originalTotal, discountAmount, bundleTotal } = useMemo(() => {
    const original = selectedProducts.reduce((sum, p) => sum + p.price, 0);
    const discount = selectedProducts.length >= 2 
      ? (original * bundleDiscount) / 100 
      : 0;
    return {
      originalTotal: original,
      discountAmount: discount,
      bundleTotal: original - discount,
    };
  }, [selectedProducts, bundleDiscount]);

  // Watch for max discount unlock - MUST be before early returns
  useEffect(() => {
    if (selectedProducts.length >= 5 && !maxDiscountCelebrated.current) {
      maxDiscountCelebrated.current = true;
      setHasUnlockedMax(true);
      triggerConfetti();
      
      setTimeout(() => {
        setHasUnlockedMax(false);
      }, 4000);
    } else if (selectedProducts.length < 5) {
      maxDiscountCelebrated.current = false;
    }
  }, [selectedProducts.length, triggerConfetti]);

  // Show skeleton when loading - AFTER all hooks
  if (isLoading) {
    return <FrequentlyBoughtTogetherSkeleton />;
  }

  if (bundleProducts.length === 0) return null;

  const toggleProduct = (productId: string) => {
    // Don't allow deselecting the current product
    if (productId === currentProduct.id) return;
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleAddBundle = async () => {
    if (selectedProducts.length < 2) {
      toast.error('Select at least 2 items for bundle discount');
      return;
    }

    setIsAdding(true);
    
    try {
      // Add each selected product to cart
      selectedProducts.forEach(product => {
        addItem({
          id: product.id,
          slug: product.slug ?? undefined,
          name: product.name,
          price: product.price * (1 - bundleDiscount / 100), // Apply discount to each item
          image: product.image_url || '/placeholder.svg',
        });
      });

      // Track bundle add to cart
      trackBundleAddToCart(
        selectedProducts.map(p => ({
          item_id: p.id,
          item_name: p.name,
          price: p.price * (1 - bundleDiscount / 100),
        })),
        bundleTotal,
        bundleDiscount,
        discountAmount,
        sourceProductId || currentProduct.id,
        sourceProductName || currentProduct.name
      );

      // Store bundle discount code for checkout
      localStorage.setItem('appliedDiscount', discountCode);

      toast.success(
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Bundle added to cart!</span>
          <span className="text-sm text-muted-foreground">
            You saved ${discountAmount.toFixed(2)} with bundle discount
          </span>
        </div>
      );
    } catch (error) {
      toast.error('Failed to add bundle to cart');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-2xl p-6 border border-primary/10"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-full bg-primary/10">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-bold">
            {isDogBed ? "Complete Your Dog's Comfort Setup" : 'Frequently Bought Together'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isDogBed
              ? 'Most customers add these for better comfort'
              : 'Buy 2+ items together and save up to 20%'}
          </p>
        </div>
      </div>

      {/* Urgency copy for dog beds */}
      {isDogBed && curatedCompanions && (
        <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Most customers add this for better comfort
        </p>
      )}

      {/* Products Row */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        {allProducts.map((product, index) => {
          const isSelected = selectedIds.has(product.id);
          const isCurrentProduct = product.id === currentProduct.id;
          const productUrl = product.slug 
            ? `/product/${product.slug}` 
            : `/product/${product.id}`;

          return (
            <div key={product.id} className="flex items-center gap-3">
              {index > 0 && (
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              
              <motion.div
                whileHover={{ scale: 1.02 }}
                className={`
                  relative flex flex-col items-center p-3 rounded-xl border-2 transition-all cursor-pointer
                  ${isSelected 
                    ? 'border-primary bg-primary/5 shadow-md' 
                    : 'border-muted bg-card hover:border-primary/50'
                  }
                  ${isCurrentProduct ? 'ring-2 ring-primary ring-offset-2' : ''}
                `}
                onClick={() => toggleProduct(product.id)}
              >
                {/* Checkbox */}
                <div className="absolute top-2 left-2">
                  <Checkbox
                    checked={isSelected}
                    disabled={isCurrentProduct}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </div>

                {/* This item badge */}
                {isCurrentProduct && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                    This item
                  </div>
                )}

                {/* Product Image */}
                <Link 
                  to={productUrl} 
                  onClick={(e) => e.stopPropagation()}
                  className="block"
                >
                  <img
                    src={product.image_url || '/placeholder.svg'}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-lg mb-2"
                  />
                </Link>

                {/* Product Info */}
                <Link 
                  to={productUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="text-center"
                >
                  <p className="text-xs md:text-sm font-medium line-clamp-2 hover:text-primary transition-colors max-w-[100px] md:max-w-[120px]">
                    {product.name}
                  </p>
                </Link>
                
                <p className="text-sm font-bold text-primary mt-1">
                  ${product.price.toFixed(2)}
                </p>

                {/* Selected checkmark */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </motion.div>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Discount Progress Bar */}
      <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              Bundle Savings
            </span>
          </div>
          <motion.span
            key={bundleDiscount}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-lg font-bold text-green-600 dark:text-green-400"
          >
            {bundleDiscount}% OFF
          </motion.span>
        </div>
        
        {/* Progress bar with tier markers */}
        <div className="relative">
          <Progress 
            value={(bundleDiscount / MAX_DISCOUNT) * 100} 
            className="h-3 bg-green-100 dark:bg-green-900/40"
          />
          
          {/* Tier markers */}
          <div className="absolute top-0 left-0 right-0 h-3 flex items-center pointer-events-none">
            {DISCOUNT_TIERS.map((tier, idx) => (
              <div
                key={tier.count}
                className="absolute flex flex-col items-center"
                style={{ left: `${(tier.percentage / MAX_DISCOUNT) * 100}%` }}
              >
                <div 
                  className={`w-1.5 h-1.5 rounded-full transform -translate-x-1/2 transition-colors duration-300 ${
                    bundleDiscount >= tier.percentage 
                      ? 'bg-white dark:bg-green-200' 
                      : 'bg-green-300 dark:bg-green-700'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
        
        {/* Tier labels */}
        <div className="flex justify-between mt-2 text-xs">
          {DISCOUNT_TIERS.map((tier) => (
            <div 
              key={tier.count}
              className={`flex flex-col items-center transition-colors duration-300 ${
                bundleDiscount >= tier.percentage 
                  ? 'text-green-700 dark:text-green-300 font-medium' 
                  : 'text-green-500/60 dark:text-green-600'
              }`}
            >
              <span>{tier.percentage}%</span>
              <span className="text-[10px]">{tier.count} items</span>
            </div>
          ))}
        </div>
        
        {/* Next tier hint */}
        {(() => {
          const nextTier = getNextTier(selectedProducts.length);
          if (nextTier && selectedProducts.length >= 2) {
            return (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 text-xs text-center text-green-600 dark:text-green-400 font-medium"
              >
                🎯 Add {nextTier.count - selectedProducts.length} more item{nextTier.count - selectedProducts.length > 1 ? 's' : ''} to unlock {nextTier.percentage}% discount!
              </motion.p>
            );
          }
          if (selectedProducts.length >= 5) {
            return (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-3 flex items-center justify-center gap-2"
                >
                  <motion.div
                    animate={hasUnlockedMax ? { 
                      rotate: [0, -10, 10, -10, 10, 0],
                      scale: [1, 1.2, 1.2, 1.2, 1.2, 1]
                    } : {}}
                    transition={{ duration: 0.6 }}
                  >
                    <PartyPopper className="w-5 h-5 text-amber-500" />
                  </motion.div>
                  <motion.p
                    animate={hasUnlockedMax ? {
                      scale: [1, 1.1, 1],
                    } : {}}
                    transition={{ duration: 0.4, repeat: hasUnlockedMax ? 2 : 0 }}
                    className="text-sm font-bold bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 bg-clip-text text-transparent"
                  >
                    Maximum 20% discount unlocked!
                  </motion.p>
                  <motion.div
                    animate={hasUnlockedMax ? { 
                      rotate: [0, 10, -10, 10, -10, 0],
                      scale: [1, 1.2, 1.2, 1.2, 1.2, 1]
                    } : {}}
                    transition={{ duration: 0.6 }}
                  >
                    <PartyPopper className="w-5 h-5 text-amber-500 transform scale-x-[-1]" />
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            );
          }
          return null;
        })()}
      </div>

      {/* Price Summary */}
      <div className="bg-card rounded-xl p-4 border shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedProducts.length} items selected
              </span>
              {selectedProducts.length >= 2 && (
                <motion.span
                  key={bundleDiscount}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full"
                >
                  {bundleDiscount}% OFF
                </motion.span>
              )}
            </div>
            
            <div className="flex items-baseline gap-2">
              {discountAmount > 0 && (
                <span className="text-lg text-muted-foreground line-through">
                  ${originalTotal.toFixed(2)}
                </span>
              )}
              <motion.span
                key={bundleTotal.toFixed(2)}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className="text-2xl font-bold text-primary"
              >
                ${bundleTotal.toFixed(2)}
              </motion.span>
              {discountAmount > 0 && (
                <motion.span
                  key={discountAmount.toFixed(2)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm font-medium text-green-600 dark:text-green-400"
                >
                  Save ${discountAmount.toFixed(2)}
                </motion.span>
              )}
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleAddBundle}
            disabled={isAdding || selectedProducts.length < 2}
            className="gap-2 shadow-lg hover:shadow-xl transition-shadow min-w-[180px]"
          >
            {isAdding ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                Add Bundle to Cart
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
