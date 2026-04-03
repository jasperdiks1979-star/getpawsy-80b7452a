/**
 * CrawlBoostLinks — Static HTML anchor links for SEO crawl signal boost.
 * Renders real <a href> links (not React Router <Link>) to ensure
 * Googlebot discovers these URLs in raw HTML without JS execution.
 *
 * ONLY links to collections with 3+ products or high-authority hubs.
 */

const CATEGORY_LINKS = [
  { href: '/collections/cat-trees-and-condos', label: 'Cat Trees & Condos' },
  { href: '/collections/cat-litter-boxes', label: 'Cat Litter Boxes' },
  { href: '/collections/dog-beds', label: 'Dog Beds' },
  { href: '/guides/dog-travel-essentials-guide', label: 'Dog Travel Guide' },
  { href: '/collections/dogs', label: 'Shop Dogs' },
  { href: '/collections/cats', label: 'Shop Cats' },
  { href: '/bestsellers', label: 'Bestsellers' },
  { href: '/products', label: 'All Products' },
  { href: '/guides', label: 'Expert Guides' },
] as const;

const FEATURED_PRODUCT = {
  href: '/product/automatic-cat-litter-box-self-cleaning-app-control',
  title: 'Automatic Self-Cleaning Cat Litter Box',
  description: 'Smart app-controlled litter box with infrared sensor, deodorizing system and multi-cat support. Our #1 bestseller.',
};

export function CrawlBoostLinks() {
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

      {/* Popular Pick — featured product link */}
      <section className="py-6 md:py-8" aria-label="Popular Pick">
        <div className="container px-4 md:px-6">
          <h2 className="text-lg md:text-xl font-display font-bold text-foreground mb-2">
            Popular Pick
          </h2>
          <a
            href={FEATURED_PRODUCT.href}
            className="block p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-primary/5 hover:border-primary/30 transition-colors group"
          >
            <span className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
              {FEATURED_PRODUCT.title}
            </span>
            <span className="block text-sm text-muted-foreground mt-1">
              {FEATURED_PRODUCT.description}
            </span>
          </a>
        </div>
      </section>
    </>
  );
}
