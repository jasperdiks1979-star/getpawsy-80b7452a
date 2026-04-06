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
import {
  SUPPORT_EMAIL,
  DELIVERY_TIME_STANDARD,
  SITE_LAST_UPDATED,
} from "@/lib/shipping-constants";

const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));

const LITTER_BOX_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f',
  'fe5ed2d6-0230-4c5a-8313-235a28ef4f21',
  '1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
  '501e9150-42e0-42d7-8031-a7225a718558',
];

const CAT_TREE_IDS = [
  '133cdc48-0117-4…d5-9aaf-1a81131ca9bb',
  '11758292-6f06-492c-88a7-0acdeb5e417e',
  '352ddb8f-89f6-41b1-86b8-25af8ab1adb1',
  '07507c96-a445-431f-9724-340ee01d818f',
  '08a62345-c1bc-438b-8169-8a49687c1289',
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

      {/* 1. Hero — H1 + CTAs + trust bar */}
      <HeroSection />

      {/* 2. Category Push — 5 real categories */}
      <CategoryEntryCards />

      {/* 3. Trust Badges — shipping, returns, checkout, trusted */}
      <div className="container px-4 md:px-6">
        <TrustBadgesBlock />
      </div>

      {/* 4. Customer Favorites — bestseller products */}
      <CuratedProductSection
        title="Customer Favorites"
        subtitle="Top-rated products chosen by pet owners across the US"
        productIds={CAT_TREE_IDS}
      />

      {/* 5. More product sections */}
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

      {/* 6. Urgency — Free Shipping CTA */}
      <FreeShippingBanner />

      {/* 7. Expert Guides — SEO money-flow links */}
      <HomepageGuideLinks />

      {/* 8. Social Proof */}
      <section className="py-10 md:py-14 bg-muted/30 border-t border-border/30" aria-label="Trust block">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-3">
            Trusted by Pet Owners Across the US
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Thousands of pet owners trust GetPawsy for quality, comfort, and reliability.
            Every product is hand-selected for real-world usability and backed by our 30-day return policy.
          </p>
        </div>
      </section>

      {/* 9. Business Transparency — GMC compliance */}
      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>

      {/* 10. FAQ */}
      <HomepageFAQ />

      {/* 11. About */}
      <section className="py-10 md:py-14 bg-background border-t border-border/30" aria-label="About GetPawsy">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-4">
            About GetPawsy
          </h2>
          <div className="space-y-2 text-sm md:text-base text-muted-foreground leading-relaxed">
            <p>
              GetPawsy is a US-focused pet supply store dedicated to quality products
              for dogs, cats, and small animals. We serve customers across all 50 states with
              estimated delivery in {DELIVERY_TIME_STANDARD}.
            </p>
            <p>
              Customer support:{' '}
              <a href="/contact" className="text-primary hover:underline" aria-label="Contact customer support">
                Contact us
              </a>{' '}
              — we respond within 24 hours.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-4">
              Last updated: {SITE_LAST_UPDATED}
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default HomePage;
