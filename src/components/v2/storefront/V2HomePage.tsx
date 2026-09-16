import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck, RotateCcw, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { V2Layout } from './V2Layout';
import { V2ProductCard, type V2CardProduct } from './V2ProductCard';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';
const heroDesktop = '/hero/cat-litter-box-hero.webp';
const heroMobile = '/hero/cat-litter-box-hero-mobile.webp';

const HERO_PRODUCT_IDS = [
  'e265e7fe-af60-4efc-b927-5c4f79fc1bf0',
  'b9c0f448-162b-4464-bf36-7697e6fe4852',
  '1b218ab0-19b5-4ae5-a227-8099f2e2f00c',
  '84be6648-7fd6-4b18-bdd7-ff9df7907892',
  '1daefaa0-7892-4760-87a9-0aa34c49c767',
] as const;

const CATEGORIES = [
  { href: '/collections/cat-litter-boxes', title: 'Litter boxes', copy: 'Options for cleaner indoor spaces', image: '/categories/litter-boxes.jpg' },
  { href: '/collections/cat-trees-and-condos', title: 'Cat trees', copy: 'Climbing, resting and scratching spaces', image: '/categories/cat-trees.jpg' },
  { href: '/collections/cats', title: 'Cat toys', copy: 'Play and enrichment for indoor cats', image: '/categories/toys.jpg' },
];

const REASSURANCE = [
  {
    icon: Truck,
    title: `Free shipping over $${FREE_SHIPPING_THRESHOLD}`,
    copy: 'Delivery timing and available shipping options are confirmed at checkout.',
  },
  {
    icon: RotateCcw,
    title: `${RETURN_WINDOW_DAYS}-day returns`,
    copy: 'Return eligible items within the return window.',
  },
  {
    icon: PackageCheck,
    title: 'US warehouse range',
    copy: 'Featured products are selected from the verified US-stock catalog.',
  },
];

function useFeaturedProducts() {
  return useQuery({
    queryKey: ['v2-home-featured', ...HERO_PRODUCT_IDS],
    queryFn: async (): Promise<V2CardProduct[]> => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, price, image_url, stock, is_active, is_duplicate')
        .in('id', [...HERO_PRODUCT_IDS])
        .eq('is_active', true)
        .gt('stock', 0)
        .not('is_duplicate', 'is', true);
      const byId = new Map((data ?? []).map((product) => [String(product.id), product]));
      return HERO_PRODUCT_IDS
        .map((id) => byId.get(id))
        .filter((product): product is NonNullable<typeof product> => Boolean(product))
        .filter((p) => p.slug && p.image_url && typeof p.price === 'number' && Number(p.price) > 0)
        // Never surface sandbox/placeholder fixtures as purchasable products.
        .filter((p) => !/sandbox|placeholder|test-fixture/i.test(`${p.slug} ${p.name}`))
        .map((p) => ({
          id: String(p.id),
          slug: String(p.slug),
          name: String(p.name),
          price: Number(p.price),
          image_url: p.image_url as string,
        }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function V2HomePage() {
  const { data: products = [] } = useFeaturedProducts();

  return (
    <V2Layout>
      <Helmet>
        <title>GetPawsy — Indoor Cat Essentials</title>
        <meta
          name="description"
          content={`Indoor-cat essentials including litter boxes, cat trees and enrichment toys. Free US shipping over $${FREE_SHIPPING_THRESHOLD} and ${RETURN_WINDOW_DAYS}-day returns.`}
        />
        <meta property="og:title" content="GetPawsy — Indoor Cat Essentials" />
        <meta
          property="og:description"
          content="A focused range of litter boxes, cat trees and enrichment products for indoor cats."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* Hero */}
      <section className="border-b border-border bg-card" aria-labelledby="hero-heading">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Indoor cat essentials · US warehouse range
            </p>
            <h1
              id="hero-heading"
              className="mt-3 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl"
            >
              A cleaner home for you and your cat
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Explore our focused range of litter boxes, cat trees and enrichment toys for indoor cats.
              Product pages separate verified supplier facts from details that are not documented.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Shop cat essentials
              </Link>
              <Link
                to="/bundles"
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Explore Sets
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Free shipping over ${FREE_SHIPPING_THRESHOLD} · {RETURN_WINDOW_DAYS}-day returns · Secure checkout
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            <picture>
              <source media="(min-width: 768px)" srcSet={heroDesktop} />
              <img
                src={heroMobile}
                alt="Enclosed cat litter box in a clean indoor space"
                width={1200}
                height={669}
                fetchPriority="high"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-16" aria-labelledby="shop-heading">
        <h2 id="shop-heading" className="font-display text-2xl font-bold text-foreground md:text-3xl">
          Shop for indoor cats
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Browse by the part of your cat's routine you want to support.</p>
        <ul className="mt-6 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <li key={c.href}>
              <Link
                to={c.href}
                className="group block overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <img
                  src={c.image}
                  alt=""
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="p-4">
                  <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.copy}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Featured products — only rendered when the live catalog returns items */}
      {products.length > 0 && (
        <section
          className="border-y border-border bg-muted/25"
          aria-labelledby="featured-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="featured-heading" className="font-display text-2xl font-bold text-foreground md:text-3xl">
                   Five featured essentials
                </h2>
                 <p className="mt-2 text-sm text-muted-foreground">The five hero products selected in our commercial range.</p>
              </div>
              <Link
                to="/products"
                className="inline-flex min-h-[44px] items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                View all products
              </Link>
            </div>
            <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-4">
              {products.map((p, i) => (
                <li key={p.id}>
                  <V2ProductCard product={p} priority={i < 2} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Reassurance */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-16" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="font-display text-2xl font-bold text-foreground md:text-3xl">
          What to expect
        </h2>
        <ul className="mt-6 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {REASSURANCE.map(({ icon: Icon, title, copy }) => (
            <li key={title} className="rounded-xl border border-border bg-card p-5">
              <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Full details on our{' '}
          <Link to="/shipping" className="text-primary hover:underline">
            shipping
          </Link>{' '}
          and{' '}
          <Link to="/returns" className="text-primary hover:underline">
            returns &amp; refunds
          </Link>{' '}
          pages, or{' '}
          <Link to="/contact" className="text-primary hover:underline">
            contact us
          </Link>
          .
        </p>
      </section>
    </V2Layout>
  );
}

export default V2HomePage;
