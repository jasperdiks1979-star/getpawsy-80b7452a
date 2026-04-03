import { useMemo } from 'react';
import { Sparkles, Shield, Truck } from 'lucide-react';

interface ProductProblemSolutionProps {
  productName: string;
  category: string;
}

type ProductType =
  | 'bed' | 'bowl' | 'collar' | 'toy' | 'carrier' | 'grooming'
  | 'clothing' | 'mat' | 'fountain' | 'food' | 'harness' | 'leash'
  | 'cat tree' | 'litter box' | 'stroller' | 'accessory';

interface ProblemSolutionData {
  problem: string;
  solution: string;
  benefits: string[];
}

function detectType(name: string, category: string): ProductType {
  const c = `${name} ${category}`.toLowerCase();
  if (/cat\s*tree|cat\s*condo|cat\s*tower|scratching/i.test(c)) return 'cat tree';
  if (/litter\s*box|self[\s-]*clean|automatic\s*litter/i.test(c)) return 'litter box';
  if (c.includes('stroller')) return 'stroller';
  if (c.includes('bed') || c.includes('cushion') || c.includes('pillow')) return 'bed';
  if (c.includes('bowl') || c.includes('feeder') || c.includes('dish')) return 'bowl';
  if (c.includes('harness')) return 'harness';
  if (c.includes('leash') || c.includes('lead')) return 'leash';
  if (c.includes('collar')) return 'collar';
  if (c.includes('toy') || c.includes('ball') || c.includes('chew')) return 'toy';
  if (c.includes('carrier') || c.includes('crate') || c.includes('bag')) return 'carrier';
  if (c.includes('brush') || c.includes('groom') || c.includes('comb') || c.includes('nail')) return 'grooming';
  if (c.includes('clothes') || c.includes('sweater') || c.includes('jacket') || c.includes('coat')) return 'clothing';
  if (c.includes('mat') || c.includes('pad') || c.includes('blanket')) return 'mat';
  if (c.includes('fountain') || c.includes('water') || c.includes('dispenser')) return 'fountain';
  if (c.includes('treat') || c.includes('food') || c.includes('snack')) return 'food';
  return 'accessory';
}

const DATA: Record<ProductType, ProblemSolutionData> = {
  bed: {
    problem: 'Does your dog struggle to get comfortable? Wake up stiff or restless? Many pets sleep on hard floors or worn-out beds that offer zero joint support — leading to pain, low energy, and restless nights, especially for older or active dogs.',
    solution: 'This orthopedic bed supports joints and pressure points with memory foam that adapts to your dog\'s body. Raised edges provide security, while the breathable cover keeps them cool. Your dog spends hours resting every day — make those hours count.',
    benefits: ['Deep joint relief', 'Better sleep quality', 'Easy-wash cover'],
  },
  bowl: {
    problem: 'Pets that eat too quickly risk bloating, vomiting, and poor digestion. Lightweight bowls slide across the floor, creating mess and frustration at every mealtime.',
    solution: 'This feeding solution promotes healthier eating habits with a stable, non-slip design. Portion-friendly and easy to clean, it brings calm and order back to mealtimes for both you and your pet.',
    benefits: ['Promotes slower eating', 'Non-slip stability', 'Dishwasher safe'],
  },
  harness: {
    problem: "Traditional collars put pressure on your pet\u2019s throat, especially if they tend to pull. This can cause neck strain, coughing, and make walks unpleasant for both of you.",
    solution: 'This harness distributes force across the chest and shoulders, giving you better control without discomfort. The adjustable fit ensures your pet can move freely while you walk with confidence.',
    benefits: ['No-choke chest design', 'Adjustable secure fit', 'Comfortable walks'],
  },
  leash: {
    problem: 'A flimsy or uncomfortable leash makes walks stressful. Weak clasps risk accidental escapes, while rigid handles cause hand fatigue on longer outings.',
    solution: 'Built with durable materials and a padded handle, this leash gives you reliable control and all-day comfort. The secure clasp keeps your pet safely by your side on every adventure.',
    benefits: ['Padded ergonomic grip', 'Heavy-duty clasp', 'All-weather durable'],
  },
  collar: {
    problem: 'Poorly fitted collars slip off, chafe skin, or cause matting around the neck area. An uncomfortable collar means your pet resists wearing it — a safety risk outdoors.',
    solution: 'This collar is built for all-day comfort with adjustable sizing, breathable material, and a secure buckle. Your pet can wear it confidently during walks, play, and rest without irritation.',
    benefits: ['Adjustable perfect fit', 'Breathable materials', 'Secure quick-release'],
  },
  toy: {
    problem: 'Boredom leads to destructive behavior — chewing furniture, excessive barking, and anxiety. Low-quality toys break apart quickly, becoming a choking hazard.',
    solution: 'Designed to engage your pet mentally and physically, this toy is built from durable, pet-safe materials that withstand daily play. It channels energy into healthy activity, keeping your pet happier and your home intact.',
    benefits: ['Durable safe materials', 'Mental stimulation', 'Reduces destructive habits'],
  },
  carrier: {
    problem: 'Traveling with a pet can feel chaotic — loose pets in the car are unsafe, and poorly ventilated carriers cause anxiety and overheating during vet visits or trips.',
    solution: "This carrier provides a secure, well-ventilated space your pet feels comfortable in. Easy-access openings reduce loading stress, and the sturdy structure keeps your pet safe whether you're in a car or on a plane.",
    benefits: ['Airline-compatible', 'Multi-point ventilation', 'Secure locking zips'],
  },
  grooming: {
    problem: 'Shedding fur covers furniture, clothes, and floors. Without regular grooming, mats and tangles develop, causing skin irritation and expensive vet visits.',
    solution: "This grooming tool removes loose fur effectively while being gentle on your pet\u2019s skin. Regular use reduces household shedding and keeps your pet\u2019s coat healthy and tangle-free \u2014 all from the comfort of home.",
    benefits: ['Reduces shedding 90%', 'Gentle on sensitive skin', 'At-home salon quality'],
  },
  clothing: {
    problem: 'Short-haired and small breeds struggle with cold weather, shivering through winter walks. Ill-fitting pet clothes restrict movement and cause discomfort.',
    solution: 'This piece provides warmth without bulk, with a stretch-friendly design that lets your pet move naturally. Easy on-off fastening means less fussing and more time enjoying the outdoors together.',
    benefits: ['Warmth without bulk', 'Easy on/off design', 'Full range of motion'],
  },
  mat: {
    problem: 'Pets need a defined resting spot, but blankets bunch up and shift around. Without a consistent place to settle, pets may claim furniture or develop anxiety.',
    solution: 'This mat gives your pet a portable, non-slip surface they can call their own. Whether at home, traveling, or at the vet, it provides familiar comfort that helps your pet stay calm.',
    benefits: ['Non-slip backing', 'Portable anywhere', 'Machine washable'],
  },
  fountain: {
    problem: 'Still water in bowls collects bacteria and debris within hours. Many pets refuse to drink stale water, leading to chronic dehydration that affects kidney and urinary health.',
    solution: "This fountain circulates and filters water continuously, keeping it fresh and appealing. The quiet motor and large capacity mean your pet always has access to clean, flowing water \u2014 even when you're away.",
    benefits: ['Triple filtration system', 'Ultra-quiet pump', 'Encourages hydration'],
  },
  food: {
    problem: 'Low-quality pet food contains fillers and artificial additives that offer little nutritional value. This can lead to poor coat condition, low energy, and digestive issues over time.',
    solution: 'Made with carefully selected ingredients, this food provides balanced daily nutrition your pet needs. No artificial fillers or preservatives — just wholesome fuel for an active, healthy life.',
    benefits: ['Natural ingredients', 'Complete nutrition', 'Supports coat health'],
  },
  'cat tree': {
    problem: 'Indoor cats without vertical space become bored and stressed. They scratch furniture, gain weight from inactivity, and lack the mental stimulation that climbing provides.',
    solution: 'This cat tree gives your cat dedicated territory to climb, scratch, and perch — satisfying their natural instincts. Multiple platforms support multi-cat households, while sturdy construction handles even large breeds safely.',
    benefits: ['Saves your furniture', 'Multi-level enrichment', 'Supports 25+ lbs'],
  },
  'litter box': {
    problem: 'Still scooping your cat\'s litter every day? Traditional litter boxes are messy, smelly, and time-consuming. Odors spread through your home between cleanings, and cats may refuse to use a dirty box — leading to accidents elsewhere.',
    solution: 'Let the litter box clean itself. This smart system automatically removes waste after every use — keeping your home fresh without any effort. Sealed compartments trap smells at the source while sensors ensure your cat\'s safety.',
    benefits: ['No more scooping', 'Always odor-free', 'Multi-cat friendly'],
  },
  accessory: {
    problem: "Finding quality pet accessories that actually work is frustrating. Many products look good online but break easily, don't fit properly, or aren't safe for daily use.",
    solution: 'This product is built with quality materials and practical design, tested to meet the demands of real pet ownership. It integrates seamlessly into your daily routine, making life easier for both you and your pet.',
    benefits: ['Premium quality build', 'Practical daily use', 'Designed for durability'],
  },
};

export function ProductProblemSolution({ productName, category }: ProductProblemSolutionProps) {
  const data = useMemo(() => {
    const type = detectType(productName, category);
    return DATA[type];
  }, [productName, category]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
        Why Pet Owners Choose This
      </h2>

      <div className="space-y-4">
        {/* Problem */}
        <article className="bg-muted/40 rounded-xl p-5 border border-border/50">
          <h3 className="font-semibold text-foreground mb-2 text-sm uppercase tracking-wide">The Problem</h3>
          <p className="text-muted-foreground text-[15px] leading-relaxed">{data.problem}</p>
        </article>

        {/* Solution */}
        <article className="bg-primary/5 rounded-xl p-5 border border-primary/10">
          <h3 className="font-semibold text-primary mb-2 text-sm uppercase tracking-wide">The Solution</h3>
          <p className="text-muted-foreground text-[15px] leading-relaxed">{data.solution}</p>
        </article>

        {/* 3 Icon Benefits */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          {data.benefits.map((benefit, idx) => {
            const icons = [Sparkles, Shield, Truck];
            const Icon = icons[idx % icons.length];
            return (
              <div key={idx} className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-card border border-border/50">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground leading-tight">{benefit}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
