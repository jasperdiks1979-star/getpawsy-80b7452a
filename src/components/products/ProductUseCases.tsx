import { useMemo } from 'react';
import { Users } from 'lucide-react';

interface ProductUseCasesProps {
  productName: string;
  category: string;
}

type ProductType =
  | 'bed' | 'harness' | 'toy' | 'carrier' | 'grooming'
  | 'cat tree' | 'litter box' | 'stroller' | 'default';

interface UseCase {
  persona: string;
  scenario: string;
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

const USE_CASES: Record<ProductType, UseCase[]> = {
  'litter box': [
    { persona: 'Busy professionals', scenario: 'No time to scoop daily — the automatic cycle keeps the box clean between long work days.' },
    { persona: 'Multi-cat households', scenario: 'Cats refuse dirty boxes. Automatic cleaning after every use means fewer accidents and territorial issues.' },
    { persona: 'Pet owners with allergies', scenario: 'Sealed waste compartments minimize dust and allergen exposure during disposal.' },
    { persona: 'Travelers and weekend trippers', scenario: 'Leave for 2–3 days knowing the litter box stays fresh and functional without a pet sitter.' },
  ],
  'cat tree': [
    { persona: 'Apartment dwellers', scenario: 'Limited floor space but vertical climbing keeps indoor cats exercised and mentally stimulated.' },
    { persona: 'Owners of destructive cats', scenario: 'Sisal scratching posts redirect clawing away from furniture and curtains.' },
    { persona: 'Multi-cat families', scenario: 'Multiple perch levels prevent territorial conflicts by giving each cat their own space.' },
    { persona: 'Work-from-home pet parents', scenario: 'A window-side cat tree keeps your cat entertained while you focus on work.' },
  ],
  harness: [
    { persona: 'Owners of strong pullers', scenario: 'Chest-clip design redirects pulling without choking — walks may become more manageable within days.' },
    { persona: 'Puppy trainers', scenario: 'Adjustable straps grow with your pup through their first year while building good leash habits.' },
    { persona: 'Brachycephalic breed owners', scenario: 'No throat pressure for flat-faced breeds like Bulldogs and Pugs who are sensitive to collars.' },
    { persona: 'Nighttime walkers', scenario: 'Reflective trim ensures visibility on early morning and late evening outings.' },
  ],
  bed: [
    { persona: 'Senior dog owners', scenario: 'Memory foam supports joint comfort and helps older dogs get in and out independently.' },
    { persona: 'Post-surgery recovery', scenario: 'Supportive surface may help reduce pressure on joints and incision sites during rest.' },
    { persona: 'Large breed families', scenario: 'High-density foam doesn\'t flatten under 80+ lb dogs, maintaining support for years.' },
    { persona: 'Anxious dogs', scenario: 'Raised bolster edges create a cozy nest that reduces nighttime restlessness.' },
  ],
  toy: [
    { persona: 'Dogs left home alone', scenario: 'Puzzle toys keep dogs occupied for hours, reducing separation anxiety and destructive behavior.' },
    { persona: 'High-energy breeds', scenario: 'Channels excess energy into constructive play instead of chewing furniture or shoes.' },
    { persona: 'Overweight pets', scenario: 'Interactive feeders slow eating speed and encourage physical movement during mealtimes.' },
    { persona: 'Teething puppies', scenario: 'Durable chew toys soothe gums and protect household items from puppy teeth.' },
  ],
  stroller: [
    { persona: 'Senior dog owners', scenario: 'Aging dogs with limited mobility still get daily outdoor stimulation without overexertion.' },
    { persona: 'Post-surgery recovery', scenario: 'Dogs recovering from surgery can enjoy fresh air and socializing while resting comfortably.' },
    { persona: 'Urban pet parents', scenario: 'Navigate busy sidewalks, farmers markets, and outdoor dining areas safely with small dogs.' },
    { persona: 'Multi-dog households', scenario: 'Stroller one pet while walking the other — both get outdoor time without exhaustion.' },
  ],
  carrier: [
    { persona: 'Frequent flyers', scenario: 'Airline-compliant dimensions fit under cabin seats for stress-free in-flight pet travel.' },
    { persona: 'Vet visit anxiety', scenario: 'Familiar enclosed space calms nervous pets during the car ride and waiting room.' },
    { persona: 'Road trip families', scenario: 'Secure, ventilated design keeps pets safe and comfortable on long drives.' },
    { persona: 'Urban pet parents', scenario: 'Lightweight construction with shoulder straps for hands-free transport on foot.' },
  ],
  grooming: [
    { persona: 'Shedding-heavy breeds', scenario: 'Removes loose undercoat before it reaches your furniture, clothes, and car seats.' },
    { persona: 'Pets with sensitive skin', scenario: 'Gentle bristles detangle without pulling or irritating skin conditions.' },
    { persona: 'Budget-conscious owners', scenario: 'Professional-quality grooming at home saves hundreds per year on salon visits.' },
    { persona: 'First-time pet owners', scenario: 'Self-cleaning mechanism makes grooming approachable — no experience needed.' },
  ],
  default: [
    { persona: 'First-time pet owners', scenario: 'Quality materials and intuitive design make daily pet care simpler from day one.' },
    { persona: 'Multi-pet households', scenario: 'Durable construction handles the demands of multiple active pets.' },
    { persona: 'Gift shoppers', scenario: 'A practical, high-quality gift that any pet owner will genuinely appreciate and use.' },
    { persona: 'Budget-conscious families', scenario: 'Long-lasting build means you buy once — no need for frequent replacements.' },
  ],
};

export function ProductUseCases({ productName, category }: ProductUseCasesProps) {
  const cases = useMemo(() => {
    const type = detectType(productName, category);
    return USE_CASES[type];
  }, [productName, category]);

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
          Who Is This For?
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cases.map((uc, idx) => (
          <article
            key={idx}
            className="flex gap-4 bg-card rounded-xl p-4 border border-border/50"
          >
            <div className="w-1 rounded-full bg-primary/30 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">{uc.persona}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{uc.scenario}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
