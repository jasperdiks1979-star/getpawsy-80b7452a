import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Heart, ChevronLeft, ChevronRight, Minus, Plus, Truck, Shield, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';
import { useCartAnimation } from '@/contexts/CartAnimationContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { useHaptic } from '@/hooks/useHaptic';
import { toast } from 'sonner';
import type { Product } from '@/components/products/ProductCard';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QuickViewModal = ({ product, isOpen, onClose }: QuickViewModalProps) => {
  const { addItem } = useCart();
  const { triggerAddToCart } = useCartAnimation();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { success: hapticSuccess } = useHaptic();
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!product) return null;

  const inWishlist = isInWishlist(product.id);
  const isOutOfStock = product.stock === 0 || product.stock === null;
  
  // Get all images
  const images = [
    product.image_url,
    ...(product.images || [])
  ].filter(Boolean) as string[];

  const discount = product.compare_at_price
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : null;

  const handleAddToCart = (e: React.MouseEvent) => {
    if (isOutOfStock) {
      toast.error('This product is out of stock');
      return;
    }
    
    hapticSuccess();
    triggerAddToCart(
      product.image_url || '/placeholder.svg',
      e.currentTarget as HTMLElement
    );
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        image: product.image_url || '/placeholder.svg',
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
              {product.stock !== null && product.stock < 5 && product.stock > 0 && (
                <Badge variant="secondary">Low stock</Badge>
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
                ${Number(product.price).toFixed(2)}
              </span>
              {product.compare_at_price && (
                <span className="text-lg text-muted-foreground line-through">
                  ${Number(product.compare_at_price).toFixed(2)}
                </span>
              )}
            </div>
            
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
                <span>Free US Shipping $35+</span>
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
