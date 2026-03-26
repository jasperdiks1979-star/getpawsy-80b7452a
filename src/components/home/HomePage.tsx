import { lazy, Suspense } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { RecentOrdersSection } from "@/components/home/RecentOrdersSection";

const BestsellersSection = lazy(() => import("@/components/home/BestsellersSection").then(m => ({ default: m.BestsellersSection })));
const ShopByCategoryLinks = lazy(() => import("@/components/home/ShopByCategoryLinks").then(m => ({ default: m.default ?? m.ShopByCategoryLinks })));
const WhyChooseSection = lazy(() => import("@/components/home/WhyChooseSection").then(m => ({ default: m.default ?? m.WhyChooseSection })));
const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));

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

      {/* 1. Hero — dual CTA, compact trust */}
      <HeroSection />

      {/* 2. Recently ordered — social proof strip */}
      <RecentOrdersSection />

      {/* 3. Bestsellers — products visible immediately */}
      <Suspense fallback={null}>
        <BestsellersSection />
      </Suspense>

      {/* 4. Shop by pet type — 4 category cards */}
      <Suspense fallback={null}>
        <ShopByCategoryLinks />
      </Suspense>

      {/* 5. Compact trust strip — 3 blocks */}
      <Suspense fallback={null}>
        <WhyChooseSection />
      </Suspense>

      {/* 6. Business transparency */}
      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>
    </Layout>
  );
};

export default HomePage;
