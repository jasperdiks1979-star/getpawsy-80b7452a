import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';

const TOP_CATEGORIES = [
  {
    href: '/collections/orthopedic-calming-dog-beds',
    title: 'Dog Beds',
    desc: 'Orthopedic & calming beds for dogs of all sizes.',
  },
  {
    href: '/collections/cat-condos',
    title: 'Cat Trees & Condos',
    desc: 'Multi-level cat furniture for climbing, scratching & lounging.',
  },
  {
    href: '/collections/best-interactive-dog-toys',
    title: 'Dog Toys',
    desc: 'Interactive & durable toys to keep your dog entertained.',
  },
  {
    href: '/collections/cat-condos',
    title: 'Cat Furniture',
    desc: 'Modern cat shelves, perches & wall-mounted play systems.',
  },
  {
    href: '/collections/dog-travel-accessories',
    title: 'Pet Travel Accessories',
    desc: 'Car seats, carriers & travel bowls for pets on the go.',
  },
  {
    href: '/collections/best-slow-feeder-dog-bowls',
    title: 'Slow Feeder Bowls',
    desc: 'Prevent bloat & promote healthy eating habits.',
  },
];

export function HomepageAuthoritySection() {
  return (
    <section className="py-16 bg-muted/20">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
            Shop by Top Pet Categories
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Explore our most popular collections — hand-picked for US pet owners
          </p>
        </FadeInView>

        <FadeInView>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
            {TOP_CATEGORIES.map((cat) => (
              <Link
                key={cat.href + cat.title}
                to={cat.href}
                className="group block bg-card border border-border/50 rounded-2xl p-5 md:p-6 hover:border-primary/30 hover:shadow-md transition-all duration-300"
              >
                <h3 className="font-display font-semibold text-base md:text-lg text-foreground group-hover:text-primary transition-colors mb-1">
                  {cat.title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {cat.desc}
                </p>
              </Link>
            ))}
          </div>
        </FadeInView>

        {/* SEO authority paragraph */}
        <FadeInView className="mt-12 max-w-3xl mx-auto text-center">
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            GetPawsy is your one-stop shop for premium{' '}
            <Link to="/collections/dog" className="text-primary hover:underline font-medium">
              dog essentials
            </Link>{' '}
            and{' '}
            <Link to="/collections/cat" className="text-primary hover:underline font-medium">
              cat essentials
            </Link>{' '}
            — all shipped fast within the United States. We curate vet-approved training gear,{' '}
            <Link to="/collections/orthopedic-calming-dog-beds" className="text-primary hover:underline font-medium">
              orthopedic dog beds
            </Link>,{' '}
            <Link to="/collections/cat-condos" className="text-primary hover:underline font-medium">
              cat trees and condos
            </Link>,{' '}
            enrichment toys, and travel accessories designed for comfort, safety, and durability. 
            Whether you're looking for a supportive bed for a senior pup, a space-saving cat tree 
            for a small apartment, or interactive toys that actually last — our US-based team has 
            tested and reviewed every product. We ship from US warehouses with 3–7 day delivery 
            and free shipping on orders over $35. Every order is backed by our 30-day hassle-free 
            return policy. Thousands of pet parents trust GetPawsy for quality, transparency, 
            and expert guidance. Explore our{' '}
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
