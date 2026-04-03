import { Link } from 'react-router-dom';
// ── Lucide: per-icon deep imports — eliminates full lucide barrel from critical chunk ──
import Star from 'lucide-react/dist/esm/icons/star';
import Truck from 'lucide-react/dist/esm/icons/truck';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FadeInView } from '@/components/ui/FadeInView';

/**
 * "Most Loved Picks" — Homepage hero conversion block
 * 
 * Features 3 hand-picked hero products with trust signals.
 * Static data to avoid DB calls on the critical homepage path.
 * Products selected based on: margin, emotional trigger, stock depth, visual appeal.
 */

const HERO_PRODUCTS = [
  {
    slug: 'memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner',
    name: 'Orthopedic Memory Foam Pet Bed',
    subtitle: 'Deep Sleep & Joint Relief for Dogs & Cats',
    price: 69.49,
    compareAt: 84.99,
    image: '/images/products/memory-foam-pet-bed.webp',
    badge: '🏆 Best Seller',
    benefit: 'Vet-recommended memory foam for achy joints',
  },
  {
    slug: 'all-in-one-cactus-cat-tree-with-climbing-frame-and-cozy-nest',
    name: 'Cactus Cat Tree with Climbing Frame',
    subtitle: 'Play, Scratch & Nap in One Adorable Design',
    price: 88.99,
    compareAt: 109.99,
    image: '/images/products/cactus-cat-tree.webp',
    badge: '❤️ Fan Favorite',
    benefit: "Space-saving design cats can't resist",
  },
  {
    slug: 'tactical-service-dog-harness-strap-set-car-seat-belt-collapsible-bowl-biodegradable-trash-bag-set-fo',
    name: 'Tactical Dog Harness & Car Safety Set',
    subtitle: '5-in-1 Bundle: Harness, Seat Belt, Bowl & More',
    price: 63.99,
    compareAt: 81.99,
    image: '/images/products/tactical-dog-harness.webp',
    badge: '⭐ Top Rated',
    benefit: 'Everything you need for safe car travel',
  },
];

export const MostLovedPicks = () => {
  return (
    <section className="py-16 md:py-20">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
            Most Loved by Pet Parents
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Hand-picked products based on customer feedback and repeat orders
          </p>
        </FadeInView>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {HERO_PRODUCTS.map((product) => {
            const discount = Math.round((1 - product.price / product.compareAt) * 100);
            return (
              <FadeInView key={product.slug}>
                <Link
                  to={`/product/${product.slug}`}
                  className="group block bg-card rounded-2xl overflow-hidden border border-border/50 shadow-soft hover:shadow-soft-lg transition-all duration-500 hover:-translate-y-1"
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={400}
                    />
                    <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground text-xs font-semibold shadow-md">
                      {product.badge}
                    </Badge>
                    {discount > 0 && (
                      <Badge variant="destructive" className="absolute top-3 right-3 text-xs font-bold">
                        -{discount}%
                      </Badge>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <h3 className="font-display font-bold text-lg leading-snug text-foreground group-hover:text-primary transition-colors mb-1">
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">{product.subtitle}</p>

                    {/* Price */}
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-2xl font-bold text-foreground">${product.price.toFixed(2)}</span>
                      <span className="text-sm text-muted-foreground line-through">${product.compareAt.toFixed(2)}</span>
                    </div>

                    {/* Benefit callout */}
                    <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-3">
                      <Star className="w-3.5 h-3.5 fill-primary" />
                      <span>{product.benefit}</span>
                    </div>

                    {/* Trust micro-signals */}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border/50 pt-3">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3" /> Free Shipping
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> 30-Day Returns
                      </span>
                    </div>
                  </div>
                </Link>
              </FadeInView>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <Button asChild variant="outline" className="gap-2 rounded-full">
            <Link to="/bestsellers">
              View All Bestsellers <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default MostLovedPicks;
