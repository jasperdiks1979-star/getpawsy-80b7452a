import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Urgency / offer block — free-shipping CTA strip.
 */
export function FreeShippingBanner() {
  return (
    <section className="py-8 md:py-10 bg-primary/5 border-y border-primary/10" aria-label="Free shipping offer">
      <div className="container px-4 md:px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Truck className="w-5 h-5 text-primary" />
          <h2 className="text-lg md:text-xl font-display font-bold text-foreground">
            Free Shipping on Orders Over $35
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Shipping to the United States · Estimated delivery: 5–10 business days
        </p>
        <Button asChild size="lg" className="rounded-xl px-8 font-bold">
          <Link to="/products">Start Shopping</Link>
        </Button>
      </div>
    </section>
  );
}
