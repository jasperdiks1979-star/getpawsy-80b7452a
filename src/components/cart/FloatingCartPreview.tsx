import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ArrowRight, X } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { safeString, safePrice } from '@/lib/safe-render';
import { fireCheckoutClick } from '@/lib/funnelEvents';

interface FloatingCartPreviewProps {
  isVisible: boolean;
  onClose: () => void;
}

export const FloatingCartPreview = memo(({ isVisible, onClose }: FloatingCartPreviewProps) => {
  const { items, totalItems, totalPrice, removeItem } = useCart();

  const displayItems = items.slice(0, 3);
  const remainingCount = items.length - 3;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-2xl shadow-soft-lg overflow-hidden z-50"
          onMouseLeave={onClose}
        >
          {/* Header */}
          <div className="px-4 py-3 bg-muted/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Items */}
          {items.length === 0 ? (
            <div className="p-6 text-center">
              <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Your cart is empty</p>
              <Link to="/products" onClick={onClose}>
                <Button variant="link" size="sm" className="mt-2 gap-1">
                  Start shopping <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-64">
                <div className="p-3 space-y-2">
                  {displayItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 p-2 rounded-xl bg-background hover:bg-muted/50 transition-colors group"
                    >
                      {/* Image */}
                      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                        <img
                          src={item.image || '/placeholder.svg'}
                          alt={safeString(item.name)}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium line-clamp-1">
                          {safeString(item.name)}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            Qty: {item.quantity}
                          </span>
                          <span className="text-xs text-primary font-semibold">
                            ${safePrice(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          removeItem(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 rounded-full transition-all"
                      >
                        <X className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </motion.div>
                  ))}

                  {remainingCount > 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      + {remainingCount} more {remainingCount === 1 ? 'item' : 'items'}
                    </p>
                  )}
                </div>
              </ScrollArea>

              {/* Footer */}
              <div className="p-3 border-t border-border bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-lg font-bold text-primary">
                    ${safePrice(totalPrice)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link to="/cart" onClick={onClose} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full rounded-full">
                      View Cart
                    </Button>
                  </Link>
                  <Link
                    to="/checkout"
                    onClick={() => {
                      try {
                        fireCheckoutClick({
                          source_component: 'floating_cart_checkout',
                          item_count: totalItems,
                          value: Number(totalPrice.toFixed(2)),
                          currency: 'USD',
                        });
                      } catch { /* analytics never breaks UX */ }
                      onClose();
                    }}
                    className="flex-1"
                  >
                    <Button size="sm" className="w-full rounded-full gap-1">
                      Checkout <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

FloatingCartPreview.displayName = 'FloatingCartPreview';

export default FloatingCartPreview;
