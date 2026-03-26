import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';

const getSupabase = () => import('@/integrations/supabase/client').then(m => m.supabase);

const TOP_SLUGS = [
  'flower-cat-tree-no-shipments-on-weekends',
  '60l-automatic-cat-litter-box-smart-app-control-deodorizing-infrared-sensor-128e',
  '63-large-dog-crate-furniture-for-double-dog-wooden-dog-kennel-with-2-drawers-ecef',
  'dog-stroller-pet-stroller',
  '4-6-in-dark-gray-cat-tree-tower-with-wide-base-3-large-hinding-condo-11-sisal-b460',
  'dog-bed-pet-sofa',
  'pawhut-cat-litter-box-enclosure-with-tall-legs-scratching-board-dark-brown',
  'dog-cot-cooling-pet-bed-3',
];

interface TopProduct {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
}

/**
 * Crawlable "Top Products" grid for homepage.
 * Renders real <a href="/product/..."> links visible in raw HTML.
 */
export function TopProductsGrid() {
  const { data: products } = useQuery<TopProduct[]>({
    queryKey: ['homepage-top-products'],
    queryFn: async () => {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, slug, image_url, price')
        .in('slug', TOP_SLUGS)
        .eq('is_active', true);
      if (error) throw error;
      // Preserve curated order
      const bySlug = new Map((data ?? []).map(p => [p.slug, p]));
      return TOP_SLUGS.map(s => bySlug.get(s)).filter(Boolean) as TopProduct[];
    },
    staleTime: 15 * 60 * 1000,
  });

  if (!products || products.length < 3) return null;

  return (
    <section className="py-10 md:py-12">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-6">
          Top Products
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {products.slice(0, 8).map((p) => (
            <a
              key={p.id}
              href={`/product/${p.slug}`}
              className="group block rounded-xl border border-border/40 bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="aspect-square bg-muted overflow-hidden">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
                  {p.name}
                </h3>
                <span className="text-sm font-bold text-primary">${p.price.toFixed(2)}</span>
              </div>
            </a>
          ))}
        </div>
        <div className="text-center mt-5">
          <a
            href="/products"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Browse All Products →
          </a>
        </div>
      </div>
    </section>
  );
}

export default TopProductsGrid;
