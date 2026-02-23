import { Link } from 'react-router-dom';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import { FadeInView } from '@/components/ui/FadeInView';

const MONEY_HUBS = [
  {
    title: 'Best Orthopedic Dog Beds',
    href: '/dog/orthopedic-dog-beds',
    anchor: 'best orthopedic dog beds',
    content:
      'If your dog struggles with stiffness, joint pain, or restless sleep, an orthopedic memory foam bed can make a dramatic difference. Veterinarians consistently recommend high-density foam beds for dogs with arthritis, hip dysplasia, and age-related mobility issues. Unlike standard polyester-fill beds that flatten within weeks, orthopedic beds distribute your dog\'s weight evenly across the entire sleep surface — reducing pressure on hips, elbows, and shoulders by up to 40%. Our curated collection features waterproof, machine-washable covers, foam densities of 1.8+ lb/ft³, and sizes from small breed to giant breed XL. Every bed ships fast within the US with free shipping over $35 and a 30-day comfort guarantee.',
    badges: ['Vet Recommended', 'Memory Foam', '30-Day Guarantee'],
  },
  {
    title: 'Cat Trees for Large Cats',
    href: '/cat/cat-trees-for-large-cats',
    anchor: 'heavy duty cat trees for large cats',
    content:
      'Standard cat trees are built for cats under 12 lbs — but Maine Coons, Ragdolls, and Norwegian Forest Cats weigh 15–25 lbs and generate 4x their body weight in impact force when jumping. That\'s why we curate only heavy-duty cat trees with solid wood or reinforced engineered-wood frames, 4-inch diameter sisal posts, and platforms 18 inches or wider. Our large-cat collection includes wall-anchor hardware and anti-tip systems rated for 40+ lbs of dynamic load. Whether you need a floor-to-ceiling tension pole model for a multi-cat household or a compact heavy-duty tree for an apartment, every pick is stability-tested and backed by our 30-day satisfaction guarantee with free US shipping.',
    badges: ['25+ lb Rated', 'Anti-Tip Tested', 'Free US Shipping'],
  },
  {
    title: 'Safe Dog Car Travel Solutions',
    href: '/dog/dog-car-travel-safety',
    anchor: 'safest dog car seats',
    content:
      'An unrestrained 60-lb dog in a 35 mph collision becomes a 2,700-lb projectile — endangering every person in the vehicle. Multiple US states now legally require pets to be restrained during travel. Our crash-tested dog car safety collection includes CPS-certified car seats for small and medium dogs, crash-tested harness systems for large breeds (50+ lbs), and elevated booster seats for anxious small dogs who need a window view. Every product is selected based on real crash-test data, reinforced stitching, and padded chest plates. We also carry waterproof seat covers and travel accessories. Fast 3–7 day US delivery, free shipping over $35, and a 30-day safety guarantee on every purchase.',
    badges: ['Crash-Test Certified', 'CPS Standards', '3–7 Day Shipping'],
  },
];

export function MoneyHubBlocks() {
  return (
    <section className="py-16 md:py-20 bg-muted/20">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
            Top Pet Solutions — Expert Tested for 2026
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Our highest-rated categories, backed by vet recommendations, crash-test data, and real pet owner reviews.
          </p>
        </FadeInView>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {MONEY_HUBS.map((hub) => (
            <FadeInView key={hub.href}>
              <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8 h-full flex flex-col hover:border-primary/30 hover:shadow-md transition-all duration-300">
                <div className="flex flex-wrap gap-2 mb-4">
                  {hub.badges.map((badge) => (
                    <span
                      key={badge}
                      className="text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full"
                    >
                      {badge}
                    </span>
                  ))}
                </div>

                <h3 className="text-xl md:text-2xl font-display font-bold mb-3 leading-snug">
                  {hub.title}
                </h3>

                <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">
                  {hub.content}
                </p>

                <Link
                  to={hub.href}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline group"
                >
                  Shop {hub.anchor}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </FadeInView>
          ))}
        </div>
      </div>
    </section>
  );
}

export default MoneyHubBlocks;
