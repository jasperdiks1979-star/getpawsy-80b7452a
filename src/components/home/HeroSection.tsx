import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import heroDesktop from '@/assets/hero-lifestyle.jpg';
import heroMobile from '@/assets/hero-lifestyle-mobile.jpg';

/**
 * Premium lifestyle hero — single CTA, trust row, social proof.
 * LCP-optimized with art-directed <picture>.
 */
export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      {/* Background image with overlay */}
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

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />

      {/* Content */}
      <div className="relative z-10 container px-4 md:px-6 py-20 md:py-32 lg:py-40 text-center">
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-tight max-w-2xl mx-auto drop-shadow-lg">
          Premium Pet Essentials for Dogs &amp; Cats — Fast US Delivery
        </h1>
        <p className="mt-3 text-base md:text-lg text-white/90 max-w-xl mx-auto drop-shadow">
          Trusted by pet owners across the United States. Fast shipping, easy returns, and reliable quality.
        </p>

        <div className="mt-6">
          <Button
            asChild
            size="lg"
            className="rounded-full px-10 py-3 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
          >
            <Link to="/bestsellers">Shop Bestsellers</Link>
          </Button>
        </div>

        {/* Trust bullets */}
        <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs md:text-sm text-white/90">
          <span className="inline-flex items-center gap-1.5">✔ Free US shipping on orders over $35</span>
          <span className="inline-flex items-center gap-1.5">✔ 30-day easy returns</span>
          <span className="inline-flex items-center gap-1.5">✔ Secure checkout (Stripe, PayPal, Apple Pay)</span>
          <span className="inline-flex items-center gap-1.5">✔ Ships from US-based fulfillment partners</span>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
