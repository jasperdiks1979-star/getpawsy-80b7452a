import { Link } from 'react-router-dom';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Star from 'lucide-react/dist/esm/icons/star';
import { Button } from '@/components/ui/button';
import { FadeInView } from '@/components/ui/FadeInView';
import { SITE_URL } from '@/lib/constants';
import { Helmet } from 'react-helmet-async';

/**
 * "Top Picks" — 20 curated product cards for internal link authority.
 * Static data: no DB call on critical homepage path.
 * All links are real <a href> for crawlability.
 */

export interface TopPickProduct {
  slug: string;
  name: string;
  price: number;
  compareAt?: number;
  image: string;
  benefit: string;
  pet: 'dog' | 'cat';
}

export const TOP_PICKS: TopPickProduct[] = [
  // ── DOG products (10) ──
  {
    slug: 'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner',
    name: 'Orthopedic Memory Foam Pet Bed',
    price: 69.49,
    compareAt: 84.99,
    image: '/images/products/memory-foam-pet-bed.jpg',
    benefit: 'Vet-recommended for joint relief',
    pet: 'dog',
  },
  {
    slug: 'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo',
    name: 'Tactical Dog Harness & Car Safety Set',
    price: 63.99,
    compareAt: 81.99,
    image: '/images/products/tactical-dog-harness.jpg',
    benefit: '5-in-1 travel safety bundle',
    pet: 'dog',
  },
  {
    slug: 'outdoor-dog-kennel-with-roof-rotating-4-level-adjustable-bowls',
    name: 'Outdoor Dog Kennel with Roof & Adjustable Bowls',
    price: 149.99,
    compareAt: 187.49,
    image: '/images/products/outdoor-dog-kennel.jpg',
    benefit: 'Weather-resistant with built-in feeders',
    pet: 'dog',
  },
  {
    slug: 'crate-furniture-32small-dog-cage-end-table-with-2-doors-lockable-door-puppy-kennel-indoor-black',
    name: 'Dog Crate End Table with Lockable Doors',
    price: 149.99,
    compareAt: 187.49,
    image: '/images/products/dog-crate-end-table.jpg',
    benefit: 'Stylish furniture-grade kennel',
    pet: 'dog',
  },
  {
    slug: '2-in-1-dog-bike-trailer-pet-stroller-carrier-for-large-dogs-with-hitch',
    name: '2-in-1 Dog Bike Trailer & Stroller',
    price: 322.99,
    compareAt: 409.99,
    image: '/images/products/dog-bike-trailer.jpg',
    benefit: 'Converts between biking & walking',
    pet: 'dog',
  },
  {
    slug: 'double-sided-all-season-dog-bed-mat-made-of-chew-resistant-leather-for-pets',
    name: 'Double-Sided All-Season Dog Bed Mat',
    price: 21.53,
    compareAt: 26.91,
    image: '/images/products/double-sided-dog-bed.jpg',
    benefit: 'Chew-resistant & reversible',
    pet: 'dog',
  },
  {
    slug: '3-in-1-pet-jogging-stroller-for-small-dogs-and-cats-with-detachable-carrier-storage-basket-gray',
    name: '3-in-1 Pet Jogging Stroller',
    price: 432.99,
    compareAt: 549.99,
    image: '/images/products/pet-jogging-stroller.jpg',
    benefit: 'Detachable carrier + storage',
    pet: 'dog',
  },
  {
    slug: 'iq-puzzle-health-dog-bowl-mat-slow-feeding-training-blanket',
    name: 'IQ Puzzle Slow Feeder Dog Bowl Mat',
    price: 9.99,
    compareAt: 12.49,
    image: 'https://cf.cjdropshipping.com/quick/product/580fe102-b486-4be8-92cd-860e28b219f1.jpg',
    benefit: 'Slows eating & stimulates mind',
    pet: 'dog',
  },
  {
    slug: 'detangle-and-de-shed-with-this-foldable-pet-grooming-comb',
    name: 'Foldable Pet Grooming Comb',
    price: 9.99,
    compareAt: 12.49,
    image: 'https://oss-cf.cjdropshipping.com/product/2026/02/23/09/b3875e8c-c135-460e-adc4-db08c408e0c6_trans.jpeg',
    benefit: 'Portable detangling & de-shedding',
    pet: 'dog',
  },
  {
    slug: 'yegbong-pet-moisturizing-paw-balm-suitable-for-cats-and-dogs-protects-and-moisturizes-paw-pads',
    name: 'Pet Moisturizing Paw Balm',
    price: 9.99,
    compareAt: 12.49,
    image: 'https://cf.cjdropshipping.com/f9473d9d-1ccd-42d6-aca2-559835ab8fb7.jpg',
    benefit: 'Soothes cracked & dry paws',
    pet: 'dog',
  },
  // ── CAT products (10) ──
  {
    slug: 'all-in-one-cactus-cat-tree-with-climbing-frame-and-cozy-nest',
    name: 'Cactus Cat Tree with Climbing Frame',
    price: 88.99,
    compareAt: 109.99,
    image: 'https://oss-cf.cjdropshipping.com/product/2026/01/15/06/41c2bcde-5615-4832-8d42-0b10485bc94c_trans.jpeg',
    benefit: 'Space-saving adorable design',
    pet: 'cat',
  },
  {
    slug: 'solid-wood-cat-tree-with-integrated-scratching-post-and-cozy-nest',
    name: 'Solid Wood Cat Tree with Scratching Post',
    price: 149.99,
    compareAt: 187.49,
    image: 'https://oss-cf.cjdropshipping.com/product/2026/01/31/05/c7c0461d-58c7-4601-84e3-8880a0567cf0_fine.jpeg',
    benefit: 'Premium real-wood construction',
    pet: 'cat',
  },
  {
    slug: '5-level-revolving-stair-cat-tree-scratcher-climbing-activity-tower-with-play-center-and-resting-perc',
    name: '5-Level Revolving Stair Cat Tower',
    price: 116.18,
    compareAt: 145.23,
    image: 'https://cf.cjdropshipping.com/a6929552-2483-4a17-b22e-62461e1d505f.jpg',
    benefit: 'Multi-level play & rest zones',
    pet: 'cat',
  },
  {
    slug: 'cat-litter-box-front-entry-enclosed-extra-large-litter-box-with-litter-catching-lid-and-scoop-for-bi',
    name: 'Extra Large Enclosed Cat Litter Box',
    price: 136.99,
    compareAt: 170.99,
    image: 'https://cf.cjdropshipping.com/6f36562d-bc5a-4d11-bb82-cdd47b5a9622.jpg',
    benefit: 'Front-entry with litter-catching lid',
    pet: 'cat',
  },
  {
    slug: 'outdoor-catio-cat-enclosure-large-wooden-cat-house-with-6-jumping-platforms-scratching-post-2-ramps--1',
    name: 'Outdoor Catio Cat Enclosure',
    price: 471.99,
    compareAt: 594.99,
    image: 'https://cf.cjdropshipping.com/70b1c5cd-0c12-498f-beb7-bc27d47212df.jpg',
    benefit: 'Safe outdoor play for 2-3 cats',
    pet: 'cat',
  },
  {
    slug: 'pawhut-cat-tree-for-indoor-cats-with-hammock-cat-tower-green',
    name: 'PawHut Cat Tree with Hammock',
    price: 136.99,
    compareAt: 166.99,
    image: 'https://cf.cjdropshipping.com/a62c86a6-3a38-4a6d-b6eb-7be827fddcf2.jpg',
    benefit: 'Cozy hammock + sisal posts',
    pet: 'cat',
  },
  {
    slug: 'cat-toy-with-bells-accordion-style-scratching-post-for-cats',
    name: 'Accordion-Style Cat Scratching Post',
    price: 9.99,
    compareAt: 12.49,
    image: 'https://cf.cjdropshipping.com/quick/product/c5c22647-f30d-437d-87e3-c959ce9e6bec.jpg',
    benefit: 'Fun bells + satisfying scratch',
    pet: 'cat',
  },
  {
    slug: '57-multi-level-cat-tree-for-multi-cat-households-2-condos-hammock-with-sisal-scratching-posts-gray',
    name: '57" Multi-Level Cat Tree for Multi-Cat Homes',
    price: 147.99,
    compareAt: 183.99,
    image: 'https://cf.cjdropshipping.com/17689536/70ba5962-2ad7-4068-9790-3d19627586a0.jpg',
    benefit: '2 condos + hammock for multi-cat',
    pet: 'cat',
  },
  {
    slug: 'extra-large-stainless-steel-litter-box-enclosed-cat-litter-box-with-scoop-deodorizer-bag-sand-drop-p',
    name: 'Stainless Steel Enclosed Litter Box',
    price: 134.99,
    compareAt: 166.99,
    image: 'https://cf.cjdropshipping.com/17664480/090adbd2-2ddb-431c-b1fd-506d8b455c45.jpg',
    benefit: 'Rust-proof with deodorizer',
    pet: 'cat',
  },
  {
    slug: 'pet-ear-cleanersuitable-for-both-cats-and-dogs',
    name: 'Pet Ear Cleaner for Cats & Dogs',
    price: 9.99,
    compareAt: 12.49,
    image: 'https://cf.cjdropshipping.com/quick/product/303f5da6-30d5-4c41-8fec-cdffa155383a.jpg',
    benefit: 'Gentle formula for sensitive ears',
    pet: 'cat',
  },
];

/** JSON-LD ItemList for the 20 top picks */
function TopPicksJsonLd() {
  const items = TOP_PICKS.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `${SITE_URL}/product/${p.slug}`,
    name: p.name,
  }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Top Picks for Pet Parents',
    numberOfItems: TOP_PICKS.length,
    itemListElement: items,
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}

export function TopPicksSection() {
  return (
    <section className="py-16 md:py-20">
      <TopPicksJsonLd />
      <div className="container px-4 md:px-6">
        <FadeInView className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-2">
              Top Picks for Pet Parents
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl">
              20 hand-selected products loved by dogs and cats — verified quality, US shipping
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2 rounded-full shrink-0">
            <Link to="/products">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </FadeInView>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-5">
          {TOP_PICKS.map((product, idx) => {
            const discount = product.compareAt
              ? Math.round((1 - product.price / product.compareAt) * 100)
              : 0;
            return (
              <a
                key={product.slug}
                href={`/product/${product.slug}`}
                className="group block bg-card rounded-xl border border-border/50 overflow-hidden shadow-soft hover:shadow-soft-lg transition-all duration-300 hover:-translate-y-1"
                data-seo-slot={`top-pick-${idx}`}
              >
                <div className="relative aspect-square overflow-hidden bg-muted">
                  <img
                    src={product.image}
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
                  <span className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm text-[10px] font-medium px-1.5 py-0.5 rounded capitalize text-muted-foreground">
                    {product.pet === 'dog' ? '🐕 Dog' : '🐈 Cat'}
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-1 text-[10px] text-primary">
                    <Star className="w-3 h-3 fill-primary" />
                    <span className="truncate">{product.benefit}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold text-foreground">${product.price.toFixed(2)}</span>
                    {product.compareAt && (
                      <span className="text-[10px] text-muted-foreground line-through">${product.compareAt.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default TopPicksSection;
