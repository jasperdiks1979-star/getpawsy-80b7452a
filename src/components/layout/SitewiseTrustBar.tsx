import { Truck, RotateCcw, ShieldCheck, Headphones } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, RETURN_WINDOW_DAYS } from '@/lib/shipping-constants';

/**
 * Sitewide Trust Bar — renders above the footer on every page.
 * Provides Google-visible trust signals for Merchant Center compliance.
 * Uses semantic design tokens only.
 */
export function SitewiseTrustBar() {
  return (
    <section
      aria-label="Store trust guarantees"
      className="w-full border-t border-border bg-muted/40 py-4 px-4"
    >
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary flex-shrink-0" />
          <span>Free Shipping on orders over ${FREE_SHIPPING_THRESHOLD}</span>
        </div>
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
          <span>{RETURN_WINDOW_DAYS}-Day Returns</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
          <span>Secure Checkout • SSL Encryption</span>
        </div>
        <div className="flex items-center gap-2">
          <Headphones className="w-4 h-4 text-primary flex-shrink-0" />
          <span>Need help? <a href="mailto:info@getpawsy.pet" className="text-primary hover:underline">info@getpawsy.pet</a></span>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground/60 mt-2">
        Secure checkout and customer support available for all orders. Estimated delivery: 3–7 business days to the United States. Customer service hours: Monday – Friday, 09:00 – 17:00 CET.
      </p>
    </section>
  );
}
