import { Users } from 'lucide-react';
import { detectPdpCategory, type PdpCategory } from '@/lib/pdp-category';

interface Props {
  productName: string;
  category: string;
}

/**
 * Category-level audiences only. These describe who a product TYPE commonly
 * suits; they never assert a feature of this product (no "machine-washable",
 * or "durable" unless evidenced elsewhere). Detection is
 * shared and word-based, so a "Dog Ramp for Bed" is a ramp, not a bed.
 */
export const IDEAL_FOR: Record<PdpCategory, string[] | null> = {
  ramp: [
    'Pets that find jumping onto beds, sofas or into cars difficult',
    'Small or short-legged breeds',
    'Owners who want to limit repeated jumping',
  ],
  'litter box': [
    'Cat owners setting up or replacing a litter area',
    'Homes comparing box size and entry height for their cat',
  ],
  'cat tree': [
    'Indoor cats that like to climb, scratch and perch',
    'Owners looking to give cats a scratching spot other than furniture',
  ],
  bed: [
    'Pets that need a dedicated resting spot',
    'Owners replacing a worn or undersized bed',
  ],
  harness: [
    'Owners comparing walking gear for fit and control',
    'Puppies and dogs learning to walk on a leash',
  ],
  'car seat': [
    'Owners who travel with their pet by car',
  ],
  stroller: [
    'Pets that cannot manage long walks',
    'Owners who want to bring a small pet on longer outings',
  ],
  carrier: [
    'Owners transporting a pet to the vet or on trips',
  ],
  bowl: [
    'Owners looking for a dedicated feeding setup',
  ],
  fountain: [
    'Owners who want to offer their pet moving water',
  ],
  toy: [
    'Pets that need regular play and activity',
  ],
  grooming: [
    'Owners managing shedding and coat care at home',
  ],
  generic: null,
};

/**
 * "Who Is This For?" — clear audience targeting for PDP authority
 * and Google trust signals. No vague claims.
 */
export function ProductIdealFor({ productName, category }: Props) {
  const audiences = IDEAL_FOR[detectPdpCategory(productName, category)];
  if (!audiences) return null;

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
