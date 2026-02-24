import { useMemo } from 'react';
import { Users } from 'lucide-react';

interface ProductUseCasesProps {
  productName: string;
  category: string;
}

const CATEGORY_USE_CASES: Record<string, string[]> = {
  bed: ['Large dogs needing joint support', 'Senior dogs with arthritis', 'Anxious dogs seeking comfort', 'Multi-pet households'],
  toy: ['Aggressive chewers', 'Puppies teething', 'Dogs home alone', 'Interactive playtime'],
  harness: ['Dogs that pull on leash', 'Small breeds needing secure fit', 'Training & obedience', 'Travel & car safety'],
  carrier: ['Vet visits & travel', 'Small pets under 20 lbs', 'Airline-approved trips', 'Senior pets needing support'],
  feeder: ['Multi-pet feeding schedules', 'Pets that eat too fast', 'Owners with busy schedules', 'Portion control needs'],
  'car seat': ['Road trips with small dogs', 'Daily commutes with pets', 'Dogs with travel anxiety', 'Safety-conscious pet parents'],
  'cat tree': ['Active climbers', 'Multi-cat households', 'Large breeds (15+ lbs)', 'Small apartments'],
  'litter box': ['Odor-sensitive households', 'Multi-cat homes', 'Large cats', 'Low-maintenance owners'],
  grooming: ['Long-haired breeds', 'Shedding season prep', 'At-home grooming routines', 'Sensitive skin pets'],
  leash: ['Training walks', 'Hiking & outdoor adventures', 'Reactive dogs', 'Nighttime visibility'],
};

function getUseCases(name: string, category: string): string[] {
  const lower = (category + ' ' + name).toLowerCase();
  for (const [key, cases] of Object.entries(CATEGORY_USE_CASES)) {
    if (lower.includes(key)) return cases;
  }
  return ['Active pets', 'First-time pet owners', 'Multi-pet households', 'Everyday use'];
}

export function ProductUseCases({ productName, category }: ProductUseCasesProps) {
  const useCases = useMemo(() => getUseCases(productName, category), [productName, category]);

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2 mb-6">
        <Users className="w-6 h-6 text-primary" />
        Best For
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {useCases.map((useCase, idx) => (
          <div
            key={idx}
            className="bg-muted/40 rounded-xl p-4 text-center border border-border/50"
          >
            <p className="text-sm font-medium text-foreground">{useCase}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
