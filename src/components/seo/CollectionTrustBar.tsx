import { Truck, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

export function CollectionTrustBar() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 py-4 px-6 rounded-xl bg-secondary/30 border border-secondary/50 mb-8">
      <div className="flex items-center gap-2 text-sm text-secondary-foreground">
        <Truck className="w-4 h-4 text-primary" />
        <span className="font-medium">Free US Shipping ${FREE_SHIPPING_THRESHOLD}+ ({DELIVERY_TIME_STANDARD})</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-secondary-foreground">
        <RotateCcw className="w-4 h-4 text-primary" />
        <span className="font-medium">{RETURN_WINDOW_DAYS}-Day Return Policy</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-secondary-foreground">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <span className="font-medium">Secure Checkout</span>
      </div>
    </div>
  );
}
