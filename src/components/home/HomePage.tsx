import { lazy, Suspense } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { useCanonical } from "@/components/seo/CanonicalTag";
import { TrustBadgesBlock } from "@/components/shared/TrustBadgesBlock";
import { CuratedProductSection } from "@/components/home/CuratedProductSection";
import { CrawlBoostLinks } from "@/components/home/CrawlBoostLinks";
import { WhyGetPawsy } from "@/components/shared/WhyGetPawsy";
import { HomepageFAQ } from "@/components/home/HomepageFAQ";
import { HomepageGuideLinks } from "@/components/home/HomepageGuideLinks";
import { HomepageCollectionHub } from "@/components/home/HomepageCollectionHub";
import {
  SUPPORT_EMAIL,
  DELIVERY_TIME_STANDARD,
  SITE_LAST_UPDATED,
} from "@/lib/shipping-constants";

const WhyChooseSection = lazy(() => import("@/components/home/WhyChooseSection").then(m => ({ default: m.default ?? m.WhyChooseSection })));
const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));

const LITTER_BOX_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f',
  'fe5ed2d6-0230-4c5a-8313-235a28ef4f21',
  '1a1302e7-939f-4c94-96b7-d4e0c9d34a37',
  '501e9150-42e0-42d7-8031-a7225a718558',
];

const CAT_TREE_IDS = [
  '133cdc48-0117-40d5-9aaf-1a81131ca9bb',
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
        <title>Best Cat Trees & Cat Condos (2026) | Large Cats Approved | GetPawsy</title>
        <meta
          name="description"
          content="Shop the best cat trees and cat condos for large and active cats. Stable, durable and vet-approved designs with fast US shipping. 30-day returns."
        />
      </Helmet>

      <HeroSection />

      {/* SEO crawl-boost: static anchor links above the fold */}
      <CrawlBoostLinks />

      <div className="container px-4 md:px-6">
        <TrustBadgesBlock />
      </div>

      <CuratedProductSection
        title="Best Cat Trees & Climbing Towers"
        subtitle="Modern, sturdy cat trees and condos for large and active indoor cats"
        productIds={CAT_TREE_IDS}
      />

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

      {/* Collection Hub — authority links to key category pages */}
      <HomepageCollectionHub />

      <div className="container px-4 md:px-6 py-8">
        <WhyGetPawsy />
      </div>

      {/* Expert Guides — crawlable guide links for authority flow */}
      <HomepageGuideLinks />

      <Suspense fallback={null}>
        <WhyChooseSection />
      </Suspense>

      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>

      <HomepageFAQ />

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
              Every product is carefully selected for quality, safety, and real-world usability.
              We focus on practical pet solutions that make life easier for pet owners.
            </p>
            <p>
               Customer support:{' '}
               <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline" aria-label="Email customer support">
                 {'support' + '@' + 'getpawsy.pet'}
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
