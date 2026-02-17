import { Truck, RotateCcw, ShieldCheck } from 'lucide-react';

export const CategoryTrustStrip = () => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 py-3 px-4 bg-muted/50 rounded-xl border border-border text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5 text-primary" />
        <span>Free Shipping Over $35</span>
      </div>
      <div className="flex items-center gap-1.5">
        <RotateCcw className="w-3.5 h-3.5 text-primary" />
        <span>30-Day Returns</span>
      </div>
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
        <span>Secure Checkout</span>
      </div>
    </div>
  );
};
