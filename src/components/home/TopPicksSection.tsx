import { Link } from 'react-router-dom';
import { getProductDiscount } from '@/lib/discount';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import { Button } from '@/components/ui/button';
import { FadeInView } from '@/components/ui/FadeInView';
import { SITE_URL } from '@/lib/constants';
import { Helmet } from 'react-helmet-async';
import {
  useEligibleProducts,
  diversify,
  productUrl,
  type EligibleProduct,
} from '@/lib/catalog-eligibility';

/**
 * "Top Picks" — live, catalog-driven product cards.
 * Source of truth: products_public via the shared promotion eligibility contract.
 * A product that goes inactive, zero-stock or duplicate disappears here on the
 * next query — no code deploy required.
 */

const MAX_PICKS = 20;

function TopPicksJsonLd({ products }: { products: EligibleProduct[] }) {
  if (!products.length) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Top Picks for Pet Parents',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}${productUrl(p.slug)}`,
      name: p.name,
    })),
  };
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

export function TopPicksSection() {
  const { data, isLoading } = useEligibleProducts({ limit: 40 });
  const products = diversify(data ?? [], MAX_PICKS);

  // No eligible products → hide the section entirely (never render dead cards).
  if (!isLoading && products.length === 0) return null;

  return (
    <section className="py-16 md:py-20">
      <TopPicksJsonLd products={products} />
      <div className="container px-4 md:px-6">
        <FadeInView className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-2">
              Top Picks for Pet Parents
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl">
              In-stock products for dogs and cats — verified availability, US shipping
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2 rounded-full shrink-0">
            <Link to="/products">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </FadeInView>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 overflow-hidden">
                <div className="aspect-square bg-muted animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-5">
            {products.map((product, idx) => {
              // Merchant-safe: compare_at_price is a synthetic anchor, so no
              // strikethrough price and no discount badge may be shown.
              const discount = getProductDiscount(product.price, product.compare_at_price).percent ?? 0;
              return (
                <a
                  key={product.id}
                  href={productUrl(product.slug)}
                  className="group block bg-card rounded-xl border border-border/50 overflow-hidden shadow-soft hover:shadow-soft-lg transition-all duration-300 hover:-translate-y-1"
                  data-seo-slot={`top-pick-${idx}`}
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <img
                      src={product.image_url || '/placeholder.svg'}
                      alt={product.name}
                      loading={idx < 5 ? 'eager' : 'lazy'}
                      decoding="async"
                      width={300}
                      height={300}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                    />
                    {discount > 0 && (
                      <span className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
                        -{discount}%
                      </span>
                    )}
                    {product.primary_species && (
                      <span className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm text-[10px] font-medium px-1.5 py-0.5 rounded capitalize text-muted-foreground">
                        {product.primary_species === 'dog' ? '🐕 Dog' : '🐈 Cat'}
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                    {product.category && (
                      <p className="text-[10px] text-muted-foreground truncate">{product.category}</p>
                    )}
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-foreground">${product.price.toFixed(2)}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default TopPicksSection;
