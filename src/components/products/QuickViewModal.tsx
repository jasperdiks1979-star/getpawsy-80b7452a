import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Heart, ChevronLeft, ChevronRight, Minus, Plus, Truck, Shield, ExternalLink, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';
import { useCartAnimation } from '@/contexts/CartAnimationContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useHaptic } from '@/hooks/useHaptic';
import { toast } from 'sonner';
import type { Product } from '@/components/products/ProductCard';

interface ParsedVariant {
  vid: string;
  variantKey: string;
  variantSellPrice: number;
  variantImage?: string;
  color?: string;
}

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

// Color detection map
const COLOR_MAP: Record<string, string> = {
  'red': '#ef4444', 'blue': '#3b82f6', 'green': '#22c55e', 'yellow': '#eab308',
  'orange': '#f97316', 'purple': '#a855f7', 'pink': '#ec4899', 'black': '#000000',
  'white': '#ffffff', 'gray': '#6b7280', 'grey': '#6b7280', 'brown': '#92400e',
  'beige': '#d4a574', 'navy': '#1e3a5a', 'teal': '#14b8a6', 'cyan': '#06b6d4',
  'gold': '#fbbf24', 'silver': '#9ca3af', 'rose': '#fb7185', 'coral': '#f97171',
  'light blue': '#93c5fd', 'dark blue': '#1e40af', 'light green': '#86efac',
};

const detectColor = (name: string): string | undefined => {
  const lower = name.toLowerCase();
  for (const [colorName, hex] of Object.entries(COLOR_MAP)) {
    if (lower.includes(colorName)) return hex;
  }
  return undefined;
};

export const QuickViewModal = ({ product, isOpen, onClose }: QuickViewModalProps) => {
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { success: hapticSuccess } = useHaptic();
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ParsedVariant | null>(null);

  // Parse variants
  const variants = useMemo<ParsedVariant[]>(() => {
    if (!product?.variants || !Array.isArray(product.variants)) return [];
    
    return (product.variants as unknown[]).map((raw): ParsedVariant | null => {
      if (!raw || typeof raw !== 'object') return null;
      const v = raw as Record<string, unknown>;
      
      const vid = String(v.vid || '');
      if (!vid) return null;
      
      const variantKey = String(v.variantKey || v.variantNameEn || 'Option');
      const variantSellPrice = Number(v.variantSellPrice) || Number(product.price) || 0;
      const variantImage = v.variantImage ? String(v.variantImage) : undefined;
      const color = detectColor(variantKey);
      
      return { vid, variantKey, variantSellPrice, variantImage, color };
    }).filter((v): v is ParsedVariant => v !== null);
  }, [product]);

  // Auto-select first variant when product changes
  useMemo(() => {
    if (variants.length > 0 && !selectedVariant) {
      setSelectedVariant(variants[0]);
    }
  }, [variants, selectedVariant]);

  // Reset state when modal closes
  useMemo(() => {
    if (!isOpen) {
      setSelectedVariant(null);
      setQuantity(1);
      setCurrentImageIndex(0);
    }
  }, [isOpen]);

  if (!product) return null;

  const inWishlist = isInWishlist(product.id);
  const isOutOfStock = (product as { is_active?: boolean | null }).is_active === false;
  
  const images = [
    product.image_url,
    ...(product.images || [])
  ].filter(Boolean) as string[];

  // Use variant price if selected
  const displayPrice = selectedVariant?.variantSellPrice || Number(product.price);
  const discount = product.compare_at_price
    ? Math.round((1 - displayPrice / Number(product.compare_at_price)) * 100)
    : null;

  const handleAddToCart = (e: React.MouseEvent) => {
    if (isOutOfStock) {
      toast.error('This product is out of stock');
      return;
    }

    // Require variant selection if variants exist
    if (variants.length > 0 && !selectedVariant) {
      toast.error('Please select an option first');
      return;
    }
    
    hapticSuccess();
    triggerAddToCart(
      selectedVariant?.variantImage || product.image_url || '/placeholder.svg',
      e.currentTarget as HTMLElement
    );

    const variantSuffix = selectedVariant ? ` - ${selectedVariant.variantKey}` : '';
    const cartId = selectedVariant ? `${product.id}_${selectedVariant.vid}` : product.id;
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: cartId,
        slug: product.slug ?? undefined,
        name: `${product.name}${variantSuffix}`,
        price: displayPrice,
        image: selectedVariant?.variantImage || product.image_url || '/placeholder.svg',
      });
    }
    
    setQuantity(1);
    onClose();
  };

  const handleToggleWishlist = () => {
    toggleWishlist(product.id);
    toast.success(inWishlist ? 'Removed from wishlist!' : 'Added to wishlist!');
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">{product.name}</DialogTitle>
        <div className="grid md:grid-cols-2">
          {/* Image Section */}
          <div className="relative aspect-square bg-muted">
            <AnimatePresence mode="wait">
              <motion.img
                key={currentImageIndex}
                src={images[currentImageIndex] || '/placeholder.svg'}
                alt={product.name}
                className="w-full h-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </AnimatePresence>
            
            {/* Image Navigation */}
            {images.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100"
                  onClick={prevImage}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full opacity-80 hover:opacity-100"
                  onClick={nextImage}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
                
                {/* Dots */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      className={`w-2 h-2 rounded-full transition-all ${
                        idx === currentImageIndex 
                          ? 'bg-primary w-6' 
                          : 'bg-background/60'
                      }`}
                      onClick={() => setCurrentImageIndex(idx)}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              {discount && discount > 0 && (
                <Badge className="bg-destructive text-destructive-foreground">
                  -{discount}%
                </Badge>
              )}
            </div>
          </div>
          
          {/* Content Section */}
          <div className="p-6 md:p-8 flex flex-col">
            {/* Category */}
            {product.category && (
              <p className="text-xs text-primary font-medium uppercase tracking-wider mb-2">
                {product.category}
              </p>
            )}
            
            {/* Title */}
            <h2 className="text-2xl font-display font-bold mb-3 line-clamp-2">
              {product.name}
            </h2>
            
            {/* Price */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl font-bold text-primary">
                ${displayPrice.toFixed(2)}
              </span>
              {product.compare_at_price && (
                <span className="text-lg text-muted-foreground line-through">
                  ${Number(product.compare_at_price).toFixed(2)}
                </span>
              )}
            </div>

            {/* Variant Selector */}
            {variants.length > 0 && (
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Choose option: <span className="text-primary">{selectedVariant?.variantKey || 'Select'}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {variants.map((variant) => {
                    const isSelected = selectedVariant?.vid === variant.vid;
                    return (
                      <button
                        key={variant.vid}
                        onClick={() => setSelectedVariant(variant)}
                        className={`
                          relative flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium
                          border-2 transition-all duration-200
                          ${isSelected 
                            ? 'border-primary bg-primary/10 text-primary' 
                            : 'border-border bg-background hover:border-primary/50'
                          }
                        `}
                      >
                        {variant.color && (
                          <span 
                            className="w-4 h-4 rounded-full border border-border/50 flex-shrink-0"
                            style={{ backgroundColor: variant.color }}
                          />
                        )}
                        <span className="truncate max-w-[120px]">{variant.variantKey}</span>
                        {isSelected && (
                          <Check className="w-3 h-3 text-primary flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Description - clean preview */}
            {product.description && (
              <p className="text-muted-foreground text-sm mb-6 line-clamp-3 leading-relaxed">
                {product.description.replace(/<[^>]*>/g, '').replace(/\*\*/g, '')}
              </p>
            )}
            
            {/* Trust badges */}
            <div className="flex gap-4 mb-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-primary" />
                <span>Free Shipping on Orders $35+</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary" />
                <span>30-Day Returns</span>
              </div>
            </div>
            
            {/* Quantity & Add to Cart */}
            <div className="flex gap-3 mb-4">
              {/* Quantity selector */}
              <div className="flex items-center border rounded-full">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={isOutOfStock}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-10 text-center font-medium">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-10 w-10"
                  onClick={() => setQuantity(quantity + 1)}
                  disabled={isOutOfStock}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Add to cart */}
              <Button
                className="flex-1 gap-2 rounded-full"
                size="lg"
                onClick={handleAddToCart}
                disabled={isOutOfStock}
              >
                <ShoppingCart className="w-5 h-5" />
                {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
              </Button>
              
              {/* Wishlist */}
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-11 w-11"
                onClick={handleToggleWishlist}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? 'fill-destructive text-destructive' : ''}`} />
              </Button>
            </div>
            
            {/* View full details link */}
            <Link 
              to={`/product/${product.id}`}
              className="mt-auto"
              onClick={onClose}
            >
              <Button variant="ghost" className="w-full gap-2 text-primary">
                View Full Details
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
