import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { trackHomepageVariant } from '@/lib/homepagePersonalization';
import { getConversionFlag } from '@/lib/conversionFlags';

// Public-dir hero images so index.html preload tags still hit (no Vite hash).
const heroDesktop = '/hero/cat-litter-box-hero.webp';
const heroMobile = '/hero/cat-litter-box-hero-mobile.webp';

/**
 * CI-7 — Premium DTC homepage hero.
 *
 * Design intent (mobile-first @ 390-440px):
 * - ONE emotional headline. Two-line Apple-style cadence — calm, not pain-led.
 * - ONE primary CTA pointing at the top-winning category (litter boxes).
 * - Hairline trust row under the CTA — concrete, no badges or ping dots.
 * - No secondary CTA, no urgency animation, no marketplace chips above the
 *   fold. The previous hero shipped a star pill, a green ping, two buttons
 *   and a TikTok deep-link button — all of that competes with the headline.
 *
 * The layout, image, alt text, preload targets, link destinations and the
 * single H1 are intentionally preserved so SEO, LCP and routing are stable.
 * Flipping `premiumHero` to false in conversionFlags reverts to the legacy
 * <HeroSection /> with zero side-effects.
 */
export interface HeroSectionPremiumProps {
  headline?: string | null;
  subheadline?: string | null;
  primaryCta?: string | null;
  /** Category slug for the primary CTA destination. */
  category?: string | null;
}

export function HeroSectionPremium({
  headline,
  subheadline,
  primaryCta,
  category,
}: HeroSectionPremiumProps = {}) {
  const heroCategory = category || 'cat-litter-boxes';
  const heroHref = `/collections/${heroCategory}`;
  const aboveFoldV2 = getConversionFlag('premiumHomeAboveFold');
  const handlePrimary = () => {
    trackEvent('hero_cta_click', {
      cta_id: 'shop_litter_boxes',
      destination: heroHref,
      location: 'homepage_hero',
      variant: 'premium',
    });
    trackHomepageVariant('hero_click');
  };

  return (
    <section className="relative w-full overflow-hidden" aria-label="Homepage hero">
      <picture>
        <source media="(min-width: 768px)" srcSet={heroDesktop} />
        <img
          src={heroMobile}
          alt="Modern self-cleaning cat litter box in a calm, clean home"
          width={750}
          height={1000}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </picture>

      {/* Softer, more editorial gradient — preserves photo presence,
          keeps copy legible without the heavy black-out of the legacy hero. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/10" />

      <div className="relative z-10 container px-5 md:px-6 py-16 md:py-32 lg:py-40 text-center">
        {/* Single editorial eyebrow — sets brand register, not a coupon. */}
        <p className="text-[11px] md:text-xs font-medium uppercase tracking-[0.22em] text-white/85">
          Smart essentials for modern pet homes
        </p>

        {/* H1 — calm, emotional, two-beat cadence. Single H1 on the page. */}
        {headline ? (
          <h1 className="mt-4 text-[30px] leading-[1.1] sm:text-5xl md:text-6xl lg:text-[64px] font-display font-semibold text-white max-w-2xl mx-auto tracking-tight">
            {headline}
          </h1>
        ) : (
          <h1 className="mt-4 text-[30px] leading-[1.1] sm:text-5xl md:text-6xl lg:text-[64px] font-display font-semibold text-white max-w-2xl mx-auto tracking-tight">
            A cleaner home.
            <span className="block text-white/90 font-normal">A happier cat.</span>
          </h1>
        )}

        {/* Sub — solution + outcome, one sentence, generous line-height. */}
        <p className={
          aboveFoldV2
            ? "mt-5 text-[15px] md:text-[17px] text-white/80 max-w-md mx-auto leading-relaxed"
            : "mt-5 text-[15px] md:text-lg text-white/85 max-w-lg mx-auto leading-relaxed"
        }>
          {subheadline ||
            'Self-cleaning litter boxes designed for the way you live — quiet, modern, and made to disappear into your home.'}
        </p>

        {/* Single primary CTA. Generous tap target, calm shadow, no scale bounce. */}
        <div className="mt-8 flex justify-center">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto min-h-[54px] rounded-full px-8 text-base font-semibold bg-white text-foreground hover:bg-white/95 shadow-[0_8px_28px_-8px_rgba(0,0,0,0.45)] transition-colors duration-200"
          >
            <Link
              to={heroHref}
              className="inline-flex items-center gap-2"
              onClick={handlePrimary}
            >
              {primaryCta || 'Shop Litter Boxes'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {/* Hairline trust row — three concrete signals, dot-separated.
            No icons (icons add visual weight and read as badge clutter on mobile). */}
        <p className="mt-6 text-[11px] md:text-xs font-medium tracking-wider uppercase text-white/75 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <span>Free U.S. shipping over $35</span>
          <span aria-hidden="true" className="opacity-60">·</span>
          <span>30-day returns</span>
          <span aria-hidden="true" className="opacity-60">·</span>
          <span>Free shipping on eligible orders $35+</span>
        </p>
      </div>
    </section>
  );
}

export default HeroSectionPremium;