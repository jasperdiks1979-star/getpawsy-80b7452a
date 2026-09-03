import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Truck, RotateCcw, Lock, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { V2Layout } from './V2Layout';
import { V2ProductCard, type V2CardProduct } from './V2ProductCard';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
  SUPPORT_EMAIL,
  RESPONSE_TIME,
} from '@/lib/shipping-constants';
import heroDesktop from '@/assets/hero-lifestyle-desktop.webp';
import heroMobile from '@/assets/hero-lifestyle-mobile.webp';
import catImage from '@/assets/category-cats.jpg';
import dogImage from '@/assets/category-dogs.jpg';
import bestsellerImage from '@/assets/category-bestsellers.jpg';

const CATEGORIES = [
  { href: '/collections/cat', title: 'For cats', copy: 'Litter boxes, trees & scratchers', image: catImage },
  { href: '/collections/dog', title: 'For dogs', copy: 'Beds, travel gear & walking', image: dogImage },
  { href: '/bestsellers', title: 'Best sellers', copy: 'Most popular this season', image: bestsellerImage },
];

const REASSURANCE = [
  {
    icon: Truck,
    title: `Free shipping over $${FREE_SHIPPING_THRESHOLD}`,
    copy: `Estimated delivery ${DELIVERY_TIME_STANDARD}.`,
  },
  {
    icon: RotateCcw,
    title: `${RETURN_WINDOW_DAYS}-day returns`,
    copy: 'Return eligible items within the return window.',
  },
  {
    icon: Lock,
    title: 'Secure checkout',
    copy: 'Payments are encrypted and processed by Stripe.',
  },
  {
    icon: Mail,
    title: 'Real support',
    copy: `Email ${SUPPORT_EMAIL}. ${RESPONSE_TIME}.`,
  },
];

function useFeaturedProducts(limit = 8) {
  return useQuery({
    queryKey: ['v2-home-featured', limit],
    queryFn: async (): Promise<V2CardProduct[]> => {
      const { data } = await supabase
        .from('products_public')
        .select('id, name, slug, price, image_url, stock, is_active, is_duplicate')
        .eq('is_active', true)
        .gt('stock', 0)
        .not('is_duplicate', 'is', true)
        .order('price', { ascending: true })
        .limit(limit);
      return (data ?? [])
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
  const { data: products = [] } = useFeaturedProducts(8);

  return (
    <V2Layout>
      <Helmet>
        <title>GetPawsy — Practical Pet Supplies for Cats & Dogs</title>
        <meta
          name="description"
          content={`Everyday pet essentials for cats and dogs: litter boxes, beds, trees and travel gear. Free US shipping over $${FREE_SHIPPING_THRESHOLD} and ${RETURN_WINDOW_DAYS}-day returns.`}
        />
        <meta property="og:title" content="GetPawsy — Practical Pet Supplies for Cats & Dogs" />
        <meta
          property="og:description"
          content="Everyday pet essentials for cats and dogs, selected for comfort and durability."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* Hero */}
      <section className="border-b border-border bg-card" aria-labelledby="hero-heading">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Pet supplies, shipped in the US
            </p>
            <h1
              id="hero-heading"
              className="mt-3 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl"
            >
              Everyday essentials for a calmer home
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              A focused catalog of litter boxes, beds, cat trees and travel gear — chosen for comfort,
              durability and easy cleaning. No noise, no gimmicks.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Shop all products
              </Link>
              <Link
                to="/bestsellers"
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Best sellers
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
                alt="A dog and a cat resting at home"
                width={960}
                height={720}
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
          Shop by pet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Three ways to find what you need.</p>
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
                  Popular right now
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">In stock and ready to ship.</p>
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
