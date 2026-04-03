import { useMemo } from 'react';
import { ArrowRight, X, Check } from 'lucide-react';

interface ProductVsAlternativesProps {
  productName: string;
  category: string;
}

type ProductType =
  | 'bed' | 'harness' | 'toy' | 'carrier' | 'grooming'
  | 'cat tree' | 'litter box' | 'stroller' | 'default';

interface ComparisonRow {
  feature: string;
  ours: boolean;
  generic: boolean;
}

interface ComparisonData {
  heading: string;
  summary: string;
  rows: ComparisonRow[];
}

function detectType(name: string, category: string): ProductType {
  const c = `${name} ${category}`.toLowerCase();
  if (/litter\s*box|self[\s-]*clean|automatic\s*litter/i.test(c)) return 'litter box';
  if (/cat\s*tree|cat\s*condo|cat\s*tower|scratching/i.test(c)) return 'cat tree';
  if (c.includes('stroller')) return 'stroller';
  if (c.includes('harness') || c.includes('leash') || c.includes('collar')) return 'harness';
  if (c.includes('bed') || c.includes('cushion')) return 'bed';
  if (c.includes('toy') || c.includes('ball') || c.includes('chew')) return 'toy';
  if (c.includes('carrier') || c.includes('crate')) return 'carrier';
  if (c.includes('brush') || c.includes('groom')) return 'grooming';
  return 'default';
}

const DATA: Record<ProductType, ComparisonData> = {
  'litter box': {
    heading: 'Why This Beats a Standard Litter Box',
    summary: 'Traditional boxes need daily scooping, smell between cleanings, and cats often avoid them. Here\'s what makes this different.',
    rows: [
      { feature: 'Automatic waste removal', ours: true, generic: false },
      { feature: 'Sealed odor control', ours: true, generic: false },
      { feature: 'Safety sensors for cats', ours: true, generic: false },
      { feature: 'Multi-cat compatible', ours: true, generic: false },
      { feature: 'App-based monitoring', ours: true, generic: false },
      { feature: 'No daily scooping needed', ours: true, generic: false },
    ],
  },
  'cat tree': {
    heading: 'How This Compares to Basic Cat Trees',
    summary: 'Budget cat trees wobble, use carpet-wrapped posts that fray in weeks, and topple with larger cats. This one is built differently.',
    rows: [
      { feature: 'Reinforced anti-tip base', ours: true, generic: false },
      { feature: 'Sisal scratching posts (3–5× lifespan)', ours: true, generic: false },
      { feature: 'Supports 25+ lb cats', ours: true, generic: false },
      { feature: 'Multi-level platforms', ours: true, generic: true },
      { feature: 'Enclosed hideaway dens', ours: true, generic: false },
      { feature: 'Washable cushion covers', ours: true, generic: false },
    ],
  },
  harness: {
    heading: 'Why This Harness Outperforms Collars',
    summary: 'Collars put all the pressure on the throat, which is dangerous for many breeds. This harness solves that while adding comfort and control.',
    rows: [
      { feature: 'No-choke chest distribution', ours: true, generic: false },
      { feature: 'Padded anti-rub straps', ours: true, generic: false },
      { feature: 'Reflective safety trim', ours: true, generic: false },
      { feature: 'Quick-snap buckle system', ours: true, generic: false },
      { feature: 'Multi-point adjustability', ours: true, generic: true },
      { feature: 'Leash attachment point', ours: true, generic: true },
    ],
  },
  bed: {
    heading: 'This Bed vs. Standard Pet Beds',
    summary: 'Flat beds and thin cushions compress within months, leaving your dog sleeping on the floor. Orthopedic design changes that.',
    rows: [
      { feature: 'Memory foam core', ours: true, generic: false },
      { feature: 'Maintains shape after 1+ year', ours: true, generic: false },
      { feature: 'Raised bolster edges', ours: true, generic: false },
      { feature: 'Non-slip base', ours: true, generic: false },
      { feature: 'Machine-washable cover', ours: true, generic: true },
      { feature: 'Vet-recommended support', ours: true, generic: false },
    ],
  },
  toy: {
    heading: 'Why This Toy Lasts Longer',
    summary: 'Cheap toys break within days, creating choking hazards. Durable, non-toxic construction makes a real difference in safety and value.',
    rows: [
      { feature: 'Heavy-duty chew-proof material', ours: true, generic: false },
      { feature: 'Non-toxic BPA-free', ours: true, generic: false },
      { feature: 'Mental stimulation design', ours: true, generic: false },
      { feature: 'Easy to clean', ours: true, generic: true },
      { feature: 'Multiple play modes', ours: true, generic: false },
      { feature: 'Vet-recommended', ours: true, generic: false },
    ],
  },
  carrier: {
    heading: 'How This Carrier Compares',
    summary: 'Basic carriers lack ventilation, have weak zippers, and stress pets out. This one is designed for real travel comfort.',
    rows: [
      { feature: 'Airline cabin compatible', ours: true, generic: false },
      { feature: 'Multi-point mesh ventilation', ours: true, generic: false },
      { feature: 'Lockable safety zippers', ours: true, generic: false },
      { feature: 'Padded comfort base', ours: true, generic: false },
      { feature: 'Multiple entry points', ours: true, generic: true },
      { feature: 'Shoulder strap included', ours: true, generic: true },
    ],
  },
  grooming: {
    heading: 'Better Than Your Average Brush',
    summary: 'Standard brushes pull hair, miss the undercoat, and are a pain to clean. This tool is designed for efficiency and comfort.',
    rows: [
      { feature: 'Self-cleaning mechanism', ours: true, generic: false },
      { feature: 'Reaches the undercoat', ours: true, generic: false },
      { feature: 'Gentle on sensitive skin', ours: true, generic: false },
      { feature: 'Ergonomic handle grip', ours: true, generic: false },
      { feature: 'Suitable for all coat types', ours: true, generic: true },
      { feature: 'Professional salon quality', ours: true, generic: false },
    ],
  },
  default: {
    heading: 'What Sets This Product Apart',
    summary: 'Not all pet products are created equal. Here\'s how this product compares to generic alternatives you\'ll find elsewhere.',
    rows: [
      { feature: 'Premium pet-safe materials', ours: true, generic: false },
      { feature: 'Built for daily durability', ours: true, generic: false },
      { feature: 'Reliable US shipping', ours: true, generic: false },
      { feature: '30-day return policy', ours: true, generic: false },
      { feature: 'Responsive support team', ours: true, generic: false },
      { feature: 'Tracked delivery included', ours: true, generic: true },
    ],
  },
};

export function ProductVsAlternatives({ productName, category }: ProductVsAlternativesProps) {
  const data = useMemo(() => {
    const type = detectType(productName, category);
    return DATA[type];
  }, [productName, category]);

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <ArrowRight className="w-4.5 h-4.5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          {data.heading}
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6 ml-12">
        {data.summary}
      </p>

      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm border-collapse min-w-[400px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 pr-4 font-medium text-muted-foreground">Feature</th>
              <th className="text-center py-3 px-4 font-semibold text-primary">This Product</th>
              <th className="text-center py-3 pl-4 font-medium text-muted-foreground">Generic</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 text-foreground">{row.feature}</td>
                <td className="py-3 px-4 text-center">
                  {row.ours ? (
                    <Check className="w-4.5 h-4.5 text-primary mx-auto" />
                  ) : (
                    <X className="w-4.5 h-4.5 text-muted-foreground/40 mx-auto" />
                  )}
                </td>
                <td className="py-3 pl-4 text-center">
                  {row.generic ? (
                    <Check className="w-4.5 h-4.5 text-muted-foreground mx-auto" />
                  ) : (
                    <X className="w-4.5 h-4.5 text-muted-foreground/40 mx-auto" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
