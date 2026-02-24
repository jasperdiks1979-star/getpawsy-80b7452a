import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';

interface GridProduct {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
  category?: string | null;
}

interface HomeProductGridSectionProps {
  title: string;
  subtitle?: string;
  products: GridProduct[];
  trackingKey: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}

/**
 * SEO-safe homepage product grid.
 * 
 * Contract:
 * - Renders raw <a href="/product/..."> (not onClick-only navigation)
 * - Links present in initial HTML for crawl discovery
 * - Each card: image + h3 title + price
 */
export function HomeProductGridSection({
  title,
  subtitle,
  products,
  trackingKey,
  seeAllHref,
  seeAllLabel = 'View All',
}: HomeProductGridSectionProps) {
  if (products.length === 0) return null;

  return (
    <section className="py-14 md:py-16" data-seo-section={trackingKey}>
      <div className="container px-4 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="text-muted-foreground text-base mt-1 max-w-xl">{subtitle}</p>
            )}
          </div>
          {seeAllHref && (
            <a
              href={seeAllHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline shrink-0"
            >
              {seeAllLabel}
              <ArrowRight className="w-4 h-4" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {products.map((product, idx) => (
            <a
              key={product.id}
              href={`/product/${product.slug}`}
              className="group block rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
              data-seo-slot={`${trackingKey}-${idx}`}
            >
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={product.image_url || '/placeholder.svg'}
                  alt={product.name}
                  width={400}
                  height={400}
                  loading={idx < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                />
              </div>
              <div className="p-3 md:p-4">
                {product.category && (
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide block mb-1">
                    {product.category}
                  </span>
                )}
                <h3 className="font-semibold text-sm md:text-base text-foreground line-clamp-2 leading-snug mb-1.5 group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                <span className="text-primary font-bold text-sm md:text-base">
                  ${product.price.toFixed(2)}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HomeProductGridSection;
