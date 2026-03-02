import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';

const DOG_TRAINING_COLLECTIONS = [
  { slug: 'dog-potty-training', shortName: 'Potty Training', icon: '🚽', description: 'Pads, trays, sprays & bell systems for housebreaking.' },
  { slug: 'dog-leash-control', shortName: 'Leash & Control', icon: '🦮', description: 'No-pull harnesses, training leashes & head collars.' },
  { slug: 'dog-anti-bark', shortName: 'Anti-Bark', icon: '🔇', description: 'Humane bark control & calming aids.' },
  { slug: 'puppy-training-essentials', shortName: 'Puppy Essentials', icon: '🐶', description: 'Everything for the first 12 months.' },
  { slug: 'dog-training-accessories', shortName: 'Training Accessories', icon: '🎯', description: 'Clickers, treat bags, agility & more.' },
];

export function HomepageAuthoritySection() {
  return (
    <section className="py-16 bg-muted/20">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
            Shop by Training Need
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Our 5 core collections — built for US dog owners who want real results
          </p>
        </FadeInView>

        <FadeInView>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 max-w-5xl mx-auto">
            {DOG_TRAINING_COLLECTIONS.map((mc) => (
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

        {/* SEO authority paragraph — dog training focused */}
        <FadeInView className="mt-12 max-w-3xl mx-auto text-center">
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            GetPawsy is the go-to destination for{' '}
            <Link to="/collections/dog-potty-training" className="text-primary hover:underline font-medium">
              dog potty training tools
            </Link>,{' '}
            <Link to="/collections/dog-leash-control" className="text-primary hover:underline font-medium">
              no-pull leash & harness solutions
            </Link>,{' '}
            and{' '}
            <Link to="/collections/dog-anti-bark" className="text-primary hover:underline font-medium">
              humane anti-bark devices
            </Link>{' '}
            — all shipped fast within the United States. Whether you're raising a{' '}
            <Link to="/collections/puppy-training-essentials" className="text-primary hover:underline font-medium">
              new puppy
            </Link>{' '}
            or correcting behavior in an adult dog, our curated{' '}
            <Link to="/collections/dog-training-accessories" className="text-primary hover:underline font-medium">
              training accessories
            </Link>{' '}
            are tested by real dog owners and recommended by professional trainers.
            We ship from US warehouses with 3–7 day delivery
            and free shipping on orders over $49. Every order is backed by our 30-day hassle-free
            return policy. Explore our{' '}
            <Link to="/guides" className="text-primary hover:underline font-medium">
              expert training guides
            </Link>{' '}
            or browse our{' '}
            <Link to="/blog?category=dogs" className="text-primary hover:underline font-medium">
              training tips blog
            </Link>{' '}
            to build a well-behaved, confident dog.
          </p>
        </FadeInView>
      </div>
    </section>
  );
}

export default HomepageAuthoritySection;
