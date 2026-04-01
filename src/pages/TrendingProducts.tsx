import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { SITE_URL } from '@/lib/constants';
import { ChevronRight, TrendingUp, Loader2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

type SortOption = 'newest' | 'price-low' | 'price-high' | 'updated';

export default function TrendingProducts() {
  const [sort, setSort] = useState<SortOption>('newest');

  const { data: products, isLoading } = useQuery({
    queryKey: ['trending-products', sort],
    queryFn: async () => {
      let query = supabase
        .from('products_public')
        .select('id, name, slug, price, image_url, category, created_at, updated_at')
        .eq('is_active', true)
        .not('image_url', 'is', null);

      switch (sort) {
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'price-low':
          query = query.order('price', { ascending: true });
          break;
        case 'price-high':
          query = query.order('price', { ascending: false });
          break;
        case 'updated':
          query = query.order('updated_at', { ascending: false });
          break;
      }

      const { data } = await query.limit(80);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const canonicalUrl = `${SITE_URL}/trending-pet-products`;
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'newest', label: 'Newest' },
    { value: 'updated', label: 'Recently Updated' },
    { value: 'price-low', label: 'Price: Low → High' },
    { value: 'price-high', label: 'Price: High → Low' },
  ];

  return (
    <Layout>
      <Helmet>
        <title>Trending Pet Products 2026 | GetPawsy</title>
        <meta name="description" content="Shop trending pet products at GetPawsy. Discover popular dog toys, cat trees, beds, and more. Sorted by what's hot — updated daily. Free shipping available." />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Trending Products</span>
        </nav>

        <header className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Trending Pet Products</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl text-base">
            The most popular dog and cat products right now. Updated daily with what pet parents are loving.
          </p>
        </header>

        {/* Sort Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          {sortOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={sort === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSort(opt.value)}
              className="rounded-full text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>

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
          <h2 className="text-lg font-bold text-foreground mb-4">Discover More</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Link to="/products" className="text-primary hover:underline">All Products</Link>
            <Link to="/recent-products" className="text-primary hover:underline">Recent Products</Link>
            <Link to="/guides" className="text-primary hover:underline">Pet Care Guides</Link>
            <Link to="/bestsellers" className="text-primary hover:underline">Bestsellers</Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
