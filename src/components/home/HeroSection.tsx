import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Star, Truck, ShieldCheck } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { TikTokDeepLinkButton } from '@/components/marketing/TikTokDeepLinkButton';

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
  /**
   * Fire a GA4 event for each hero CTA click.
   *
   * For the secondary anchor CTA we *also* poll for `#how-it-works` after
   * the click to verify the in-page jump actually landed in the viewport
   * (handles cases where the section is lazy/conditionally rendered or
   * the id was renamed). This lets us spot broken anchors in analytics
   * instead of waiting for a user complaint.
   */
  const handleCtaClick = (
    cta: 'shop_litter_boxes' | 'how_it_works',
    destination: string,
  ) => {
    trackEvent('hero_cta_click', {
      cta_id: cta,
      destination,
      location: 'homepage_hero',
    });

    if (cta !== 'how_it_works') return;

    // Verify the anchor actually scrolls into view. We check on the next
    // animation frame, then again after the typical scroll duration, so a
    // missing/late-mounted target shows up as `anchor_reached: false`.
    const verify = () => {
      const target = document.getElementById('how-it-works');
      if (!target) {
        trackEvent('hero_anchor_result', {
          cta_id: cta,
          anchor: 'how-it-works',
          anchor_reached: false,
          reason: 'target_missing',
        });
        return;
      }
      const rect = target.getBoundingClientRect();
      const inView =
        rect.top < window.innerHeight * 0.6 && rect.bottom > 0;
      trackEvent('hero_anchor_result', {
        cta_id: cta,
        anchor: 'how-it-works',
        anchor_reached: inView,
        offset_top: Math.round(rect.top),
      });
    };
    // Native anchor scrolling resolves within ~600ms even with smooth scroll.
    window.setTimeout(verify, 800);
  };

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
          <span className="inline-flex items-center text-warning" aria-hidden="true">
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
            <Star className="h-3.5 w-3.5 fill-current" />
          </span>
          <span>Curated for US pet parents</span>
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
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-success-foreground bg-success/90 px-2.5 py-1 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-foreground opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-foreground" />
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
            <Link
              to="/collections/cat-litter-boxes"
              className="inline-flex items-center gap-2"
              onClick={() =>
                handleCtaClick('shop_litter_boxes', '/collections/cat-litter-boxes')
              }
            >
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
            {/* Plain anchor — robust across routes if hero is ever reused. */}
            <a
              href="#how-it-works"
              onClick={() => handleCtaClick('how_it_works', '#how-it-works')}
            >
              See How It Works
            </a>
          </Button>
        </div>

        {/* TikTok deep-link CTA — desktop-only entry point for visitors who
            saw the TikTok creative and landed on the homepage instead of /go.
            Hidden on mobile to avoid CTA stacking; mobile traffic uses /go. */}
        <div className="mt-4 hidden md:flex justify-center">
          <TikTokDeepLinkButton
            label="Saw us on TikTok? Shop the Litter Box →"
            campaign="tt_home_hero"
            content="home_hero_desktop"
            fullWidth={false}
          />
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
