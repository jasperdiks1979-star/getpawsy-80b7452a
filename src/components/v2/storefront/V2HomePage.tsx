import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Heart, Lock, PackageCheck, RotateCcw, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import petsPhoto from '@/assets/everyday-pets.webp.asset.json';
import catPhoto from '@/assets/living-room-cat.webp.asset.json';
import litterPhoto from '@/assets/category-litter-essentials.jpg';
import toysPhoto from '@/assets/category-cat-toys.jpg';
import heroPhoto from '@/assets/hero-cat-dog-joy.webp';
import { supabase } from '@/integrations/supabase/client';
import { V2Layout } from './V2Layout';
import { V2ProductCard, type V2CardProduct } from './V2ProductCard';
import {
  selectFeaturedPicks,
  type FeaturedPickRow,
} from '@/lib/featured-picks';
import {
  FREE_SHIPPING_THRESHOLD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';

// Local Vite does not proxy the hosting asset endpoint; published pages use
// the same-origin asset URLs. Both origins serve the same immutable photos.
const photoUrl = (url: string) => import.meta.env.DEV ? `https://getpawsy.lovable.app${url}` : url;

// Verified curator picks: visible, active products with verified stock, a
// live PDP, a purchasable variant, and a stable rehosted primary image.
const VERIFIED_PICK_IDS = [
  '1b218ab0-19b5-4ae5-a227-8099f2e2f00c',
  '1daefaa0-7892-4760-87a9-0aa34c49c767',
  '84be6648-7fd6-4b18-bdd7-ff9df7907892',
  'a59f49ad-b9ee-47ce-a16d-74c2ab61b900',
  // Collage-style supplier image: kept eligible but never in a lead slot.
  'b9c0f448-162b-4464-bf36-7697e6fe4852',
] as const;

const PICK_COLUMNS = 'id, name, slug, price, image_url, stock, is_active, is_duplicate, merch_hidden, merch_role';

const CATEGORIES = [
  { href: '/collections/cats', title: 'For cats', copy: 'Little comforts. Everyday play.', image: photoUrl(catPhoto.url) },
  { href: '/collections/dogs', title: 'For dogs', copy: 'For walks, naps and everything between.', image: photoUrl(petsPhoto.url) },
  { href: '/collections/cat-litter-boxes', title: 'Litter essentials', copy: 'Find a setup that fits your home.', image: litterPhoto },
  { href: '/collections/cat-toys', title: 'Cat toys', copy: 'A little more play in every day.', image: toysPhoto },
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
    title: 'US delivery',
    copy: 'Orders ship to US addresses; delivery time is confirmed at checkout.',
  },
];

function useFeaturedPicks() {
  return useQuery({
    queryKey: ['v2-home-featured-picks'],
    queryFn: async (): Promise<V2CardProduct[]> => {
      const [verifiedRes, catalogRes] = await Promise.all([
        supabase
          .from('products_public')
          .select(PICK_COLUMNS)
          .in('id', [...VERIFIED_PICK_IDS]),
        supabase
          .from('products_public')
          .select(PICK_COLUMNS)
          .eq('is_active', true)
          .gt('stock', 0)
          .not('is_duplicate', 'is', true)
          .eq('merch_hidden', false)
          .neq('merch_role', 'blocked')
          .not('image_url', 'is', null)
          .order('stock', { ascending: false })
          .limit(40),
      ]);
      const picks = selectFeaturedPicks(
        VERIFIED_PICK_IDS,
        (verifiedRes.data ?? []) as FeaturedPickRow[],
        (catalogRes.data ?? []) as FeaturedPickRow[],
      );
      return picks.map((p) => ({
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

/** Decorative paw print; hidden from assistive tech. */
function PawPrint({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="32" cy="42" rx="14" ry="11" />
      <ellipse cx="14" cy="26" rx="6" ry="8" transform="rotate(-18 14 26)" />
      <ellipse cx="26" cy="16" rx="6" ry="8" transform="rotate(-6 26 16)" />
      <ellipse cx="38" cy="16" rx="6" ry="8" transform="rotate(6 38 16)" />
      <ellipse cx="50" cy="26" rx="6" ry="8" transform="rotate(18 50 26)" />
    </svg>
  );
}

export function V2HomePage() {
  const { data: products = [] } = useFeaturedPicks();

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
      <section className="relative isolate overflow-hidden border-b border-border bg-secondary" aria-labelledby="hero-heading">
        <img src={heroPhoto} alt="A happy ginger cat and golden dog relaxing together on a cream sofa" width={1600} height={1000} fetchPriority="high" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_center] md:object-center" />
        <div className="storefront-hero-scrim absolute inset-0 -z-10" aria-hidden="true" />
        <PawPrint className="paw-float absolute -z-10 left-[46%] top-10 hidden h-14 w-14 text-primary/20 md:block" />
        <Heart className="paw-float paw-float-delay absolute -z-10 left-[40%] bottom-16 hidden h-9 w-9 fill-primary/20 text-primary/30 md:block" aria-hidden="true" />
        <div className="mx-auto flex min-h-[570px] w-full max-w-6xl items-start px-4 py-8 sm:px-6 md:min-h-[600px] md:items-center md:py-16">
          <div className="max-w-sm md:max-w-lg">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <PawPrint className="h-3.5 w-3.5" /> Pet essentials · Shipped to the US
            </p>
            <h1
              id="hero-heading"
              className="mt-4 font-display text-4xl font-semibold leading-tight text-foreground md:text-6xl md:leading-[1.08]"
            >
              Happy pets,{' '}
              <span className="relative inline-block text-primary">
                happy homes
                <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true" className="absolute -bottom-2 left-0 h-3 w-full text-primary/60"><path d="M2 8 Q50 2 100 7 T198 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
              Litter boxes, cat trees, toys and comfy beds for cats and dogs — chosen to make every day a little brighter.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" className="cta-bounce min-h-12 rounded-full px-7 text-base shadow-md"><Link to="/products">Shop now <ArrowRight aria-hidden="true" /></Link></Button>
              <Button asChild variant="outline" size="lg" className="min-h-12 rounded-full border-primary/40 bg-background/80 px-7 text-base"><Link to="/bundles">Explore Sets</Link></Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar — only policy facts already stated on our shipping/returns pages */}
      <section aria-label="Shopping with GetPawsy" className="border-b border-border bg-background">
        <ul className="mx-auto flex w-full max-w-6xl list-none flex-wrap items-center justify-center gap-2 px-4 py-4 sm:gap-3 sm:px-6">
          {[
            { icon: Truck, label: `Free US shipping over $${FREE_SHIPPING_THRESHOLD}` },
            { icon: RotateCcw, label: `${RETURN_WINDOW_DAYS}-day returns` },
            { icon: Lock, label: 'Secure checkout' },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-foreground sm:text-sm">
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" /> {label}
            </li>
          ))}
        </ul>
      </section>

      {/* Categories */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-16" aria-labelledby="shop-heading">
        <h2 id="shop-heading" className="font-display text-2xl font-bold text-foreground md:text-3xl">
          A little something for every day
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">For the pets who make your house a home.</p>
        <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <li key={c.href}>
              <Link
                to={c.href}
                className="group block overflow-hidden rounded-2xl bg-secondary transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <img
                  src={c.image}
                  alt=""
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className={`aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${c.title === 'For dogs' ? 'object-right' : 'object-bottom'}`}
                />
                <div className="p-4">
                  <h3 className="flex items-center justify-between gap-2 font-sans text-base font-semibold text-foreground">{c.title}<ArrowRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" aria-hidden="true" /></h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.copy}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Featured picks — only rendered when the live catalog returns items */}
      {products.length > 0 && (
        <section
          className="border-y border-border bg-muted/25"
          aria-labelledby="featured-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 md:py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="featured-heading" className="flex items-center gap-2 font-display text-2xl font-bold text-foreground md:text-3xl">
                  Featured picks <Heart className="h-5 w-5 fill-primary/25 text-primary" aria-hidden="true" />
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">In stock now and ready to ship to your door.</p>
              </div>
              <Link
                to="/products"
                className="inline-flex min-h-[44px] items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                View all products
              </Link>
            </div>
            <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 lg:grid-cols-4">
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
        <ul className="mt-6 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-3">
          {REASSURANCE.map(({ icon: Icon, title, copy }) => (
            <li key={title} className="border-t border-border py-5">
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
