import { Lock, Truck, RotateCcw, Star, Clock, Flame, ShieldCheck } from 'lucide-react';

/**
 * CheckoutTrustBlock — high-conversion reassurance shown directly above
 * the primary Stripe checkout button. Mobile-first, no decisions to make,
 * scannable in <2 seconds.
 */
export function CheckoutTrustBlock() {
  return (
    <div className="mt-5 space-y-3">
      {/* Trust grid */}
      <ul className="grid grid-cols-2 gap-2 list-none p-0 m-0">
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <Lock className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">Secure Stripe Checkout</span>
        </li>
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">SSL Secured (256-bit)</span>
        </li>
        <li className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <Truck className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
          <span className="text-[12px] font-medium leading-tight">Shipping shown at checkout</span>
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