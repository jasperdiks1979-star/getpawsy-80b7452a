import { useMemo } from 'react';
import { Star } from 'lucide-react';

interface ProductSocialProofProps {
  productName: string;
  category: string;
}

type ProductType =
  | 'bed' | 'bowl' | 'harness' | 'leash' | 'collar' | 'toy'
  | 'carrier' | 'grooming' | 'clothing' | 'cat tree' | 'litter box' | 'default';

interface Review {
  text: string;
  name: string;
}

function detectType(name: string, category: string): ProductType {
  const c = `${name} ${category}`.toLowerCase();
  if (/cat\s*tree|cat\s*condo|cat\s*tower|scratching/i.test(c)) return 'cat tree';
  if (/litter\s*box|self[\s-]*clean|automatic\s*litter/i.test(c)) return 'litter box';
  if (c.includes('bed') || c.includes('cushion') || c.includes('pillow')) return 'bed';
  if (c.includes('bowl') || c.includes('feeder') || c.includes('dish')) return 'bowl';
  if (c.includes('harness')) return 'harness';
  if (c.includes('leash') || c.includes('lead')) return 'leash';
  if (c.includes('collar')) return 'collar';
  if (c.includes('toy') || c.includes('ball') || c.includes('chew')) return 'toy';
  if (c.includes('carrier') || c.includes('crate') || c.includes('bag')) return 'carrier';
  if (c.includes('brush') || c.includes('groom') || c.includes('comb')) return 'grooming';
  if (c.includes('sweater') || c.includes('jacket') || c.includes('coat') || c.includes('hoodie')) return 'clothing';
  return 'default';
}

const REVIEWS: Record<ProductType, Review[]> = {
  harness: [
    { text: 'My dog stopped pulling within days. Walks are actually enjoyable now.', name: 'Jessica M.' },
    { text: 'Easy to put on and my pup doesn\'t fuss at all. Total game changer.', name: 'Daniel R.' },
    { text: 'Great control without choking. Exactly what we needed.', name: 'Sarah K.' },
  ],
  bed: [
    { text: 'My older dog finally sleeps through the night again. Huge difference in her energy.', name: 'Amanda L.' },
    { text: 'Best purchase I made for my dog. He sinks right in and doesn\'t move all night.', name: 'Chris T.' },
    { text: 'Worth every penny. Our senior lab moves so much better in the mornings now.', name: 'Rachel K.' },
  ],
  bowl: [
    { text: 'My dog eats so much slower now. No more bloating after meals.', name: 'Mark H.' },
    { text: 'Stays in place on our tile floor. Super easy to clean.', name: 'Rachel S.' },
    { text: 'Great quality and my picky eater actually uses it.', name: 'Kevin D.' },
  ],
  leash: [
    { text: 'Comfortable grip even on long walks. The clasp feels really secure.', name: 'Tom B.' },
    { text: 'Survived rain, mud, and a very stubborn golden retriever.', name: 'Emily C.' },
    { text: 'Perfect length for city walking. Love the padded handle.', name: 'Jenn L.' },
  ],
  collar: [
    { text: 'Fits perfectly and my dog doesn\'t scratch at it anymore.', name: 'Mike R.' },
    { text: 'Love the quick-release buckle. Peace of mind at the dog park.', name: 'Stacy N.' },
    { text: 'Looks great and holds up really well. Third month and still perfect.', name: 'Brian F.' },
  ],
  toy: [
    { text: 'Only toy that survived my pit bull. Seriously durable.', name: 'Carlos M.' },
    { text: 'Keeps my dog busy for hours. Way less chewing on furniture.', name: 'Lisa G.' },
    { text: 'Safe materials and my puppy absolutely loves it.', name: 'Nicole J.' },
  ],
  carrier: [
    { text: 'Used it on a 4-hour flight. My cat was calm the entire time.', name: 'Priya S.' },
    { text: 'Fits perfectly under the airline seat. Great ventilation.', name: 'Alex T.' },
    { text: 'Sturdy zippers and my escape-artist cat can\'t get out.', name: 'Dana W.' },
  ],
  grooming: [
    { text: 'The amount of fur this removes is incredible. My couch thanks me.', name: 'Hannah P.' },
    { text: 'My dog actually enjoys being brushed now. Gentle and effective.', name: 'Steve K.' },
    { text: 'Self-cleaning feature is genius. Makes grooming so much faster.', name: 'Olivia R.' },
  ],
  clothing: [
    { text: 'My chihuahua stopped shivering on walks. Great fit too.', name: 'Maria L.' },
    { text: 'Easy to put on and take off. No more wrestling with my dog.', name: 'Jason B.' },
    { text: 'Held up great in the washing machine. Still looks new.', name: 'Kara M.' },
  ],
  'cat tree': [
    { text: 'My cats fight over who gets the top perch. They love it.', name: 'Sandra E.' },
    { text: 'Saved our couch from scratching. The sisal posts are tough.', name: 'David H.' },
    { text: 'Sturdy enough for our 18-lb Maine Coon. No wobbling at all.', name: 'Paula A.' },
  ],
  'litter box': [
    { text: 'No more daily scooping. This thing cleans itself and our home smells fresh all day.', name: 'Angela C.' },
    { text: 'Guests don\'t even know we have three cats. The odor control is incredible.', name: 'Robert F.' },
    { text: 'Both our cats adapted immediately. Quiet, efficient, and saves us so much time.', name: 'Tina M.' },
  ],
  default: [
    { text: 'Great quality product. My pet loves it and it arrived well-packaged.', name: 'Jordan W.' },
    { text: 'Exactly as described. Happy with the purchase.', name: 'Taylor B.' },
    { text: 'Good value for the price. Would definitely order again.', name: 'Casey H.' },
  ],
};

/**
 * Social proof section — 3 realistic review-style quotes.
 * Category-aware for relevance.
 */
export function ProductSocialProof({ productName, category }: ProductSocialProofProps) {
  const reviews = useMemo(() => {
    const type = detectType(productName, category);
    return REVIEWS[type];
  }, [productName, category]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
        What Pet Owners Are Saying
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {reviews.map((review, idx) => (
          <article
            key={idx}
            className="bg-card rounded-xl p-5 border border-border/50 space-y-3"
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 text-warning fill-warning" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              "{review.text}"
            </p>
            <p className="text-xs font-medium text-foreground">— {review.name}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
