/**
 * Free Shipping Progress Bar — shows how close the cart is to the free shipping threshold.
 * Also serves as a commitment trigger on product pages.
 */
import { Truck, CheckCircle } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { FREE_SHIPPING_THRESHOLD } from '@/lib/shipping-constants';

interface FreeShippingBarProps {
  /** Extra amount being added (e.g. current product price) */
  previewAmount?: number;
}

export function FreeShippingBar({ previewAmount = 0 }: FreeShippingBarProps) {
  const { items } = useCart();
  const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const projectedTotal = cartTotal + previewAmount;
  const threshold = FREE_SHIPPING_THRESHOLD;
  const remaining = Math.max(0, threshold - projectedTotal);
  const progress = Math.min(100, (projectedTotal / threshold) * 100);
  const qualified = remaining <= 0;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {qualified ? (
            <>
              <CheckCircle className="w-4 h-4 text-[hsl(var(--success))]" />
              <span className="text-[hsl(var(--success))]">Free Shipping Unlocked!</span>
            </>
          ) : (
            <>
              <Truck className="w-4 h-4 text-primary" />
              <span className="text-foreground">
                Add <span className="font-bold text-primary">${remaining.toFixed(2)}</span> for free shipping
              </span>
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground">${projectedTotal.toFixed(0)} / ${threshold}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: qualified
              ? 'hsl(var(--success))'
              : 'hsl(var(--primary))',
          }}
        />
      </div>
    </div>
  );
}
