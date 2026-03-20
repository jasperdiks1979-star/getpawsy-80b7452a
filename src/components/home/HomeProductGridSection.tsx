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
 * SEO-safe homepage product grid with CTA buttons on each card.
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
    <section className="py-10 md:py-14" data-seo-section={trackingKey}>
      <div className="container px-4 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="text-muted-foreground text-sm mt-1 max-w-lg">{subtitle}</p>
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {products.map((product, idx) => (
            <a
              key={product.id}
              href={`/product/${product.slug}`}
              className="group flex flex-col rounded-xl border border-border/50 bg-card overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
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
              <div className="p-3 flex flex-col flex-1">
                {product.category && (
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                    {product.category}
                  </span>
                )}
                <h3 className="font-semibold text-xs md:text-sm text-foreground line-clamp-2 leading-snug mb-auto group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-primary font-bold text-sm">
                    ${product.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HomeProductGridSection;
