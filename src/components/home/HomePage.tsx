import { lazy, Suspense } from "react";
import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

const BestsellersSection = lazy(() => import("@/components/home/BestsellersSection").then(m => ({ default: m.BestsellersSection })));
const ShopByCategoryLinks = lazy(() => import("@/components/home/ShopByCategoryLinks").then(m => ({ default: m.default ?? m.ShopByCategoryLinks })));
const TrustTransparencySection = lazy(() => import("@/components/home/TrustTransparencySection").then(m => ({ default: m.default ?? m.TrustTransparencySection })));
const FeaturedProductsSection = lazy(() => import("@/components/home/FeaturedProductsSection").then(m => ({ default: m.default ?? m.FeaturedProductsSection })));

const HomePage = () => {
  return (
    <Layout>
      <Helmet>
        <title>GetPawsy – Premium Pet Products | Fast US Shipping</title>
        <meta
          name="description"
          content="Shop premium pet products at GetPawsy. Innovative solutions for dogs and cats with fast US shipping and 30-day returns."
        />
        <link rel="canonical" href="https://getpawsy.pet/" />
      </Helmet>

      <Suspense fallback={null}>
        <BestsellersSection />
      </Suspense>

      <Suspense fallback={null}>
        <ShopByCategoryLinks />
      </Suspense>

      <Suspense fallback={null}>
        <FeaturedProductsSection />
      </Suspense>

      <Suspense fallback={null}>
        <TrustTransparencySection />
      </Suspense>
    </Layout>
  );
};

export default HomePage;
