import { Users } from 'lucide-react';

interface Props {
  productName: string;
  category: string;
}

interface IdealForData {
  audiences: string[];
}

function getIdealFor(name: string, cat: string): IdealForData {
  const c = `${name} ${cat}`.toLowerCase();

  if (/litter/i.test(c)) {
    return {
      audiences: [
        'Multi-cat households looking for hands-free litter management',
        'Busy pet owners who want a consistently clean litter area',
        'Cat parents sensitive to litter box odors',
        'Anyone switching from manual scooping to automated cleaning',
      ],
    };
  }

  if (/cat\s*tree|cat\s*condo|scratching/i.test(c)) {
    return {
      audiences: [
        'Indoor cats who need vertical climbing and scratching space',
        'Multi-cat homes where pets compete for territory',
        'Owners looking to protect furniture from scratching damage',
        'Shy or anxious cats who benefit from elevated hiding spots',
      ],
    };
  }

  if (/bed|mattress|cushion/i.test(c)) {
    return {
      audiences: [
        'Senior dogs or dogs with joint stiffness',
        'Active breeds recovering after long walks or play',
        'Puppies building healthy sleep habits from day one',
        'Pet owners who want a machine-washable, durable sleep surface',
      ],
    };
  }

  if (/harness|leash|collar/i.test(c)) {
    return {
      audiences: [
        'Dogs that pull on walks or need better leash control',
        'Owners training puppies to walk calmly',
        'Breeds prone to throat sensitivity from collars',
        'Active pet parents who walk daily in varied conditions',
      ],
    };
  }

  if (/car.*seat|car.*cover|travel/i.test(c) && !/stroller/i.test(c)) {
    return {
      audiences: [
        'Pet owners who travel with dogs in the car regularly',
        'Families wanting to protect vehicle upholstery',
        'Dogs that get anxious during car rides',
        'Anyone planning road trips with their pet',
      ],
    };
  }

  if (/stroller/i.test(c)) {
    return {
      audiences: [
        'Senior dogs or pets recovering from surgery who need outdoor time',
        'Small breed owners navigating busy urban environments',
        'Multi-dog households where one pet tires faster',
        'Pet parents who enjoy farmers markets, festivals, and outdoor dining',
      ],
    };
  }

  if (/carrier|backpack/i.test(c)) {
    return {
      audiences: [
        'Pet owners who travel by air with small dogs or cats',
        'Hikers and outdoor enthusiasts who bring their pet along',
        'Urban commuters who use public transit with their pet',
        'Frequent vet visitors looking for a calming transport solution',
      ],
    };
  }

  if (/bowl|feeder|slow/i.test(c)) {
    return {
      audiences: [
        'Dogs or cats that eat too quickly',
        'Pet owners managing healthy portions at mealtime',
        'Households with multiple pets needing organized feeding',
        'Anyone looking for spill-resistant, easy-to-clean bowls',
      ],
    };
  }

  // Generic fallback
  return {
    audiences: [
      'Dog and cat owners looking for everyday quality products',
      'Pet parents who prioritize comfort and safety',
      'First-time pet owners building their essentials kit',
      'Anyone looking for a trusted, US-shipped pet product',
    ],
  };
}

/**
 * "Who Is This For?" — clear audience targeting for PDP authority
 * and Google trust signals. No vague claims.
 */
export function ProductIdealFor({ productName, category }: Props) {
  const { audiences } = getIdealFor(productName, category);

  return (
    <section className="mt-12 scroll-mt-20" aria-labelledby="ideal-for-heading">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <h2
          id="ideal-for-heading"
          className="text-lg md:text-xl font-display font-bold text-foreground"
        >
          Who Is This For?
        </h2>
      </div>

      <ul className="grid sm:grid-cols-2 gap-3">
        {audiences.map((a, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 bg-muted/40 rounded-xl px-4 py-3 text-sm text-muted-foreground"
          >
            <span className="text-primary mt-0.5 flex-shrink-0">✓</span>
            <span>{a}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
