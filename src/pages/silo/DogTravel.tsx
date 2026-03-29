import { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { FadeInView } from '@/components/ui/FadeInView';
import { SiloBackLinks } from '@/components/seo/SiloBackLinks';

const ProductCard = lazy(() => import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard })));

const DogTravel = () => {
  const { data: products, isLoading } = useQuery({
    queryKey: ['dog-travel-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', ['Dog Carriers', 'Dog Training'])
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
        <title>Dog Travel Safety Gear – Car Seats & Carriers | GetPawsy</title>
        <meta name="description" content="Crash-tested dog car seats, travel carriers, harnesses & back seat hammocks. Keep your dog safe on every trip. US 5–10 day shipping." />
        <link rel="canonical" href="https://getpawsy.pet/collections/all" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <section className="py-16 md:py-20 bg-sand/30">
        <div className="container px-4 md:px-6">
          <FadeInView className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">Dog Travel</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight mb-4">
              Dog Travel Safety Gear
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              Crash-tested car seats, travel carriers, safety harnesses, and back seat hammocks — because your dog deserves safe travel too. Shipping to the US in 5–10 business days.
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
          <h2 className="text-2xl font-display font-bold mb-4">Why Dog Travel Safety Matters</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            An unrestrained 60-pound dog in a 35 mph crash generates approximately 2,700 pounds of force. Proper travel restraint protects your dog, your passengers, and prevents dangerous distractions while driving.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            From short vet visits to cross-country road trips, the right travel gear reduces anxiety and keeps everyone safe. Look for crash-tested products with Center for Pet Safety (CPS) certification.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container px-4 md:px-6">
          <h2 className="text-2xl font-display font-bold mb-8">Dog Travel Products</h2>
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
        <SiloBackLinks silo="dog" currentPath="/collections/dog" />
      </div>
    </Layout>
  );
};

export default DogTravel;
