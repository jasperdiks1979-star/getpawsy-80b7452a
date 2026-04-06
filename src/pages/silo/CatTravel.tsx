import { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { FadeInView } from '@/components/ui/FadeInView';
import { SiloBackLinks } from '@/components/seo/SiloBackLinks';

const ProductCard = lazy(() => import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard })));

const CatTravel = () => {
  const { data: products, isLoading } = useQuery({
    queryKey: ['cat-travel-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', ['Cat Carriers'])
        .order('price', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data || []).map(p => safeProduct(p)).filter((p): p is SafeProduct => p !== null);
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Layout>
      <Helmet>
        <title>Cat Travel Carriers – Airline-Approved & Vet Visit Ready | GetPawsy</title>
        <meta name="description" content="Airline-approved cat carriers, travel bags & anxiety-reducing gear. Mesh ventilation, top-loading access. US 5–10 day shipping. 30-day return policy." />
        <link rel="canonical" href="https://getpawsy.pet/collections/cats" />
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      <section className="py-16 md:py-20 bg-sand/30">
        <div className="container px-4 md:px-6">
          <FadeInView className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">Cat Travel</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight mb-4">
              Cat Travel Essentials
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              Airline-approved carriers, expandable travel bags, and anxiety-reducing accessories — making vet visits and travel easier for you and your cat. Shipping available across the US.
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-medium text-muted-foreground">
              <span>📦 US Shipping Available</span>
              <span>🛡️ 30-Day Return Policy</span>
            </div>
          </FadeInView>
        </div>
      </section>

      <section className="py-12 border-b border-border/40">
        <div className="container px-4 md:px-6 max-w-4xl">
          <h2 className="text-2xl font-display font-bold mb-4">Choosing the Right Cat Carrier</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Most cats experience travel anxiety, making carrier selection critical. Top-loading carriers allow you to lower an anxious cat in rather than forcing them through a front door. Mesh ventilation on three or more sides provides airflow and lets your cat see their surroundings.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            For airline travel, verify your carrier meets standard under-seat dimensions (typically 17" × 11" × 7.5"). A familiar blanket with your scent inside reduces stress significantly during transit.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container px-4 md:px-6">
          <h2 className="text-2xl font-display font-bold mb-8">Cat Travel Products</h2>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading products...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <Suspense fallback={null}>
                {products?.map(product => (
                  <ProductCard key={product.id} product={product as any} />
                ))}
              </Suspense>
            </div>
          )}
        </div>
      </section>

      <div className="container px-4 md:px-6 max-w-4xl">
        <SiloBackLinks silo="cat" currentPath="/collections/cat" />
      </div>
    </Layout>
  );
};

export default CatTravel;
