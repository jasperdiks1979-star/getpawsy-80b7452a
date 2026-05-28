import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { HeroSectionPremium } from "@/components/home/HeroSectionPremium";
import { getConversionFlag } from "@/lib/conversionFlags";
import {
  shouldUsePersonalization,
  prefetchHomepageVariant,
  getHomepageVariant,
  trackHomepageVariant,
  type HomepageVariant,
} from "@/lib/homepagePersonalization";
import { useCanonical } from "@/components/seo/CanonicalTag";
import { BenefitsSection } from "@/components/home/BenefitsSection";
import { HeroTrustStrip } from "@/components/home/HeroTrustStrip";
import { UsOnlyTrustStrip } from "@/components/home/UsOnlyTrustStrip";
import { CuratedProductSection } from "@/components/home/CuratedProductSection";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SocialProofSection } from "@/components/home/SocialProofSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ProblemSolutionSection } from "@/components/home/ProblemSolutionSection";
import { HomepageFAQ } from "@/components/home/HomepageFAQ";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";
import { StickyMobileCta } from "@/components/home/StickyMobileCta";
import { SoftEmailCapture } from "@/components/email/SoftEmailCapture";
import { ReturningVisitorWelcome } from "@/components/home/ReturningVisitorWelcome";
import {
  DELIVERY_TIME_STANDARD,
  SITE_LAST_UPDATED,
} from "@/lib/shipping-constants";
import { Mail } from "lucide-react";

const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));

/**
 * Maximum bestsellers to surface on the homepage grid.
 * 12 fills three rows of 4 on desktop / six rows of 2 on mobile —
 * enough product breadth without pushing social proof too far down.
 */
const HOMEPAGE_BESTSELLER_LIMIT = 12;

const HomePage = () => {
  useCanonical('/');

  // CI-8 — personalization layer. Default null so first paint stays static
  // and Lighthouse / LCP are unaffected. Variant (if any) applies after
  // hydration via a sessionStorage cache hit or a quick background fetch.
  const [variant, setVariant] = useState<HomepageVariant | null>(() => getHomepageVariant());
  useEffect(() => {
    if (!shouldUsePersonalization()) return;
    if (variant) {
      trackHomepageVariant('impression');
      return;
    }
    let cancelled = false;
    prefetchHomepageVariant().then((v) => {
      if (!cancelled && v) {
        setVariant(v);
        trackHomepageVariant('impression');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  // Pull active bestsellers (ranked) so the homepage stays in sync
  // with whatever the merchandiser promotes — no hard-coded IDs.
  const { data: featuredIds = [] } = useQuery({
    queryKey: ['homepage-featured-bestseller-ids', HOMEPAGE_BESTSELLER_LIMIT],
    queryFn: async () => {
      const { data } = await supabase
        .from('bestsellers')
        .select('product_id, rank')
        .eq('is_active', true)
        .order('rank', { ascending: true })
        .limit(HOMEPAGE_BESTSELLER_LIMIT);
      return (data ?? []).map((b) => b.product_id);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Map block keys -> renderable nodes. Used only when a variant is active;
  // otherwise the legacy static JSX below renders unchanged.
  const heroProps = variant?.hero
    ? {
        headline: variant.hero.headline,
        subheadline: variant.hero.subheadline,
        primaryCta: variant.hero.primaryCta,
        category: variant.hero.category,
      }
    : undefined;

  const blocks = useMemo<Record<string, JSX.Element | null>>(
    () => ({
      hero: getConversionFlag('premiumHero')
        ? <HeroSectionPremium key="hero" {...(heroProps || {})} />
        : <HeroSection key="hero" />,
      benefits: <BenefitsSection key="benefits" />,
      curated: featuredIds.length > 0
        ? <CuratedProductSection
            key="curated"
            title="Popular Picks for Pet Owners"
            subtitle="Our most-loved products, chosen for comfort and everyday use"
            productIds={featuredIds}
          />
        : null,
      social_proof: <SocialProofSection key="social_proof" />,
      email_capture: (
        <section key="email_capture" className={getConversionFlag('premiumNewsletter') ? 'py-10 md:py-14 border-t border-border/30' : 'py-10 md:py-14 bg-muted/20'} aria-label="Newsletter signup">
          <div className="container px-4 md:px-6 max-w-3xl mx-auto">
            {getConversionFlag('premiumNewsletter') && (
              <div className="flex items-center justify-center gap-2 mb-5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Newsletter</span>
              </div>
            )}
            <SoftEmailCapture
              variant="collection"
              headline="Get $5 off your first order"
              description="Join 2,000+ US pet owners getting helpful product picks and care tips. No spam — unsubscribe anytime."
            />
          </div>
        </section>
      ),
      how_it_works: <HowItWorks key="how_it_works" />,
      problem_solution: <ProblemSolutionSection key="problem_solution" />,
      faq: <HomepageFAQ key="faq" />,
      trust: (
        <Suspense key="trust" fallback={null}>
          <TrustTransparencySection />
        </Suspense>
      ),
      final_cta: <FinalCtaSection key="final_cta" />,
    }),
    [heroProps, featuredIds],
  );

  // Personalization path — render blocks in the order the engine chose.
  if (variant && variant.blockOrder?.length) {
    return (
      <Layout>
        <Helmet>
          <title>Smart Pet Essentials | Free US Shipping $35+ | GetPawsy</title>
          <meta
            name="description"
            content="Make pet care easier every day. Smart, practical products for a cleaner home and a happier pet. Free shipping over $35. 30-day returns. Trusted by US pet owners."
          />
        </Helmet>

        {variant.blockOrder.map((key) => blocks[key] ?? null)}

        <section className="py-8 md:py-10 bg-background border-t border-border/30" aria-label="About GetPawsy">
          <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
            <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
              About GetPawsy
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              GetPawsy is a registered pet supply business serving all 50 US states with estimated delivery in {DELIVERY_TIME_STANDARD}.
              We carefully select each product for quality, comfort, and everyday practicality.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-3">
              Last updated: {SITE_LAST_UPDATED}
            </p>
          </div>
        </section>

        <StickyMobileCta />
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Smart Pet Essentials | Free US Shipping $35+ | GetPawsy</title>
        <meta
          name="description"
          content="Make pet care easier every day. Smart, practical products for a cleaner home and a happier pet. Free shipping over $35. 30-day returns. Trusted by US pet owners."
        />
      </Helmet>

      {/* CI-13: quiet welcome strip for visitors with a recent purchase */}
      <ReturningVisitorWelcome />

      {/* 1. Hero — CI-7 premium variant by default, legacy on flag flip. */}
      {getConversionFlag('premiumHero') ? <HeroSectionPremium /> : <HeroSection />}

      {/* 1b/1c. Legacy trust strips — suppressed when the premium hero is on,
          because the premium hero already embeds a calm trust row. Keeps the
          fold quiet for cold TikTok/Pinterest traffic. */}
      {!getConversionFlag('premiumHero') && (
        <>
          <HeroTrustStrip />
          <UsOnlyTrustStrip />
        </>
      )}

      {/* 2. Benefits */}
      <BenefitsSection />

      {/* 3. Featured Products — pulled live from the bestsellers table */}
      {featuredIds.length > 0 && (
        <CuratedProductSection
          title="Popular Picks for Pet Owners"
          subtitle="Our most-loved products, chosen for comfort and everyday use"
          productIds={featuredIds}
        />
      )}

      {/* 4. Social Proof */}
      <SocialProofSection />

      {/* 4b. Email Capture — vang elke bezoeker */}
      <section className="py-10 md:py-14 bg-muted/20" aria-label="Newsletter signup">
        <div className="container px-4 md:px-6 max-w-3xl mx-auto">
          <SoftEmailCapture
            variant="collection"
            headline="Get $5 off your first order"
            description="Join 2,000+ US pet owners getting helpful product picks and care tips. No spam — unsubscribe anytime."
          />
        </div>
      </section>

      {/* 5. How It Works */}
      <HowItWorks />

      {/* 6. Problem → Solution */}
      <ProblemSolutionSection />

      {/* 7. FAQ */}
      <HomepageFAQ />

      {/* 8. Business Transparency */}
      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>

      {/* 9. Final CTA */}
      <FinalCtaSection />

      {/* About — compact */}
      <section className="py-8 md:py-10 bg-background border-t border-border/30" aria-label="About GetPawsy">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
          <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
            About GetPawsy
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            GetPawsy is a registered pet supply business serving all 50 US states with estimated delivery in {DELIVERY_TIME_STANDARD}.
            We carefully select each product for quality, comfort, and everyday practicality.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-3">
            Last updated: {SITE_LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <StickyMobileCta />
    </Layout>
  );
};

export default HomePage;
