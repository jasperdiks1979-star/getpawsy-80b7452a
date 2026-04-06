import { lazy, Suspense } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { useCanonical } from "@/components/seo/CanonicalTag";
import { TrustBadgesBlock } from "@/components/shared/TrustBadgesBlock";
import { CategoryEntryCards } from "@/components/home/CategoryEntryCards";
import { CuratedProductSection } from "@/components/home/CuratedProductSection";
import { HomepageGuideLinks } from "@/components/home/HomepageGuideLinks";
import { HomepageFAQ } from "@/components/home/HomepageFAQ";
import { FreeShippingBanner } from "@/components/home/FreeShippingBanner";
import { StickyMobileCta } from "@/components/home/StickyMobileCta";
import {
  DELIVERY_TIME_STANDARD,
  SITE_LAST_UPDATED,
} from "@/lib/shipping-constants";

const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));

const CUSTOMER_FAVORITES_IDS = [
  '133cdc48-0117-40d5-9aaf-1a81131ca9bb',
  '11758292-6f06-492c-88a7-0acdeb5e417e',
  '352ddb8f-89f6-41b1-86b8-25af8ab1adb1',
  '07507c96-a445-431f-9724-340ee01d818f',
  '08a62345-c1bc-438b-8169-8a49687c1289',
  '128e0207-8a94-4d71-b428-5b7f5002528f',
];

const LITTER_BOX_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f',
  'fe5ed2d6-0230-4c5a-8313-235a28ef4f21',
  '1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
  '501e9150-42e0-42d7-8031-a7225a718558',
];

const DOG_IDS = [
  '0381585e-8b6b-48a8-b541-c7298f99b0c9',
  '18028997-901a-40b8-8790-9e7b3ec558bf',
  'c7177ee4-5509-492f-965f-617402968f5c',
];

const HomePage = () => {
  useCanonical('/');

  return (
    <Layout>
      <Helmet>
        <title>Pet Products for Dogs & Cats | Fast US Shipping | GetPawsy</title>
        <meta
          name="description"
          content="Shop premium cat trees, litter boxes, dog beds and travel essentials at GetPawsy. Free shipping over $35. 30-day returns. Trusted by US pet owners."
        />
      </Helmet>

      {/* 1. Hero */}
      <HeroSection />

      {/* 2. Category cards */}
      <CategoryEntryCards />

      {/* 3. Customer Favorites — dominant product block */}
      <CuratedProductSection
        title="🔥 Most Loved by Pet Owners"
        subtitle="Top picks — limited availability"
        productIds={CUSTOMER_FAVORITES_IDS}
      />

      {/* 4. Category product sections */}
      <CuratedProductSection
        title="Top Cat Litter Box Solutions"
        subtitle="Self-cleaning, enclosed & furniture-style litter boxes"
        productIds={LITTER_BOX_IDS}
      />

      <CuratedProductSection
        title="Dog Travel & Comfort Essentials"
        subtitle="Strollers, carriers & elevated beds for dogs"
        productIds={DOG_IDS}
      />

      {/* 5. Free Shipping CTA */}
      <FreeShippingBanner />

      {/* 6. Trust badges */}
      <div className="container px-4 md:px-6">
        <TrustBadgesBlock />
      </div>

      {/* 7. Expert Guides */}
      <HomepageGuideLinks />

      {/* 8. Social Proof */}
      <section className="py-8 md:py-10 bg-muted/30 border-t border-border/30" aria-label="Trust block">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-2">
            Trusted by Pet Owners Across the US
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Thousands of pet owners trust GetPawsy for quality and reliability — backed by our 30-day return policy.
          </p>
        </div>
      </section>

      {/* 9. Business Transparency */}
      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>

      {/* 10. FAQ */}
      <HomepageFAQ />

      {/* About — compact */}
      <section className="py-8 md:py-10 bg-background border-t border-border/30" aria-label="About GetPawsy">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
          <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
            About GetPawsy
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            GetPawsy is a US-focused pet supply store serving all 50 states with estimated delivery in {DELIVERY_TIME_STANDARD}.
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
