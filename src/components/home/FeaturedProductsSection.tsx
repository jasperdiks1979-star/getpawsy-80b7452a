import { Link } from 'react-router-dom';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ELIGIBLE_SELECT,
  eligibleForPromotion,
  fetchEligibleProducts,
  diversify,
  productUrl,
  type EligibleProduct,
} from '@/lib/catalog-eligibility';

/**
 * Featured Products — editorial pinning with live validation.
 *
 * PREFERRED_SLUGS is an optional editorial preference, never a source of truth.
 * Every preferred slug is validated against products_public with the shared
 * eligibility contract; anything unavailable is skipped and backfilled from the
 * live catalog. A dead/stale slug can therefore never render a card.
 */
const PREFERRED_SLUGS: string[] = [
  'automatic-cat-litter-box-self-cleaning-app-control',
  '44-multi-level-cat-tree-with-spacious-top-perch-2-door-condo-hammock-for-indoor-0441',
  'extra-large-stainless-steel-litter-box-enclosed-cat-litter-box-with-scoop-deodorizer-bag-sand-drop-p',
];

const TARGET = 6;

/** Non-product evergreen links — safe static routes (collections/guides only). */
const STATIC_LINKS = [
  {
    name: 'Cat Trees & Condos',
    path: '/collections/cat-trees-and-condos',
    description: 'Browse all cat trees, towers, and condos for climbing and scratching.',
  },
  {
    name: 'Dog Beds & Cots',
    path: '/collections/dog-beds',
    description: 'Cooling, orthopedic, and elevated dog beds for every breed.',
  },
] as const;

async function fetchFeatured(): Promise<EligibleProduct[]> {
  const pinned: EligibleProduct[] = [];
  if (PREFERRED_SLUGS.length) {
    const { data } = await supabase
      .from('products_public')
      .select(ELIGIBLE_SELECT)
      .in('slug', PREFERRED_SLUGS)
      .eq('is_active', true)
      .gt('stock', 0)
      .not('is_duplicate', 'is', true);
    const valid = ((data ?? []) as EligibleProduct[]).filter(eligibleForPromotion);
    // Preserve editorial order, drop anything ineligible.
    for (const slug of PREFERRED_SLUGS) {
      const hit = valid.find((p) => p.slug === slug);
      if (hit) pinned.push(hit);
    }
  }

  if (pinned.length >= TARGET) return pinned.slice(0, TARGET);

  // Backfill from the live catalog (one extra bounded query).
  const pool = await fetchEligibleProducts({ limit: 40 });
  const seen = new Set(pinned.map((p) => p.id));
  const backfill = diversify(pool.filter((p) => !seen.has(p.id)), TARGET - pinned.length);
  return [...pinned, ...backfill];
}

export function FeaturedProductsSection() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['featured-products-live'],
    queryFn: fetchFeatured,
    staleTime: 5 * 60 * 1000,
  });

  if (!isLoading && products.length === 0) return null;

  return (
    <section className="py-10 md:py-12">
      <div className="container px-4 md:px-6">
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground text-center mb-2">
          Featured Products & Collections
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-lg mx-auto">
          In-stock picks from the live GetPawsy catalog.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-5xl mx-auto">
          {products.map((item) => (
            <Link
              key={item.id}
              to={productUrl(item.slug)}
              className="group flex flex-col rounded-xl border border-border/50 bg-card overflow-hidden hover:shadow-md transition-shadow duration-300"
            >
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={item.image_url || '/placeholder.svg'}
                  alt={item.name}
                  width={300}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                />
              </div>

              <div className="p-3 flex flex-col flex-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                  {item.category || 'Product'}
                </span>
                <h3 className="font-semibold text-xs md:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1">
                  {item.name}
                </h3>
                <p className="text-[11px] text-muted-foreground mb-2">
                  ${item.price.toFixed(2)}
                </p>
                <span className="text-xs font-medium text-primary mt-auto inline-flex items-center gap-1">
                  View Details
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          ))}

          {STATIC_LINKS.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="group flex flex-col justify-center rounded-xl border border-border/50 bg-card p-4 hover:shadow-md transition-shadow duration-300"
            >
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                Collection
              </span>
              <h3 className="font-semibold text-xs md:text-sm text-foreground group-hover:text-primary transition-colors mb-1">
                {link.name}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                {link.description}
              </p>
              <span className="text-xs font-medium text-primary inline-flex items-center gap-1">
                Browse <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeaturedProductsSection;
