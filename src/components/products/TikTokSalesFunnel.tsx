/**
 * TikTokSalesFunnel — compliant TikTok-optimized funnel content for the
 * self-cleaning litter box PDP. Renders ONLY when ?utm_source=tiktok.
 *
 * Compliance:
 *  - No fake reviews / no fake star counts
 *  - No fake urgency / no countdown timers
 *  - No fabricated testimonials
 *  - Uses real low-stock badge (already on PDP) — does not duplicate it
 */
import { ShoppingCart, Sparkles, Smartphone, Wind, Clock, Heart, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TikTokSalesFunnelProps {
  onCtaClick: () => void;
  inStock: boolean;
  price: number;
}

export function TikTokSalesFunnel({ onCtaClick, inStock, price }: TikTokSalesFunnelProps) {
  return (
    <section aria-label="Why cat owners switch" className="mt-12 space-y-10">
      {/* Problem */}
      <div className="rounded-2xl bg-muted/40 border border-border/50 p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          Tired of dealing with litter box smell every day?
        </h2>
        <ul className="mt-4 space-y-2.5 text-[15px] text-muted-foreground">
          <li className="flex gap-2"><span aria-hidden="true">•</span> Odor that spreads through your whole home</li>
          <li className="flex gap-2"><span aria-hidden="true">•</span> Daily scooping you keep putting off</li>
          <li className="flex gap-2"><span aria-hidden="true">•</span> Mess, tracking, and an unhygienic corner</li>
        </ul>
      </div>

      {/* Solution */}
      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">This changes everything</p>
        <p className="text-xl md:text-2xl font-display font-bold text-foreground leading-snug">
          A self-cleaning litter box that takes care of itself.
        </p>
        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-4 border border-border/40">
            <Sparkles className="w-5 h-5 text-primary mb-2" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">Self-cleaning mechanism</p>
            <p className="text-xs text-muted-foreground mt-1">Automatically separates waste after every visit.</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/40">
            <Wind className="w-5 h-5 text-primary mb-2" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">Odor-control system</p>
            <p className="text-xs text-muted-foreground mt-1">Sealed waste compartment helps keep your home fresh.</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/40">
            <Smartphone className="w-5 h-5 text-primary mb-2" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">App-controlled</p>
            <p className="text-xs text-muted-foreground mt-1">Monitor and control cleaning cycles from your phone.</p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
          What you get every single day
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">Saves time, every day</p>
            <p className="text-xs text-muted-foreground mt-1">No more daily scooping routine.</p>
          </div>
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Home className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">A home that stays fresh</p>
            <p className="text-xs text-muted-foreground mt-1">Sealed waste compartment helps reduce odor.</p>
          </div>
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Heart className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">Cleaner for your cat</p>
            <p className="text-xs text-muted-foreground mt-1">A consistently clean box your cat will actually use.</p>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-6 md:p-8 text-center">
        <p className="text-xl md:text-2xl font-display font-bold text-foreground">
          Ready for a fresher home?
        </p>
        <p className="text-sm text-muted-foreground mt-1.5">Free US shipping on eligible orders. 30-day returns.</p>
        <p className="mt-4 text-3xl font-display font-bold text-primary">${price.toFixed(2)}</p>
        <Button
          onClick={onCtaClick}
          disabled={!inStock}
          className="mt-4 h-14 px-10 gap-2 text-base font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl shadow-md"
        >
          <ShoppingCart className="w-5 h-5" />
          Get Yours Today
        </Button>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-xs text-muted-foreground">
          <span>✔ Free Shipping</span>
          <span>✔ 30-Day Returns</span>
          <span>✔ Secure Checkout</span>
        </div>
      </div>
    </section>
  );
}

export default TikTokSalesFunnel;