import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { CollectionTrustBar } from '@/components/seo/CollectionTrustBar';
import { Truck, ShieldCheck, BadgeCheck, Star } from 'lucide-react';
import { getCanonicalCardPrice } from '@/lib/canonical-pricing';

export type BestLanderConfig = {
  slug: string;
  category: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
  collectionHref: string;
};

export function BestCategoryLander({ config }: { config: BestLanderConfig }) {
  const canonical = `https://getpawsy.pet/${config.slug}`;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['best-lander', config.category],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('products_public')
        .select('id, slug, name, price, compare_at_price, image_url, category, stock, shipping_score, is_us_warehouse, is_fast_shipping')
        .eq('active', true)
        .eq('category', config.category)
        .gt('stock', 0)
        .order('shipping_score', { ascending: false, nullsFirst: false })
        .limit(12);
      if (error) throw error;
      return data || [];
    },
  });

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: config.h1,
    itemListElement: products.slice(0, 10).map((p: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://getpawsy.pet/products/${p.slug}`,
      name: p.name,
    })),
  };

  return (
    <Layout>
      <Helmet>
        <title>{config.title}</title>
        <meta name="description" content={config.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={config.title} />
        <meta property="og:description" content={config.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(itemListJsonLd)}</script>
      </Helmet>

      <main className="container px-4 md:px-6 py-8 md:py-12">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-primary">Home</Link>
          <span className="mx-1">/</span>
          <span>{config.h1}</span>
        </nav>

        <header className="max-w-3xl mb-6">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">{config.h1}</h1>
          <p className="mt-3 text-base text-muted-foreground">{config.intro}</p>
        </header>

        <CollectionTrustBar />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 text-sm">
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
            <Truck className="w-4 h-4 text-primary" />
            <span><strong>Fast US shipping</strong> — most orders ship in ≤7 days from US warehouses.</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span><strong>Secure checkout</strong> — encrypted payments, no hidden fees.</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
            <BadgeCheck className="w-4 h-4 text-primary" />
            <span><strong>Satisfaction guarantee</strong> — 30-day return window on every order.</span>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading top picks…</p>}

        {!isLoading && products.length > 0 && (
          <>
            <h2 className="text-xl md:text-2xl font-display font-bold mb-4">Top-rated picks, ranked by shipping speed &amp; availability</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((p: any, idx: number) => {
                const price = getCanonicalCardPrice(p).price;
                return (
                  <article key={p.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                    <Link to={`/products/${p.slug}`} className="block">
                      <div className="aspect-square bg-muted overflow-hidden">
                        <img
                          src={p.image_url || '/placeholder.svg'}
                          alt={p.name}
                          loading={idx < 4 ? 'eager' : 'lazy'}
                          decoding="async"
                          width={300}
                          height={300}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-primary transition-colors">{p.name}</h3>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-primary/80">
                          <Star className="w-3 h-3 fill-current" />
                          <span>{p.is_us_warehouse ? 'Ships from US' : 'In stock'}</span>
                        </div>
                        <p className="text-sm font-bold text-primary mt-1">${price.toFixed(2)}</p>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              <Link
                to={config.collectionHref}
                className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Browse the full {config.category} collection
              </Link>
            </div>
          </>
        )}

        {!isLoading && products.length === 0 && (
          <p className="text-sm text-muted-foreground">
            We're restocking — meanwhile, browse the full{' '}
            <Link to={config.collectionHref} className="text-primary underline">{config.category} collection</Link>.
          </p>
        )}
      </main>
    </Layout>
  );
}

export const BEST_LANDERS: Record<string, BestLanderConfig> = {
  'best-dog-toys': {
    slug: 'best-dog-toys',
    category: 'Dog Toys',
    h1: 'Best Dog Toys (2026)',
    title: 'Best Dog Toys 2026 — Tested Picks, Fast US Shipping | GetPawsy',
    description: 'Our top-rated dog toys for 2026, ranked by shipping speed, stock, and customer fit. Fast US shipping, secure checkout, 30-day returns.',
    intro: 'A curated shortlist of the most reliable dog toys in our catalog — chosen for durability, safety and how fast we can get them on your doorstep.',
    collectionHref: '/collections/dog-toys',
  },
  'best-cat-trees': {
    slug: 'best-cat-trees',
    category: 'Cat Trees & Condos',
    h1: 'Best Cat Trees & Condos (2026)',
    title: 'Best Cat Trees & Condos 2026 — Sturdy Picks, US Shipping | GetPawsy',
    description: 'Top cat trees and condos for 2026 — sturdy multi-level designs, sisal scratching posts, and fast US shipping.',
    intro: 'Our most-recommended cat trees and condos, hand-ranked for stability, footprint and how quickly we can ship them from US warehouses.',
    collectionHref: '/collections/cat-trees-and-condos',
  },
  'best-cat-litter-boxes': {
    slug: 'best-cat-litter-boxes',
    category: 'Cat Litter Boxes',
    h1: 'Best Cat Litter Boxes (2026)',
    title: 'Best Cat Litter Boxes 2026 — Self-Cleaning & Enclosed | GetPawsy',
    description: 'Top-rated cat litter boxes for 2026 — self-cleaning, enclosed, and odor-controlled picks with fast US shipping.',
    intro: 'From smart self-cleaning units to discreet enclosures — these are the litter boxes our customers reorder for and that ship fastest from the US.',
    collectionHref: '/collections/cat-litter-boxes',
  },
  'best-dog-beds': {
    slug: 'best-dog-beds',
    category: 'Dog Beds',
    h1: 'Best Dog Beds (2026)',
    title: 'Best Dog Beds 2026 — Orthopedic & Cooling Picks | GetPawsy',
    description: 'Best dog beds for 2026 — orthopedic memory foam, cooling cots, and bolstered designs. Fast US shipping and 30-day returns.',
    intro: 'Orthopedic, cooling and bolstered dog beds — ranked by joint support, durability and how fast they ship from our US warehouse partners.',
    collectionHref: '/collections/dog-beds',
  },
  'best-dog-collars': {
    slug: 'best-dog-collars',
    category: 'Dog Collars & Leashes',
    h1: 'Best Dog Collars & Leashes (2026)',
    title: 'Best Dog Collars & Leashes 2026 — Comfort & Control | GetPawsy',
    description: 'Top dog collars and leashes for 2026 — padded, reflective, and no-pull designs. Fast US shipping and secure checkout.',
    intro: 'A trusted shortlist of collars and leashes — chosen for comfort, control, and visibility, with the fastest US shipping in our catalog.',
    collectionHref: '/collections/dog-collars-and-leashes',
  },
};

export function BestDogToysLander() { return <BestCategoryLander config={BEST_LANDERS['best-dog-toys']} />; }
export function BestCatTreesLander() { return <BestCategoryLander config={BEST_LANDERS['best-cat-trees']} />; }
export function BestCatLitterBoxesLander() { return <BestCategoryLander config={BEST_LANDERS['best-cat-litter-boxes']} />; }
export function BestDogBedsLander() { return <BestCategoryLander config={BEST_LANDERS['best-dog-beds']} />; }
export function BestDogCollarsLander() { return <BestCategoryLander config={BEST_LANDERS['best-dog-collars']} />; }

export default BestCategoryLander;