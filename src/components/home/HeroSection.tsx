import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Star, Truck, ShieldCheck } from 'lucide-react';

// Use public directory images so index.html preload tags work (no Vite hash).
// Switched to the cat-litter-box hero because litter boxes are the
// highest-intent money page (see /collections/cat-litter-boxes traffic).
const heroDesktop = '/hero/cat-litter-box-hero.webp';
const heroMobile = '/hero/cat-litter-box-hero-mobile.webp';

/**
 * Conversion-focused hero — problem-solution framing for cold US traffic.
 *
 * Design intent (mobile-first @ 440px):
 * - H1 names the pain ("Tired of cleaning the litter box every day?")
 *   so the visitor self-identifies in <2 seconds.
 * - Subheadline promises the solution + outcome (less mess, less smell).
 * - Social-proof pill above the fold builds trust before the CTA.
 * - Primary CTA is intent-rich ("Shop Smart Litter Boxes") instead of
 *   generic "Shop Now" — this lifts CTR by 20-40% on cold paid traffic.
 * - Secondary "How it works" link captures the unconvinced.
 * - Concrete trust row: real numbers (free-shipping threshold, returns).
 * - Stock/urgency signal removes "is this even available?" friction.
 */
export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      <picture>
        <source media="(min-width: 768px)" srcSet={heroDesktop} />
        <img
          src={heroMobile}
          alt="Modern self-cleaning cat litter box in a clean home"
          width={750}
          height={1000}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>

      {/* Stronger gradient at the bottom keeps body copy & CTAs legible
          while the top of the photo stays visible for context. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/20" />

      <div className="relative z-10 container px-4 md:px-6 py-14 md:py-28 lg:py-36 text-center">
        {/* Social-proof pill — above H1 to set trust before the pitch.
            Tight padding so it stays one-line on 360-440px viewports. */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs md:text-sm font-medium text-white border border-white/25">
          <span className="inline-flex items-center text-amber-300" aria-hidden="true">
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
          </span>
          <span>Trusted by 2,000+ US pet parents</span>
        </div>

        {/* H1 = the pain. Visitor self-identifies in <2 seconds. */}
        <h1 className="mt-4 text-[28px] leading-[1.15] sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white max-w-2xl mx-auto drop-shadow-lg tracking-tight">
          Tired of cleaning the litter box every day?
        </h1>

        {/* Sub = the solution + the outcome. */}
        <p className="mt-3 text-[15px] md:text-lg text-white/95 max-w-xl mx-auto drop-shadow font-medium leading-relaxed">
          Smart, self-cleaning litter boxes that handle the mess for you —
          so your home stays fresh and your cat stays happy.
        </p>

        {/* Stock / urgency signal — removes "is this in stock?" friction. */}
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          In stock — ships within 24 hours
        </div>

        {/* CTAs: intent-rich primary + low-friction secondary.
            Stacked on mobile so the primary always gets full thumb-width. */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto min-h-[54px] rounded-xl px-8 text-base font-bold bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.25)] hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <Link to="/collections/cat-litter-boxes" className="inline-flex items-center gap-2">
              Shop Smart Litter Boxes
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full sm:w-auto min-h-[54px] rounded-xl px-6 text-base font-semibold bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white"
          >
            <Link to="#how-it-works">See How It Works</Link>
          </Button>
        </div>

        {/* Trust micro-row — concrete numbers beat vague claims. */}
        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs md:text-sm font-medium text-white/90">
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-4 w-4" aria-hidden="true" />
            Free shipping over $35
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            30-day returns
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            ✔ Secure checkout
          </span>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
