import { lazy, Suspense } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { useCanonical } from "@/components/seo/CanonicalTag";
import { BenefitsSection } from "@/components/home/BenefitsSection";
import { CuratedProductSection } from "@/components/home/CuratedProductSection";
import { SocialProofSection } from "@/components/home/SocialProofSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { ProblemSolutionSection } from "@/components/home/ProblemSolutionSection";
import { HomepageFAQ } from "@/components/home/HomepageFAQ";
import { FinalCtaSection } from "@/components/home/FinalCtaSection";
import { StickyMobileCta } from "@/components/home/StickyMobileCta";
import {
  DELIVERY_TIME_STANDARD,
  SITE_LAST_UPDATED,
} from "@/lib/shipping-constants";

const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));

const FEATURED_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f',
  '6b8973ab-a651-4e1d-955f-a3984d1b0229',
  '4cfa9189-9686-4649-b1bf-53fb7ecaa88f',
  '57279fcc-09cb-43a0-84fb-979b32ea6a49',
  '08a62345-c1bc-438b-8169-8a49687c1289',
  'd3f8b8c6-5846-4d38-a39e-b89efe3dca7f',
];

const HomePage = () => {
  useCanonical('/');

  return (
    <Layout>
      <Helmet>
        <title>Smart Pet Essentials | Free US Shipping $35+ | GetPawsy</title>
        <meta
          name="description"
          content="Make pet care easier every day. Smart, practical products for a cleaner home and a happier pet. Free shipping over $35. 30-day returns. Trusted by US pet owners."
        />
      </Helmet>

      {/* 1. Hero */}
      <HeroSection />

      {/* 2. Benefits */}
      <BenefitsSection />

      {/* 3. Featured Products */}
      <CuratedProductSection
        title="Popular Picks for Pet Owners"
        subtitle="Our most-loved products, chosen for comfort and everyday use"
        productIds={FEATURED_IDS}
        ctaLink="/products"
        ctaLabel="View All Products"
      />

      {/* 4. Social Proof */}
      <SocialProofSection />

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
