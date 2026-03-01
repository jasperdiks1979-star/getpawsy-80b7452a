import { Link } from 'react-router-dom';
import { FadeInView } from '@/components/ui/FadeInView';

/**
 * Revenue-sculpted homepage blocks — Dog Training Authority focus.
 * All blocks prioritize the 5 hero dog training collections.
 */

const HERO_COLLECTIONS = [
  { slug: 'dog-potty-training', name: 'Potty Training Gear', shortName: 'Potty Training', icon: '🚽', description: 'Training pads, trays, sprays & bell systems for fast housebreaking.' },
  { slug: 'dog-leash-control', name: 'Leash & Walk Control', shortName: 'Leash & Control', icon: '🦮', description: 'No-pull harnesses, training leashes & head collars for safe walks.' },
  { slug: 'dog-anti-bark', name: 'Anti-Bark Solutions', shortName: 'Anti-Bark', icon: '🔇', description: 'Ultrasonic deterrents, calming aids & humane bark correction tools.' },
  { slug: 'puppy-training-essentials', name: 'Puppy Training Essentials', shortName: 'Puppy Essentials', icon: '🐶', description: 'Complete starter kits: crate pads, chew toys, socialization tools.' },
  { slug: 'dog-training-accessories', name: 'Training Accessories', shortName: 'Accessories', icon: '🎯', description: 'Clickers, treat pouches, agility equipment & behavior aids.' },
];

export function PopularRightNow() {
  return (
    <section className="py-10 md:py-14">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-2">
            Most Popular Training Collections
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Our highest-rated dog training tools, trusted by owners across the US
          </p>
        </FadeInView>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-6xl mx-auto">
          {HERO_COLLECTIONS.map((mc) => (
            <Link
              key={mc.slug}
              to={`/collections/${mc.slug}`}
              className="group block rounded-2xl border border-border/50 bg-card p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
            >
              <span className="text-3xl block mb-2">{mc.icon}</span>
              <h4 className="font-display font-semibold text-base text-foreground group-hover:text-primary transition-colors mb-1">
                {mc.name}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                {mc.description}
              </p>
              <span className="text-xs font-medium text-primary block">
                Shop {mc.shortName} →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default PopularRightNow;
