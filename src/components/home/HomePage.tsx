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

const CAT_TREE_IDS = [
  '42eb633a-5a59-4b27-a512-4291b85fda86', // 102" Floor to Ceiling Cat Tree
  '6b8973ab-a651-4e1d-955f-a3984d1b0229', // Cat Tree w/ Litter Box Enclosure
  '4cfa9189-9686-4649-b1bf-53fb7ecaa88f', // Moon & Star Cat Tree
  '08a62345-c1bc-438b-8169-8a49687c1289', // Cactus Cat Tree
  '22c97654-a505-489f-bf96-81d4ceb17d71', // Gothic Cat Tree
  'addf38e5-5190-4a64-bdd4-12a791f8c5fc', // Hanging Cat Tree
];

const CUSTOMER_FAVORITES_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f', // Self-Cleaning Litter Box
  '6b8973ab-a651-4e1d-955f-a3984d1b0229', // Cat Tree w/ Litter Box Enclosure
  '8a7cad9a-edfb-443d-a8c8-dad93a349c66', // Elevated Cooling Dog Bed
  '4cfa9189-9686-4649-b1bf-53fb7ecaa88f', // Moon & Star Cat Tree
  '57279fcc-09cb-43a0-84fb-979b32ea6a49', // Memory Foam Pet Bed
  'd3f8b8c6-5846-4d38-a39e-b89efe3dca7f', // Dog Puzzle Toy
  '08a62345-c1bc-438b-8169-8a49687c1289', // Cactus Cat Tree
  'b5f53c36-d5c3-4c87-a182-7ef80d56819a', // Top Entry Litter Box
];

const LITTER_BOX_IDS = [
  '128e0207-8a94-4d71-b428-5b7f5002528f', // Self-Cleaning
  'fe5ed2d6-0230-4c5a-8313-235a28ef4f21', // Enclosed Litter Box
  '1a1302e7-939f-4c94-96b7-d4e0c9d34a37', // Smart Litter Box
  '501e9150-42e0-42d7-8031-a7225a718558', // XL Litter Box
  'b5f53c36-d5c3-4c87-a182-7ef80d56819a', // Top Entry
  '142bb614-8ed6-4b65-a552-d5e146a8f4a1', // Stainless Litter Box
  '175ad360-d7ee-40ad-bbdf-b714cb596635', // Dome Covered
  '71f38863-6b7c-4f23-86a4-7f9d0dbcac8e', // Hooded w/ Lid
];

const DOG_IDS = [
  '0381585e-8b6b-48a8-b541-c7298f99b0c9', // Pet Carrier Backpack
  'c7177ee4-5509-492f-965f-617402968f5c', // Elevated Cooling Dog Bed
  'fc17c0f8-8e31-4990-a762-d4a9ee4587e9', // Elevated w/ Canopy
  'be546356-901f-4a0d-9096-3317da3d313e', // Cooling Dog Bed Mesh
  '57279fcc-09cb-43a0-84fb-979b32ea6a49', // Memory Foam Pet Bed
  '84cd536c-9651-485a-aabf-cf7c388cb744', // Orthopedic Round Bed
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
        title="Best Cat Trees & Condos"
        subtitle="Scratching posts, climbing towers & cozy condos for cats"
        productIds={CAT_TREE_IDS}
      />

      <CuratedProductSection
        title="Dog Travel & Comfort Essentials"
        subtitle="Elevated beds, carriers & cooling cots for dogs"
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
