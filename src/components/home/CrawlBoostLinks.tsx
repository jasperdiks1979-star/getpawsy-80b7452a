/**
 * CrawlBoostLinks — crawlable internal discovery links.
 *
 * Category/hub links are static non-product routes (safe).
 * Product links are pulled live from products_public through the shared
 * eligibility contract, bounded to a small set, so a deactivated or
 * zero-stock product is never promoted to crawlers.
 */

import { useEligibleProducts, diversify, productUrl } from '@/lib/catalog-eligibility';

const CATEGORY_LINKS = [
  { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos' },
  { href: '/collections/cat-litter-boxes', label: 'Cat Litter Boxes' },
  { href: '/collections/dog-beds', label: 'Dog Beds' },
  { href: '/collections/dogs', label: 'Shop Dogs' },
  { href: '/collections/cats', label: 'Shop Cats' },
  { href: '/bestsellers', label: 'Bestsellers' },
  { href: '/products', label: 'All Products' },
  { href: '/guides', label: 'Expert Guides' },
] as const;

/** Bounded: never turn this into an invisible link farm. */
const MAX_PRODUCT_LINKS = 6;

export function CrawlBoostLinks() {
  const { data } = useEligibleProducts({ limit: 24 });
  const picks = diversify(data ?? [], MAX_PRODUCT_LINKS);

  return (
    <>
      {/* Shop by Category — crawlable anchor links */}
      <nav className="py-6 md:py-8 border-b border-border/30" aria-label="Shop by Category">
        <div className="container px-4 md:px-6">
          <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-3">
            Shop by Category
          </h2>
          <div className="flex flex-wrap gap-2 md:gap-3">
            {CATEGORY_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex items-center px-4 py-2 rounded-full bg-muted text-sm font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Popular Picks — live, in-stock products only */}
      {picks.length > 0 && (
        <section className="py-6 md:py-8" aria-label="Popular Picks">
          <div className="container px-4 md:px-6">
            <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
              Popular Picks
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {picks.map((p) => (
                <li key={p.id}>
                  <a
                    href={productUrl(p.slug)}
                    className="block p-3 rounded-xl border border-border/50 bg-muted/30 hover:bg-primary/5 hover:border-primary/30 transition-colors group"
                  >
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {p.name}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1">
                      {p.category ? `${p.category} — ` : ''}In stock, ships to the US · ${p.price.toFixed(2)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
