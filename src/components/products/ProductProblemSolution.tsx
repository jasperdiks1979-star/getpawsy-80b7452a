import { Info } from 'lucide-react';
import { detectPdpCategory, type PdpCategory } from '@/lib/pdp-category';

interface ProductProblemSolutionProps {
  productName: string;
  category: string;
}

/**
 * General, category-level context only ("what owners usually look for").
 *
 * This block used to state product facts from a keyword template — memory
 * foam, dishwasher-safe, "supports 25+ lbs", "reduces shedding 90%" — with
 * no evidence, and a dog ramp could inherit bed copy. Verified per-product
 * problem/solution rows render through PdpVerifiedProblemSolution instead.
 * Nothing here describes the specific product's materials or specs.
 */
export const CATEGORY_CONTEXT: Record<PdpCategory, string | null> = {
  ramp: 'Ramps and steps are usually chosen for pets that find jumping onto furniture or into vehicles difficult. Owners typically compare the height it reaches, the walking surface, the footprint and the stated weight capacity.',
  'litter box': 'When choosing a litter box, owners usually compare interior size against their cat, entry height, how waste and odor are managed, and how much cleaning the design requires.',
  'cat tree': 'Indoor cats use vertical space to climb, scratch and rest. Owners usually compare overall height, platform size, base footprint and stability for the size of their cat.',
  stroller: 'Pet strollers are often used for pets that cannot manage long walks. Owners usually compare the weight limit, fold size, wheel type and ventilation.',
  carrier: 'For trips and vet visits, owners usually compare interior dimensions, ventilation, how the carrier opens, and whether it fits the size rules of their transport.',
  'car seat': 'For car travel, owners usually compare how the seat or cover attaches, the size against their pet, and how it is cleaned.',
  harness: 'Walking gear is usually chosen by fit, adjustability and where the leash attaches. Measure your pet against the listed size range before ordering.',
  bed: 'Pets spend much of the day resting. Owners usually compare bed size against their pet, filling, edge height and how the cover is cleaned.',
  bowl: 'For mealtimes, owners usually compare capacity, height, stability and how the bowl is cleaned.',
  fountain: 'Some pets drink more readily from moving water. Owners usually compare capacity, filter type, noise and cleaning effort.',
  toy: 'Toys provide physical and mental activity. Always supervise play and choose a size appropriate for your pet.',
  grooming: 'Regular grooming helps manage loose fur. Owners usually choose a tool by coat type and pet size.',
  generic: null,
};

export function ProductProblemSolution({ productName, category }: ProductProblemSolutionProps) {
  const text = CATEGORY_CONTEXT[detectPdpCategory(productName, category)];
  if (!text) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-foreground mb-4">
        What to Consider
      </h2>
      <article className="bg-muted/40 rounded-xl p-5 border border-border/50 flex gap-3">
        <Info className="w-4 h-4 mt-1 shrink-0 text-primary" />
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          {text} Check the product details above for what is documented for this item.
        </p>
      </article>
    </section>
  );
}
