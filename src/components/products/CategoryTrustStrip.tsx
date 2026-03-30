import { Truck, RotateCcw, ShieldCheck, Package } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, RETURN_WINDOW_DAYS, DELIVERY_TIME_STANDARD } from '@/lib/shipping-constants';

export const CategoryTrustStrip = () => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 py-3 px-4 bg-muted/50 rounded-xl border border-border text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-primary" />
        <span>Free US Shipping on Orders ${FREE_SHIPPING_THRESHOLD}+</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5 text-primary" />
        <span>Estimated delivery: {DELIVERY_TIME_STANDARD}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <RotateCcw className="w-3.5 h-3.5 text-primary" />
        <span>{RETURN_WINDOW_DAYS}-Day Returns</span>
      </div>
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        <span>Secure Checkout</span>
      </div>
    </div>
  );
};
