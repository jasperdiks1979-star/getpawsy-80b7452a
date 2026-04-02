/**
 * Curated companion products for Dog Bed PDPs.
 *
 * When a customer views a dog bed, the FBT section should show
 * products that genuinely complement the purchase — not random items.
 *
 * This registry maps each dog bed product ID to its ideal companions
 * (ordered by relevance). The FBT component consults this before
 * falling back to generic related-product logic.
 */

export interface CuratedCompanion {
  productId: string;
  reason: string;          // shown as sub-label in FBT card
  urgencyCopy?: string;    // optional social-proof nudge
}

// ── Active dog bed product IDs ──────────────────────────────
export const ELEVATED_COOLING_BED_ID = 'c7177ee4-5509-492f-965f-617402968f5c';
export const DOG_CAR_BED_ID         = '6367cdd8-25f6-4d27-891f-65c5db831d54';

// ── Companion product IDs ───────────────────────────────────
const CHEW_TOY_ID       = 'ab56a66b-dfaa-4caa-921a-de5bf544f9d8';
const PET_CARRIER_ID    = '0381585e-8b6b-48a8-b541-c7298f99b0c9';

// ── Category identifier ─────────────────────────────────────
const DOG_BED_KEYWORDS = ['dog bed', 'dog beds', 'cooling bed', 'elevated bed', 'pet cot', 'travel pad', 'car bed'];

export function isDogBedProduct(category: string | null, name: string): boolean {
  const text = `${category || ''} ${name}`.toLowerCase();
  return DOG_BED_KEYWORDS.some(kw => text.includes(kw));
}

// ── Curated companion map ───────────────────────────────────
// Each dog bed maps to ordered companions; FBT picks the first N that are in-stock.
const COMPANION_MAP: Record<string, CuratedCompanion[]> = {
  // Elevated Cooling Dog Bed → Car Bed + Chew Toy
  [ELEVATED_COOLING_BED_ID]: [
    {
      productId: DOG_CAR_BED_ID,
      reason: 'Perfect for car rides',
      urgencyCopy: 'Most customers add this for travel comfort',
    },
    {
      productId: CHEW_TOY_ID,
      reason: 'Keeps your dog entertained',
      urgencyCopy: '72% of dog bed buyers add a chew toy',
    },
  ],

  // Dog Car Bed → Elevated Cooling Bed + Chew Toy
  [DOG_CAR_BED_ID]: [
    {
      productId: ELEVATED_COOLING_BED_ID,
      reason: 'Complete home + car comfort setup',
      urgencyCopy: 'Most customers add a home bed too',
    },
    {
      productId: CHEW_TOY_ID,
      reason: 'Keeps your dog calm during rides',
      urgencyCopy: 'Popular add-on for car travel',
    },
  ],
};

/**
 * Returns curated companions for a given product ID, or null if
 * the product has no curated FBT config (falls back to generic).
 */
export function getCuratedCompanions(productId: string): CuratedCompanion[] | null {
  return COMPANION_MAP[productId] ?? null;
}

// ── Cart upsell messaging ───────────────────────────────────
export const DOG_BED_CART_HEADLINE = "Complete Your Dog's Comfort Setup";
export const DOG_BED_CART_SUBTITLE = 'Most customers add these for the full experience';

// ── Bundle tiers for dog beds ───────────────────────────────
export const DOG_BED_BUNDLE_TIERS = [
  { count: 2, percentage: 10, label: 'Buy 2 – Save 10%' },
  { count: 3, percentage: 15, label: 'Buy 3 – Save 15%' },
];
