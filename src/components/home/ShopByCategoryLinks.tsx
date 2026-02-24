import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

interface SeoCollection {
  id: string;
  slug: string;
  name: string;
}

/**
 * Compact "Shop by Category" link grid for mid-page crawl discovery.
 * Renders 8–12 real <a href="/collections/..."> links.
 */
export function ShopByCategoryLinks() {
  const { data: collections } = useQuery<SeoCollection[]>({
    queryKey: ['homepage-seo-collections-links'],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('seo_collections')
        .select('id, slug, name')
        .order('name', { ascending: true })
        .limit(16);
      if (error) throw error;
      return data || [];
    },
    staleTime: 15 * 60 * 1000,
  });

  const items = useMemo(() => (collections || []).slice(0, 12), [collections]);

  if (items.length < 3) return null;

  if (items.length < 6) {
    console.warn(`ShopByCategoryLinks: only ${items.length} collections (target: 6+)`);
  }

  return (
    <section className="py-10 md:py-12 bg-muted/30" data-seo-section="category-discovery">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-center mb-6">
          Shop by Category
        </h2>
        <div className="flex flex-wrap justify-center gap-2 md:gap-3">
          {items.map((col) => (
            <a
              key={col.id}
              href={`/collections/${col.slug}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors duration-200"
            >
              {col.name}
            </a>
          ))}
        </div>
        <div className="text-center mt-5">
          <a
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Browse All Products
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export default ShopByCategoryLinks;
