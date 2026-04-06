import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { SITE_URL } from '@/lib/constants';
import { ChevronRight, Clock, Loader2 } from 'lucide-react';
import { OptimizedImage } from '@/components/ui/optimized-image';

export default function RecentProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['recent-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, price, image_url, category, created_at')
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const canonicalUrl = `${SITE_URL}/recent-products`;

  return (
    <Layout>
      <Helmet>
        <title>Recently Added Pet Products | GetPawsy</title>
        <meta name="description" content="Discover the latest pet products added to GetPawsy. New dog toys, cat trees, beds, carriers and more — updated daily. Free shipping on qualifying orders." /><meta name="robots" content="index, follow" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Recent Products</span>
        </nav>

        <header className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-6 h-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Recently Added Products</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl text-base">
            The newest arrivals in our pet supply catalog. Updated daily with fresh dog and cat products, shipped to customers across the United States.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products?.map((product) => (
              <Link
                key={product.id}
                to={`/product/${product.slug || product.id}`}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md hover:border-primary/30 transition-all"
              >
                <div className="aspect-square bg-muted overflow-hidden">
                  <img
                    src={product.image_url!}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    width={300}
                    height={300}
                  />
                </div>
                <div className="p-3">
                  <h2 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                    {product.name}
                  </h2>
                  <p className="text-sm font-bold text-foreground mt-1">${product.price?.toFixed(2)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <section className="border-t border-border pt-8 mt-12">
          <h2 className="text-lg font-bold text-foreground mb-4">Explore More</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Link to="/products" className="text-primary hover:underline">All Products</Link>
            <Link to="/trending-pet-products" className="text-primary hover:underline">Trending Products</Link>
            <Link to="/guides" className="text-primary hover:underline">Pet Care Guides</Link>
            <Link to="/shop" className="text-primary hover:underline">Shop Hub</Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
