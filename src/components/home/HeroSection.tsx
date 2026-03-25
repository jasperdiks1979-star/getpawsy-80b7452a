import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Truck from 'lucide-react/dist/esm/icons/truck';
import RotateCcw from 'lucide-react/dist/esm/icons/rotate-ccw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';

/**
 * Homepage Hero — conversion-first above-the-fold.
 * Clean headline, trust signals, single CTA. No fake urgency.
 */
export function HeroSection() {
  return (
    <section className="relative bg-gradient-to-b from-card to-background pt-10 pb-8 md:pt-16 md:pb-12">
      <div className="container px-4 md:px-6 text-center">
        <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-tight max-w-2xl mx-auto">
          Premium Pet Essentials for Dogs & Cats
        </h1>
        <p className="mt-3 text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
          Fast US shipping · 30-day returns · Trusted quality
        </p>

        <div className="mt-6">
          <Button asChild size="lg" className="rounded-full px-8 text-base font-semibold">
            <Link to="/products">Shop Now</Link>
          </Button>
        </div>

        {/* Trust strip */}
        <div className="mt-8 flex flex-wrap justify-center gap-4 md:gap-8 text-xs md:text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-primary" />
            Free shipping over $35
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-primary" />
            30-day returns
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Secure checkout
          </span>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
