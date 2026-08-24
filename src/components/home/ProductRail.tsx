import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';

interface Props {
  title: string;
  subtitle?: string;
  /** Filter on products_public.primary_species ('cat' | 'dog'); omit for all */
  species?: 'cat' | 'dog';
  limit?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
}

/**
 * Live product rail — pulls in-stock, active, non-duplicate products straight
 * from the public catalog view so the homepage always shows saleable items.
 * Replaces the old bestsellers-table dependency, which rendered nothing once
 * every curated bestseller went out of stock.
 */
export function ProductRail({
  title,
  subtitle,
  species,
  limit = 8,
  viewAllHref,
  viewAllLabel = 'View all',
}: Props) {
  const { addItem } = useCart();

  const { data: products } = useQuery({
    queryKey: ['home-rail', species ?? 'all', limit],
    queryFn: async () => {
      let q = supabase
        .from('products_public')
        .select('id, name, slug, price, compare_at_price, image_url, stock, primary_species')
        .eq('is_active', true)
        .gt('stock', 0)
        .gte('price', 15)
        // First-Sale Strike: cap the homepage rails at an approachable price
        // band and lead with the most affordable in-stock items. The rails
        // previously sorted price DESC, so a first-time visitor met a $397
        // stroller before anything buyable on impulse.
        .lte('price', 150)
        .not('is_duplicate', 'is', true)
        .order('price', { ascending: true })

        .limit(limit);
      if (species) q = q.eq('primary_species', species);
      const { data } = await q;
      return (data ?? []).filter((p) => p.image_url && p.slug);
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!products || products.length === 0) return null;

  return (
    <section className="py-8 md:py-12" aria-label={title}>
      <div className="container px-4 md:px-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {viewAllHref && (
            <Link
              to={viewAllHref}
              className="shrink-0 text-xs md:text-sm font-semibold text-primary hover:underline"
            >
              {viewAllLabel} →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {products.map((p) => {
            const price = typeof p.price === 'number' ? p.price : Number(p.price) || 0;
            const compare = p.compare_at_price ? Number(p.compare_at_price) : 0;
            return (
              <div key={p.id} className="flex flex-col">
                <Link
                  to={`/products/${p.slug}`}
                  className="group flex flex-col rounded-2xl border border-border/40 bg-card overflow-hidden hover:shadow-md transition-shadow flex-1"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={p.image_url || '/placeholder.svg'}
                      alt={p.name ?? 'Pet product'}
                      width={220}
                      height={220}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="font-semibold text-xs md:text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {p.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-primary">${price.toFixed(2)}</span>
                      {compare > price && (
                        <span className="text-xs line-through text-muted-foreground">
                          ${compare.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Free shipping over $35</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    addItem({
                      id: p.id,
                      slug: p.slug ?? undefined,
                      name: p.name || 'Product',
                      price,
                      image: p.image_url || '/placeholder.svg',
                    })
                  }
                  className="w-full mt-2 py-2.5 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Add to Cart
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ProductRail;
