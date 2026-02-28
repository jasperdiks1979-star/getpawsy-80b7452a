import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';
import { MONEY_COLLECTIONS } from '@/lib/money-collections';

export function HomepageAuthoritySection() {
  return (
    <section className="py-16 bg-muted/20">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
            Shop by Top Pet Categories
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Our 10 most popular collections — curated for US pet owners
          </p>
        </FadeInView>

        <FadeInView>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 max-w-5xl mx-auto">
            {MONEY_COLLECTIONS.map((mc) => (
              <Link
                key={mc.slug}
                to={`/collections/${mc.slug}`}
                className="group block bg-card border border-border/50 rounded-2xl p-4 md:p-5 hover:border-primary/30 hover:shadow-md transition-all duration-300"
              >
                <span className="text-2xl block mb-1.5">{mc.icon}</span>
                <h3 className="font-display font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors mb-0.5">
                  {mc.shortName}
                </h3>
                <p className="text-[11px] md:text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {mc.description}
                </p>
              </Link>
            ))}
          </div>
        </FadeInView>

        {/* SEO authority paragraph with contextual links to money collections */}
        <FadeInView className="mt-12 max-w-3xl mx-auto text-center">
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            GetPawsy is your one-stop shop for premium{' '}
            <Link to="/collections/dogs" className="text-primary hover:underline font-medium">
              dog essentials
            </Link>{' '}
            and{' '}
            <Link to="/collections/cats" className="text-primary hover:underline font-medium">
              cat essentials
            </Link>{' '}
            — all shipped fast within the United States. We curate vet-approved{' '}
            <Link to="/collections/best-dog-harnesses" className="text-primary hover:underline font-medium">
              no-pull dog harnesses
            </Link>,{' '}
            <Link to="/collections/orthopedic-calming-dog-beds" className="text-primary hover:underline font-medium">
              orthopedic dog beds
            </Link>,{' '}
            <Link to="/collections/cat-trees-and-condos" className="text-primary hover:underline font-medium">
              cat trees and condos
            </Link>,{' '}
            <Link to="/collections/best-interactive-dog-toys" className="text-primary hover:underline font-medium">
              interactive dog toys
            </Link>,{' '}
            <Link to="/collections/best-cat-litter-boxes" className="text-primary hover:underline font-medium">
              self-cleaning litter boxes
            </Link>,{' '}
            and{' '}
            <Link to="/collections/best-dog-car-seats" className="text-primary hover:underline font-medium">
              crash-tested dog car seats
            </Link>{' '}
            designed for comfort, safety, and durability.
            Whether you need a{' '}
            <Link to="/collections/best-slow-feeder-dog-bowls" className="text-primary hover:underline font-medium">
              slow feeder bowl
            </Link>{' '}
            for a fast-eating pup, a{' '}
            <Link to="/collections/best-cat-scratching-posts" className="text-primary hover:underline font-medium">
              sisal scratching post
            </Link>{' '}
            for your indoor cat, or an{' '}
            <Link to="/collections/best-cat-carriers" className="text-primary hover:underline font-medium">
              airline-approved cat carrier
            </Link>{' '}
            — our US-based team has tested and reviewed every product.
            We ship from US warehouses with 3–7 day delivery 
            and free shipping on orders over $49. Every order is backed by our 30-day hassle-free 
            return policy. Explore our{' '}
            <Link to="/guides" className="text-primary hover:underline font-medium">
              expert buying guides
            </Link>{' '}
            or browse our{' '}
            <Link to="/bestsellers" className="text-primary hover:underline font-medium">
              best sellers
            </Link>{' '}
            to find the perfect match for your furry family member today.
          </p>
        </FadeInView>
      </div>
    </section>
  );
}

export default HomepageAuthoritySection;
