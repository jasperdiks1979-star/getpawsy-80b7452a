import { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { FadeInView } from '@/components/ui/FadeInView';
import { SiloBackLinks } from '@/components/seo/SiloBackLinks';

const ProductCard = lazy(() => import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard })));

const DogTraining = () => {
  const { data: products, isLoading } = useQuery({
    queryKey: ['dog-training-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', ['Dog Training', 'Dog Collars & Leashes'])
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
        <title>Dog Training Gear – No-Pull Harnesses & Leashes | GetPawsy</title>
        <meta name="description" content="Shop dog training harnesses, leashes & behavior tools. No-pull designs, reflective stitching, adjustable fit. Estimated delivery: 5–10 business days. 30-day return policy." />
        <link rel="canonical" href="https://getpawsy.pet/collections/all" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <section className="py-16 md:py-20 bg-sand/30">
        <div className="container px-4 md:px-6">
          <FadeInView className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">Dog Training</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight mb-4">
              Dog Training Essentials
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              No-pull harnesses, training leashes, and behavior tools — everything you need to build a better bond with your dog. Estimated delivery: 5–10 business days.
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-medium text-muted-foreground">
              <span>📦 Estimated delivery: 5–10 business days</span>
              <span>🛡️ 30-Day Return Policy</span>
            </div>
          </FadeInView>
        </div>
      </section>

      {/* Content section for SEO depth */}
      <section className="py-12 border-b border-border/40">
        <div className="container px-4 md:px-6 max-w-4xl">
          <h2 className="text-2xl font-display font-bold mb-4">Why Proper Training Gear Matters</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            The right training equipment makes the difference between a frustrating walk and an enjoyable one. Front-clip harnesses redirect pulling force without causing choking or tracheal pressure, making them the preferred choice among certified dog trainers.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Whether you're working on loose-leash walking, recall training, or basic obedience, matching the right tool to your training goal accelerates progress and builds your dog's confidence.
          </p>
        </div>
      </section>

      {/* Products */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <h2 className="text-2xl font-display font-bold mb-8">Dog Training Products</h2>
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

      {/* Silo back-links */}
      <div className="container px-4 md:px-6 max-w-4xl">
        <SiloBackLinks silo="dog" currentPath="/collections/dog" />
      </div>
    </Layout>
  );
};

export default DogTraining;
