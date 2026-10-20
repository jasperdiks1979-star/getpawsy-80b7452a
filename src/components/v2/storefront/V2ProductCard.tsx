import { Link } from 'react-router-dom';
import { useListingPrice } from '@/hooks/useListingPrice';
import { ArrowUpRight } from 'lucide-react';
import { displayName } from '@/lib/displayName';

export interface V2CardProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  image_url: string | null;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Product card for the V2 storefront. Shows only verifiable data:
 * name, current price, image. No ratings, no compare-at price, no urgency.
 */
export function V2ProductCard({ product, priority = false }: { product: V2CardProduct; priority?: boolean }) {
  const lp = useListingPrice({ id: product.id, price: product.price });
  const shown = lp === 'loading' ? '\u00a0' : lp ? `${lp.isRange ? 'From ' : ''}${usd.format(lp.price)}` : usd.format(product.price);
  return (
    <article className="group h-full">
      <Link
        to={`/products/${product.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="aspect-square w-full overflow-hidden bg-muted">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={displayName(product)}
              width={480}
              height={480}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="h-full w-full" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <h3 title={displayName(product)} className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-foreground">{displayName(product)}</h3>
          <p className="mt-auto pt-2 text-base font-semibold text-foreground">{shown}</p>
          <span className="flex items-center justify-between gap-2 text-xs font-medium text-primary">View options <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></span>
        </div>
      </Link>
    </article>
  );
}

export default V2ProductCard;
