/**
 * TikTokSalesFunnel — compliant TikTok-optimized funnel for the
 * self-cleaning litter box PDP. Renders ONLY when ?utm_source=tiktok.
 *
 * Compliance:
 *  - No fake reviews / no fake star counts / no fabricated testimonials
 *  - No fake urgency / no countdown timers / no fake stock counts
 *  - Generic, verifiable trust signals only (shipping, returns, secure checkout)
 *  - Real low-stock badge already lives on the PDP — this component does not
 *    duplicate or invent stock claims.
 */
import {
  ShoppingCart, Sparkles, Smartphone, Wind, Clock, Heart, Home,
  CheckCircle2, Truck, RotateCcw, Lock, ShieldCheck, PawPrint, Cat, Recycle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TikTokSalesFunnelProps {
  onCtaClick: () => void;
  inStock: boolean;
  price: number;
}

export function TikTokSalesFunnel({ onCtaClick, inStock, price }: TikTokSalesFunnelProps) {
  return (
    <section aria-label="Why cat owners switch" className="mt-12 space-y-10">
      {/* PROBLEM */}
      <div className="rounded-2xl bg-muted/40 border border-border/50 p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          Tired of the smell and daily scooping?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">If you own a cat, you know the struggle.</p>
        <ul className="mt-4 space-y-2.5 text-[15px] text-muted-foreground">
          <li className="flex gap-2"><span aria-hidden="true">•</span> Lingering odors in your home</li>
          <li className="flex gap-2"><span aria-hidden="true">•</span> Messy, time-consuming cleaning</li>
          <li className="flex gap-2"><span aria-hidden="true">•</span> Unhygienic litter handling</li>
        </ul>
        <p className="mt-4 text-sm font-medium text-foreground/90">
          And no matter what you try… the odor keeps coming back.
        </p>
      </div>

      {/* SOLUTION */}
      <div className="rounded-2xl bg-primary/5 border border-primary/20 p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">This changes everything</p>
        <p className="text-xl md:text-2xl font-display font-bold text-foreground leading-snug">
          A self-cleaning litter box that takes care of itself.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          No effort. No mess. No stress.
        </p>
        <div className="mt-5 grid sm:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-4 border border-border/40">
            <Sparkles className="w-5 h-5 text-primary mb-2" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">Cleans itself automatically</p>
            <p className="text-xs text-muted-foreground mt-1">Separates waste after every visit.</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/40">
            <Wind className="w-5 h-5 text-primary mb-2" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">Helps reduce odor</p>
            <p className="text-xs text-muted-foreground mt-1">Sealed waste compartment keeps your home fresh.</p>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border/40">
            <Smartphone className="w-5 h-5 text-primary mb-2" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">App-controlled</p>
            <p className="text-xs text-muted-foreground mt-1">Monitor and control cleaning cycles from your phone.</p>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
          How it works
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Cat, title: '1. Cat enters', body: 'Smart sensors detect your cat — no training needed.' },
            { icon: Recycle, title: '2. Box rotates', body: 'After they leave, the box automatically rotates.' },
            { icon: ShieldCheck, title: '3. Waste is sealed', body: 'Solids are separated and dropped into a sealed drawer.' },
            { icon: Sparkles, title: '4. Clean litter remains', body: 'Fresh litter is ready for the next visit.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="relative bg-card rounded-2xl p-5 border border-border/40">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <p className="font-semibold text-foreground text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-1">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-sm font-medium text-foreground/90">
          Result: a clean, fresh-smelling home — without lifting a finger.
        </p>
      </div>

      {/* MID-PAGE CTA */}
      <div className="rounded-2xl bg-card border border-border/50 p-5 md:p-6 flex flex-col md:flex-row items-center gap-4">
        <div className="flex-1 text-center md:text-left">
          <p className="font-display font-bold text-foreground text-lg leading-snug">
            Ready for a fresher home?
          </p>
          <p className="text-xs text-muted-foreground">Free US shipping on eligible orders. 30-day returns.</p>
        </div>
        <Button
          onClick={onCtaClick}
          disabled={!inStock}
          className="h-12 w-full md:w-auto px-8 gap-2 text-base font-bold bg-[hsl(25,95%,53%)] hover:bg-[hsl(25,95%,46%)] text-white rounded-xl shadow-md"
        >
          <ShoppingCart className="w-5 h-5" />
          Get Yours Today
        </Button>
      </div>

      {/* BENEFITS */}
      <div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
          Why cat owners love it
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">Save time, every single day</p>
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
              <PawPrint className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">Cleaner for your cat</p>
            <p className="text-xs text-muted-foreground mt-1">A consistently clean box your cat will actually use.</p>
          </div>
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Heart className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">Stress-free maintenance</p>
            <p className="text-xs text-muted-foreground mt-1">Empty the sealed drawer every 1–2 weeks.</p>
          </div>
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Smartphone className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">Modern smart solution</p>
            <p className="text-xs text-muted-foreground mt-1">App-connected so you’re always in control.</p>
          </div>
          <div className="text-center bg-card rounded-2xl p-5 border border-border/40">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Wind className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground text-sm">No more odor build-up</p>
            <p className="text-xs text-muted-foreground mt-1">Waste is removed and sealed after each visit.</p>
          </div>
        </div>
      </div>

      {/* TRUST BLOCK (verifiable signals only) */}
      <div className="rounded-2xl bg-muted/30 border border-border/50 p-6 md:p-8">
        <h2 className="text-lg md:text-xl font-display font-bold text-foreground text-center">
          Shop with confidence
        </h2>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-card border border-border/40 p-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">Secure Checkout</span>
          </div>
          <div className="rounded-xl bg-card border border-border/40 p-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">30-Day Returns</span>
          </div>
          <div className="rounded-xl bg-card border border-border/40 p-3 flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">Free US Shipping</span>
          </div>
          <div className="rounded-xl bg-card border border-border/40 p-3 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">Easy US Returns</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Payments processed securely. We accept all major US payment methods.
        </p>
      </div>

      {/* RISK REVERSAL */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 mb-3">
          <ShieldCheck className="w-6 h-6 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg md:text-xl font-display font-bold text-foreground">
          30-Day Money-Back Guarantee
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Try it risk-free. Not satisfied? Return it within 30 days for a full refund.
        </p>
      </div>

      {/* FINAL CTA */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-6 md:p-8 text-center">
        <p className="text-xl md:text-2xl font-display font-bold text-foreground">
          Make your life easier. Make your home cleaner.
        </p>
        <p className="text-sm text-muted-foreground mt-1.5">
          Free US shipping on orders $35+ • 30-Day Returns • Secure Checkout
        </p>
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
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-primary" aria-hidden="true" /> Free Shipping</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-primary" aria-hidden="true" /> 30-Day Returns</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-primary" aria-hidden="true" /> Secure Checkout</span>
        </div>
      </div>
    </section>
  );
}

export default TikTokSalesFunnel;
