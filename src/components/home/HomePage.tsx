import { lazy, Suspense } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { CuratedProductSection } from "@/components/home/CuratedProductSection";

import { WhyGetPawsy } from "@/components/shared/WhyGetPawsy";

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
  return (
    <Layout>
      <Helmet>
        <title>GetPawsy – Premium Pet Products | Fast US Shipping</title>
        <meta
          name="description"
          content="Shop premium pet products at GetPawsy. Top-rated essentials for dogs and cats with fast US shipping and 30-day returns."
        />
        <link rel="canonical" href="https://getpawsy.pet/" />
      </Helmet>

      <HeroSection />

      <CuratedProductSection
        title="Bestsellers — Cat Litter Solutions"
        subtitle="Self-cleaning, enclosed & furniture-style litter boxes"
        productIds={LITTER_BOX_IDS}
      />

      <CuratedProductSection
        title="Cat Trees & Climbing Towers"
        subtitle="Modern, multi-level activity centers for indoor cats"
        productIds={CAT_TREE_IDS}
      />

      <CuratedProductSection
        title="Dog Travel & Comfort"
        subtitle="Strollers, carriers & elevated beds for dogs"
        productIds={DOG_IDS}
      />

      <Suspense fallback={null}>
        <WhyChooseSection />
      </Suspense>

      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>

      <section className="py-10 md:py-14 bg-background border-t border-border/30" aria-label="About GetPawsy">
        <div className="container px-4 md:px-6 max-w-2xl mx-auto text-center">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-4">
            About GetPawsy
          </h2>
          <div className="space-y-2 text-sm md:text-base text-muted-foreground leading-relaxed">
            <p>GetPawsy is operated by Skidzo.</p>
            <p>We focus on modern, practical pet solutions for everyday life.</p>
            <p>All orders are processed securely and shipped within the United States.</p>
            <p>
              Customer support:{' '}
              <a href="mailto:info@getpawsy.pet" className="text-primary hover:underline">
                info@getpawsy.pet
              </a>
            </p>
            <p>We are committed to providing a safe and transparent shopping experience for pet owners.</p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default HomePage;
