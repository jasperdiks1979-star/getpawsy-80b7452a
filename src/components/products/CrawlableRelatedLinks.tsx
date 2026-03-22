import { Link } from 'react-router-dom';

interface RelatedProduct {
  id: string;
  name: string;
  slug?: string | null;
  price?: number;
  category?: string | null;
}

interface CrawlableRelatedLinksProps {
  products: RelatedProduct[];
  currentCategory?: string | null;
}

/**
 * SEO-critical: static crawlable <a> links to related products.
 * Supplements the JS-only carousel so crawlers discover product-to-product links.
 */
export function CrawlableRelatedLinks({ products, currentCategory }: CrawlableRelatedLinksProps) {
  if (!products || products.length === 0) return null;

  const categorySlug = currentCategory
    ? currentCategory.toLowerCase().replace(/\s+/g, '-')
    : null;

  return (
    <nav aria-label="Related products" className="mt-10 border-t border-border/40 pt-8">
      <h3 className="text-lg font-display font-semibold text-foreground mb-4">
        More Products You Might Like
      </h3>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
        {products.slice(0, 8).map((p) => (
          <li key={p.id}>
            <Link
              to={`/product/${p.slug || p.id}`}
              className="text-sm text-primary hover:underline line-clamp-1"
            >
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
      {categorySlug && (
        <div className="mt-4">
          <Link
            to={`/collections/${categorySlug}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View all {currentCategory} products →
          </Link>
        </div>
      )}
    </nav>
  );
}
