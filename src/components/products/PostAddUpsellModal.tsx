import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { X, Check, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { computeAvailability } from '@/lib/availability';
import { trackCrossSellClick } from '@/lib/analytics';

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

interface PostAddUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProduct: Product;
  upsellProduct: Product | null;
  sourceProductId: string;
  sourceProductName: string;
}

// Benefit-driven short copy
const UPSELL_BENEFITS: Record<string, string> = {
  default: 'Perfect companion for your purchase',
  collar: 'Complete the look with matching style',
  leash: 'Perfect for safe adventures together',
  bed: 'Give your pet a comfortable rest spot',
  toy: 'Keep your furry friend entertained',
  carrier: 'Travel safely with your companion',
  harness: 'Comfortable walks, no pulling',
  bowl: 'Mealtime made better',
  brush: 'Keep that coat shiny and healthy',
  mat: 'Protect your surfaces in style',
  cover: 'Complete protection for your car',
  protector: 'Full coverage peace of mind',
  blanket: 'Cozy comfort on every journey',
};

const getUpsellBenefit = (productName: string): string => {
  const nameLower = productName.toLowerCase();
  for (const [key, benefit] of Object.entries(UPSELL_BENEFITS)) {
    if (nameLower.includes(key)) return benefit;
  }
  return UPSELL_BENEFITS.default;
};

// Session storage key to track if modal was shown
const UPSELL_SHOWN_KEY = 'pawsy-post-add-upsell-shown';

// Upsell discount percentage
const UPSELL_DISCOUNT = 10;

export const PostAddUpsellModal = ({
  isOpen,
  onClose,
  currentProduct,
  upsellProduct,
  sourceProductId,
  sourceProductName,
}: PostAddUpsellModalProps) => {
  const { addItem } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [hasShownThisSession, setHasShownThisSession] = useState(false);

  // Check if already shown this session
  useEffect(() => {
    const shown = sessionStorage.getItem(UPSELL_SHOWN_KEY);
    if (shown === 'true') {
      setHasShownThisSession(true);
    }
  }, []);

  // Mark as shown when modal opens
  useEffect(() => {
    if (isOpen && !hasShownThisSession) {
      sessionStorage.setItem(UPSELL_SHOWN_KEY, 'true');
      setHasShownThisSession(true);
    }
  }, [isOpen, hasShownThisSession]);

  // Close on scroll or outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      onClose();
    };

    // Delay adding scroll listener to avoid immediate close
    const timeoutId = setTimeout(() => {
      window.addEventListener('scroll', handleScroll, { passive: true });
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isOpen, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle add upsell
  const handleAddUpsell = async () => {
    if (!upsellProduct) return;
    
    setIsAdding(true);
    
    try {
      const discountedPrice = upsellProduct.price * (1 - UPSELL_DISCOUNT / 100);
      
      addItem({
        id: upsellProduct.id,
        slug: upsellProduct.slug ?? undefined,
        name: upsellProduct.name,
        price: discountedPrice,
        image: upsellProduct.image_url || '/placeholder.svg',
      });

      // Track the cross-sell click
      trackCrossSellClick(
        sourceProductId,
        sourceProductName,
        {
          id: upsellProduct.id,
          name: upsellProduct.name,
          price: upsellProduct.price,
          position: 0,
        },
        'upsell'
      );

      toast.success(`${upsellProduct.name} added!`, {
        description: `You saved $${(upsellProduct.price * UPSELL_DISCOUNT / 100).toFixed(2)}`,
      });

      onClose();
    } catch {
      toast.error('Failed to add item');
    } finally {
      setIsAdding(false);
    }
  };

  // Don't show if already shown this session or no upsell product
  if (hasShownThisSession && !isOpen) return null;
  if (!upsellProduct) return null;

  // Check if upsell product is in stock
  const availability = computeAvailability(upsellProduct);
  if (!availability.isInStock) return null;

  const discountedPrice = upsellProduct.price * (1 - UPSELL_DISCOUNT / 100);
  const benefitCopy = getUpsellBenefit(upsellProduct.name);
  const productUrl = upsellProduct.slug ? `/product/${upsellProduct.slug}` : `/product/${upsellProduct.id}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-50 md:hidden"
            onClick={handleBackdropClick}
          />

          {/* Modal - Mobile only slide-up */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-2xl z-50 md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>

            {/* Content */}
            <div className="px-4 pb-4">
              {/* Header */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full mb-2">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Added to Cart
                  </span>
                </div>
                <h3 className="text-lg font-semibold">Complete the Ride in One Click</h3>
              </div>

              {/* Upsell Product Card */}
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                <Link to={productUrl} onClick={onClose}>
                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-border/50">
                    <img
                      src={upsellProduct.image_url || '/placeholder.svg'}
                      alt={upsellProduct.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link 
                    to={productUrl} 
                    onClick={onClose}
                    className="text-sm font-medium line-clamp-2 hover:text-primary transition-colors"
                  >
                    {upsellProduct.name}
                  </Link>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {benefitCopy}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-base font-bold text-primary">
                      ${discountedPrice.toFixed(2)}
                    </span>
                    <span className="text-sm text-muted-foreground line-through">
                      ${upsellProduct.price.toFixed(2)}
                    </span>
                    <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] px-1.5">
                      {UPSELL_DISCOUNT}% OFF
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 h-12"
                >
                  No Thanks
                </Button>
                <Button
                  onClick={handleAddUpsell}
                  disabled={isAdding}
                  className="flex-1 h-12 gap-2 font-semibold"
                >
                  {isAdding ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Package className="w-4 h-4" />
                      Yes, Add This
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
