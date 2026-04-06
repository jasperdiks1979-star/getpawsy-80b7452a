import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { getTrustLabel } from '@/lib/trust-labels';

interface Props {
  title: string;
  subtitle?: string;
  productIds: string[];
}

/**
 * Curated product grid — fetches specific products by ID, filters to in-stock only.
 */
export function CuratedProductSection({ title, subtitle, productIds }: Props) {
  const { addItem } = useCart();

  const { data: products } = useQuery({
    queryKey: ['curated-products', productIds],
    queryFn: async () => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, price, compare_at_price, image_url, stock')
        .in('id', productIds)
        .eq('is_active', true);

      if (!data) return [];

      // Filter in-stock: fulfillment model — only explicit 0 is out of stock
      const inStock = data.filter(
        (p) => p.stock !== 0
      );
      return productIds
        .map((id) => inStock.find((p) => p.id === id))
        .filter(Boolean) as typeof inStock;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!products || products.length === 0) return null;

  return (
    <section className="py-8 md:py-12">
      <div className="container px-4 md:px-6">
        <div className="mb-5">
          <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {products.map((p, idx) => {
            const price = typeof p.price === 'number' ? p.price : 0;
            return (
              <div key={p.id} className="flex flex-col">
                <Link
                  to={`/product/${p.slug}`}
                  className="group flex flex-col rounded-2xl border border-border/40 bg-card overflow-hidden hover:shadow-md transition-shadow flex-1"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={p.image_url || '/placeholder.svg'}
                      alt={p.name}
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
                    <p className="text-[10px] text-primary/80 font-medium mt-1">{getTrustLabel(p.id, idx)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-primary">
                        ${price.toFixed(2)}
                      </span>
                      {p.compare_at_price &&
                        Number(p.compare_at_price) > price && (
                          <span className="text-xs line-through text-muted-foreground">
                            ${Number(p.compare_at_price).toFixed(2)}
                          </span>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Free shipping over $35
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() =>
                    addItem({
                      id: p.id,
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

export default CuratedProductSection;
