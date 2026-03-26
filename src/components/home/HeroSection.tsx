import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import heroDesktop from '@/assets/hero-lifestyle.jpg';
import heroMobile from '@/assets/hero-lifestyle-mobile.jpg';

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
          Premium Pet Essentials, Delivered Fast in the US
        </h1>
        <p className="mt-3 text-base md:text-lg text-white/95 max-w-xl mx-auto drop-shadow">
          Top-rated products for dogs &amp; cats — fast US shipping and easy returns.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto rounded-full px-12 py-3.5 text-base font-bold bg-primary text-primary-foreground shadow-lg hover:brightness-110 hover:scale-[1.03] active:scale-[0.98] transition-all duration-150"
          >
            <Link to="/bestsellers">Shop Bestsellers</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto rounded-full px-10 py-3.5 text-base font-semibold bg-white text-foreground border border-border shadow-md hover:bg-muted hover:shadow-lg active:scale-[0.98] transition-all duration-150"
          >
            <Link to="/products">View All Products</Link>
          </Button>
        </div>

        <p className="mt-3 text-xs text-white/70 tracking-wide">Popular items sell out weekly</p>

        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs md:text-sm font-medium text-white">
          <span className="inline-flex items-center gap-1.5">✔ Free US shipping over $35</span>
          <span className="inline-flex items-center gap-1.5">✔ 30-day returns</span>
          <span className="inline-flex items-center gap-1.5">✔ Secure checkout</span>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
