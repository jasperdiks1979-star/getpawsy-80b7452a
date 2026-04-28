/**
 * TikTokHero — high-conversion above-the-fold hero shown only to TikTok ad
 * traffic on the litter-box PDP. Compliant: no fake urgency, no fake reviews,
 * no unverifiable claims. Mobile-first.
 */
import { ShoppingCart, Truck, RotateCcw, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TikTokHeroProps {
  onCtaClick: () => void;
  inStock: boolean;
}

export function TikTokHero({ onCtaClick, inStock }: TikTokHeroProps) {
  return (
    <section
      aria-label="TikTok offer hero"
      className="mb-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-4 md:p-6"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary mb-2">
        As seen on TikTok
      </p>
      <p className="text-2xl md:text-3xl font-display font-extrabold text-foreground leading-[1.15]">
        Stop Scooping Your Cat&apos;s Litter.
      </p>
      <p className="text-sm md:text-base text-muted-foreground mt-2 leading-relaxed">
        This self-cleaning litter box removes waste automatically and helps keep your home odor-free 24/7.
      </p>

      <Button
        onClick={onCtaClick}
        disabled={!inStock}
        className="mt-4 h-12 w-full md:w-auto px-8 gap-2 text-base font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl shadow-md"
      >
        <ShoppingCart className="w-5 h-5" />
        Get Yours Today
      </Button>

      <ul className="mt-4 grid grid-cols-3 gap-2 text-[11px] md:text-xs">
        <li className="flex items-center gap-1.5 rounded-lg bg-card/70 border border-border/40 px-2.5 py-2">
          <Truck className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
          <span className="font-medium text-foreground">Free US Shipping $35+</span>
        </li>
        <li className="flex items-center gap-1.5 rounded-lg bg-card/70 border border-border/40 px-2.5 py-2">
          <RotateCcw className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
          <span className="font-medium text-foreground">30-Day Returns</span>
        </li>
        <li className="flex items-center gap-1.5 rounded-lg bg-card/70 border border-border/40 px-2.5 py-2">
          <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden="true" />
          <span className="font-medium text-foreground">Secure Checkout</span>
        </li>
      </ul>
    </section>
  );
}

export default TikTokHero;