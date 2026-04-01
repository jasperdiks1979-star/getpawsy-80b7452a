import { Link } from 'react-router-dom';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import { FadeInView } from '@/components/ui/FadeInView';

const MONEY_HUBS: Array<{
  title: string;
  href: string;
  anchor: string;
  content: string;
  badges: string[];
  guideLink?: string;
}> = [
  {
    title: 'Cat Trees & Condos',
    href: '/collections/cat-trees-and-condos',
    anchor: 'premium cat trees and condos',
    content:
      'Standard cat trees are built for cats under 12 lbs — but Maine Coons, Ragdolls, and Norwegian Forest Cats weigh 15–25 lbs and generate 4x their body weight in impact force when jumping. That\'s why we curate only heavy-duty cat trees with solid wood or reinforced engineered-wood frames, 4-inch diameter sisal posts, and platforms 18 inches or wider. Our large-cat collection includes wall-anchor hardware and anti-tip systems rated for 40+ lbs of dynamic load. Whether you need a floor-to-ceiling tension pole model for a multi-cat household or a compact heavy-duty tree for an apartment, every pick is stability-tested and backed by our 30-day return policy with free US shipping. See our expert comparison of the 7 best cat trees for large cats in our 2026 stability guide.',
    badges: ['25+ lb Rated', 'Anti-Tip Tested', 'Free Shipping Available'],
    guideLink: '/guides/best-cat-trees-large-cats-2026',
  },
  {
    title: 'Best Cat Litter Boxes 2026',
    href: '/collections/best-cat-litter-boxes',
    anchor: 'best cat litter boxes',
    content:
      'Finding the right litter box means balancing odor control, ease of cleaning, and your cat\'s comfort. Our expert-tested collection features self-cleaning systems that reduce daily scooping by 90%, enclosed boxes that trap odors with activated carbon filters, and extra-large options designed for cats over 15 lbs. We also carry furniture-style enclosures that blend into your living room décor. Every litter box is tested for splash resistance, entry height accessibility, and long-term durability. Free shipping on eligible orders over $35 and a 30-day return policy.',
    badges: ['Odor Control', 'Self-Cleaning', 'Large Cat Friendly'],
    guideLink: '/guides/best-cat-litter-box-2026',
  },
  {
    title: 'Indoor Cat Enrichment & Furniture',
    href: '/collections/cat-condos',
    anchor: 'indoor cat furniture and enrichment',
    content:
      'Indoor cats need vertical space, scratching surfaces, and mental stimulation to stay healthy and happy. Our curated indoor cat furniture collection includes wall-mounted shelves that create aerial highways, sisal scratching towers that protect your furniture, window perches with suction-cup mounts for bird watching, and interactive puzzle feeders. Each piece is selected for durability, modern aesthetics, and cat ergonomics. Perfect for apartments and multi-cat households. US shipping, free over $35.',
    badges: ['Wall-Mountable', 'Space-Saving', 'Modern Design'],
    guideLink: '/resources/indoor-cat-care',
  },
];

export function MoneyHubBlocks() {
  return (
    <section className="py-16 md:py-20 bg-muted/20">
      <div className="container px-4 md:px-6">
        <FadeInView className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">
            Indoor Cat Authority — Expert Tested for 2026
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Our highest-rated indoor cat categories, backed by stability testing, real cat owner reviews, and expert curation.
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

                <div className="flex flex-col gap-2">
                  <Link
                    to={hub.href}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline group"
                  >
                    Shop {hub.anchor}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                  {'guideLink' in hub && hub.guideLink && (
                    <Link
                      to={hub.guideLink}
                      className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary hover:underline transition-colors"
                      aria-label={`Read our expert buying guide for ${hub.title}`}
                    >
                      📖 Read our expert buying guide
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            </FadeInView>
          ))}
        </div>
      </div>
    </section>
  );
}

export default MoneyHubBlocks;
