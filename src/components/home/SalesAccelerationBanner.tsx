/**
 * SalesAccelerationBanner — Homepage priority banner + category spotlight
 * for SERP War Sales Acceleration Mode.
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Star, Shield, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PRIORITY_SPOTLIGHTS = [
  {
    title: 'Orthopedic Dog Beds',
    subtitle: 'Memory foam support for dogs with joint discomfort',
    href: '/products',
    badge: '⭐ Popular Choice',
    trust: '30-Day Returns · Free Shipping $35+',
  },
  {
    title: 'Cat Trees for Large Cats',
    subtitle: 'Heavy-duty designs built for cats 25+ lbs',
    href: '/products',
    badge: '🏆 Customer Favorite',
    trust: 'Sturdy Build · Free Shipping $35+',
  },
  {
    title: 'Dog Car Safety Gear',
    subtitle: 'Car seats, harnesses & boosters for safer travel',
    href: '/products',
    badge: '🛡️ Travel Essentials',
    trust: 'Selected for Safety · 30-Day Returns',
  },
];

export function SalesAccelerationBanner() {
  return (
    <section className="py-10 md:py-14">
      <div className="container">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            Popular Categories
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Carefully selected pet products with free shipping on orders over $35.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {PRIORITY_SPOTLIGHTS.map((spot) => (
            <Link
              key={spot.href}
              to={spot.href}
              className="group relative bg-card border rounded-2xl p-6 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
            >
              <span className="text-xs font-semibold text-primary mb-2 block">
                {spot.badge}
              </span>
              <h3 className="text-lg font-display font-bold mb-1 group-hover:text-primary transition-colors">
                {spot.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {spot.subtitle}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-primary" /> 30-Day Returns
                </span>
                <span className="flex items-center gap-1">
                  <Truck className="w-3 h-3 text-primary" /> US Delivery
                </span>
              </div>
              <span className="text-xs text-muted-foreground/70">{spot.trust}</span>
              <div className="mt-4">
                <span className="text-sm font-medium text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  Shop Now <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
