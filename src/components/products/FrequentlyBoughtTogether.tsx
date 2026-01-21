import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { trackCrossSellImpression, trackBundleAddToCart } from '@/lib/analytics';

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
}

// Dynamic discount tiers based on number of selected items
const DISCOUNT_TIERS: Record<number, { percentage: number; code: string }> = {
  2: { percentage: 10, code: 'BUNDLE10' },
  3: { percentage: 15, code: 'BUNDLE15' },
  4: { percentage: 18, code: 'BUNDLE18' },
  5: { percentage: 20, code: 'BUNDLE20' },
};

const getDiscountForCount = (count: number): { percentage: number; code: string } => {
  if (count >= 5) return DISCOUNT_TIERS[5];
  return DISCOUNT_TIERS[count] || { percentage: 0, code: '' };
};

export const FrequentlyBoughtTogether = ({
  currentProduct,
  relatedProducts,
  maxItems = 3,
  sourceProductId,
  sourceProductName,
}: FrequentlyBoughtTogetherProps) => {
  const { addItem } = useCart();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const impressionTracked = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Select top related products for the bundle
  const bundleProducts = useMemo(() => {
    return relatedProducts
      .filter(p => p.id !== currentProduct.id && p.price > 0)
      .slice(0, maxItems);
  }, [relatedProducts, currentProduct.id, maxItems]);

  // Initialize with all items selected
  useEffect(() => {
    const initialSelected = new Set<string>([currentProduct.id]);
    bundleProducts.forEach(p => initialSelected.add(p.id));
    setSelectedIds(initialSelected);
  }, [currentProduct.id, bundleProducts]);

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

  if (bundleProducts.length === 0) return null;

  const allProducts = [currentProduct, ...bundleProducts];
  const selectedProducts = allProducts.filter(p => selectedIds.has(p.id));

  // Calculate dynamic discount based on selection count
  const { percentage: bundleDiscount, code: discountCode } = getDiscountForCount(selectedProducts.length);
  
  // Calculate prices
  const originalTotal = selectedProducts.reduce((sum, p) => sum + p.price, 0);
  const discountAmount = selectedProducts.length >= 2 
    ? (originalTotal * bundleDiscount) / 100 
    : 0;
  const bundleTotal = originalTotal - discountAmount;

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
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-full bg-primary/10">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Frequently Bought Together</h3>
          <p className="text-sm text-muted-foreground">
            Buy 2+ items together and save up to 20%
          </p>
        </div>
      </div>

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

      {/* Price Summary */}
      <div className="bg-card rounded-xl p-4 border shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedProducts.length} items selected
              </span>
              {selectedProducts.length >= 2 && (
                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
                  {bundleDiscount}% OFF
                </span>
              )}
            </div>
            
            <div className="flex items-baseline gap-2">
              {discountAmount > 0 && (
                <span className="text-lg text-muted-foreground line-through">
                  ${originalTotal.toFixed(2)}
                </span>
              )}
              <span className="text-2xl font-bold text-primary">
                ${bundleTotal.toFixed(2)}
              </span>
              {discountAmount > 0 && (
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  Save ${discountAmount.toFixed(2)}
                </span>
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
