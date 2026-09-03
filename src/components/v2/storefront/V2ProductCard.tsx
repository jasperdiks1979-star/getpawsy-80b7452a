import { Link } from 'react-router-dom';

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
  return (
    <article className="group h-full">
      <Link
        to={`/products/${product.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="aspect-square w-full overflow-hidden bg-muted">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              width={480}
              height={480}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{product.name}</h3>
          <p className="mt-auto pt-2 text-base font-semibold text-foreground">{usd.format(product.price)}</p>
        </div>
      </Link>
    </article>
  );
}

export default V2ProductCard;
