import { useMemo } from 'react';
import { getProductContentOverride } from '@/config/product-content-overrides';

interface ProductHowItWorksProps {
  productId?: string;
  productName: string;
  category: string;
}

interface Step {
  step: string;
  title: string;
  description: string;
}

type ProductType =
  | 'litter box' | 'cat tree' | 'harness' | 'bed' | 'grooming' | 'carrier' | 'stroller' | 'default';

function detectType(name: string, category: string): ProductType {
  const c = `${name} ${category}`.toLowerCase();
  if (/litter\s*box|self[\s-]*clean|automatic\s*litter/i.test(c)) return 'litter box';
  if (/cat\s*tree|cat\s*condo|cat\s*tower|scratching/i.test(c)) return 'cat tree';
  if (c.includes('stroller')) return 'stroller';
  if (c.includes('harness')) return 'harness';
  if (c.includes('bed') || c.includes('cushion')) return 'bed';
  if (c.includes('brush') || c.includes('groom') || c.includes('comb')) return 'grooming';
  if (c.includes('carrier') || c.includes('crate')) return 'carrier';
  return 'default';
}

const STEPS: Record<ProductType, Step[]> = {
  'litter box': [
    { step: '1', title: 'Your cat uses the litter box', description: 'Normal usage — no training needed. Cats adapt quickly to the spacious design.' },
    { step: '2', title: 'Sensors detect when your cat leaves', description: 'Built-in infrared sensors wait until your cat exits safely before activating.' },
    { step: '3', title: 'Auto-clean cycle starts', description: 'The system automatically separates waste and seals it — eliminating odors instantly.' },
  ],
  'cat tree': [
    { step: '1', title: 'Assemble in under an hour', description: 'All hardware and step-by-step instructions included. No special tools needed.' },
    { step: '2', title: 'Place in your cat\'s favorite room', description: 'Position near a window or in a social area for maximum cat engagement.' },
    { step: '3', title: 'Watch your cat explore', description: 'Multiple levels, scratching posts, and hideaways keep cats entertained for hours.' },
  ],
  harness: [
    { step: '1', title: 'Adjust the straps to fit', description: 'Use the adjustable buckles to get a snug, comfortable fit around chest and shoulders.' },
    { step: '2', title: 'Clip on your leash', description: 'Attach to the sturdy D-ring and you\'re ready for a controlled, comfortable walk.' },
    { step: '3', title: 'Enjoy pull-free walks', description: 'The chest-clip design redirects pulling force — no more choking or strain.' },
  ],
  bed: [
    { step: '1', title: 'Unbox and fluff', description: 'Remove from packaging and let the memory foam expand to its full shape.' },
    { step: '2', title: 'Place in your dog\'s spot', description: 'Set it in their favorite resting area — the non-slip base keeps it in place.' },
    { step: '3', title: 'Better sleep from night one', description: 'Watch your dog sink in and finally get the deep, joint-relieving rest they need.' },
  ],
  grooming: [
    { step: '1', title: 'Brush gently through the coat', description: 'Work in the direction of hair growth, starting from the back and working forward.' },
    { step: '2', title: 'Collect loose fur', description: 'The fine bristles capture loose undercoat without pulling or irritating the skin.' },
    { step: '3', title: 'Press to self-clean', description: 'One click retracts the bristles and releases collected fur for easy disposal.' },
  ],
  carrier: [
    { step: '1', title: 'Open the top or side entry', description: 'Multiple access points make loading stress-free for anxious pets.' },
    { step: '2', title: 'Secure your pet inside', description: 'Internal safety clip and lockable zippers keep your pet safe during transit.' },
    { step: '3', title: 'Travel with confidence', description: 'Ventilated mesh panels and a padded base keep your pet comfortable anywhere.' },
  ],
  stroller: [
    { step: '1', title: 'Unfold in seconds', description: 'One-hand fold mechanism sets up the stroller in under 10 seconds. No tools needed.' },
    { step: '2', title: 'Place your pet inside', description: 'Wide zippered opening lets you load your pet easily. Internal tether keeps them secure.' },
    { step: '3', title: 'Walk, jog, or stroll', description: 'All-terrain wheels and rear brakes give you smooth, controlled movement on any surface.' },
  ],
  default: [
    { step: '1', title: 'Unbox your product', description: 'Everything you need is included — get set up in minutes.' },
    { step: '2', title: 'Introduce to your pet', description: 'Let your pet explore at their own pace for a positive first experience.' },
    { step: '3', title: 'Enjoy the benefits', description: 'See the difference quality pet products make in your daily routine.' },
  ],
};

export function ProductHowItWorks({ productId, productName, category }: ProductHowItWorksProps) {
  const steps = useMemo(() => {
    const override = getProductContentOverride(productId);
    if (override?.steps && override.steps.length > 0) return override.steps;
    const type = detectType(productName, category);
    return STEPS[type];
  }, [productId, productName, category]);

  return (
    <section id="how-it-works" className="mt-12 scroll-mt-20">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
        How It Works
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, idx) => (
          <article
            key={idx}
            className="relative bg-card rounded-xl p-5 border border-border/50"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <span className="text-sm font-bold text-primary">{step.step}</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1.5">{step.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
