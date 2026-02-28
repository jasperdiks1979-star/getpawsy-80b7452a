import { useMemo } from 'react';

interface ProductFeatureGridProps {
  productName: string;
  category: string;
}

interface Feature {
  title: string;
  description: string;
}

type ProductType =
  | 'bed' | 'bowl' | 'harness' | 'leash' | 'collar' | 'toy'
  | 'carrier' | 'grooming' | 'clothing' | 'cat tree' | 'litter box' | 'default';

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

const FEATURES: Record<ProductType, Feature[]> = {
  bed: [
    { title: 'Supportive Fill', description: 'Cushions joints and pressure points for deep rest' },
    { title: 'Washable Cover', description: 'Removable cover keeps things fresh and clean' },
    { title: 'Non-Slip Base', description: 'Stays in place on hardwood and tile floors' },
    { title: 'Size Options', description: 'Available in sizes for small to extra-large pets' },
  ],
  bowl: [
    { title: 'Slow-Feed Design', description: 'Ridges promote healthier eating pace' },
    { title: 'Non-Slip Bottom', description: 'Stays firmly in place during mealtimes' },
    { title: 'Food-Safe Material', description: 'BPA-free and dishwasher safe for hygiene' },
    { title: 'Portion Friendly', description: 'Easy to measure and serve correct amounts' },
  ],
  harness: [
    { title: 'No-Pull Design', description: 'Reduces pulling without choking or strain' },
    { title: 'Padded Straps', description: 'Soft lining prevents rubbing and chafing' },
    { title: 'Reflective Trim', description: 'Visible during early morning and evening walks' },
    { title: 'Quick-Snap Buckle', description: 'Easy on/off without threading through loops' },
  ],
  leash: [
    { title: 'Padded Handle', description: 'Comfortable grip reduces hand fatigue' },
    { title: 'Secure Clasp', description: 'Heavy-duty rotating clip prevents tangling' },
    { title: 'Weather Resistant', description: 'Performs in rain, sun, and cold conditions' },
    { title: 'Ideal Length', description: 'Balanced control for urban and trail walking' },
  ],
  collar: [
    { title: 'Adjustable Fit', description: 'Accommodates growing pets and seasonal coats' },
    { title: 'Breathable Fabric', description: 'Prevents heat buildup and skin irritation' },
    { title: 'Quick-Release Buckle', description: 'Safety breakaway for emergencies' },
    { title: 'D-Ring Attachment', description: 'Sturdy connection point for leash or tag' },
  ],
  toy: [
    { title: 'Durable Build', description: 'Withstands daily chewing and rough play' },
    { title: 'Pet-Safe Materials', description: 'Non-toxic and free from harmful chemicals' },
    { title: 'Mental Stimulation', description: 'Engages problem-solving instincts' },
    { title: 'Easy to Clean', description: 'Rinse or machine wash for quick hygiene' },
  ],
  carrier: [
    { title: 'Multi-Point Ventilation', description: 'Mesh panels ensure airflow from all sides' },
    { title: 'Padded Interior', description: 'Soft base keeps your pet comfortable in transit' },
    { title: 'Secure Closures', description: 'Lockable zippers prevent escape attempts' },
    { title: 'Airline Compatible', description: 'Fits under most airline cabin seats' },
  ],
  grooming: [
    { title: 'Gentle Bristles', description: 'Safe for sensitive skin and all coat types' },
    { title: 'Ergonomic Handle', description: 'Comfortable grip for extended grooming sessions' },
    { title: 'Self-Cleaning', description: 'One-click button retracts bristles for easy cleanup' },
    { title: 'Reduces Shedding', description: 'Removes loose fur before it reaches your furniture' },
  ],
  clothing: [
    { title: 'Stretch Fabric', description: 'Moves with your pet without restricting activity' },
    { title: 'Easy Fastening', description: 'Velcro or snap closure for quick dressing' },
    { title: 'Warm Insulation', description: 'Keeps short-haired and small breeds cozy' },
    { title: 'Machine Washable', description: 'Easy care after muddy walks and outdoor play' },
  ],
  'cat tree': [
    { title: 'Heavy-Duty Base', description: 'Wide footprint prevents tipping during play' },
    { title: 'Sisal Scratching Posts', description: 'Natural rope lasts 3-5x longer than carpet' },
    { title: 'Multi-Level Platforms', description: 'Multiple cats can perch simultaneously' },
    { title: 'Cozy Hideaway', description: 'Enclosed space for napping and privacy' },
  ],
  'litter box': [
    { title: 'Odor Control', description: 'Sealed compartment traps smells at the source' },
    { title: 'Low-Entry Design', description: 'Easy access for kittens and senior cats' },
    { title: 'Easy Cleaning', description: 'Removable tray simplifies waste disposal' },
    { title: 'Splash Guard', description: 'High walls prevent litter scatter and mess' },
  ],
  default: [
    { title: 'Premium Materials', description: 'Built to withstand daily pet life demands' },
    { title: 'Pet-Safe Design', description: 'Non-toxic materials safe for all pets' },
    { title: 'Easy Maintenance', description: 'Simple to clean and keep in great condition' },
    { title: 'US Warehouse', description: 'Ships fast from domestic fulfillment centers' },
  ],
};

export function ProductFeatureGrid({ productName, category }: ProductFeatureGridProps) {
  const features = useMemo(() => {
    const type = detectType(productName, category);
    return FEATURES[type];
  }, [productName, category]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-6">
        Key Features
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {features.map((feature, idx) => (
          <article
            key={idx}
            className="bg-card rounded-xl p-4 border border-border/50 space-y-1.5"
          >
            <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
