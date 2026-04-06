import { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { FadeInView } from '@/components/ui/FadeInView';
import { SiloBackLinks } from '@/components/seo/SiloBackLinks';
import { useCanonical } from '@/components/seo/CanonicalTag';

const ProductCard = lazy(() => import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard })));

const CatTraining = () => {
  useCanonical('/collections/cats');
  const { data: products, isLoading } = useQuery({
    queryKey: ['cat-training-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', ['Cat Trees & Condos', 'Cat Scratching Posts', 'Cat Toys', 'Cat Furniture'])
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
        <title>Cat Enrichment & Training – Trees, Posts & Toys | GetPawsy</title>
        <meta name="description" content="Cat trees, scratching posts, interactive toys & enrichment furniture. Keep indoor cats active and happy. US 5–10 day shipping. 30-day return policy." /><meta name="robots" content="noindex, follow" />
      </Helmet>

      <section className="py-16 md:py-20 bg-sand/30">
        <div className="container px-4 md:px-6">
          <FadeInView className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">Cat Training</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight mb-4">
              Cat Enrichment & Training
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              Cat trees, scratching posts, puzzle feeders, and interactive toys — everything indoor cats need to stay active, healthy, and happy. Shipping to the US in 5–10 business days.
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-medium text-muted-foreground">
              <span>📦 US Shipping 5–10 Days</span>
              <span>🛡️ 30-Day Return Policy</span>
            </div>
          </FadeInView>
        </div>
      </section>

      <section className="py-12 border-b border-border/40">
        <div className="container px-4 md:px-6 max-w-4xl">
          <h2 className="text-2xl font-display font-bold mb-4">Why Enrichment Prevents Behavior Problems</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Indoor cats without proper enrichment are prone to obesity, anxiety, and destructive scratching. A cat tree provides essential vertical territory, while scratching posts protect your furniture by satisfying natural claw-sharpening instincts.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Interactive toys that mimic prey movement stimulate hunting behavior and provide the mental stimulation that keeps indoor cats engaged. Veterinarians recommend 15–20 minutes of interactive play daily.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container px-4 md:px-6">
          <h2 className="text-2xl font-display font-bold mb-8">Cat Enrichment & Training Products</h2>
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

export default CatTraining;
