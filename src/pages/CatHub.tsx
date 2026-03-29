import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { safeProduct, SafeProduct } from '@/lib/safe-render';
import { FadeInView } from '@/components/ui/FadeInView';
import { CAT_SILO } from '@/lib/silo-config';

const ProductCard = lazy(() => import('@/components/products/ProductCard').then(m => ({ default: m.ProductCard })));

const CatHub = () => {
  const { data: products, isLoading } = useQuery({
    queryKey: ['cat-hub-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,image_url,price,compare_at_price,category,stock,is_active,created_at,updated_at')
        .eq('is_active', true)
        .in('category', CAT_SILO.categories)
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
        <title>Cat Trees, Carriers & Essentials – US Shipping | GetPawsy</title>
        <meta name="description" content="Shop cat trees, carriers, enrichment toys & scratching posts. Estimated delivery: 5–10 business days. 30-day return policy." />
        <link rel="canonical" href="https://getpawsy.pet/collections/all" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      {/* Hero */}
      <section className="py-16 md:py-20 bg-sand/30">
        <div className="container px-4 md:px-6">
          <FadeInView className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80 mb-3">Cat Training & Travel</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight mb-4">
              Cat Training & Travel Essentials
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed mb-6">
              Cat trees, enrichment toys, airline-approved carriers & scratching posts — shipping to customers in the United States.
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-medium text-muted-foreground">
              <span>📦 US Shipping 5–10 Days</span>
              <span>🛡️ 30-Day Return Policy</span>
              <span>🔒 Secure Checkout</span>
            </div>
          </FadeInView>
        </div>
      </section>

      {/* Silo Navigation — links ONLY within cat silo */}
      <section className="py-12 border-b border-border/40">
        <div className="container px-4 md:px-6">
          <h2 className="text-2xl font-display font-bold mb-6">Explore Cat Categories</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: CAT_SILO.training.label, href: CAT_SILO.training.href, desc: CAT_SILO.training.desc },
              { title: CAT_SILO.travel.label, href: CAT_SILO.travel.href, desc: CAT_SILO.travel.desc },
              ...CAT_SILO.subCollections.map(c => ({ title: c.label, href: c.href, desc: c.desc })),
              { title: 'Training & Travel Guide 2026', href: CAT_SILO.pillar.href, desc: 'Expert buyer guide' },
            ].map(item => (
              <Link
                key={item.href}
                to={item.href}
                className="group bg-card rounded-2xl border border-border/40 p-6 hover:border-primary/30 hover:shadow-soft transition-all"
              >
                <h3 className="font-display font-bold text-foreground group-hover:text-primary transition-colors mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <h2 className="text-2xl font-display font-bold mb-8">Cat Training & Travel Products</h2>
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
          <div className="text-center mt-10">
            <Link
              to="/collections/cat"
              className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold border border-border hover:border-primary/30 transition-colors"
            >
              View All Cat Products →
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default CatHub;
