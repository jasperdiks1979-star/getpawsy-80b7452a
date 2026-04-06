import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
// Use public directory images so index.html preload tags work (no Vite hash)
const heroDesktop = '/hero/dog-training-hero-desktop.webp';
const heroMobile = '/hero/dog-training-hero-mobile.webp';

/**
 * Conversion-focused hero — dual CTA, compact trust row.
 * LCP-optimized with art-directed <picture>.
 */
export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      <picture>
        <source media="(min-width: 768px)" srcSet={heroDesktop} />
        <img
          src={heroMobile}
          alt="Happy dog and cat relaxing together in a cozy home"
          width={750}
          height={1000}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>

      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/25" />

      <div className="relative z-10 container px-4 md:px-6 py-16 md:py-28 lg:py-36 text-center">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-tight max-w-2xl mx-auto drop-shadow-lg">
          Premium Pet Products for Dogs &amp; Cats
        </h1>
        <p className="mt-3 text-base md:text-lg text-white/95 max-w-xl mx-auto drop-shadow font-medium">
          Fast US Shipping &bull; Secure Checkout &bull; Trusted Quality
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto min-h-[52px] rounded-xl px-10 text-base font-bold bg-primary text-white shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:brightness-110 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200"
          >
            <Link to="/products">Shop All Products</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto min-h-[52px] rounded-xl px-8 text-base font-bold border-2 border-primary bg-white text-foreground hover:bg-primary/10 transition-all duration-200"
          >
            <Link to="/collections/cats">Shop Cat Essentials</Link>
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm font-medium text-white/90">
          <span className="inline-flex items-center gap-1.5">✔ Free shipping over $35</span>
          <span className="inline-flex items-center gap-1.5">✔ 30-day returns</span>
          <span className="inline-flex items-center gap-1.5">✔ Secure checkout</span>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
