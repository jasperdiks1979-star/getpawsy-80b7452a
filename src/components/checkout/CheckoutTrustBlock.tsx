import { Lock, Truck, RotateCcw, Star, Clock, Flame, ShieldCheck } from 'lucide-react';

/**
 * CheckoutTrustBlock — high-conversion reassurance shown directly above
 * the primary Stripe checkout button. Mobile-first, no decisions to make,
 * scannable in <2 seconds.
 */
export function CheckoutTrustBlock() {
  return (
    <div className="mt-5 space-y-3">
      {/* Urgency strip */}
      <div className="flex items-center justify-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
        <Flame className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden />
        <span className="text-[12px] font-semibold tracking-tight text-foreground">
          Today's discount active
        </span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/40" aria-hidden />
        <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
        <span className="text-[12px] text-muted-foreground">Limited inventory</span>
      </div>

      {/* Trust grid */}
      <ul className="grid grid-cols-2 gap-2 list-none p-0 m-0">
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500 flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">Trusted by Cat Owners</span>
        </li>
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <Lock className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">Secure Stripe Checkout</span>
        </li>
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">SSL Secured (256-bit)</span>
        </li>
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <span className="text-sm flex-shrink-0" aria-hidden>🇺🇸</span>
          <span className="text-[12px] font-medium leading-tight">Fast US shipping · International where supported</span>
        </li>
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <Truck className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">Free shipping included</span>
        </li>
        <li className="col-span-2 flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">30-day money-back guarantee</span>
        </li>
      </ul>
    </div>
  );
}

export default CheckoutTrustBlock;